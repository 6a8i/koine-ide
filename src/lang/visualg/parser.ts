import { tokenize, Token, TokenStream } from "../shared/lexer";
import { PortugolError } from "../shared/types";
import * as A from "./ast";
import { T, T_UNK, TypeRef, typeName } from "./ast";
import { BUILTINS } from "./builtins";

const KEYWORDS = new Set([
  "algoritmo", "var", "inicio", "fimalgoritmo", "const",
  "inteiro", "real", "caractere", "caracter", "literal", "logico", "vetor", "de",
  "se", "entao", "senao", "fimse", "enquanto", "faca", "fimenquanto",
  "para", "ate", "passo", "fimpara", "repita", "escolha", "caso", "outrocaso", "fimescolha",
  "funcao", "fimfuncao", "procedimento", "fimprocedimento", "retorne", "interrompa",
  "e", "ou", "nao", "xou", "div", "mod", "verdadeiro", "falso",
  "escreva", "escreval", "leia", "limpatela", "pausa", "aleatorio", "timer", "eco", "cronometro", "debug", "arquivo",
  "on", "off", "tipo", "registro", "fimregistro", "dos", "passo", "fimprocedimento",
]);

const OPERATORS = ["<-", ":=", "<=", ">=", "<>", "..", "+", "-", "*", "/", "\\", "^", "%", "=", "<", ">", "(", ")", "[", "]", ",", ":", ";", "."];

interface Sym { name: string; slot: number; global: boolean; t: TypeRef; ref: boolean; isRet?: boolean }

const CLOSERS = new Set(["fimalgoritmo", "fimse", "fimenquanto", "fimpara", "fimescolha", "fimfuncao", "fimprocedimento", "senao", "outrocaso", "caso", "ate", "fimrepita"]);

const err = (msg: string, n: { line: number; col: number }) => new PortugolError(msg, n.line, n.col, "sintaxe");

function assignable(to: TypeRef, from: TypeRef): boolean {
  if (to.base === "?" || from.base === "?") return true;
  if (to.dims !== from.dims) return false;
  if (to.base === from.base) return true;
  if (to.base === "real" && from.base === "inteiro") return true;
  return false;
}
const isNum = (t: TypeRef) => t.dims === 0 && (t.base === "inteiro" || t.base === "real");

export function parseVisualg(src: string): A.ProgramAst {
  const toks = tokenize(src, {
    keywords: KEYWORDS,
    caseInsensitive: true,
    operators: OPERATORS,
    blockComments: false,
    braceComments: true,
    singleQuoteChar: false,
    escapes: false,
  });
  return new Parser(new TokenStream(toks)).program();
}

class Parser {
  private globals = new Map<string, Sym>();
  private locals: Map<string, Sym> | null = null;
  private nglobals = 0;
  private nslots = 0;
  private subs = new Map<string, A.Sub>();
  private curSub: A.Sub | null = null;
  private loopDepth = 0;
  private globalDecls: A.VarDecl[] = [];

  constructor(private s: TokenStream) {}

  private pos(t: Token) { return { line: t.line, col: t.col, blocking: false }; }

  program(): A.ProgramAst {
    const s = this.s;
    if (s.is("eof")) throw s.error('O arquivo está vazio. Um algoritmo começa com: algoritmo "nome"');
    if (!s.isKw("algoritmo")) throw s.error(`Todo algoritmo deve começar com a palavra "algoritmo", mas encontrei ${s.describe()}`);
    s.next();
    let name = "semnome";
    if (s.is("string")) name = s.next().value;
    else if (s.is("ident")) name = s.next().raw;
    // seções opcionais: const, var, tipo, subprogramas
    for (;;) {
      if (s.isKw("var")) {
        s.next();
        this.varSection(true);
      } else if (s.isKw("const")) {
        s.next();
        this.constSection();
      } else if (s.isKw("funcao") || s.isKw("procedimento")) {
        this.subprogram();
      } else if (s.isKw("tipo")) {
        throw s.error('Declarações de "tipo" (registros) ainda não são suportadas nesta versão');
      } else break;
    }
    if (!s.isKw("inicio")) {
      if (s.is("eof")) throw s.error('Faltou a seção "inicio" do algoritmo');
      throw s.error(`Esperava "var", "inicio", "funcao" ou "procedimento", mas encontrei ${s.describe()}${s.is("ident") ? '. Variáveis devem ser declaradas depois de "var", e comandos depois de "inicio"' : ""}`);
    }
    s.next();
    const body = this.block(["fimalgoritmo"], "do algoritmo");
    s.expectKw("fimalgoritmo");
    if (!s.is("eof")) throw s.error(`O algoritmo já terminou em "fimalgoritmo", mas ainda há código depois: ${s.describe()}`);
    const ast: A.ProgramAst = { name, globals: this.globalDecls, nglobals: this.nglobals, subs: this.subs, body, nslots: 0 };
    return ast;
  }

