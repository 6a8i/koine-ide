import { BREAK, Host, PortugolError, Program, ReturnSignal } from "../shared/types";
import { MAX_CALL_DEPTH, finalizeError, parseIntStrict, parseRealStrict, stackOverflow, wrapJsError } from "../shared/runtime";
import * as A from "./ast";
import { TypeRef, typeName } from "./ast";
import { formatVisualg, formatWithWidth } from "./builtins";
import { parseVisualg } from "./parser";
import { Debugger, FrameNames, Snapshot, describeFrame, markAllBlocking } from "../shared/debug";

type Frame = any[];

// ----- nomes das variáveis de cada subprograma (para o depurador) -----
const namesCache = new WeakMap<A.Sub, FrameNames>();
function namesOf(fn: A.Sub): FrameNames {
  let n = namesCache.get(fn);
  if (!n) {
    const slots: FrameNames["slots"] = fn.params.map((p) => ({ slot: p.slot, name: p.name, type: typeName(p.t) }));
    for (const d of fn.locals) slots.push({ slot: d.slot, name: d.name, type: typeName(d.t) });
    if (fn.isFunction) slots.push({ slot: fn.retSlot, name: fn.name + " (retorno)", type: typeName(fn.ret) });
    n = { name: fn.name, slots };
    namesCache.set(fn, n);
  }
  return n;
}
function globalNames(ast: A.ProgramAst): FrameNames {
  return { name: "globais", slots: ast.globals.map((d) => ({ slot: d.slot, name: d.name, type: typeName(d.t) })) };
}
const MAIN_NAMES: FrameNames = { name: "algoritmo", slots: [] };
class Ref {
  constructor(public get: () => any, public set: (v: any) => void) {}
}
const rt = (msg: string, n: { line: number; col: number }) => new PortugolError(msg, n.line, n.col);

/** Vetor do VisuAlg com limites arbitrários (ex.: 1..10). */
class VArray {
  data: any[];
  constructor(public lo: number, public hi: number, fill: () => any) {
    this.data = new Array(hi - lo + 1);
    for (let i = 0; i < this.data.length; i++) this.data[i] = fill();
  }
  idx(i: number, at: { line: number; col: number }, name: string): number {
    if (!Number.isInteger(i) || i < this.lo || i > this.hi)
      throw rt(`Índice ${i} fora dos limites de "${name}" (válidos: ${this.lo} a ${this.hi})`, at);
    return i - this.lo;
  }
}

export function compileVisualg(src: string): Program {
  return new VisualgProgram(parseVisualg(src));
}

function defaultValue(t: TypeRef): any {
  switch (t.base) {
    case "inteiro": case "real": return 0;
    case "caractere": return "";
    case "logico": return false;
    default: return undefined;
  }
}

function makeVar(t: TypeRef, ranges: A.Range[]): any {
  if (ranges.length === 0) return defaultValue(t);
  const [r, ...rest] = ranges;
  return new VArray(r.lo, r.hi, () => (rest.length ? makeVar(t, rest) : defaultValue(t)));
}

class VisualgProgram implements Program {
  private G: Frame = [];
  private host!: Host;
  private depth = 0;
  private dbg: Debugger | null = null;

  constructor(private ast: A.ProgramAst) {}

  attachDebugger(d: Debugger) {
    this.dbg = d;
    markAllBlocking(this.ast);
  }

  snapshot(): Snapshot {
    if (this.dbg && this.dbg.depth > 0) return this.dbg.snapshot();
    return { frames: [], globals: describeFrame(globalNames(this.ast), this.G) };
  }

