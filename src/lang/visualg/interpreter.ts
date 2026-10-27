import { BREAK, CompileOptions, Host, PortugolError, Program, ReturnSignal } from "../shared/types";
import { CoverageCollector, CoverageUnit, TestInfo, statementLines } from "../shared/testing";
import { SourceFile } from "../protocol";
import { MAX_CALL_DEPTH, Ref, StructVal, ObjVal, copyStruct, structEquals, finalizeError, parseIntStrict, parseRealStrict, stackOverflow, wrapJsError, parseBool, BOOL_WORDS } from "../shared/runtime";
import * as A from "./ast";
import { TypeRef, typeName } from "./ast";
import { formatVisualg, formatWithWidth } from "./builtins";
import { parseVisualgProject } from "./parser";
import { Debugger, FrameNames, Snapshot, describeFrame, markAllBlocking } from "../shared/debug";

type Frame = any[];
type Loc = { line: number; col: number; file?: number };

// ----- nomes das variáveis de cada subprograma (para o depurador) -----
const namesCache = new WeakMap<A.Sub, FrameNames>();
function namesOf(fn: A.Sub): FrameNames {
  let n = namesCache.get(fn);
  if (!n) {
    const slots: FrameNames["slots"] = fn.params.map((p) => ({ slot: p.slot, name: p.name, type: typeName(p.t) }));
    for (const d of fn.locals) slots.push({ slot: d.slot, name: d.name, type: typeName(d.t) });
    if (fn.isFunction) slots.push({ slot: fn.retSlot, name: fn.name + " (retorno)", type: typeName(fn.ret) });
    n = { name: fn.cls ? `${fn.cls.name}.${fn.name}` : fn.name, slots };
    namesCache.set(fn, n);
  }
  return n;
}
function globalNames(ast: A.ProgramAst): FrameNames {
  return {
    name: "globais",
    slots: ast.globals.map((d) => ({ slot: d.slot, name: d.module && d.module !== ast.entry ? `${d.module.name}.${d.name}` : d.name, type: typeName(d.t) })),
  };
}
const MAIN_NAMES: FrameNames = { name: "algoritmo", slots: [] };
const rt = (msg: string, n: Loc) => new PortugolError(msg, n.line, n.col, "execucao", n.file ?? 0);

/** Vetor do VisuAlg com limites arbitrários (ex.: 1..10). */
class VArray {
  data: any[];
  constructor(public lo: number, public hi: number, fill: () => any) {
    this.data = new Array(hi - lo + 1);
    for (let i = 0; i < this.data.length; i++) this.data[i] = fill();
  }
  idx(i: number, at: Loc, name: string): number {
    if (!Number.isInteger(i) || i < this.lo || i > this.hi)
      throw rt(`Índice ${i} fora dos limites de "${name}" (válidos: ${this.lo} a ${this.hi})`, at);
    return i - this.lo;
  }
}

export function compileVisualg(src: string): Program {
  return compileVisualgProject([{ path: "principal.alg", source: src }], "principal.alg");
}

/** Compila um projeto: liga os módulos a partir da entrada e analisa tudo. */
export function compileVisualgProject(files: SourceFile[], entry: string, opts: CompileOptions = {}): Program {
  const ast = parseVisualgProject(files, entry, 0, opts);
  return new VisualgProgram(ast, ast.files);
}

function defaultValue(t: TypeRef): any {
  switch (t.base) {
    case "inteiro": case "real": return 0;
    case "caractere": return "";
    case "logico": return false;
    case "registro": return zeroRecord(t.decl as A.RecordDecl);
    case "classe": case "ref": case "nulo": return null;
    default: return undefined;
  }
}

function makeVar(t: TypeRef, ranges: A.Range[]): any {
  if (ranges.length === 0) return defaultValue(t);
  const [r, ...rest] = ranges;
  return new VArray(r.lo, r.hi, () => (rest.length ? makeVar(t, rest) : defaultValue(t)));
}

function zeroRecord(decl: A.RecordDecl): StructVal {
  return new StructVal(decl, decl.fields.map((f) => makeVar(f.t, f.ranges)));
}