  // ---------- declarações ----------
  private typeSpec(): { t: TypeRef; ranges: A.Range[] } {
    const s = this.s;
    if (s.acceptKw("vetor")) {
      s.expectOp("[", 'depois de "vetor"');
      const ranges: A.Range[] = [];
      do {
        const lo = this.intLiteral("o limite inferior do vetor");
        s.expectOp("..", "entre os limites do vetor (ex.: vetor[1..10])");
        const hi = this.intLiteral("o limite superior do vetor");
        if (hi < lo) throw s.error(`Limites do vetor inválidos: ${lo}..${hi}`);
        ranges.push({ lo, hi });
      } while (s.acceptOp(","));
      s.expectOp("]", "para fechar os limites do vetor");
      if (ranges.length > 2) throw s.error("Só são permitidos vetores (1 dimensão) e matrizes (2 dimensões)");
      s.expectKw("de", 'depois dos limites do vetor (ex.: vetor[1..10] de inteiro)');
      const base = this.baseType();
      return { t: T(base, ranges.length), ranges };
    }
    return { t: T(this.baseType()), ranges: [] };
  }

  private intLiteral(what: string): number {
    const s = this.s;
    let neg = false;
    if (s.acceptOp("-")) neg = true;
    if (!s.is("int")) throw s.error(`Esperava um número inteiro para ${what}, mas encontrei ${s.describe()}`);
    const v = parseInt(s.next().value, 10);
    return neg ? -v : v;
  }

  private baseType(): A.Base {
    const s = this.s;
    const t = s.cur;
    if (t.type === "keyword") {
      switch (t.value) {
        case "inteiro": s.next(); return "inteiro";
        case "real": s.next(); return "real";
        case "caractere": case "caracter": case "literal": s.next(); return "caractere";
        case "logico": s.next(); return "logico";
      }
    }
    if (t.type === "ident" && t.value === "string") { s.next(); return "caractere"; }
    throw s.error(`Esperava um tipo (inteiro, real, caractere, logico), mas encontrei ${s.describe()}`);
  }

  private varSection(global: boolean) {
    const s = this.s;
    while (s.is("ident")) {
      const names: Token[] = [];
      do {
        names.push(s.expectIdent("o nome da variável"));
      } while (s.acceptOp(","));
      if (!s.isOp(":")) {
        if (s.isOp("<-")) throw s.error('Comandos de atribuição devem ficar depois de "inicio". Na seção "var" apenas declare: nome: tipo');
        throw s.error(`Esperava ":" depois do nome da variável para indicar o tipo (ex.: ${names[0].raw}: inteiro), mas encontrei ${s.describe()}`);
      }
      s.next();
      const { t, ranges } = this.typeSpec();
      for (const n of names) this.declareVar(n, t, ranges, global);
      s.acceptOp(";");
    }
    if (s.is("keyword") && ["inteiro", "real", "caractere", "logico"].includes(s.cur.value))
      throw s.error(`Na seção "var" o nome vem antes do tipo: nome: ${s.cur.raw}`);
  }

  private constSection() {
    // const NOME = valor  (extensão comum)
    const s = this.s;
    while (s.is("ident")) {
      const n = s.expectIdent("o nome da constante");
      s.expectOp("=", "depois do nome da constante");
      const e = this.expr();
      if (e.k !== "lit") throw err("O valor de uma constante deve ser um literal", e);
      const decl = this.declareVar(n, e.t, [], true);
      this.globalInits.push({ decl, value: e });
      s.acceptOp(";");
    }
  }
  globalInits: { decl: A.VarDecl; value: A.Lit }[] = [];

  private declareVar(n: Token, t: TypeRef, ranges: A.Range[], global: boolean): A.VarDecl {
    const scope = global ? this.globals : this.locals!;
    if (scope.has(n.value)) throw err(`A variável "${n.raw}" já foi declarada`, n);
    if (this.subs.has(n.value)) throw err(`"${n.raw}" já é o nome de uma função ou procedimento`, n);
    if (BUILTINS[n.value]) throw err(`"${n.raw}" é uma função interna do VisuAlg e não pode ser usada como nome de variável`, n);
    const slot = global ? this.nglobals++ : this.nslots++;
    scope.set(n.value, { name: n.value, slot, global, t, ref: false });
    const d: A.VarDecl = { name: n.raw, t, ranges, slot, global, line: n.line, col: n.col };
    if (global) this.globalDecls.push(d);
    else this.curSub!.locals.push(d);
    return d;
  }

