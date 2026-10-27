import { BREAK, BreakSignal, Host, PortugolError, Program, ReturnSignal } from "../shared/types";
import { MAX_CALL_DEPTH, finalizeError, parseIntStrict, parseRealStrict, stackOverflow, wrapJsError } from "../shared/runtime";
import * as A from "./ast";
import { TypeRef, typeName } from "./ast";
import { formatValue } from "./builtins";
import { parseStudio } from "./parser";
import { resolveStudio } from "./resolver";
import { Debugger, FrameNames, Snapshot, describeFrame, markAllBlocking } from "../shared/debug";

type Frame = any[];

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
    n = { name: fn.name, slots };
    namesCache.set(fn, n);
  }
  return n;
}

function globalNames(ast: A.ProgramAst): FrameNames {
  return { name: "globais", slots: ast.globals.map((d) => ({ slot: d.slot, name: d.name, type: typeName(d.t) })) };
}

/** Referência a uma posição de memória (parâmetros por &). */
class Ref {
  constructor(public get: () => any, public set: (v: any) => void) {}
}

const rt = (msg: string, n: { line: number; col: number }) => new PortugolError(msg, n.line, n.col);

export function compileStudio(src: string): Program {
  const ast = resolveStudio(parseStudio(src));
  return new StudioProgram(ast);
}

function defaultValue(t: TypeRef): any {
  switch (t.base) {
    case "inteiro": case "real": return 0;
    case "cadeia": case "caracter": return "";
    case "logico": return false;
    default: return undefined;
  }
}

function makeArray(sizes: number[], t: TypeRef, n: { line: number; col: number }): any {
  const [s, ...rest] = sizes;
  if (!Number.isInteger(s) || s < 0) throw rt(`Tamanho de vetor inválido: ${s}`, n);
  const arr = new Array(s);
  for (let i = 0; i < s; i++) arr[i] = rest.length ? makeArray(rest, t, n) : defaultValue(t);
  return arr;
}

class StudioProgram implements Program {
  private G: Frame = [];
  private host!: Host;
  private depth = 0;
  private dbg: Debugger | null = null;
  private mainF: Frame = [];

  constructor(private ast: A.ProgramAst) {}

  attachDebugger(d: Debugger) {
    this.dbg = d;
    markAllBlocking(this.ast);
  }

  snapshot(): Snapshot {
    if (this.dbg && this.dbg.depth > 0) return this.dbg.snapshot();
    return {
      frames: [{ name: this.ast.main.name, line: 0, vars: describeFrame(namesOf(this.ast.main), this.mainF) }],
      globals: describeFrame(globalNames(this.ast), this.G),
    };
  }

  async run(host: Host) {
    this.host = host;
    this.G = new Array(this.ast.nglobals);
    this.dbg?.setGlobals(globalNames(this.ast), this.G);
    for (const d of this.ast.globals) {
      if (d.blocking) await this.execA(d, this.G);
      else this.exec(d, this.G);
    }
    const main = this.ast.main;
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

  // ======================= Execução síncrona =======================
  private runBody(body: A.Stmt[], F: Frame) {
    for (let i = 0; i < body.length; i++) this.exec(body[i], F);
  }

  private exec(s: A.Stmt, F: Frame): void {
    switch (s.k) {
      case "decl": {
        const M = s.global ? this.G : F;
        if (s.t.dims > 0) {
          if (s.init) M[s.slot] = this.buildArray(s.init as A.ArrayLit, s.t, s.sizes, F, s);
          else M[s.slot] = makeArray(s.sizes.map((e) => this.evalE(e!, F)), s.t, s);
        } else if (s.init) M[s.slot] = this.coerce(this.evalE(s.init, F), s.t);
        else M[s.slot] = undefined;
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
      case "return": throw new ReturnSignal(s.value ? this.evalE(s.value, F) : undefined);
      case "block": this.runBody(s.body, F); return;
    }
  }

  private buildArray(lit: A.Expr, t: TypeRef, sizes: (A.Expr | null)[], F: Frame, n: { line: number; col: number }): any {
    if (lit.k !== "arr") return this.coerce(this.evalE(lit, F), t);
    const arr = lit.items.map((it) => this.buildArray(it, A.T(t.base, t.dims - 1), sizes.slice(1), F, n));
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
        if (e.op !== "=") v = this.binop({ op: e.op[0], line: e.line, col: e.col, t: e.t } as any, this.readLValue(e.target, F), v);
        v = this.coerce(v, e.t);
        this.store(e.target, v, F);
        return v;
      }
      case "incdec": {
        const old = this.readLValue(e.target, F);
        const nv = e.op === "++" ? old + 1 : old - 1;
        this.store(e.target, nv, F);
        return e.prefix ? nv : old;
      }
      case "call": return this.call(e, F);
      case "arr": throw rt("Lista de valores inesperada", e);
    }
  }