const nullCheck = (v: any, what: string, n: Loc) => {
  if (v === null) throw rt(`"${what}" é nulo: nenhum objeto foi criado para ele (use novo NomeDaClasse(...) para criar)`, n);
  if (v === undefined) throw rt(`"${what}" ainda não tem valor`, n);
};

function describeExpr(e: A.Expr): string {
  switch (e.k) {
    case "var": return e.name;
    case "index": return describeExpr(e.target) + "[...]";
    case "member": return describeExpr(e.obj) + "." + e.name;
    case "deref": return "*" + describeExpr(e.e);
    default: return "expressão";
  }
}

class VisualgProgram implements Program {
  private G: Frame = [];
  private host!: Host;
  private depth = 0;
  private dbg: Debugger | null = null;
  private cov: CoverageCollector | null = null;
  tests: TestInfo[];

  constructor(private ast: A.ProgramAst, public files: string[] = ["principal.alg"]) {
    this.tests = ast.tests.map((t, id) => ({ id, name: t.name, file: files[t.file] ?? files[0], line: t.line }));
  }

  attachDebugger(d: Debugger) {
    this.dbg = d;
    d.setFiles(this.files);
    markAllBlocking(this.ast);
  }

  attachCoverage(c: CoverageCollector) {
    this.cov = c;
    c.bind(this.files, this.coverageUnits());
  }

  /** Funções, procedimentos, métodos e corpos de algoritmo (sem os testes). */
  private coverageUnits(): CoverageUnit[] {
    const subs = new Set<A.Sub>(this.ast.subs.values());
    for (const c of this.ast.classes) { for (const m of c.methods) subs.add(m); if (c.ctor) subs.add(c.ctor); }
    const units: CoverageUnit[] = [];
    for (const f of subs) {
      if (f.isTest || !f.body.length) continue;
      units.push({ name: f.qname, file: this.files[f.file] ?? this.files[0], line: f.line, lines: statementLines(f.body) });
    }
    const mains = [{ module: this.ast.entry, body: this.ast.body }, ...this.ast.bodies];
    for (const m of mains) {
      if (!m.body.length) continue;
      units.push({ name: "algoritmo", file: m.module.file, line: m.body[0].line, lines: statementLines(m.body) });
    }
    return units;
  }

  /** Executa um teste: globais reiniciadas, corpo como um procedimento sem parâmetros. */
  async runTest(host: Host, id: number) {
    const t = this.ast.tests[id];
    if (!t) throw new PortugolError(`Teste ${id} não existe`, 0, 0, "interno");
    this.initGlobals(host);
    const F = this.newFrame(t, []);
    this.dbg?.enter(namesOf(t), F);
    try {
      if (t.blocking) await this.runBodyA(t.body, F);
      else this.runBody(t.body, F);
    } catch (e) {
      if (e instanceof ReturnSignal) return;
      throw finalizeError(e);
    } finally {
      this.dbg?.leave();
    }
  }

  private initGlobals(host: Host) {
    this.host = host;
    this.G = new Array(this.ast.nglobals);
    for (const d of this.ast.globals) this.G[d.slot] = makeVar(d.t, d.ranges);
    for (const c of this.ast.constInits) this.G[c.slot] = c.value.value;
    this.dbg?.setGlobals(globalNames(this.ast), this.G);
  }

  /** Corpo principal que `executar_algoritmo()` deve rodar: o do próprio arquivo ou o do único programa importado. */
  private programBody(at: Loc): A.Stmt[] {
    if (this.ast.body.length) return this.ast.body;
    if (this.ast.bodies.length === 1) return this.ast.bodies[0].body;
    if (this.ast.bodies.length === 0) throw rt('"executar_algoritmo" precisa de um algoritmo: escreva os testes no próprio arquivo do algoritmo ou importe-o no arquivo de testes', at);
    throw rt(`"executar_algoritmo" não sabe qual algoritmo rodar: o arquivo de testes importa ${this.ast.bodies.length} programas (${this.ast.bodies.map((b) => b.module.file).join(", ")})`, at);
  }

  private captured(at: Loc): string {
    if (!this.host.captured) throw rt('"saida" só funciona dentro de um teste', at);
    return this.host.captured();
  }

  private feed(text: unknown, at: Loc) {
    if (!this.host.feed) throw rt('"entrada" só funciona dentro de um teste', at);
    this.host.feed(String(text));
  }