  private subprogram() {
    const s = this.s;
    const kw = s.next();
    const isFunction = kw.value === "funcao";
    const name = s.expectIdent(isFunction ? "o nome da função" : "o nome do procedimento");
    if (this.subs.has(name.value) || this.globals.has(name.value)) throw err(`"${name.raw}" já foi declarado`, name);
    const sub: A.Sub = {
      name: name.raw, isFunction, ret: T("vazio"), params: [], locals: [], body: [], nslots: 0, blocking: false,
      line: kw.line, col: kw.col, retSlot: -1,
    };
    this.curSub = sub;
    this.locals = new Map();
    this.nslots = 0;
    if (s.acceptOp("(")) {
      if (!s.isOp(")")) {
        do {
          const ref = !!s.acceptKw("var");
          const names: Token[] = [];
          do { names.push(s.expectIdent("o nome do parâmetro")); } while (s.acceptOp(","));
          s.expectOp(":", "depois do nome do parâmetro para indicar o tipo");
          const { t, ranges } = this.typeSpec();
          for (const n of names) {
            if (this.locals.has(n.value)) throw err(`O parâmetro "${n.raw}" está repetido`, n);
            const slot = this.nslots++;
            this.locals.set(n.value, { name: n.value, slot, global: false, t, ref });
            sub.params.push({ name: n.raw, t, ref, slot, ranges });
          }
        } while (s.acceptOp(";") || s.acceptOp(","));
      }
      s.expectOp(")", "para fechar os parâmetros");
    }
    if (isFunction) {
      s.expectOp(":", "depois dos parâmetros da função, para indicar o tipo de retorno (ex.: funcao soma(a, b: inteiro): inteiro)");
      sub.ret = T(this.baseType());
      sub.retSlot = this.nslots++;
      this.locals.set(name.value, { name: name.value, slot: sub.retSlot, global: false, t: sub.ret, ref: false, isRet: true });
    }
    this.subs.set(name.value, sub); // registra antes do corpo (recursão)
    if (s.acceptKw("var")) this.varSection(false);
    s.expectKw("inicio", `para começar o corpo de "${name.raw}"`);
    const end = isFunction ? "fimfuncao" : "fimprocedimento";
    sub.body = this.block([end], `de "${name.raw}"`);
    s.expectKw(end);
    sub.nslots = this.nslots;
    sub.blocking = sub.body.some((x) => x.blocking);
    if (sub.blocking) remarkStmts(sub.body);
    this.curSub = null;
    this.locals = null;
    this.nslots = 0;
  }

  // ---------- comandos ----------
  private block(terminators: string[], what: string): A.Stmt[] {
    const s = this.s;
    const body: A.Stmt[] = [];
    while (!(s.is("keyword") && terminators.includes(s.cur.value))) {
      if (s.is("eof")) throw s.error(`Faltou "${terminators[0]}" para fechar o bloco ${what}`);
      if (s.is("keyword") && CLOSERS.has(s.cur.value))
        throw s.error(`Faltou "${terminators[0]}" para fechar o bloco ${what} (encontrei "${s.cur.raw}" antes)`);
      body.push(this.statement());
    }
    return body;
  }