  async run(host: Host) {
    this.host = host;
    this.G = new Array(this.ast.nglobals);
    for (const d of this.ast.globals) this.G[d.slot] = makeVar(d.t, d.ranges);
    this.dbg?.setGlobals(globalNames(this.ast), this.G);
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
    switch (s.k) {
      case "assign": this.store(s.target, this.coerce(this.evalE(s.value, F), s.target.t), F); return;
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
      case "callstmt": this.call(s.call, F); return;
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
      case "return": throw new ReturnSignal(this.evalE(s.value!, F));
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
      case "=": return l === r;
      case "<>": return l !== r;
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
    const name = e.target.k === "var" ? e.target.name : "vetor";
    let arr = this.evalE(e.target, F) as VArray;
    for (let i = 0; i < e.indices.length; i++) {
      const idx = arr.idx(this.evalE(e.indices[i], F), e.indices[i], name);
      if (i === e.indices.length - 1) return { arr, idx };
      arr = arr.data[idx];
    }
    throw rt("Índice inválido", e);
  }

  private store(t: A.Var | A.Index, v: any, F: Frame) {
    if (t.k === "var") {
      if (t.ref) ((t.global ? this.G : F)[t.slot] as Ref).set(v);
      else if (t.global) this.G[t.slot] = v;
      else F[t.slot] = v;
      return;
    }
    const c = this.containerOf(t, F);
    c.arr.data[c.idx] = v;
  }

  private makeRef(a: A.Var | A.Index, F: Frame): Ref {
    if (a.k === "var") {
      if (a.ref) return (a.global ? this.G : F)[a.slot] as Ref;
      const M = a.global ? this.G : F, slot = a.slot;
      return new Ref(() => M[slot], (v) => { M[slot] = v; });
    }
    const c = this.containerOf(a, F);
    return new Ref(() => c.arr.data[c.idx], (v) => { c.arr.data[c.idx] = v; });
  }

  private call(e: A.Call, F: Frame): any {
    if (e.builtin) return e.builtin.impl(e.args.map((a) => this.evalE(a, F)), e);
    const fn = e.fn!;
    const args = fn.params.map((p, i) => (p.ref ? this.makeRef(e.args[i] as A.Var | A.Index, F) : this.coerce(this.evalE(e.args[i], F), p.t)));
    return this.invoke(fn, args, e);
  }

  private newFrame(fn: A.Sub, args: any[]): Frame {
    const NF: Frame = new Array(fn.nslots);
    for (let i = 0; i < args.length; i++) NF[fn.params[i].slot] = args[i];
    for (const d of fn.locals) NF[d.slot] = makeVar(d.t, d.ranges);
    if (fn.isFunction) NF[fn.retSlot] = defaultValue(fn.ret);
    return NF;
  }

  private invoke(fn: A.Sub, args: any[], at: { line: number; col: number }): any {
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
    switch (s.k) {
      case "assign": this.store(s.target, this.coerce(await this.evalA(s.value, F), s.target.t), F); return;
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
      case "callstmt": await this.callA(s.call, F); return;
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
      case "return": throw new ReturnSignal(await this.evalA(s.value!, F));
      default: this.exec(s, F);
    }
  }

  private async evalA(e: A.Expr, F: Frame): Promise<any> {
    if (!e.blocking) return this.evalE(e, F);
    switch (e.k) {
      case "index": {
        const name = e.target.k === "var" ? e.target.name : "vetor";
        let arr = (await this.evalA(e.target, F)) as VArray;
        for (let i = 0; i < e.indices.length; i++) arr = arr.data[arr.idx(await this.evalA(e.indices[i], F), e.indices[i], name)];
        return arr;
      }
      case "bin": {
        const l = await this.evalA(e.l, F);
        if (e.op === "e" && !l) return false;
        if (e.op === "ou" && l) return true;
        return this.binop(e, l, await this.evalA(e.r, F));
      }
      case "un": { const v = await this.evalA(e.e, F); return e.op === "nao" ? !v : -v; }
      case "call": return this.callA(e, F);
      default: return this.evalE(e, F);
    }
  }

  private async callA(e: A.Call, F: Frame): Promise<any> {
    const args: any[] = [];
    if (e.builtin) {
      for (const a of e.args) args.push(await this.evalA(a, F));
      return e.builtin.impl(args, e);
    }
    const fn = e.fn!;
    for (let i = 0; i < fn.params.length; i++) {
      const p = fn.params[i];
      args.push(p.ref ? this.makeRef(e.args[i] as A.Var | A.Index, F) : this.coerce(await this.evalA(e.args[i], F), p.t));
    }
    if (!fn.blocking) return this.invoke(fn, args, e);
    if (++this.depth > MAX_CALL_DEPTH) { this.depth = 0; throw stackOverflow(e.line, e.col); }
    const NF = this.newFrame(fn, args);
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
    return fn.isFunction ? NF[fn.retSlot] : undefined;
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
        if (["verdadeiro", "v", "true", "1", "sim", "s"].includes(s)) return true;
        if (["falso", "f", "false", "0", "nao", "não", "n"].includes(s)) return false;
        throw rt(`Valor inválido: "${line}" não é um valor lógico (digite verdadeiro ou falso)`, n);
      }
      default: return line;
    }
  }
}