  snapshot(): Snapshot {
    if (this.dbg && this.dbg.depth > 0) return this.dbg.snapshot();
    return { frames: [], globals: describeFrame(globalNames(this.ast), this.G) };
  }

  async run(host: Host) {
    this.initGlobals(host);
    const F: Frame = [];
    const blocking = this.ast.body.some((s) => s.blocking);
    this.dbg?.enter(MAIN_NAMES, F);
    try {
      if (blocking) await this.runBodyA(this.ast.body, F);
      else this.runBody(this.ast.body, F);
    } catch (e) {
      throw finalizeError(e);
    } finally {
      this.dbg?.leave();
    }
  }

  // ======================= síncrono =======================
  private runBody(body: A.Stmt[], F: Frame) {
    for (let i = 0; i < body.length; i++) this.exec(body[i], F);
  }

  private exec(s: A.Stmt, F: Frame): void {
    if (this.cov && s.k !== "nop") this.cov.hit(s.file, s.line);
    switch (s.k) {
      case "assign": {
        let v = this.coerce(this.evalE(s.value, F), s.target.t);
        if (s.copy) v = copyStruct(v);
        this.store(s.target, v, F);
        return;
      }
      case "write": {
        let out = "";
        for (const a of s.args) {
          const v = this.evalE(a.e, F);
          if (a.width || a.decimals) out += formatWithWidth(v, a.width ? this.evalE(a.width, F) : null, a.decimals ? this.evalE(a.decimals, F) : null, a.e.t);
          else out += formatVisualg(v, a.e.t);
        }
        if (s.newline) out += "\n";
        this.host.write(out);
        return;
      }
      case "callstmt": this.evalE(s.call, F); return;
      case "if":
        if (this.evalE(s.cond, F)) this.runBody(s.then, F);
        else if (s.else) this.runBody(s.else, F);
        return;
      case "while":
        try { while (this.evalE(s.cond, F)) this.runBody(s.body, F); } catch (e) { if (e !== BREAK) throw e; }
        return;
      case "repeat":
        try { do this.runBody(s.body, F); while (s.cond === null || !this.evalE(s.cond, F)); } catch (e) { if (e !== BREAK) throw e; }
        return;
      case "for": {
        const from = this.evalE(s.from, F), to = this.evalE(s.to, F);
        const step = s.step ? this.evalE(s.step, F) : 1;
        if (step === 0) throw rt('O "passo" do "para" não pode ser zero', s);
        try {
          if (step > 0) for (let i = from; i <= to; i += step) { this.store(s.v, i, F); this.runBody(s.body, F); }
          else for (let i = from; i >= to; i += step) { this.store(s.v, i, F); this.runBody(s.body, F); }
        } catch (e) { if (e !== BREAK) throw e; }
        return;
      }
      case "switch": {
        const v = this.evalE(s.e, F);
        for (const c of s.cases) {
          if (c.items === null) continue;
          for (const it of c.items) {
            const lo = this.evalE(it.lo, F);
            const ok = it.hi ? v >= lo && v <= this.evalE(it.hi, F) : v === lo;
            if (ok) { this.runBody(c.body, F); return; }
          }
        }
        const def = s.cases.find((c) => c.items === null);
        if (def) this.runBody(def.body, F);
        return;
      }
      case "read": throw rt("leitura em contexto síncrono", s); // nunca acontece: read é sempre bloqueante
      case "pause": return;
      case "break": throw BREAK;
      case "return": {
        const v = this.evalE(s.value!, F);
        throw new ReturnSignal(s.copy ? copyStruct(v) : v);
      }
      case "clear": this.host.clear(); return;
      case "nop": return;
    }
  }

  private coerce(v: any, t: TypeRef) {
    if (t.base === "inteiro" && typeof v === "number") return Math.trunc(v);
    return v;
  }