  private statement(): A.Stmt {
    const s = this.s;
    const t = s.cur;
    if (t.type === "keyword") {
      switch (t.value) {
        case "escreva": case "escreval": return this.writeStmt();
        case "leia": return this.readStmt();
        case "se": return this.ifStmt();
        case "enquanto": {
          s.next();
          const cond = this.cond('do "enquanto"');
          s.expectKw("faca", 'depois da condição do "enquanto"');
          this.loopDepth++;
          const body = this.block(["fimenquanto"], 'do "enquanto"');
          this.loopDepth--;
          s.next();
          return { k: "while", ...this.pos(t), cond, body, blocking: cond.blocking || body.some((x) => x.blocking) };
        }
        case "repita": {
          s.next();
          this.loopDepth++;
          const body = this.block(["ate", "fimrepita"], 'do "repita"');
          this.loopDepth--;
          let cond: A.Expr | null = null;
          if (s.acceptKw("ate")) cond = this.cond('do "ate"');
          else s.next(); // fimrepita
          return { k: "repeat", ...this.pos(t), body, cond, blocking: !!cond?.blocking || body.some((x) => x.blocking) };
        }
        case "para": return this.forStmt();
        case "escolha": return this.switchStmt();
        case "interrompa":
          s.next();
          if (this.loopDepth === 0) throw err('"interrompa" só pode ser usado dentro de um laço (enquanto, para, repita)', t);
          return { k: "break", ...this.pos(t) };
        case "retorne": {
          s.next();
          if (!this.curSub || !this.curSub.isFunction) throw err('"retorne" só pode ser usado dentro de uma função', t);
          const value = this.expr();
          if (!assignable(this.curSub.ret, value.t))
            throw err(`A função "${this.curSub.name}" deve retornar ${typeName(this.curSub.ret)}, mas está retornando ${typeName(value.t)}`, value);
          return { k: "return", ...this.pos(t), value, blocking: value.blocking };
        }
        case "limpatela": s.next(); return { k: "clear", ...this.pos(t) };
        case "pausa": {
          s.next();
          let ms: A.Expr | null = null;
          if (s.acceptOp("(")) { ms = this.expr(); s.expectOp(")"); }
          return { k: "pause", ...this.pos(t), ms, blocking: true };
        }
        case "aleatorio": case "timer": case "eco": case "cronometro": case "debug": case "arquivo": {
          // comandos de ambiente do VisuAlg: aceitos e ignorados
          s.next();
          while (!s.is("eof") && s.cur.line === t.line) s.next();
          return { k: "nop", ...this.pos(t) };
        }
        case "senao": throw s.error('"senao" só pode aparecer dentro de um "se ... fimse"');
        case "fimse": throw s.error('"fimse" sem um "se" correspondente');
        case "fimenquanto": throw s.error('"fimenquanto" sem um "enquanto" correspondente');
        case "fimpara": throw s.error('"fimpara" sem um "para" correspondente');
        case "fimalgoritmo": throw s.error('"fimalgoritmo" inesperado aqui: algum bloco ficou aberto');
        case "var": throw s.error('A seção "var" deve vir antes de "inicio"');
        case "inicio": throw s.error('"inicio" inesperado aqui');
        case "funcao": case "procedimento": throw s.error("Funções e procedimentos devem ser declarados antes do \"inicio\" do algoritmo");
        case "inteiro": case "real": case "caractere": case "logico":
          throw s.error(`Declarações de variáveis devem ficar na seção "var", antes de "inicio" (ex.: var x: ${t.raw})`);
        default:
          throw s.error(`Não esperava ${s.describe()} aqui`);
      }
    }
    if (t.type === "ident") {
      // atribuição ou chamada de procedimento
      if (s.peek().type === "op" && s.peek().value === ":")
        throw s.error(`Declarações de variáveis devem ficar na seção "var", antes de "inicio" (ex.: var ${t.raw}: inteiro)`);
      const sub = this.subs.get(t.value);
      if (sub && !this.locals?.has(t.value)) {
        s.next();
        const call = this.finishCall(t, sub, null);
        return { k: "callstmt", ...this.pos(t), call, blocking: call.blocking };
      }
      const target = this.lvalue();
      if (s.isOp("=")) throw s.error('Para atribuir um valor use "<-" (seta). O "=" serve para comparar', s.cur);
      if (!s.isOp("<-") && !s.isOp(":=")) {
        if (s.isOp("(")) throw err(`"${t.raw}" não é uma função ou procedimento conhecido`, t);
        throw s.error(`Esperava "<-" para atribuir um valor a "${t.raw}", mas encontrei ${s.describe()}`);
      }
      s.next();
      const value = this.expr();
      if (!assignable(target.t, value.t)) {
        if (target.t.base === "inteiro" && value.t.base === "real")
          throw err(`Não é possível guardar um valor real em "${t.raw}", que é inteiro. Use "div" para divisão inteira ou int(...) para truncar`, value);
        throw err(`Não é possível guardar um valor do tipo ${typeName(value.t)} em "${t.raw}", que é do tipo ${typeName(target.t)}`, value);
      }
      s.acceptOp(";");
      return { k: "assign", ...this.pos(t), target, value, blocking: target.blocking || value.blocking };
    }
    if (t.type === "op" && t.value === ";") { s.next(); return { k: "nop", ...this.pos(t) }; }
    throw s.error(`Não esperava ${s.describe()} aqui`);
  }

