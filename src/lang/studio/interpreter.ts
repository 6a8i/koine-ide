import { BREAK, CompileOptions, Host, PortugolError, Program, ReturnSignal } from "../shared/types";
import { CoverageCollector, CoverageUnit, TestInfo, statementLines } from "../shared/testing";
import { SourceFile } from "../protocol";
import { MAX_CALL_DEPTH, Ref, StructVal, ObjVal, copyStruct, structEquals, finalizeError, parseIntStrict, parseRealStrict, stackOverflow, wrapJsError, parseBool, BOOL_WORDS } from "../shared/runtime";
import { linkModules } from "../shared/modules";
import * as A from "./ast";
import { TypeRef, typeName } from "./ast";
import { formatValue } from "./builtins";
import { parseStudio, RawModule } from "./parser";
import { resolveStudio } from "./resolver";
import { Debugger, FrameNames, Snapshot, describeFrame, markAllBlocking } from "../shared/debug";

type Frame = any[];
type Loc = { line: number; col: number; file?: number };

// ----- nomes das variáveis de cada função (para o depurador) -----
const namesCache = new WeakMap<A.FuncDecl, FrameNames>();

function collectDecls(body: A.Stmt[], out: FrameNames["slots"]) {
  for (const s of body) {
    switch (s.k) {
      case "decl": if (!s.global) out.push({ slot: s.slot, name: s.name, type: typeName(s.t) }); break;
      case "if": collectDecls(s.then, out); if (s.else) collectDecls(s.else, out); break;
      case "while": case "dowhile": case "block": collectDecls(s.body, out); break;
      case "for": if (s.init) collectDecls([s.init], out); collectDecls(s.body, out); break;
      case "switch": for (const c of s.cases) collectDecls(c.body, out); break;
    }
  }
}