  private evalE(e: A.Expr, F: Frame): any {
    switch (e.k) {
      case "lit": return e.value;
      case "var": {
        const v = e.global ? this.G[e.slot] : F[e.slot];
        return e.ref ? (v as Ref).get() : v;
      }
      case "index": {
        const c = this.containerOf(e, F);
        return c.arr.data[c.idx];
      }
      case "member": {
        const o = this.evalE(e.obj, F);
        nullCheck(o, describeExpr(e.obj), e);
        return o.f[e.index];
      }
      case "deref": {
        const r = this.evalE(e.e, F);
        if (r === null || r === undefined) throw rt(`Referência nula: "${describeExpr(e.e)}" não aponta para nenhuma variável (use & para apontar)`, e);
        return (r as Ref).get();
      }
      case "addr": return this.makeRef(e.target, F);
      case "bin": {
        const l = this.evalE(e.l, F);
        if (e.op === "e") return l ? this.evalE(e.r, F) : false;
        if (e.op === "ou") return l ? true : this.evalE(e.r, F);
        return this.binop(e, l, this.evalE(e.r, F));
      }
      case "un": {
        const v = this.evalE(e.e, F);
        return e.op === "nao" ? !v : -v;
      }
      case "call": return this.call(e, F);
      case "mcall": return this.mcall(e, F);
      case "new": return this.construct(e, F);
    }
  }

  private binop(e: A.Bin, l: any, r: any): any {
    switch (e.op) {
      case "+": return l + r;
      case "-": return l - r;
      case "*": return l * r;
      case "/": if (r === 0) throw rt("Divisão por zero", e); return l / r;
      case "\\": case "div": if (r === 0) throw rt("Divisão por zero", e); return Math.trunc(l / r);
      case "mod": case "%": if (r === 0) throw rt("Divisão por zero (mod)", e); return l % r;
      case "^": {
        const v = Math.pow(l, r);
        return e.t.base === "inteiro" ? Math.trunc(v) : v;
      }
      case "=": return l instanceof StructVal ? structEquals(l, r) : l === r;
      case "<>": return l instanceof StructVal ? !structEquals(l, r) : l !== r;
      case "<": return l < r;
      case ">": return l > r;
      case "<=": return l <= r;
      case ">=": return l >= r;
      case "xou": return l !== r;
      case "e": return l && r;
      case "ou": return l || r;
    }
    throw rt(`Operador desconhecido "${e.op}"`, e);
  }

  private containerOf(e: A.Index, F: Frame): { arr: VArray; idx: number } {
    const name = describeExpr(e.target);
    let arr = this.evalE(e.target, F) as VArray;
    for (let i = 0; i < e.indices.length; i++) {
      if (!(arr instanceof VArray)) throw rt(`"${name}" não é um vetor`, e);
      const idx = arr.idx(this.evalE(e.indices[i], F), e.indices[i], name);
      if (i === e.indices.length - 1) return { arr, idx };
      arr = arr.data[idx];
    }
    throw rt("Índice inválido", e);
  }

  private store(t: A.LValue, v: any, F: Frame) {
    switch (t.k) {
      case "var":
        if (t.ref) ((t.global ? this.G : F)[t.slot] as Ref).set(v);
        else if (t.global) this.G[t.slot] = v;
        else F[t.slot] = v;
        return;
      case "index": {
        const c = this.containerOf(t, F);
        c.arr.data[c.idx] = v;
        return;
      }
      case "member": {
        const o = this.evalE(t.obj, F);
        nullCheck(o, describeExpr(t.obj), t);
        o.f[t.index] = v;
        return;
      }
      case "deref": {
        const r = this.evalE(t.e, F);
        if (r === null || r === undefined) throw rt(`Referência nula: "${describeExpr(t.e)}" não aponta para nenhuma variável (use & para apontar)`, t);
        (r as Ref).set(v);
        return;
      }
    }
  }

  private makeRef(a: A.LValue, F: Frame): Ref {
    switch (a.k) {
      case "var": {
        if (a.ref) return (a.global ? this.G : F)[a.slot] as Ref;
        const M = a.global ? this.G : F, slot = a.slot;
        return new Ref(() => M[slot], (v) => { M[slot] = v; });
      }
      case "index": {
        const c = this.containerOf(a, F);
        return new Ref(() => c.arr.data[c.idx], (v) => { c.arr.data[c.idx] = v; });
      }
      case "member": {
        const o = this.evalE(a.obj, F);
        nullCheck(o, describeExpr(a.obj), a);
        const i = a.index;
        return new Ref(() => o.f[i], (v) => { o.f[i] = v; });
      }
      case "deref": {
        const r = this.evalE(a.e, F);
        if (r === null || r === undefined) throw rt(`Referência nula: "${describeExpr(a.e)}" não aponta para nenhuma variável`, a);
        return r as Ref;
      }
    }
  }