  private cond(what: string): A.Expr {
    const e = this.expr();
    if (e.t.base !== "logico" && e.t.base !== "?") {
      throw err(`A condição ${what} deve ser do tipo lógico (verdadeiro/falso), mas é do tipo ${typeName(e.t)}`, e);
    }
    return e;
  }

  private writeStmt(): A.Write {
    const s = this.s;
    const kw = s.next();
    const newline = kw.value === "escreval";
    const args: A.WriteArg[] = [];
    if (s.acceptOp("(")) {
      if (!s.isOp(")")) {
        do {
          const e = this.expr();
          if (e.t.dims > 0) throw err("Não é possível escrever um vetor inteiro; escreva uma posição por vez", e);
          let width: A.Expr | null = null, decimals: A.Expr | null = null;
          if (s.acceptOp(":")) {
            width = this.expr();
            if (s.acceptOp(":")) decimals = this.expr();
          }
          args.push({ e, width, decimals });
        } while (s.acceptOp(","));
      }
      s.expectOp(")", `para fechar os parênteses do "${kw.raw}"`);
    }
    return { k: "write", ...this.pos(kw), args, newline, blocking: args.some((a) => a.e.blocking) };
  }

  private readStmt(): A.Read {
    const s = this.s;
    const kw = s.next();
    s.expectOp("(", 'depois de "leia"');
    const targets: (A.Var | A.Index)[] = [];
    do {
      const t = s.cur;
      if (!s.is("ident")) throw s.error(`"leia" precisa de uma variável para guardar o valor lido, mas encontrei ${s.describe()}`);
      const lv = this.lvalue();
      if (lv.t.dims > 0) throw err(`Não é possível ler o vetor "${t.raw}" inteiro; leia uma posição por vez`, t);
      targets.push(lv);
    } while (s.acceptOp(","));
    s.expectOp(")", 'para fechar o "leia"');
    return { k: "read", ...this.pos(kw), targets, blocking: true };
  }

  private ifStmt(): A.If {
    const s = this.s;
    const t = s.expectKw("se");
    const cond = this.cond('do "se"');
    s.expectKw("entao", 'depois da condição do "se"');
    const then = this.block(["fimse", "senao"], 'do "se"');
    let els: A.Stmt[] | null = null;
    if (s.acceptKw("senao")) {
      els = this.block(["fimse"], 'do "senao"');
    }
    s.expectKw("fimse");
    return { k: "if", ...this.pos(t), cond, then, else: els, blocking: cond.blocking || then.some((x) => x.blocking) || !!els?.some((x) => x.blocking) };
  }

  private forStmt(): A.For {
    const s = this.s;
    const t = s.expectKw("para");
    const vt = s.expectIdent('o nome da variável de controle do "para"');
    const v = this.varRef(vt);
    if (v.t.base !== "inteiro" && v.t.base !== "?") throw err(`A variável de controle do "para" deve ser inteira, mas "${vt.raw}" é ${typeName(v.t)}`, vt);
    if (!s.acceptKw("de")) {
      if (s.isOp("<-")) throw s.error('No "para" use "de": para i de 1 ate 10 faca');
      throw s.error(`Esperava "de" depois de "${vt.raw}" (ex.: para ${vt.raw} de 1 ate 10 faca)`);
    }
    const from = this.expr();
    s.expectKw("ate", 'no "para" (ex.: para i de 1 ate 10 faca)');
    const to = this.expr();
    let step: A.Expr | null = null;
    if (s.acceptKw("passo")) step = this.expr();
    s.expectKw("faca", 'no final do cabeçalho do "para"');
    this.loopDepth++;
    const body = this.block(["fimpara"], 'do "para"');
    this.loopDepth--;
    s.next();
    return { k: "for", ...this.pos(t), v, from, to, step, body, blocking: from.blocking || to.blocking || !!step?.blocking || body.some((x) => x.blocking) };
  }