  private readLValue(t: A.Var | A.Index, F: Frame): any {
    return this.evalE(t, F);
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

  private store(t: A.Var | A.Index, v: any, F: Frame) {
    if (t.k === "var") {
      if (t.ref) ((t.global ? this.G : F)[t.slot] as Ref).set(v);
      else if (t.global) this.G[t.slot] = v;
      else F[t.slot] = v;
      return;
    }
    const container = this.containerOf(t, F);
    container.arr[container.idx] = v;
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

  private binop(e: { op: string; line: number; col: number; t: TypeRef }, l: any, r: any): any {
    switch (e.op) {
      case "+":
        if (typeof l === "string" || typeof r === "string") {
          return (typeof l === "string" ? l : formatValue(l, null)) + (typeof r === "string" ? r : formatValue(r, null));
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
      case "==": return l === r;
      case "!=": return l !== r;
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
      const args = e.args.map((a) => this.evalE(a, F));
      return b.impl!(args, e);
    }
    const fn = e.fn!;
    const args = fn.params.map((p, i) => (p.ref ? this.makeRef(e.args[i] as A.Var | A.Index, F) : this.coerce(this.evalE(e.args[i], F), p.t)));
    return this.invoke(fn, args, e);
  }

  private makeRef(a: A.Var | A.Index, F: Frame): Ref {
    if (a.k === "var") {
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
    const c = this.containerOf(a, F);
    return new Ref(() => c.arr[c.idx], (v) => { c.arr[c.idx] = v; });
  }

  private invoke(fn: A.FuncDecl, args: any[], at: { line: number; col: number }): any {
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
    switch (s.k) {
      case "decl": {
        const M = s.global ? this.G : F;
        if (s.t.dims > 0) {
          if (s.init) M[s.slot] = this.buildArray(s.init as A.ArrayLit, s.t, s.sizes, F, s); // listas bloqueantes são raras
          else M[s.slot] = makeArray(await Promise.all(s.sizes.map((e) => this.evalA(e!, F))), s.t, s);
        } else if (s.init) M[s.slot] = this.coerce(await this.evalA(s.init, F), s.t);
        else M[s.slot] = undefined;
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
      case "return": throw new ReturnSignal(s.value ? await this.evalA(s.value, F) : undefined);
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
        if (e.op !== "=") v = this.binop({ op: e.op[0], line: e.line, col: e.col, t: e.t } as any, this.readLValue(e.target, F), v);
        v = this.coerce(v, e.t);
        this.store(e.target, v, F);
        return v;
      }
      case "call": return this.callA(e, F);
      default: return this.evalE(e, F);
    }
  }

  private async callA(e: A.Call, F: Frame): Promise<any> {
    if (e.builtin) {
      const b = e.builtin;
      if (b.name === "leia") {
        for (const a of e.args) {
          const line = await this.host.readLine();
          this.store(a as A.Var | A.Index, this.convertInput(line, a.t, a), F);
        }
        return;
      }
      if (b.name === "escreva") {
        let out = "";
        for (const a of e.args) out += formatValue(await this.evalA(a, F), a.t);
        this.host.write(out);
        return;
      }
      const args: any[] = [];
      for (const a of e.args) args.push(await this.evalA(a, F));
      if (b.name === "aguarde") { await this.host.sleep(args[0]); return; }
      return b.impl!(args, e);
    }
    const fn = e.fn!;
    const args: any[] = [];
    for (let i = 0; i < fn.params.length; i++) {
      const p = fn.params[i];
      args.push(p.ref ? this.makeRef(e.args[i] as A.Var | A.Index, F) : this.coerce(await this.evalA(e.args[i], F), p.t));
    }
    if (!fn.blocking) return this.invoke(fn, args, e);
    if (++this.depth > MAX_CALL_DEPTH) { this.depth = 0; throw stackOverflow(e.line, e.col); }
    const NF: Frame = new Array(fn.nslots);
    for (let i = 0; i < args.length; i++) NF[fn.params[i].slot] = args[i];
    this.dbg?.enter(namesOf(fn), NF);
    try {
      await this.runBodyA(fn.body, NF);
    } catch (ex) {
      if (ex instanceof ReturnSignal) return this.coerce(ex.value, fn.ret);
      throw wrapJsError(ex, e.line, e.col);
    } finally {
      this.depth--;
      this.dbg?.leave();
    }
    return undefined;
  }

  private convertInput(line: string, t: TypeRef, n: { line: number; col: number }): any {
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
        const s = line.trim().toLowerCase();
        if (s === "verdadeiro" || s === "v" || s === "true" || s === "1") return true;
        if (s === "falso" || s === "f" || s === "false" || s === "0") return false;
        throw rt(`Valor inválido: "${line}" não é um valor lógico (digite verdadeiro ou falso)`, n);
      }
      case "caracter": return line.length ? line[0] : "";
      default: return line;
    }
  }
}

export { typeName };