  private argsFor(params: A.Param[], args: A.Expr[], copyArgs: boolean[], F: Frame, offset: number): any[] {
    const out = new Array(params.length);
    for (let i = offset; i < params.length; i++) {
      const p = params[i], a = args[i - offset];
      if (p.ref) out[i] = this.makeRef(a as A.LValue, F);
      else {
        let v = this.coerce(this.evalE(a, F), p.t);
        if (copyArgs[i - offset]) v = copyStruct(v);
        out[i] = v;
      }
    }
    return out;
  }

  private call(e: A.Call, F: Frame): any {
    if (e.builtin) {
      const b = e.builtin;
      if (b.name === "saida") return this.captured(e);
      if (b.name === "entrada") { this.feed(this.evalE(e.args[0], F), e); return; }
      if (b.name === "executar_algoritmo") {
        const body = this.programBody(e);
        if (body.some((x) => x.blocking)) throw rt("Erro interno: executar_algoritmo fora do caminho assíncrono", e);
        this.runBody(body, []);
        return;
      }
      return b.impl(e.args.map((a) => this.evalE(a, F)), e);
    }
    const fn = e.fn!;
    return this.invoke(fn, this.argsFor(fn.params, e.args, e.copyArgs, F, 0), e);
  }

  private mcall(e: A.MethodCall, F: Frame): any {
    if (e.isSuper) {
      const m = e.method!;
      const args = this.argsFor(m.params, e.args, e.copyArgs, F, 1);
      args[0] = F[0];
      return this.invoke(m, args, e);
    }
    const obj = this.evalE(e.obj, F);
    if (obj === null || obj === undefined) throw rt(`Tentativa de chamar "${e.name}" em "${describeExpr(e.obj)}", que é nulo (nenhum objeto foi criado)`, e);
    const m = (obj as ObjVal).cls.vtable[e.vslot] as A.Sub;
    const args = this.argsFor(m.params, e.args, e.copyArgs, F, 1);
    args[0] = obj;
    return this.invoke(m, args, e);
  }

  private newObject(decl: A.ClassDecl): ObjVal {
    return new ObjVal(decl, decl.allFields.map((f) => makeVar(f.t, f.ranges)));
  }

  private construct(e: A.New, F: Frame): any {
    const decl = e.decl!;
    const obj = this.newObject(decl);
    const ctor = decl.ctor!;
    const args = this.argsFor(ctor.params, e.args, e.copyArgs, F, 1);
    args[0] = obj;
    this.invoke(ctor, args, e);
    return obj;
  }

  private newFrame(fn: A.Sub, args: any[]): Frame {
    const NF: Frame = new Array(fn.nslots);
    for (let i = 0; i < args.length; i++) NF[fn.params[i].slot] = args[i];
    for (const d of fn.locals) NF[d.slot] = makeVar(d.t, d.ranges);
    if (fn.isFunction) NF[fn.retSlot] = defaultValue(fn.ret);
    return NF;
  }

  private invoke(fn: A.Sub, args: any[], at: Loc): any {
    if (++this.depth > MAX_CALL_DEPTH) { this.depth = 0; throw stackOverflow(at.line, at.col); }
    const NF = this.newFrame(fn, args);
    try {
      this.runBody(fn.body, NF);
    } catch (e) {
      if (e instanceof ReturnSignal) return this.coerce(e.value, fn.ret);
      throw wrapJsError(e, at.line, at.col);
    } finally {
      this.depth--;
    }
    return fn.isFunction ? NF[fn.retSlot] : undefined;
  }

  // ======================= assíncrono =======================
  private async runBodyA(body: A.Stmt[], F: Frame) {
    for (let i = 0; i < body.length; i++) {
      const s = body[i];
      if (this.dbg && s.k !== "nop") await this.dbg.before(s);
      if (s.blocking) await this.execA(s, F);
      else this.exec(s, F);
    }
  }