  private switchStmt(): A.Switch {
    const s = this.s;
    const t = s.expectKw("escolha");
    const paren = !!s.acceptOp("(");
    const e = this.expr();
    if (paren) s.expectOp(")");
    const cases: A.Case[] = [];
    while (!s.isKw("fimescolha")) {
      if (s.is("eof")) throw s.error('Faltou "fimescolha"');
      const ck = s.cur;
      if (s.acceptKw("outrocaso")) {
        const body = this.block(["fimescolha", "caso"], 'do "outrocaso"');
        cases.push({ items: null, body, line: ck.line, col: ck.col });
        continue;
      }
      s.expectKw("caso", 'dentro do "escolha"');
      const items: A.CaseItem[] = [];
      do {
        const lo = this.expr();
        let hi: A.Expr | null = null;
        if (s.is("ident") && s.cur.value === "a" && !(s.peek().type === "op" && ["<-", ":=", "["].includes(s.peek().value))) { s.next(); hi = this.expr(); }
        else if (s.acceptKw("ate")) hi = this.expr();
        if (!assignable(e.t, lo.t) && !assignable(lo.t, e.t)) throw err(`O valor do "caso" (${typeName(lo.t)}) não é compatível com a expressão do "escolha" (${typeName(e.t)})`, lo);
        items.push({ lo, hi });
      } while (s.acceptOp(","));
      const body = this.block(["fimescolha", "caso", "outrocaso"], 'do "caso"');
      cases.push({ items, body, line: ck.line, col: ck.col });
    }
    s.next();
    return { k: "switch", ...this.pos(t), e, cases, blocking: e.blocking || cases.some((c) => c.body.some((x) => x.blocking)) };
  }

  // ---------- expressões ----------
  private lvalue(): A.Var | A.Index {
    const s = this.s;
    const t = s.expectIdent("o nome de uma variável");
    const v = this.varRef(t);
    if (s.isOp("[")) return this.indexOf(v);
    return v;
  }

  private varRef(t: Token): A.Var {
    const sym = this.locals?.get(t.value) ?? this.globals.get(t.value);
    if (!sym) {
      if (this.subs.has(t.value)) throw err(`"${t.raw}" é uma função/procedimento, não uma variável`, t);
      throw err(`A variável "${t.raw}" não foi declarada. Declare-a na seção "var" (ex.: ${t.raw}: inteiro)`, t);
    }
    return { k: "var", ...this.pos(t), name: t.raw, slot: sym.slot, global: sym.global, ref: sym.ref, t: sym.t };
  }

  private indexOf(target: A.Expr): A.Index {
    const s = this.s;
    const open = s.expectOp("[");
    const indices: A.Expr[] = [];
    do {
      indices.push(this.expr());
    } while (s.acceptOp(","));
    s.expectOp("]", "para fechar o índice");
    if (target.t.dims === 0 && target.t.base !== "?") throw err(`"${(target as A.Var).name}" não é um vetor e não pode ser indexado com [ ]`, open);
    if (target.t.base !== "?" && indices.length !== target.t.dims)
      throw err(`"${(target as A.Var).name}" é um ${typeName(target.t)} e precisa de ${target.t.dims} índice(s), mas recebeu ${indices.length}`, open);
    for (const i of indices) if (i.t.base !== "inteiro" && i.t.base !== "?") throw err(`O índice de um vetor deve ser inteiro, mas é ${typeName(i.t)}`, i);
    return { k: "index", ...this.pos(open), target, indices, t: T(target.t.base, 0), blocking: target.blocking || indices.some((i) => i.blocking) };
  }

  expr(): A.Expr { return this.binary(0); }

  private static PREC: Record<string, number> = {
    ou: 1, xou: 1, e: 2,
    "=": 3, "<>": 3, "<": 3, ">": 3, "<=": 3, ">=": 3,
    "+": 4, "-": 4, "*": 5, "/": 5, "\\": 5, div: 5, mod: 5, "%": 5, "^": 6,
  };

  private binOp(): string | null {
    const t = this.s.cur;
    if (t.type === "op" && Parser.PREC[t.value] !== undefined) return t.value;
    if (t.type === "keyword" && ["e", "ou", "xou", "div", "mod"].includes(t.value)) return t.value;
    return null;
  }

  private binary(minPrec: number): A.Expr {
    let left = this.unary();
    for (;;) {
      const op = this.binOp();
      if (!op) break;
      const prec = Parser.PREC[op];
      if (prec < minPrec) break;
      const t = this.s.next();
      const right = this.binary(op === "^" ? prec : prec + 1);
      left = { k: "bin", ...this.pos(t), op, l: left, r: right, t: this.binType(op, left.t, right.t, t), blocking: left.blocking || right.blocking };
    }
    return left;
  }

