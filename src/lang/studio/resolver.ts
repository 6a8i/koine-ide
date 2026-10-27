import { PortugolError } from "../shared/types";
import * as A from "./ast";
import { T, T_UNK, TypeRef, typeName } from "./ast";
import { GLOBAL_BUILTINS, LIBS } from "./builtins";
import { RawProgram } from "./parser";

interface Sym {
  name: string;
  slot: number;
  global: boolean;
  t: TypeRef;
  ref: boolean;
  isConst: boolean;
  line: number;
  col: number;
}

const err = (msg: string, n: { line: number; col: number }) => new PortugolError(msg, n.line, n.col, "sintaxe");

function same(a: TypeRef, b: TypeRef) {
  return a.base === b.base && a.dims === b.dims;
}
function isNum(t: TypeRef) {
  return t.dims === 0 && (t.base === "inteiro" || t.base === "real");
}
/** Pode atribuir um valor do tipo `from` numa variável do tipo `to`? */
export function assignable(to: TypeRef, from: TypeRef): boolean {
  if (to.base === "?" || from.base === "?") return true;
  if (to.dims !== from.dims) return false;
  if (to.base === from.base) return true;
  if (to.base === "real" && from.base === "inteiro") return true;
  if (to.base === "cadeia" && from.base === "caracter") return true;
  return false;
}

export function resolveStudio(raw: RawProgram): A.ProgramAst {
  return new Resolver(raw).run();
}

class Resolver {
  private scopes: Map<string, Sym>[] = [];
  private globalsMap = new Map<string, Sym>();
  private nglobals = 0;
  private nslots = 0;
  private fnMap = new Map<string, A.FuncDecl>();
  private libAlias = new Map<string, string>();
  private curFn: A.FuncDecl | null = null;
  private loopDepth = 0;
  private switchDepth = 0;
  /** para análise de bloqueio: chamadas de função feitas por cada função */
  private calls = new Map<A.FuncDecl, Set<A.FuncDecl>>();
  private callNodes: A.Call[] = [];

  constructor(private raw: RawProgram) {}

  run(): A.ProgramAst {
    for (const inc of this.raw.includes) {
      if (!LIBS[inc.lib]) throw err(`A biblioteca "${inc.lib}" não existe. Bibliotecas disponíveis: ${Object.keys(LIBS).join(", ")}`, inc);
      this.libAlias.set(inc.alias, inc.lib);
    }
    for (const f of this.raw.functions) {
      if (this.fnMap.has(f.name)) throw err(`A função "${f.name}" já foi declarada`, f);
      if (GLOBAL_BUILTINS[f.name]) throw err(`"${f.name}" já é uma função do Portugol e não pode ser redeclarada`, f);
      this.fnMap.set(f.name, f);
    }
    const main = this.fnMap.get("inicio");
    if (!main) throw err('O programa precisa ter a função "inicio": funcao inicio() { ... }', { line: 1, col: 1 });
    if (main.params.length > 0) throw err('A função "inicio" não pode ter parâmetros', main);

    // globais
    this.scopes = [this.globalsMap];
    for (const d of this.raw.globals) this.declare(d, true);

    for (const f of this.raw.functions) this.resolveFn(f);
    this.computeBlocking();
    return { globals: this.raw.globals, nglobals: this.nglobals, functions: this.fnMap, main };
  }

  // ---------- escopo ----------
  private push() { this.scopes.push(new Map()); }
  private pop() { this.scopes.pop(); }