  private async execA(s: A.Stmt, F: Frame): Promise<void> {
    if (!s.blocking) return this.exec(s, F);
    if (this.cov && s.k !== "nop") this.cov.hit(s.file, s.line);
    switch (s.k) {
      case "assign": {
        let v = this.coerce(await this.evalA(s.value, F), s.target.t);
        if (s.copy) v = copyStruct(v);
        this.store(s.target, v, F);
        return;
      }
      case "write": {
        let out = "";
        for (const a of s.args) {
          const v = await this.evalA(a.e, F);
          if (a.width || a.decimals) out += formatWithWidth(v, a.width ? await this.evalA(a.width, F) : null, a.decimals ? await this.evalA(a.decimals, F) : null, a.e.t);
          else out += formatVisualg(v, a.e.t);
        }
        if (s.newline) out += "\n";
        this.host.write(out);
        return;
      }
      case "read":
        for (const t of s.targets) {
          const line = await this.host.readLine();
          this.store(t, this.convertInput(line, t.t, t), F);
        }
        return;
      case "callstmt": await this.evalA(s.call, F); return;
      case "if":
        if (await this.evalA(s.cond, F)) await this.runBodyA(s.then, F);
        else if (s.else) await this.runBodyA(s.else, F);
        return;
      // Nos laços, o depurador para na linha do cabeçalho a cada iteração.
      case "while":
        try {
          for (;;) {
            if (this.dbg) await this.dbg.before(s);
            if (!(await this.evalA(s.cond, F))) break;
            await this.runBodyA(s.body, F);
          }
        } catch (e) { if (e !== BREAK) throw e; }
        return;
      case "repeat":
        try {
          do {
            if (this.dbg) await this.dbg.before(s);
            await this.runBodyA(s.body, F);
          } while (s.cond === null || !(await this.evalA(s.cond, F)));
        } catch (e) { if (e !== BREAK) throw e; }
        return;
      case "for": {
        const from = await this.evalA(s.from, F), to = await this.evalA(s.to, F);
        const step = s.step ? await this.evalA(s.step, F) : 1;
        if (step === 0) throw rt('O "passo" do "para" não pode ser zero', s);
        const iter = async (i: number) => {
          this.store(s.v, i, F);
          if (this.dbg) await this.dbg.before(s);
          await this.runBodyA(s.body, F);
        };
        try {
          if (step > 0) for (let i = from; i <= to; i += step) await iter(i);
          else for (let i = from; i >= to; i += step) await iter(i);
        } catch (e) { if (e !== BREAK) throw e; }
        return;
      }
      case "switch": {
        const v = await this.evalA(s.e, F);
        for (const c of s.cases) {
          if (c.items === null) continue;
          for (const it of c.items) {
            const lo = await this.evalA(it.lo, F);
            const ok = it.hi ? v >= lo && v <= (await this.evalA(it.hi, F)) : v === lo;
            if (ok) { await this.runBodyA(c.body, F); return; }
          }
        }
        const def = s.cases.find((c) => c.items === null);
        if (def) await this.runBodyA(def.body, F);
        return;
      }
      case "pause": await this.host.sleep(s.ms ? await this.evalA(s.ms, F) : 0); return;
      case "return": {
        const v = await this.evalA(s.value!, F);
        throw new ReturnSignal(s.copy ? copyStruct(v) : v);
      }
      default: this.exec(s, F);
    }
  }

  private async evalA(e: A.Expr, F: Frame): Promise<any> {
    if (!e.blocking) return this.evalE(e, F);
    switch (e.k) {
      case "index": {
        const name = describeExpr(e.target);
        let arr = (await this.evalA(e.target, F)) as VArray;
        for (let i = 0; i < e.indices.length; i++) arr = arr.data[arr.idx(await this.evalA(e.indices[i], F), e.indices[i], name)];
        return arr;
      }
      case "member": {
        const o = await this.evalA(e.obj, F);
        nullCheck(o, describeExpr(e.obj), e);
        return o.f[e.index];
      }
      case "deref": {
        const r = await this.evalA(e.e, F);
        if (r === null || r === undefined) throw rt(`Referência nula: "${describeExpr(e.e)}" não aponta para nenhuma variável (use & para apontar)`, e);
        return (r as Ref).get();
      }
      case "bin": {
        const l = await this.evalA(e.l, F);
        if (e.op === "e" && !l) return false;
        if (e.op === "ou" && l) return true;
        return this.binop(e, l, await this.evalA(e.r, F));
      }
      case "un": { const v = await this.evalA(e.e, F); return e.op === "nao" ? !v : -v; }
      case "call": return this.callA(e, F);
      case "mcall": return this.mcallA(e, F);
      case "new": return this.constructA(e, F);
      default: return this.evalE(e, F);
    }
  }