  private binType(op: string, l: TypeRef, r: TypeRef, n: { line: number; col: number }): TypeRef {
    if (l.base === "?" || r.base === "?") return ["=", "<>", "<", ">", "<=", ">=", "e", "ou", "xou"].includes(op) ? T("logico") : T_UNK;
    if (l.dims > 0 || r.dims > 0) throw err(`Não é possível usar o operador "${op}" com um vetor inteiro; acesse uma posição com [ ]`, n);
    switch (op) {
      case "+":
        if (l.base === "caractere" && r.base === "caractere") return T("caractere");
        if (isNum(l) && isNum(r)) return l.base === "real" || r.base === "real" ? T("real") : T("inteiro");
        if (l.base === "caractere" || r.base === "caractere")
          throw err(`Não é possível somar ${typeName(l)} com ${typeName(r)}. Para juntar texto e número use numpcarac(numero) ou escreva(texto, numero)`, n);
        break;
      case "-": case "*":
        if (isNum(l) && isNum(r)) return l.base === "real" || r.base === "real" ? T("real") : T("inteiro");
        break;
      case "/":
        if (isNum(l) && isNum(r)) return T("real");
        break;
      case "^":
        if (isNum(l) && isNum(r)) return l.base === "real" || r.base === "real" ? T("real") : T("inteiro");
        break;
      case "\\": case "div": case "mod": case "%":
        if (l.base === "inteiro" && r.base === "inteiro") return T("inteiro");
        if (isNum(l) && isNum(r)) throw err(`O operador "${op}" só funciona com números inteiros`, n);
        break;
      case "=": case "<>":
        if (isNum(l) && isNum(r)) return T("logico");
        if (l.base === r.base) return T("logico");
        break;
      case "<": case ">": case "<=": case ">=":
        if (isNum(l) && isNum(r)) return T("logico");
        if (l.base === "caractere" && r.base === "caractere") return T("logico");
        break;
      case "e": case "ou": case "xou":
        if (l.base === "logico" && r.base === "logico") return T("logico");
        break;
    }
    throw err(`Não é possível usar o operador "${op}" entre ${typeName(l)} e ${typeName(r)}`, n);
  }

  private unary(): A.Expr {
    const s = this.s;
    const t = s.cur;
    if (t.type === "op" && (t.value === "-" || t.value === "+")) {
      s.next();
      const e = this.unary();
      if (!isNum(e.t) && e.t.base !== "?") throw err(`O sinal "${t.value}" só pode ser usado com números`, t);
      if (t.value === "+") return e;
      return { k: "un", ...this.pos(t), op: "-", e, t: e.t, blocking: e.blocking };
    }
    if (t.type === "keyword" && t.value === "nao") {
      s.next();
      const e = this.unary();
      if (e.t.base !== "logico" && e.t.base !== "?") throw err(`O operador "nao" só pode ser usado com valores lógicos, mas recebeu ${typeName(e.t)}`, t);
      return { k: "un", ...this.pos(t), op: "nao", e, t: T("logico"), blocking: e.blocking };
    }
    return this.primary();
  }

  private primary(): A.Expr {
    const s = this.s;
    const t = s.cur;
    switch (t.type) {
      case "int": s.next(); return { k: "lit", ...this.pos(t), value: parseInt(t.value, 10), t: T("inteiro") };
      case "real": s.next(); return { k: "lit", ...this.pos(t), value: parseFloat(t.value), t: T("real") };
      case "string": s.next(); return { k: "lit", ...this.pos(t), value: t.value, t: T("caractere") };
      case "keyword":
        if (t.value === "verdadeiro" || t.value === "falso") { s.next(); return { k: "lit", ...this.pos(t), value: t.value === "verdadeiro", t: T("logico") }; }
        throw s.error(`Não esperava a palavra reservada "${t.raw}" aqui`);
      case "ident": {
        s.next();
        const local = this.locals?.get(t.value);
        if (local && !(local.isRet && s.isOp("("))) {
          const v: A.Var = { k: "var", ...this.pos(t), name: t.raw, slot: local.slot, global: false, ref: local.ref, t: local.t };
          return s.isOp("[") ? this.indexOf(v) : v;
        }
        const sub = this.subs.get(t.value);
        if (sub) {
          if (!sub.isFunction) throw err(`"${t.raw}" é um procedimento e não devolve valor; não pode ser usado em uma expressão`, t);
          return this.finishCall(t, sub, null);
        }
        const bi = BUILTINS[t.value];
        if (bi && !this.globals.has(t.value)) return this.finishCall(t, null, bi);
        const g = this.globals.get(t.value);
        if (g) {
          const v: A.Var = { k: "var", ...this.pos(t), name: t.raw, slot: g.slot, global: true, ref: false, t: g.t };
          return s.isOp("[") ? this.indexOf(v) : v;
        }
        if (s.isOp("(")) throw err(`A função "${t.raw}" não existe ou ainda não foi declarada`, t);
        throw err(`A variável "${t.raw}" não foi declarada. Declare-a na seção "var" (ex.: ${t.raw}: inteiro)`, t);
      }
      case "op":
        if (t.value === "(") {
          s.next();
          const e = this.expr();
          s.expectOp(")", "para fechar o parêntese aberto");
          return e;
        }
        if (t.value === ")") throw s.error('Parêntese ")" sem o "(" correspondente');
        throw s.error(`Não esperava o operador "${t.raw}" aqui`);
      case "eof":
        throw s.error("O algoritmo terminou de forma inesperada. Verifique se todos os blocos foram fechados");
    }
    throw s.error(`Não esperava ${s.describe()} aqui`);
  }