function namesOf(fn: A.FuncDecl): FrameNames {
  let n = namesCache.get(fn);
  if (!n) {
    const slots: FrameNames["slots"] = fn.params.map((p) => ({ slot: p.slot, name: p.name, type: typeName(p.t) }));
    collectDecls(fn.body, slots);
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

const rt = (msg: string, n: Loc) => new PortugolError(msg, n.line, n.col, "execucao", n.file ?? 0);

export function compileStudio(src: string): Program {
  return compileStudioProject([{ path: "principal.por", source: src }], "principal.por");
}

/** Compila um projeto: analisa todos os arquivos, liga os módulos a partir da entrada e resolve o programa inteiro. */
export function compileStudioProject(files: SourceFile[], entry: string, opts: CompileOptions = {}): Program {
  const names = files.map((f) => f.path);
  let entryIndex = names.indexOf(entry);
  if (entryIndex < 0) entryIndex = 0;
  const raws: RawModule[] = files.map((f, i) => parseStudio(f.source, i, f.path, opts.locale ?? "pt-BR"));
  const entryRaw = raws[entryIndex];
  if (entryRaw.importable && !opts.tests) {
    throw new PortugolError(`O arquivo ${entryRaw.file} não tem a função "inicio" e não pode ser executado diretamente. Execute o arquivo principal do projeto`, 1, 1, "sintaxe", entryIndex);
  }
  // um arquivo só de testes pode importar o programa que testa
  const link = linkModules(raws, entryRaw, false, { canImportProgram: (from) => !!opts.tests && from.importable && from.tests.length > 0 });
  const ast = resolveStudio({ modules: link.order, entry: entryRaw, link, files: names, tests: opts.tests });
  return new StudioProgram(ast, names);
}

function defaultValue(t: TypeRef): any {
  switch (t.base) {
    case "inteiro": case "real": return 0;
    case "cadeia": case "caracter": return "";
    case "logico": return false;
    case "estrutura": return zeroStruct(t.decl as A.StructDecl);
    case "classe": case "ref": case "nulo": return null;
    default: return undefined;
  }
}

/** Valor inicial de um campo (vetores com tamanho fixo, estruturas zeradas, objetos/refs nulos). */
function defaultField(f: A.Field): any {
  if (f.dims.length) return fixedArray(f.dims, f.t);
  return defaultValue(f.t);
}

function fixedArray(dims: number[], t: TypeRef): any {
  const [s, ...rest] = dims;
  const arr = new Array(s);
  for (let i = 0; i < s; i++) arr[i] = rest.length ? fixedArray(rest, t) : defaultValue(t);
  return arr;
}

function zeroStruct(decl: A.StructDecl): StructVal {
  return new StructVal(decl, decl.fields.map(defaultField));
}

function makeArray(sizes: number[], t: TypeRef, n: Loc): any {
  const [s, ...rest] = sizes;
  if (!Number.isInteger(s) || s < 0) throw rt(`Tamanho de vetor inválido: ${s}`, n);
  const arr = new Array(s);
  for (let i = 0; i < s; i++) arr[i] = rest.length ? makeArray(rest, t, n) : defaultValue(t);
  return arr;
}

const nullCheck = (v: any, what: string, n: Loc) => {
  if (v === null) throw rt(`"${what}" é nulo: nenhum objeto foi criado para ele (use NomeDaClasse(...) para criar)`, n);
  if (v === undefined) throw rt(`"${what}" foi usada antes de receber um valor`, n);
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

class StudioProgram implements Program {
  private G: Frame = [];
  private host!: Host;
  private depth = 0;
  private dbg: Debugger | null = null;
  private cov: CoverageCollector | null = null;
  private mainF: Frame = [];
  tests: TestInfo[];

  constructor(private ast: A.ProgramAst, public files: string[] = ["principal.por"]) {
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

  /** Funções, métodos e construtores (sem os testes), com as linhas de comando de cada um. */
  private coverageUnits(): CoverageUnit[] {
    const fns = new Set<A.FuncDecl>([...this.ast.functions.values(), this.ast.main]);
    for (const c of this.ast.classes) { for (const m of c.methods) fns.add(m); if (c.ctor) fns.add(c.ctor); }
    const units: CoverageUnit[] = [];
    for (const f of fns) {
      if (f.isTest || !f.body.length) continue;
      units.push({ name: f.qname, file: this.files[f.file] ?? this.files[0], line: f.line, lines: statementLines(f.body) });
    }
    return units;
  }

  /** Executa um teste: globais reiniciadas, corpo como uma função sem parâmetros. */
  async runTest(host: Host, id: number) {
    const t = this.ast.tests[id];
    if (!t) throw new PortugolError(`Teste ${id} não existe`, 0, 0, "interno");
    await this.initGlobals(host);
    await this.runMain(t);
  }

  private async initGlobals(host: Host) {
    this.host = host;
    this.G = new Array(this.ast.nglobals);
    this.dbg?.setGlobals(globalNames(this.ast), this.G);
    for (const d of this.ast.globals) {
      if (d.blocking) await this.execA(d, this.G);
      else this.exec(d, this.G);
    }
  }

  private async runMain(main: A.FuncDecl) {
    const F: Frame = new Array(main.nslots);
    this.mainF = F;
    this.dbg?.enter(namesOf(main), F);
    try {
      if (main.blocking) await this.runBodyA(main.body, F);
      else this.runBody(main.body, F);
    } catch (e) {
      if (e instanceof ReturnSignal) return;
      throw finalizeError(e);
    } finally {
      this.dbg?.leave();
    }
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
    return {
      frames: [{ name: this.ast.main.name, line: 0, vars: describeFrame(namesOf(this.ast.main), this.mainF) }],
      globals: describeFrame(globalNames(this.ast), this.G),
    };
  }

  async run(host: Host) {
    await this.initGlobals(host);
    await this.runMain(this.ast.main);
  }

  // ======================= Execução síncrona =======================
  private runBody(body: A.Stmt[], F: Frame) {
    for (let i = 0; i < body.length; i++) this.exec(body[i], F);
  }

  private exec(s: A.Stmt, F: Frame): void {
    if (this.cov) this.cov.hit(s.file, s.line);
    switch (s.k) {
      case "decl": {
        const M = s.global ? this.G : F;
        if (s.t.dims > 0) {
          if (s.init) M[s.slot] = this.buildArray(s.init as A.ArrayLit, s.t, s.sizes, F, s);
          else M[s.slot] = makeArray(s.sizes.map((e) => this.evalE(e!, F)), s.t, s);
        } else if (s.init) {
          const v = this.coerce(this.evalE(s.init, F), s.t);
          M[s.slot] = s.copy ? copyStruct(v) : v;
        } else M[s.slot] = s.t.base === "estrutura" ? zeroStruct(s.t.decl as A.StructDecl) : undefined;
        return;
      }
      case "expr": this.evalE(s.e, F); return;
      case "if":
        if (this.evalE(s.cond, F)) this.runBody(s.then, F);
        else if (s.else) this.runBody(s.else, F);
        return;
      case "while":
        try {
          while (this.evalE(s.cond, F)) this.runBody(s.body, F);
        } catch (e) { if (e !== BREAK) throw e; }
        return;
      case "dowhile":
        try {
          do this.runBody(s.body, F); while (this.evalE(s.cond, F));
        } catch (e) { if (e !== BREAK) throw e; }
        return;
      case "for":
        if (s.init) this.exec(s.init, F);
        try {
          while (s.cond === null || this.evalE(s.cond, F)) {
            this.runBody(s.body, F);
            if (s.step) this.evalE(s.step, F);
          }
        } catch (e) { if (e !== BREAK) throw e; }
        return;
      case "switch": {
        const v = this.evalE(s.e, F);
        let matched = false;
        try {
          for (const c of s.cases) {
            if (!matched) {
              if (c.values === null) continue;
              for (const ve of c.values) if (this.evalE(ve, F) === v) { matched = true; break; }
            }
            if (matched) this.runBody(c.body, F);
          }
          if (!matched) {
            const def = s.cases.find((c) => c.values === null);
            if (def) {
              matched = true;
              let after = false;
              for (const c of s.cases) {
                if (c === def) after = true;
                if (after) this.runBody(c.body, F);
              }
            }
          }
        } catch (e) { if (e !== BREAK) throw e; }
        return;
      }
      case "break": throw BREAK;
      case "return": {
        if (!s.value) throw new ReturnSignal(undefined);
        const v = this.evalE(s.value, F);
        throw new ReturnSignal(s.copy ? copyStruct(v) : v);
      }
      case "block": this.runBody(s.body, F); return;
    }
  }

  private buildArray(lit: A.Expr, t: TypeRef, sizes: (A.Expr | null)[], F: Frame, n: Loc): any {
    if (lit.k !== "arr") {
      const v = this.coerce(this.evalE(lit, F), t);
      return t.base === "estrutura" && t.dims === 0 && A.isLValue(lit) ? copyStruct(v) : v;
    }
    const arr = lit.items.map((it) => this.buildArray(it, A.withDims(t, t.dims - 1), sizes.slice(1), F, n));
    const declared = sizes[0];
    if (declared) {
      const sz = this.evalE(declared, F);
      if (arr.length > sz) throw rt(`O vetor foi declarado com tamanho ${sz}, mas recebeu ${arr.length} valores`, n);
      while (arr.length < sz) arr.push(t.dims > 1 ? makeArray(sizes.slice(1).map((e) => (e ? this.evalE(e, F) : 0)), t, n) : defaultValue(t));
    }
    return arr;
  }

  private coerce(v: any, t: TypeRef): any {
    if (t.base === "inteiro" && typeof v === "number") return Math.trunc(v);
    return v;
  }

  // ----- expressões -----
  private evalE(e: A.Expr, F: Frame): any {
    switch (e.k) {
      case "lit": return e.value;
      case "var": {
        const v = e.global ? this.G[e.slot] : F[e.slot];
        if (e.ref) return (v as Ref).get();
        if (v === undefined) throw rt(`A variável "${e.name}" foi usada antes de receber um valor`, e);
        return v;
      }
      case "index": return this.indexGet(e, F);
      case "member": {
        const o = this.evalE(e.obj, F);
        nullCheck(o, describeExpr(e.obj), e);
        return o.f[e.index];
      }
      case "deref": {
        const r = this.evalE(e.e, F);
        if (r === null) throw rt(`Referência nula: "${describeExpr(e.e)}" não aponta para nenhuma variável (use & para apontar)`, e);
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
        if (e.op === "nao") return !v;
        if (e.op === "-") return -v;
        return ~v;
      }
      case "assign": {
        let v = this.evalE(e.value, F);
        if (e.op !== "=") v = this.binop({ op: e.op[0], line: e.line, col: e.col, file: e.file, t: e.t }, this.evalE(e.target, F), v);
        v = this.coerce(v, e.t);
        if (e.copy) v = copyStruct(v);
        this.store(e.target, v, F);
        return v;
      }
      case "incdec": {
        const old = this.evalE(e.target, F);
        const nv = e.op === "++" ? old + 1 : old - 1;
        this.store(e.target, nv, F);
        return e.prefix ? nv : old;
      }
      case "call": return this.call(e, F);
      case "mcall": return this.mcall(e, F);
      case "new": return this.construct(e, F);
      case "arr": throw rt("Lista de valores inesperada", e);
    }
  }

  private indexGet(e: A.Index, F: Frame): any {
    let arr = this.evalE(e.target, F);
    for (let i = 0; i < e.indices.length; i++) {
      const idx = this.evalE(e.indices[i], F);
      if (!Array.isArray(arr)) throw rt("Tentativa de indexar algo que não é um vetor", e);
      if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length)
        throw rt(`Índice ${idx} fora dos limites (o ${Array.isArray(arr[0]) ? "número de linhas" : "tamanho"} é ${arr.length}, índices válidos: 0 a ${arr.length - 1})`, e.indices[i]);
      arr = arr[idx];
    }
    return arr;
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
        c.arr[c.idx] = v;
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
        if (r === null) throw rt(`Referência nula: "${describeExpr(t.e)}" não aponta para nenhuma variável (use & para apontar)`, t);
        (r as Ref).set(v);
        return;
      }
    }
  }

  private containerOf(t: A.Index, F: Frame): { arr: any[]; idx: number } {
    let arr = this.evalE(t.target, F);
    for (let i = 0; i < t.indices.length; i++) {
      const idx = this.evalE(t.indices[i], F);
      if (!Array.isArray(arr)) throw rt("Tentativa de indexar algo que não é um vetor", t);
      if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length)
        throw rt(`Índice ${idx} fora dos limites (tamanho ${arr.length}, índices válidos: 0 a ${arr.length - 1})`, t.indices[i]);
      if (i === t.indices.length - 1) return { arr, idx };
      arr = arr[idx];
    }
    throw rt("Índice inválido", t);
  }

  private binop(e: { op: string; line: number; col: number; file?: number; t: TypeRef; l?: A.Expr; r?: A.Expr }, l: any, r: any): any {
    switch (e.op) {
      case "+":
        if (typeof l === "string" || typeof r === "string") {
          return (typeof l === "string" ? l : formatValue(l, e.l?.t ?? null)) + (typeof r === "string" ? r : formatValue(r, e.r?.t ?? null));
        }
        return l + r;
      case "-": return l - r;
      case "*": return l * r;
      case "/":
        if (r === 0) throw rt("Divisão por zero", e);
        return e.t.base === "inteiro" ? Math.trunc(l / r) : l / r;
      case "%":
        if (r === 0) throw rt("Divisão por zero (resto)", e);
        return l % r;
      case "==": return l instanceof StructVal ? structEquals(l, r) : l === r;
      case "!=": return l instanceof StructVal ? !structEquals(l, r) : l !== r;
      case "<": return l < r;
      case ">": return l > r;
      case "<=": return l <= r;
      case ">=": return l >= r;
      case "e": return l && r;
      case "ou": return l || r;
      case "&": return typeof l === "boolean" ? l && r : l & r;
      case "|": return typeof l === "boolean" ? l || r : l | r;
      case "^": return typeof l === "boolean" ? l !== r : l ^ r;
      case "<<": return l << r;
      case ">>": return l >> r;
    }
    throw rt(`Operador desconhecido "${e.op}"`, e);
  }

  /** Argumentos de uma função/método do usuário (params pode começar com `este`, preenchido por quem chama). */
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
      if (b.name === "escreva") {
        let out = "";
        for (const a of e.args) out += formatValue(this.evalE(a, F), a.t);
        this.host.write(out);
        return;
      }
      if (b.name === "limpa") { this.host.clear(); return; }
      if (b.name === "saida") return this.captured(e);
      if (b.name === "entrada") { this.feed(this.evalE(e.args[0], F), e); return; }
      const args = e.args.map((a) => this.evalE(a, F));
      return b.impl!(args, e);
    }
    const fn = e.fn!;
    return this.invoke(fn, this.argsFor(fn.params, e.args, e.copyArgs, F, 0), e);
  }

  private mcall(e: A.MethodCall, F: Frame): any {
    if (e.isSuper) {
      const self = F[0];
      if (e.name === "<construtor>") {
        if (e.method) {
          const args = this.argsFor(e.method.params, e.args, e.copyArgs, F, 1);
          args[0] = self;
          this.invoke(e.method, args, e);
        }
        this.initFields(e.initsOf!, self, F);
        return undefined;
      }
      const m = e.method!;
      const args = this.argsFor(m.params, e.args, e.copyArgs, F, 1);
      args[0] = self;
      return this.invoke(m, args, e);
    }
    const obj = this.evalE(e.obj, F);
    if (obj === null) throw rt(`Tentativa de chamar "${e.name}" em "${describeExpr(e.obj)}", que é nulo (nenhum objeto foi criado)`, e);
    const m = (obj as ObjVal).cls.vtable[e.vslot] as A.MethodDecl;
    const args = this.argsFor(m.params, e.args, e.copyArgs, F, 1);
    args[0] = obj;
    return this.invoke(m, args, e);
  }

  /** Inicializadores de campo da classe (rodam logo após o super(...)). */
  private initFields(cls: A.ClassDecl, self: ObjVal, F: Frame) {
    for (const f of cls.ownFields) {
      if (!f.init) continue;
      const v = this.coerce(this.evalE(f.init, F), f.t);
      self.f[f.index] = v instanceof StructVal && A.isLValue(f.init) ? copyStruct(v) : v;
    }
  }

  private construct(e: A.New, F: Frame): any {
    const decl = e.decl!;
    if (decl.kind === "struct") {
      if (e.args.length === 0) return zeroStruct(decl);
      const f = new Array(decl.fields.length);
      for (let i = 0; i < decl.fields.length; i++) {
        let v = this.coerce(this.evalE(e.args[i], F), decl.fields[i].t);
        if (e.copyArgs[i]) v = copyStruct(v);
        f[i] = v;
      }
      return new StructVal(decl, f);
    }
    const obj = new ObjVal(decl, decl.allFields.map(defaultField));
    const ctor = decl.ctor!;
    const args = this.argsFor(ctor.params, e.args, e.copyArgs, F, 1);
    args[0] = obj;
    this.invoke(ctor, args, e);
    return obj;
  }

  private makeRef(a: A.LValue, F: Frame): Ref {
    switch (a.k) {
      case "var": {
        if (a.ref) return (a.global ? this.G : F)[a.slot] as Ref;
        const M = a.global ? this.G : F, slot = a.slot, name = a.name;
        return new Ref(
          () => {
            const v = M[slot];
            if (v === undefined) throw rt(`A variável "${name}" foi usada antes de receber um valor`, a);
            return v;
          },
          (v) => { M[slot] = v; },
        );
      }
      case "index": {
        const c = this.containerOf(a, F);
        return new Ref(() => c.arr[c.idx], (v) => { c.arr[c.idx] = v; });
      }
      case "member": {
        const o = this.evalE(a.obj, F);
        nullCheck(o, describeExpr(a.obj), a);
        const i = a.index;
        return new Ref(() => o.f[i], (v) => { o.f[i] = v; });
      }
      case "deref": {
        const r = this.evalE(a.e, F);
        if (r === null) throw rt(`Referência nula: "${describeExpr(a.e)}" não aponta para nenhuma variável`, a);
        return r as Ref;
      }
    }
  }

  private invoke(fn: A.FuncDecl, args: any[], at: Loc): any {
    if (++this.depth > MAX_CALL_DEPTH) { this.depth = 0; throw stackOverflow(at.line, at.col); }
    const NF: Frame = new Array(fn.nslots);
    for (let i = 0; i < args.length; i++) NF[fn.params[i].slot] = args[i];
    try {
      this.runBody(fn.body, NF);
    } catch (e) {
      if (e instanceof ReturnSignal) return this.coerce(e.value, fn.ret);
      throw wrapJsError(e, at.line, at.col);
    } finally {
      this.depth--;
    }
    return undefined;
  }

  // ======================= Execução assíncrona =======================
  // Só percorre nós marcados como bloqueantes; o resto delega à versão síncrona.

  private async runBodyA(body: A.Stmt[], F: Frame) {
    for (let i = 0; i < body.length; i++) {
      const s = body[i];
      if (this.dbg) await this.dbg.before(s);
      if (s.blocking) await this.execA(s, F);
      else this.exec(s, F);
    }
  }

  private async execA(s: A.Stmt, F: Frame): Promise<void> {
    if (!s.blocking) return this.exec(s, F);
    if (this.cov) this.cov.hit(s.file, s.line);
    switch (s.k) {
      case "decl": {
        const M = s.global ? this.G : F;
        if (s.t.dims > 0) {
          if (s.init) M[s.slot] = this.buildArray(s.init as A.ArrayLit, s.t, s.sizes, F, s); // listas bloqueantes são raras
          else M[s.slot] = makeArray(await Promise.all(s.sizes.map((e) => this.evalA(e!, F))), s.t, s);
        } else if (s.init) {
          const v = this.coerce(await this.evalA(s.init, F), s.t);
          M[s.slot] = s.copy ? copyStruct(v) : v;
        } else M[s.slot] = s.t.base === "estrutura" ? zeroStruct(s.t.decl as A.StructDecl) : undefined;
        return;
      }
      case "expr": await this.evalA(s.e, F); return;
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
      case "dowhile":
        try {
          do {
            if (this.dbg) await this.dbg.before(s);
            await this.runBodyA(s.body, F);
          } while (await this.evalA(s.cond, F));
        } catch (e) { if (e !== BREAK) throw e; }
        return;
      case "for":
        if (s.init) await this.execA(s.init, F);
        try {
          for (;;) {
            if (this.dbg) await this.dbg.before(s);
            if (s.cond !== null && !(await this.evalA(s.cond, F))) break;
            await this.runBodyA(s.body, F);
            if (s.step) await this.evalA(s.step, F);
          }
        } catch (e) { if (e !== BREAK) throw e; }
        return;
      case "switch": {
        const v = await this.evalA(s.e, F);
        let matched = false;
        try {
          for (const c of s.cases) {
            if (!matched) {
              if (c.values === null) continue;
              for (const ve of c.values) if ((await this.evalA(ve, F)) === v) { matched = true; break; }
            }
            if (matched) await this.runBodyA(c.body, F);
          }
          if (!matched) {
            const def = s.cases.find((c) => c.values === null);
            if (def) {
              let after = false;
              for (const c of s.cases) {
                if (c === def) after = true;
                if (after) await this.runBodyA(c.body, F);
              }
            }
          }
        } catch (e) { if (e !== BREAK) throw e; }
        return;
      }
      case "return": {
        if (!s.value) throw new ReturnSignal(undefined);
        const v = await this.evalA(s.value, F);
        throw new ReturnSignal(s.copy ? copyStruct(v) : v);
      }
      case "block": await this.runBodyA(s.body, F); return;
      case "break": throw BREAK;
    }
  }

  private async evalA(e: A.Expr, F: Frame): Promise<any> {
    if (!e.blocking) return this.evalE(e, F);
    switch (e.k) {
      case "index": {
        // avalia índices (possivelmente bloqueantes) e depois acessa
        const idxs: number[] = [];
        for (const i of e.indices) idxs.push(await this.evalA(i, F));
        let arr = await this.evalA(e.target, F);
        for (let i = 0; i < idxs.length; i++) {
          const idx = idxs[i];
          if (!Array.isArray(arr) || !Number.isInteger(idx) || idx < 0 || idx >= arr.length)
            throw rt(`Índice ${idx} fora dos limites (tamanho ${Array.isArray(arr) ? arr.length : 0})`, e.indices[i]);
          arr = arr[idx];
        }
        return arr;
      }
      case "member": {
        const o = await this.evalA(e.obj, F);
        nullCheck(o, describeExpr(e.obj), e);
        return o.f[e.index];
      }
      case "deref": {
        const r = await this.evalA(e.e, F);
        if (r === null) throw rt(`Referência nula: "${describeExpr(e.e)}" não aponta para nenhuma variável (use & para apontar)`, e);
        return (r as Ref).get();
      }
      case "bin": {
        const l = await this.evalA(e.l, F);
        if (e.op === "e" && !l) return false;
        if (e.op === "ou" && l) return true;
        const r = await this.evalA(e.r, F);
        return this.binop(e, l, r);
      }
      case "un": {
        const v = await this.evalA(e.e, F);
        return e.op === "nao" ? !v : e.op === "-" ? -v : ~v;
      }
      case "assign": {
        let v = await this.evalA(e.value, F);
        if (e.op !== "=") v = this.binop({ op: e.op[0], line: e.line, col: e.col, file: e.file, t: e.t }, this.evalE(e.target, F), v);
        v = this.coerce(v, e.t);
        if (e.copy) v = copyStruct(v);
        this.store(e.target, v, F);
        return v;
      }
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
      if (b.name === "leia") {
        for (const a of e.args) {
          const line = await this.host.readLine();
          this.store(a as A.LValue, this.convertInput(line, a.t, a), F);
        }
        return;
      }
      if (b.name === "escreva") {
        let out = "";
        for (const a of e.args) out += formatValue(await this.evalA(a, F), a.t);
        this.host.write(out);
        return;
      }
      if (b.name === "limpa") { this.host.clear(); return; }
      if (b.name === "saida") return this.captured(e);
      const args: any[] = [];
      for (const a of e.args) args.push(await this.evalA(a, F));
      if (b.name === "entrada") { this.feed(args[0], e); return; }
      if (b.name === "aguarde") { await this.host.sleep(args[0]); return; }
      return b.impl!(args, e);
    }
    const fn = e.fn!;
    const args = await this.argsForA(fn.params, e.args, e.copyArgs, F, 0);
    return this.invokeA(fn, args, e);
  }

  private async mcallA(e: A.MethodCall, F: Frame): Promise<any> {
    if (e.isSuper) {
      const self = F[0];
      if (e.name === "<construtor>") {
        if (e.method) {
          const args = await this.argsForA(e.method.params, e.args, e.copyArgs, F, 1);
          args[0] = self;
          await this.invokeA(e.method, args, e);
        }
        await this.initFieldsA(e.initsOf!, self, F);
        return undefined;
      }
      const m = e.method!;
      const args = await this.argsForA(m.params, e.args, e.copyArgs, F, 1);
      args[0] = self;
      return this.invokeA(m, args, e);
    }
    const obj = await this.evalA(e.obj, F);
    if (obj === null) throw rt(`Tentativa de chamar "${e.name}" em "${describeExpr(e.obj)}", que é nulo (nenhum objeto foi criado)`, e);
    const m = (obj as ObjVal).cls.vtable[e.vslot] as A.MethodDecl;
    const args = await this.argsForA(m.params, e.args, e.copyArgs, F, 1);
    args[0] = obj;
    return this.invokeA(m, args, e);
  }

  private async initFieldsA(cls: A.ClassDecl, self: ObjVal, F: Frame) {
    for (const f of cls.ownFields) {
      if (!f.init) continue;
      const v = this.coerce(await this.evalA(f.init, F), f.t);
      self.f[f.index] = v instanceof StructVal && A.isLValue(f.init) ? copyStruct(v) : v;
    }
  }

  private async constructA(e: A.New, F: Frame): Promise<any> {
    const decl = e.decl!;
    if (decl.kind === "struct") {
      if (e.args.length === 0) return zeroStruct(decl);
      const f = new Array(decl.fields.length);
      for (let i = 0; i < decl.fields.length; i++) {
        let v = this.coerce(await this.evalA(e.args[i], F), decl.fields[i].t);
        if (e.copyArgs[i]) v = copyStruct(v);
        f[i] = v;
      }
      return new StructVal(decl, f);
    }
    const obj = new ObjVal(decl, decl.allFields.map(defaultField));
    const ctor = decl.ctor!;
    const args = await this.argsForA(ctor.params, e.args, e.copyArgs, F, 1);
    args[0] = obj;
    await this.invokeA(ctor, args, e);
    return obj;
  }

  private async invokeA(fn: A.FuncDecl, args: any[], at: Loc): Promise<any> {
    if (!fn.blocking) return this.invoke(fn, args, at);
    if (++this.depth > MAX_CALL_DEPTH) { this.depth = 0; throw stackOverflow(at.line, at.col); }
    const NF: Frame = new Array(fn.nslots);
    for (let i = 0; i < args.length; i++) NF[fn.params[i].slot] = args[i];
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
    return undefined;
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
      case "caracter": return line.length ? line[0] : "";
      default: return line;
    }
  }
}

export { typeName };