  private async argsForA(params: A.Param[], args: A.Expr[], copyArgs: boolean[], F: Frame, offset: number): Promise<any[]> {
    const out = new Array(params.length);
    for (let i = offset; i < params.length; i++) {
      const p = params[i], a = args[i - offset];
      if (p.ref) out[i] = this.makeRef(a as A.LValue, F);
      else {
        let v = this.coerce(await this.evalA(a, F), p.t);
        if (copyArgs[i - offset]) v = copyStruct(v);
        out[i] = v;
      }
    }
    return out;
  }

  private async callA(e: A.Call, F: Frame): Promise<any> {
    if (e.builtin) {
      const b = e.builtin;
      if (b.name === "saida") return this.captured(e);
      if (b.name === "executar_algoritmo") { await this.runBodyA(this.programBody(e), []); return; }
      const args: any[] = [];
      for (const a of e.args) args.push(await this.evalA(a, F));
      if (b.name === "entrada") { this.feed(args[0], e); return; }
      return b.impl(args, e);
    }
    const fn = e.fn!;
    const args = await this.argsForA(fn.params, e.args, e.copyArgs, F, 0);
    return this.invokeA(fn, args, e);
  }

  private async mcallA(e: A.MethodCall, F: Frame): Promise<any> {
    if (e.isSuper) {
      const m = e.method!;
      const args = await this.argsForA(m.params, e.args, e.copyArgs, F, 1);
      args[0] = F[0];
      return this.invokeA(m, args, e);
    }
    const obj = await this.evalA(e.obj, F);
    if (obj === null || obj === undefined) throw rt(`Tentativa de chamar "${e.name}" em "${describeExpr(e.obj)}", que é nulo (nenhum objeto foi criado)`, e);
    const m = (obj as ObjVal).cls.vtable[e.vslot] as A.Sub;
    const args = await this.argsForA(m.params, e.args, e.copyArgs, F, 1);
    args[0] = obj;
    return this.invokeA(m, args, e);
  }

  private async constructA(e: A.New, F: Frame): Promise<any> {
    const decl = e.decl!;
    const obj = this.newObject(decl);
    const ctor = decl.ctor!;
    const args = await this.argsForA(ctor.params, e.args, e.copyArgs, F, 1);
    args[0] = obj;
    await this.invokeA(ctor, args, e);
    return obj;
  }

  private async invokeA(fn: A.Sub, args: any[], at: Loc): Promise<any> {
    if (!fn.blocking) return this.invoke(fn, args, at);
    if (++this.depth > MAX_CALL_DEPTH) { this.depth = 0; throw stackOverflow(at.line, at.col); }
    const NF = this.newFrame(fn, args);
    this.dbg?.enter(namesOf(fn), NF);
    try {
      await this.runBodyA(fn.body, NF);
    } catch (ex) {
      if (ex instanceof ReturnSignal) return this.coerce(ex.value, fn.ret);
      throw wrapJsError(ex, at.line, at.col);
    } finally {
      this.depth--;
      this.dbg?.leave();
    }
    return fn.isFunction ? NF[fn.retSlot] : undefined;
  }

  private convertInput(line: string, t: TypeRef, n: Loc): any {
    switch (t.base) {
      case "inteiro": {
        const v = parseIntStrict(line);
        if (v === null) throw rt(`Valor inválido: "${line}" não é um número inteiro`, n);
        return v;
      }
      case "real": {
        const v = parseRealStrict(line);
        if (v === null) throw rt(`Valor inválido: "${line}" não é um número real`, n);
        return v;
      }
      case "logico": {
        const b = parseBool(line);
        if (b !== null) return b;
        throw rt(`Valor inválido: "${line}" não é um valor lógico (digite ${BOOL_WORDS.yes} ou ${BOOL_WORDS.no})`, n);
      }
      default: return line;
    }
  }
}