  private lookup(name: string): Sym | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const s = this.scopes[i].get(name);
      if (s) return s;
    }
    return null;
  }

  private addSym(name: string, t: TypeRef, ref: boolean, isConst: boolean, n: { line: number; col: number }, global: boolean): Sym {
    const scope = this.scopes[this.scopes.length - 1];
    if (scope.has(name)) throw err(`A variável "${name}" já foi declarada neste bloco`, n);
    if (!global && this.globalsMap.has(name) && this.scopes.length === 2) {
      // permitido sombrear global em função, mas avisa? Mantém permitido.
    }
    if (this.fnMap.has(name)) throw err(`"${name}" já é o nome de uma função`, n);
    const slot = global ? this.nglobals++ : this.nslots++;
    const sym: Sym = { name, slot, global, t, ref, isConst, line: n.line, col: n.col };
    scope.set(name, sym);
    return sym;
  }

  private declare(d: A.Decl, global: boolean) {
    // tamanhos
    d.sizes = d.sizes.map((s) => (s ? this.expr(s) : null));
    for (const s of d.sizes) {
      if (s && s.t.base !== "inteiro" && s.t.base !== "?") throw err("O tamanho de um vetor deve ser um número inteiro", s);
    }
    if (d.init) {
      d.init = this.exprOrArray(d.init, d.t);
      if (d.init.k !== "arr" && !assignable(d.t, d.init.t))
        throw err(`Não é possível guardar um valor do tipo ${typeName(d.init.t)} na variável "${d.name}", que é do tipo ${typeName(d.t)}`, d.init);
    } else if (d.t.dims > 0 && d.sizes.some((s) => s === null)) {
      throw err(`O vetor "${d.name}" precisa de um tamanho ou de uma lista de valores iniciais`, d);
    }
    const sym = this.addSym(d.name, d.t, false, d.isConst, d, global);
    d.slot = sym.slot;
    d.global = global;
    d.blocking = !!(d.init?.blocking || d.sizes.some((s) => s?.blocking));
  }

  private exprOrArray(e: A.Expr, t: TypeRef): A.Expr {
    if (e.k === "arr") {
      const elemT = T(t.base, t.dims - 1);
      e.items = e.items.map((it) => this.exprOrArray(it, elemT));
      for (const it of e.items) {
        if (it.k !== "arr" && !assignable(elemT, it.t))
          throw err(`Valor do tipo ${typeName(it.t)} numa lista que deveria conter ${typeName(elemT)}`, it);
      }
      e.t = t;
      e.blocking = e.items.some((i) => i.blocking);
      return e;
    }
    return this.expr(e);
  }

  // ---------- funções ----------
  private resolveFn(f: A.FuncDecl) {
    this.curFn = f;
    this.nslots = 0;
    this.scopes = [this.globalsMap];
    this.push();
    for (const p of f.params) {
      const sym = this.addSym(p.name, p.t, p.ref, false, f, false);
      p.slot = sym.slot;
    }
    this.calls.set(f, new Set());
    this.stmts(f.body);
    if (f.ret.base !== "vazio" && !this.alwaysReturns(f.body))
      throw err(`A função "${f.name}" deve retornar um valor do tipo ${typeName(f.ret)} em todos os caminhos (faltou "retorne"?)`, f);
    this.pop();
    f.nslots = this.nslots;
    f.blocking = f.body.some((s) => s.blocking);
    this.curFn = null;
  }

  private alwaysReturns(body: A.Stmt[]): boolean {
    for (const s of body) {
      if (s.k === "return") return true;
      if (s.k === "if" && s.else && this.alwaysReturns(s.then) && this.alwaysReturns(s.else)) return true;
      if (s.k === "block" && this.alwaysReturns(s.body)) return true;
      if (s.k === "switch" && s.cases.some((c) => c.values === null) && s.cases.every((c) => this.alwaysReturns(c.body))) return true;
      if (s.k === "while" && s.cond.k === "lit" && s.cond.value === true) return true;
    }
    return false;
  }

  private stmts(list: A.Stmt[]) {
    for (let i = 0; i < list.length; i++) list[i] = this.stmt(list[i]);
  }

  private blockScoped(list: A.Stmt[]) {
    this.push();
    this.stmts(list);
    this.pop();
  }

  private cond(e: A.Expr, what: string): A.Expr {
    const r = this.expr(e);
    if (r.t.base !== "logico" && r.t.base !== "?") {
      if (r.k === "assign" && r.op === "=")
        throw err(`A condição ${what} usa "=" (atribuição). Para comparar valores use "==" (dois sinais de igual)`, r);
      throw err(`A condição ${what} deve ser do tipo lógico (verdadeiro/falso), mas é do tipo ${typeName(r.t)}`, r);
    }
    return r;
  }

  private stmt(s: A.Stmt): A.Stmt {
    switch (s.k) {
      case "decl": this.declare(s, false); return s;
      case "expr": {
        s.e = this.expr(s.e);
        if (s.e.k === "call" && s.e.fn && s.e.fn.ret.base !== "vazio") {
          // chamada cujo retorno é ignorado: permitido
        }
        s.blocking = s.e.blocking;
        return s;
      }
      case "if": {
        s.cond = this.cond(s.cond, 'do "se"');
        this.blockScoped(s.then);
        if (s.else) this.blockScoped(s.else);
        s.blocking = s.cond.blocking || s.then.some((x) => x.blocking) || !!s.else?.some((x) => x.blocking);
        return s;
      }
      case "while":
      case "dowhile": {
        s.cond = this.cond(s.cond, 'do "enquanto"');
        this.loopDepth++;
        this.blockScoped(s.body);
        this.loopDepth--;
        s.blocking = s.cond.blocking || s.body.some((x) => x.blocking);
        return s;
      }
      case "for": {
        this.push();
        if (s.init) s.init = this.stmt(s.init);
        if (s.cond) s.cond = this.cond(s.cond, 'do "para"');
        if (s.step) s.step = this.expr(s.step);
        this.loopDepth++;
        this.blockScoped(s.body);
        this.loopDepth--;
        this.pop();
        s.blocking = !!(s.init?.blocking || s.cond?.blocking || s.step?.blocking) || s.body.some((x) => x.blocking);
        return s;
      }
      case "switch": {
        s.e = this.expr(s.e);
        this.switchDepth++;
        let hasDefault = false;
        for (const c of s.cases) {
          if (c.values === null) {
            if (hasDefault) throw err('Só pode haver um "caso contrario" por "escolha"', c);
            hasDefault = true;
          } else {
            c.values = c.values.map((v) => this.expr(v));
            for (const v of c.values) {
              if (!assignable(s.e.t, v.t) && !assignable(v.t, s.e.t))
                throw err(`O valor do "caso" (${typeName(v.t)}) não é compatível com a expressão do "escolha" (${typeName(s.e.t)})`, v);
            }
          }
          this.blockScoped(c.body);
        }
        this.switchDepth--;
        s.blocking = s.e.blocking || s.cases.some((c) => c.body.some((x) => x.blocking));
        return s;
      }
      case "break":
        if (this.loopDepth === 0 && this.switchDepth === 0) throw err('"pare" só pode ser usado dentro de um laço (enquanto, para, faca) ou de um "escolha"', s);
        return s;
      case "return": {
        const f = this.curFn!;
        if (s.value) {
          s.value = this.expr(s.value);
          if (f.ret.base === "vazio") throw err(`A função "${f.name}" não retorna valor (é "vazio"), mas há um "retorne" com valor`, s);
          if (!assignable(f.ret, s.value.t))
            throw err(`A função "${f.name}" deve retornar ${typeName(f.ret)}, mas está retornando ${typeName(s.value.t)}`, s.value);
          s.blocking = s.value.blocking;
        } else if (f.ret.base !== "vazio") {
          throw err(`A função "${f.name}" deve retornar um valor do tipo ${typeName(f.ret)}`, s);
        }
        return s;
      }
      case "block":
        if (s.inline) this.stmts(s.body);
        else this.blockScoped(s.body);
        s.blocking = s.body.some((x) => x.blocking);
        return s;
    }
  }

  // ---------- expressões ----------
  private expr(e: A.Expr): A.Expr {
    switch (e.k) {
      case "lit": return e;
      case "arr": throw err("Listas de valores entre chaves só podem ser usadas na declaração de vetores", e);
      case "var": return this.varRef(e);
      case "index": {
        e.target = this.expr(e.target);
        e.indices = e.indices.map((i) => this.expr(i));
        const tt = e.target.t;
        if (tt.base !== "?") {
          if (tt.dims === 0) throw err(`"${this.describe(e.target)}" não é um vetor nem uma matriz, não pode ser indexado com [ ]`, e);
          if (e.indices.length > tt.dims) throw err(`"${this.describe(e.target)}" é um ${typeName(tt)} e aceita apenas ${tt.dims} índice(s)`, e);
        }
        for (const i of e.indices) if (i.t.base !== "inteiro" && i.t.base !== "?") throw err(`O índice de um vetor deve ser um número inteiro, mas é ${typeName(i.t)}`, i);
        e.t = tt.base === "?" ? T_UNK : T(tt.base, tt.dims - e.indices.length);
        e.blocking = e.target.blocking || e.indices.some((i) => i.blocking);
        return e;
      }
      case "un": {
        e.e = this.expr(e.e);
        const t = e.e.t;
        if (e.op === "nao") {
          if (t.base !== "logico" && t.base !== "?") throw err(`O operador "nao" só pode ser usado com valores lógicos, mas recebeu ${typeName(t)}`, e);
          e.t = T("logico");
        } else if (e.op === "-") {
          if (!isNum(t) && t.base !== "?") throw err(`O sinal de negativo só pode ser usado com números, mas recebeu ${typeName(t)}`, e);
          e.t = t;
        } else {
          // ~
          if (t.base !== "inteiro" && t.base !== "?") throw err(`O operador "~" só pode ser usado com inteiros`, e);
          e.t = T("inteiro");
        }
        e.blocking = e.e.blocking;
        return e;
      }
      case "bin": return this.binary(e);
      case "assign": {
        e.target = this.expr(e.target) as A.Var | A.Index;
        e.value = this.expr(e.value);
        if (e.target.k === "var" && e.target.isConst) throw err(`"${e.target.name}" é uma constante e não pode receber um novo valor`, e);
        const tt = e.target.t;
        if (e.op === "=") {
          if (!assignable(tt, e.value.t))
            throw err(`Não é possível guardar um valor do tipo ${typeName(e.value.t)} em "${this.describe(e.target)}", que é do tipo ${typeName(tt)}`, e.value);
        } else {
          const op = e.op[0];
          const rt = this.binType(op, tt, e.value.t, e);
          if (!assignable(tt, rt)) throw err(`O resultado de "${e.op}" seria ${typeName(rt)}, que não cabe em "${this.describe(e.target)}" (${typeName(tt)})`, e);
        }
        e.t = tt;
        e.blocking = e.target.blocking || e.value.blocking;
        return e;
      }
      case "incdec": {
        e.target = this.expr(e.target) as A.Var | A.Index;
        if (e.target.k === "var" && e.target.isConst) throw err(`"${e.target.name}" é uma constante e não pode ser alterada`, e);
        if (!isNum(e.target.t) && e.target.t.base !== "?") throw err(`"${e.op}" só pode ser usado com números`, e);
        e.t = e.target.t;
        e.blocking = e.target.blocking;
        return e;
      }
      case "call": return this.call(e);
    }
  }

  private describe(e: A.Expr): string {
    if (e.k === "var") return e.name;
    if (e.k === "index") return this.describe(e.target) + "[...]";
    return "expressão";
  }

  private varRef(e: A.Var): A.Expr {
    if (e.name.includes(".")) {
      const [alias, member] = e.name.split(".");
      const lib = this.resolveLib(alias, e);
      const m = LIBS[lib][member];
      if (!m) throw err(`A biblioteca ${lib} não tem "${member}"`, e);
      if (!("constValue" in m)) throw err(`"${lib}.${member}" é uma função: use ${alias}.${member}(...)`, e);
      return { k: "lit", line: e.line, col: e.col, blocking: false, value: m.constValue, t: m.t };
    }
    const sym = this.lookup(e.name);
    if (!sym) {
      if (this.fnMap.has(e.name)) throw err(`"${e.name}" é uma função. Para chamá-la use ${e.name}(...)`, e);
      if (LIBS[e.name]) throw err(`"${e.name}" é uma biblioteca. Use ${e.name}.nome_da_funcao(...)`, e);
      const hint = this.suggest(e.name);
      throw err(`A variável "${e.name}" não foi declarada${hint ? `. Você quis dizer "${hint}"?` : ""}`, e);
    }
    e.slot = sym.slot;
    e.global = sym.global;
    e.ref = sym.ref;
    e.t = sym.t;
    e.isConst = sym.isConst;
    return e;
  }

  private suggest(name: string): string | null {
    const names: string[] = [];
    for (const sc of this.scopes) for (const k of sc.keys()) names.push(k);
    const lower = name.toLowerCase();
    for (const n of names) if (n.toLowerCase() === lower) return n;
    let best: string | null = null, bestD = 3;
    for (const n of names) {
      const d = lev(lower, n.toLowerCase());
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  private resolveLib(alias: string, n: { line: number; col: number }): string {
    const lib = this.libAlias.get(alias);
    if (lib) return lib;
    if (LIBS[alias]) throw err(`Para usar a biblioteca ${alias} é preciso incluí-la no início do programa: inclua biblioteca ${alias}`, n);
    throw err(`A biblioteca "${alias}" não existe ou não foi incluída`, n);
  }

  private binType(op: string, l: TypeRef, r: TypeRef, n: { line: number; col: number }): TypeRef {
    if (l.base === "?" || r.base === "?") {
      if (["==", "!=", "<", ">", "<=", ">=", "e", "ou"].includes(op)) return T("logico");
      return T_UNK;
    }
    if (l.dims > 0 || r.dims > 0) throw err(`Não é possível usar o operador "${op}" com vetores ou matrizes inteiros; acesse uma posição com [ ]`, n);
    const isStr = (t: TypeRef) => t.base === "cadeia" || t.base === "caracter";
    switch (op) {
      case "+":
        if (l.base === "cadeia" || r.base === "cadeia") return T("cadeia");
        if (isStr(l) && isStr(r)) return T("cadeia");
        if (isNum(l) && isNum(r)) return l.base === "real" || r.base === "real" ? T("real") : T("inteiro");
        break;
      case "-": case "*": case "/":
        if (isNum(l) && isNum(r)) return l.base === "real" || r.base === "real" ? T("real") : T("inteiro");
        break;
      case "%": case "<<": case ">>": case "&": case "|": case "^":
        if (l.base === "inteiro" && r.base === "inteiro") return T("inteiro");
        if ((op === "&" || op === "|" || op === "^") && l.base === "logico" && r.base === "logico") return T("logico");
        break;
      case "==": case "!=":
        if (isNum(l) && isNum(r)) return T("logico");
        if (isStr(l) && isStr(r)) return T("logico");
        if (l.base === r.base) return T("logico");
        break;
      case "<": case ">": case "<=": case ">=":
        if (isNum(l) && isNum(r)) return T("logico");
        if (isStr(l) && isStr(r)) return T("logico");
        break;
      case "e": case "ou":
        if (l.base === "logico" && r.base === "logico") return T("logico");
        break;
    }
    throw err(`Não é possível usar o operador "${op}" entre ${typeName(l)} e ${typeName(r)}`, n);
  }

  private binary(e: A.Bin): A.Expr {
    e.l = this.expr(e.l);
    e.r = this.expr(e.r);
    e.t = this.binType(e.op, e.l.t, e.r.t, e);
    e.blocking = e.l.blocking || e.r.blocking;
    return e;
  }

  private call(e: A.Call): A.Expr {
    e.args = e.args.map((a) => this.expr(a));
    e.blocking = e.args.some((a) => a.blocking);
    if (e.name.includes(".")) {
      const [alias, member] = e.name.split(".");
      const lib = this.resolveLib(alias, e);
      const m = LIBS[lib][member];
      if (!m) {
        const names = Object.keys(LIBS[lib]).filter((k) => !("constValue" in (LIBS[lib][k] as any)));
        throw err(`A biblioteca ${lib} não tem a função "${member}". Funções disponíveis: ${names.join(", ")}`, e);
      }
      if ("constValue" in m) throw err(`"${lib}.${member}" é uma constante, não uma função`, e);
      e.builtin = m;
      this.checkBuiltinArgs(e, m, `${alias}.${member}`);
      return e;
    }
    const gb = GLOBAL_BUILTINS[e.name];
    if (gb) {
      e.builtin = gb;
      e.t = gb.ret as TypeRef;
      if (gb.blocking) e.blocking = true;
      if (e.name === "leia") {
        if (e.args.length === 0) throw err('"leia" precisa de pelo menos uma variável para guardar o valor lido', e);
        for (const a of e.args) {
          if (a.k !== "var" && a.k !== "index") throw err('"leia" só aceita variáveis ou posições de vetores', a);
          if (a.t.dims > 0) throw err('"leia" não pode ler um vetor inteiro; leia uma posição por vez', a);
          if (a.k === "var" && a.isConst) throw err(`"${a.name}" é uma constante e não pode receber um valor lido`, a);
        }
      }
      if (e.name === "escreva") {
        for (const a of e.args) {
          if (a.t.dims > 0) throw err('"escreva" não pode escrever um vetor inteiro; escreva uma posição por vez', a);
          if (a.k === "call" && a.fn && a.fn.ret.base === "vazio") throw err(`A função "${a.fn.name}" não retorna valor e não pode ser escrita`, a);
        }
      }
      return e;
    }
    const fn = this.fnMap.get(e.name);
    if (!fn) {
      if (this.lookup(e.name)) throw err(`"${e.name}" é uma variável, não uma função`, e);
      for (const lib of Object.keys(LIBS)) {
        if (LIBS[lib][e.name]) throw err(`A função "${e.name}" pertence à biblioteca ${lib}. Inclua-a com "inclua biblioteca ${lib}" e chame ${lib}.${e.name}(...)`, e);
      }
      throw err(`A função "${e.name}" não foi declarada`, e);
    }
    e.fn = fn;
    e.t = fn.ret;
    if (e.args.length !== fn.params.length)
      throw err(`A função "${fn.name}" espera ${fn.params.length} parâmetro(s), mas recebeu ${e.args.length}`, e);
    fn.params.forEach((p, i) => {
      const a = e.args[i];
      if (p.ref) {
        if (a.k !== "var" && a.k !== "index") throw err(`O parâmetro "${p.name}" é por referência (&) e precisa receber uma variável`, a);
        if (!same(p.t, a.t) && a.t.base !== "?") throw err(`O parâmetro por referência "${p.name}" é ${typeName(p.t)}, mas recebeu ${typeName(a.t)}`, a);
      } else if (!assignable(p.t, a.t)) {
        throw err(`O parâmetro "${p.name}" da função "${fn.name}" é do tipo ${typeName(p.t)}, mas recebeu ${typeName(a.t)}`, a);
      }
    });
    if (this.curFn) this.calls.get(this.curFn)!.add(fn);
    this.callNodes.push(e);
    return e;
  }

  private checkBuiltinArgs(e: A.Call, b: A.Builtin, display: string) {
    if (!b.variadic && e.args.length !== b.params.length)
      throw err(`A função ${display} espera ${b.params.length} parâmetro(s), mas recebeu ${e.args.length}`, e);
    b.params.forEach((p, i) => {
      if (p === "*") return;
      const a = e.args[i];
      if (!assignable(p, a.t)) throw err(`O parâmetro ${i + 1} de ${display} deve ser ${typeName(p)}, mas recebeu ${typeName(a.t)}`, a);
    });
    e.t = b.ret === "arg0" ? (e.args[0]?.t ?? T_UNK) : b.ret;
    if (b.blocking) e.blocking = true;
  }

  /** Propaga a marca de bloqueio por chamadas entre funções (ponto fixo) e remarca os nós. */
  private computeBlocking() {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [f, callees] of this.calls) {
        if (f.blocking) continue;
        for (const c of callees) if (c.blocking) { f.blocking = true; changed = true; break; }
      }
    }
    // se alguma função ficou bloqueante por propagação, precisamos remarcar as subárvores que a chamam
    if (this.callNodes.some((c) => c.fn!.blocking && !c.blocking)) {
      for (const f of this.fnMap.values()) {
        remarkStmts(f.body);
        f.blocking = f.blocking || f.body.some((s) => s.blocking);
      }
      for (const g of this.raw.globals) remarkStmts([g]);
    }
  }
}