  private finishCall(t: Token, sub: A.Sub | null, bi: A.Builtin | null): A.Call {
    const s = this.s;
    const args: A.Expr[] = [];
    if (s.acceptOp("(")) {
      if (!s.isOp(")")) {
        do { args.push(this.expr()); } while (s.acceptOp(","));
      }
      s.expectOp(")", `para fechar os argumentos de "${t.raw}"`);
    }
    let ret: TypeRef;
    let blocking = args.some((a) => a.blocking);
    if (sub) {
      if (args.length !== sub.params.length) throw err(`"${sub.name}" espera ${sub.params.length} parâmetro(s), mas recebeu ${args.length}`, t);
      sub.params.forEach((p, i) => {
        const a = args[i];
        if (p.ref) {
          if (a.k !== "var" && a.k !== "index") throw err(`O parâmetro "${p.name}" é passado por referência (var) e precisa receber uma variável`, a);
          if (a.t.base !== p.t.base || a.t.dims !== p.t.dims) throw err(`O parâmetro por referência "${p.name}" é ${typeName(p.t)}, mas recebeu ${typeName(a.t)}`, a);
        } else if (!assignable(p.t, a.t)) throw err(`O parâmetro "${p.name}" de "${sub.name}" é ${typeName(p.t)}, mas recebeu ${typeName(a.t)}`, a);
      });
      ret = sub.ret;
      if (sub.blocking) blocking = true;
    } else {
      const b = bi!;
      if (args.length !== b.params.length) throw err(`A função "${b.name}" espera ${b.params.length} parâmetro(s), mas recebeu ${args.length}`, t);
      b.params.forEach((p, i) => {
        if (!assignable(p, args[i].t)) throw err(`O parâmetro ${i + 1} de "${b.name}" deve ser ${typeName(p)}, mas recebeu ${typeName(args[i].t)}`, args[i]);
      });
      ret = b.ret === "arg0" ? args[0].t : b.ret;
    }
    return { k: "call", ...this.pos(t), name: t.raw, fn: sub, builtin: bi, args, t: ret, blocking };
  }
}

// Remarca subárvores depois que uma função recursiva se descobre bloqueante.
function remarkStmts(list: A.Stmt[]): boolean {
  let any = false;
  for (const s of list) if (remarkStmt(s)) any = true;
  return any;
}
function remarkStmt(s: A.Stmt): boolean {
  let b = false;
  const E = (e: A.Expr | null | undefined) => { if (e && remarkExpr(e)) b = true; };
  const S = (l: A.Stmt[] | null | undefined) => { if (l && remarkStmts(l)) b = true; };
  switch (s.k) {
    case "assign": E(s.target); E(s.value); break;
    case "write": for (const a of s.args) { E(a.e); E(a.width); E(a.decimals); } break;
    case "read": b = true; break;
    case "callstmt": E(s.call); break;
    case "if": E(s.cond); S(s.then); S(s.else); break;
    case "while": E(s.cond); S(s.body); break;
    case "repeat": S(s.body); E(s.cond); break;
    case "for": E(s.from); E(s.to); E(s.step); S(s.body); break;
    case "switch": E(s.e); for (const c of s.cases) { if (c.items) for (const it of c.items) { E(it.lo); E(it.hi); } S(c.body); } break;
    case "return": E(s.value); break;
    case "pause": b = true; break;
    default: break;
  }
  s.blocking = b;
  return b;
}
function remarkExpr(e: A.Expr): boolean {
  let b = false;
  switch (e.k) {
    case "index": if (remarkExpr(e.target)) b = true; for (const i of e.indices) if (remarkExpr(i)) b = true; break;
    case "bin": if (remarkExpr(e.l)) b = true; if (remarkExpr(e.r)) b = true; break;
    case "un": b = remarkExpr(e.e); break;
    case "call": for (const a of e.args) if (remarkExpr(a)) b = true; if (e.fn?.blocking) b = true; break;
    default: break;
  }
  e.blocking = b;
  return b;
}