function remarkStmts(list: A.Stmt[]): boolean {
  let any = false;
  for (const s of list) if (remarkStmt(s)) any = true;
  return any;
}
function remarkStmt(s: A.Stmt): boolean {
  let b = false;
  switch (s.k) {
    case "decl": b = !!(s.init && remarkExpr(s.init)) || s.sizes.some((x) => !!x && remarkExpr(x)); break;
    case "expr": b = remarkExpr(s.e); break;
    case "if": b = remarkExpr(s.cond); if (remarkStmts(s.then)) b = true; if (s.else && remarkStmts(s.else)) b = true; break;
    case "while": case "dowhile": b = remarkExpr(s.cond); if (remarkStmts(s.body)) b = true; break;
    case "for": {
      if (s.init && remarkStmt(s.init)) b = true;
      if (s.cond && remarkExpr(s.cond)) b = true;
      if (s.step && remarkExpr(s.step)) b = true;
      if (remarkStmts(s.body)) b = true;
      break;
    }
    case "switch": b = remarkExpr(s.e); for (const c of s.cases) { if (c.values) for (const v of c.values) if (remarkExpr(v)) b = true; if (remarkStmts(c.body)) b = true; } break;
    case "return": b = !!(s.value && remarkExpr(s.value)); break;
    case "block": b = remarkStmts(s.body); break;
    case "break": break;
  }
  s.blocking = b;
  return b;
}
function remarkExpr(e: A.Expr): boolean {
  let b = false;
  switch (e.k) {
    case "lit": break;
    case "var": break;
    case "index": b = remarkExpr(e.target); for (const i of e.indices) if (remarkExpr(i)) b = true; break;
    case "bin": b = remarkExpr(e.l); if (remarkExpr(e.r)) b = true; break;
    case "un": b = remarkExpr(e.e); break;
    case "assign": b = remarkExpr(e.target); if (remarkExpr(e.value)) b = true; break;
    case "incdec": b = remarkExpr(e.target); break;
    case "arr": for (const i of e.items) if (remarkExpr(i)) b = true; break;
    case "call": for (const a of e.args) if (remarkExpr(a)) b = true; if (e.fn?.blocking || e.builtin?.blocking) b = true; break;
  }
  e.blocking = b;
  return b;
}

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const d: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[n];
}
