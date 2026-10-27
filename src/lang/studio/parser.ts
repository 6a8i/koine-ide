import { tokenize, Token, TokenStream } from "../shared/lexer";
import { PortugolError } from "../shared/types";
import * as A from "./ast";
import { T, T_UNK, TypeRef } from "./ast";

const KEYWORDS = new Set([
  "programa", "funcao", "inclua", "biblioteca", "const",
  "inteiro", "real", "cadeia", "caracter", "logico", "vazio",
  "se", "senao", "enquanto", "faca", "para", "escolha", "caso", "contrario", "pare", "retorne",
  "verdadeiro", "falso", "e", "ou", "nao",
]);

const OPERATORS = [
  "-->", "++", "--", "+=", "-=", "*=", "/=", "%=", "==", "!=", "<=", ">=", "<<", ">>",
  "+", "-", "*", "/", "%", "=", "<", ">", "(", ")", "{", "}", "[", "]", ",", ".", ":", ";", "&", "|", "^", "~", "!",
];

const TYPES = new Set(["inteiro", "real", "cadeia", "caracter", "logico", "vazio"]);

export interface RawProgram {
  includes: { lib: string; alias: string; line: number; col: number }[];
  globals: A.Decl[];
  functions: A.FuncDecl[];
}

export function parseStudio(src: string): RawProgram {
  const toks = tokenize(src, {
    keywords: KEYWORDS,
    caseInsensitive: false,
    operators: OPERATORS,
    blockComments: true,
    braceComments: false,
    singleQuoteChar: true,
    escapes: true,
  });
  return new Parser(new TokenStream(toks)).program();
}

class Parser {
  constructor(private s: TokenStream) {}

  private pos(t: Token) {
    return { line: t.line, col: t.col, blocking: false };
  }

  program(): RawProgram {
    const s = this.s;
    const out: RawProgram = { includes: [], globals: [], functions: [] };
    if (!s.isKw("programa")) {
      throw s.error(
        s.is("eof")
          ? "O arquivo está vazio. Um programa começa com: programa { funcao inicio() { } }"
          : `Todo programa deve começar com a palavra "programa", mas encontrei ${s.describe()}`,
      );
    }
    s.next();
    s.expectOp("{", 'depois de "programa"');
    while (!s.isOp("}")) {
      if (s.is("eof")) throw s.error('Faltou fechar o bloco do programa com "}"');
      if (s.acceptKw("inclua")) {
        s.expectKw("biblioteca", 'depois de "inclua"');
        const lib = s.expectIdent("o nome da biblioteca");
        let alias = lib.value;
        if (s.acceptOp("-->")) alias = s.expectIdent("o apelido da biblioteca").value;
        out.includes.push({ lib: lib.value, alias, line: lib.line, col: lib.col });
        s.acceptOp(";");
        continue;
      }
      if (s.isKw("funcao")) {
        out.functions.push(this.funcDecl());
        continue;
      }
      if (s.isKw("const") || (s.is("keyword") && TYPES.has(s.cur.value))) {
        out.globals.push(...this.declaration(true));
        s.acceptOp(";");
        continue;
      }
      if (s.is("ident")) {
        throw s.error(
          `Comando "${s.cur.raw}" fora de uma função. Comandos devem ficar dentro de "funcao inicio()" ou de outra função`,
        );
      }
      throw s.error(`Não esperava ${s.describe()} aqui. Dentro de "programa" só podem existir bibliotecas, variáveis globais e funções`);
    }
    s.next();
    if (!s.is("eof")) throw s.error(`O programa já terminou, mas ainda há código depois do "}" final: ${s.describe()}`);
    return out;
  }

  private typeKw(): TypeRef {
    const s = this.s;
    if (s.is("keyword") && TYPES.has(s.cur.value)) return T(s.next().value as A.Base);
    throw s.error(`Esperava um tipo (inteiro, real, cadeia, caracter, logico), mas encontrei ${s.describe()}`);
  }

  private funcDecl(): A.FuncDecl {
    const s = this.s;
    const kw = s.expectKw("funcao");
    let ret: TypeRef = T("vazio");
    if (s.is("keyword") && TYPES.has(s.cur.value)) ret = this.typeKw();
    const name = s.expectIdent("o nome da função");
    s.expectOp("(", "depois do nome da função");
    const params: A.Param[] = [];
    if (!s.isOp(")")) {
      do {
        const t = this.typeKw();
        const ref = !!s.acceptOp("&");
        const pn = s.expectIdent("o nome do parâmetro");
        let dims = 0;
        while (s.acceptOp("[")) {
          s.expectOp("]", "(parâmetros de vetor não têm tamanho)");
          dims++;
        }
        params.push({ name: pn.value, t: T(t.base, dims), ref, slot: -1 });
      } while (s.acceptOp(","));
    }
    s.expectOp(")", "para fechar os parâmetros da função");
    const body = this.block(`da função "${name.value}"`);
    return { name: name.value, ret, params, body, nslots: 0, blocking: false, line: kw.line, col: kw.col };
  }

  private block(what: string): A.Stmt[] {
    const s = this.s;
    const open = s.expectOp("{", what ? `para abrir o bloco ${what}` : "");
    const body: A.Stmt[] = [];
    while (!s.isOp("}")) {
      if (s.is("eof")) throw new PortugolError(`Faltou fechar com "}" o bloco ${what} aberto aqui`, open.line, open.col, "sintaxe");
      body.push(this.statement());
    }
    s.next();
    return body;
  }

  /** Um bloco entre chaves, ou um único comando. */
  private bodyOrStmt(what: string): A.Stmt[] {
    if (this.s.isOp("{")) return this.block(what);
    return [this.statement()];
  }

  private declaration(global: boolean): A.Decl[] {
    const s = this.s;
    const isConst = !!s.acceptKw("const");
    const t = this.typeKw();
    const decls: A.Decl[] = [];
    do {
      const name = s.expectIdent("o nome da variável");
      const sizes: (A.Expr | null)[] = [];
      while (s.acceptOp("[")) {
        if (s.acceptOp("]")) sizes.push(null);
        else {
          sizes.push(this.expr());
          s.expectOp("]", "para fechar o tamanho do vetor");
        }
      }
      if (sizes.length > 2) throw s.error("Só são permitidos vetores (1 dimensão) e matrizes (2 dimensões)");
      let init: A.Expr | null = null;
      if (s.acceptOp("=")) init = sizes.length > 0 ? this.arrayLitOrExpr() : this.expr();
      else if (s.isOp("==")) throw s.error('Use "=" (um sinal de igual) para atribuir um valor; "==" serve para comparar');
      if (isConst && !init) throw s.error(`A constante "${name.value}" precisa receber um valor na declaração`);
      decls.push({
        k: "decl", ...this.pos(name), name: name.value, slot: -1, global,
        t: T(t.base, sizes.length), sizes, init, isConst,
      });
    } while (s.acceptOp(","));
    return decls;
  }

  private arrayLitOrExpr(): A.Expr {
    const s = this.s;
    if (!s.isOp("{")) return this.expr();
    const open = s.next();
    const items: A.Expr[] = [];
    if (!s.isOp("}")) {
      do {
        items.push(this.arrayLitOrExpr());
      } while (s.acceptOp(","));
    }
    s.expectOp("}", "para fechar a lista de valores");
    return { k: "arr", ...this.pos(open), items, t: T_UNK };
  }

  private statement(): A.Stmt {
    const s = this.s;
    const t = s.cur;
    if (t.type === "keyword") {
      switch (t.value) {
        case "const":
        case "inteiro": case "real": case "cadeia": case "caracter": case "logico": case "vazio": {
          const decls = this.declaration(false);
          s.acceptOp(";");
          if (decls.length === 1) return decls[0];
          return { k: "block", ...this.pos(t), body: decls, inline: true };
        }
        case "se": return this.ifStmt();
        case "enquanto": {
          s.next();
          s.expectOp("(", 'depois de "enquanto"');
          const cond = this.expr();
          s.expectOp(")", "para fechar a condição do enquanto");
          const body = this.bodyOrStmt('do "enquanto"');
          return { k: "while", ...this.pos(t), cond, body };
        }
        case "faca": {
          s.next();
          const body = this.bodyOrStmt('do "faca"');
          s.expectKw("enquanto", 'depois do bloco do "faca"');
          s.expectOp("(", 'depois de "enquanto"');
          const cond = this.expr();
          s.expectOp(")", "para fechar a condição");
          s.acceptOp(";");
          return { k: "dowhile", ...this.pos(t), cond, body };
        }
        case "para": return this.forStmt();
        case "escolha": return this.switchStmt();
        case "pare": s.next(); s.acceptOp(";"); return { k: "break", ...this.pos(t) };
        case "retorne": {
          s.next();
          let value: A.Expr | null = null;
          if (!s.isOp("}") && !s.isOp(";") && !this.startsStatementKeyword()) value = this.expr();
          s.acceptOp(";");
          return { k: "return", ...this.pos(t), value };
        }
        case "senao": throw s.error('"senao" só pode aparecer logo depois do bloco de um "se"');
        case "caso": throw s.error('"caso" só pode aparecer dentro de um "escolha"');
        case "funcao": throw s.error("Não é possível declarar uma função dentro de outra função");
        case "programa": throw s.error('"programa" só pode aparecer uma vez, no início do arquivo');
        case "verdadeiro": case "falso": case "nao": break; // expressão
        default:
          throw s.error(`Não esperava ${s.describe()} aqui`);
      }
    }
    if (t.type === "op" && t.value === "{") {
      return { k: "block", ...this.pos(t), body: this.block("") };
    }
    if (t.type === "op" && t.value === ";") { s.next(); return { k: "block", ...this.pos(t), body: [] }; }
    const e = this.expr();
    if (e.k !== "call" && e.k !== "assign" && e.k !== "incdec") {
      if (e.k === "var" && s.is("ident")) {
        throw s.error(`"${(e as A.Var).name}" não é um tipo. Para declarar uma variável use inteiro, real, cadeia, caracter ou logico`, t);
      }
      if (e.k === "bin" && (e as A.Bin).op === "==") throw s.error('Use "=" (um sinal de igual) para atribuir um valor; "==" serve para comparar', t);
      throw s.error("Esta expressão não faz nada. Esperava uma atribuição, uma chamada de função ou um comando", t);
    }
    s.acceptOp(";");
    return { k: "expr", ...this.pos(t), e };
  }

  private startsStatementKeyword(): boolean {
    const t = this.s.cur;
    return t.type === "keyword" && ["se", "enquanto", "faca", "para", "escolha", "pare", "retorne", "inteiro", "real", "cadeia", "caracter", "logico", "const"].includes(t.value);
  }

  private ifStmt(): A.If {
    const s = this.s;
    const t = s.expectKw("se");
    s.expectOp("(", 'depois de "se"');
    const cond = this.expr();
    s.expectOp(")", 'para fechar a condição do "se"');
    const then = this.bodyOrStmt('do "se"');
    let els: A.Stmt[] | null = null;
    if (s.acceptKw("senao")) {
      if (s.isKw("se")) els = [this.ifStmt()];
      else els = this.bodyOrStmt('do "senao"');
    }
    return { k: "if", ...this.pos(t), cond, then, else: els };
  }

  private forStmt(): A.For {
    const s = this.s;
    const t = s.expectKw("para");
    s.expectOp("(", 'depois de "para"');
    let init: A.Stmt | null = null;
    if (!s.isOp(";")) {
      if (s.is("keyword") && TYPES.has(s.cur.value)) {
        const d = this.declaration(false);
        init = d.length === 1 ? d[0] : { k: "block", ...this.pos(t), body: d, inline: true };
      } else {
        const e = this.expr();
        init = { k: "expr", ...this.pos(t), e };
      }
    }
    s.expectOp(";", 'depois da inicialização do "para" (ex.: para (inteiro i = 0; i < 10; i++))');
    const cond = s.isOp(";") ? null : this.expr();
    s.expectOp(";", 'depois da condição do "para"');
    const step = s.isOp(")") ? null : this.expr();
    s.expectOp(")", 'para fechar o cabeçalho do "para"');
    const body = this.bodyOrStmt('do "para"');
    return { k: "for", ...this.pos(t), init, cond, step, body };
  }

  private switchStmt(): A.Switch {
    const s = this.s;
    const t = s.expectKw("escolha");
    s.expectOp("(", 'depois de "escolha"');
    const e = this.expr();
    s.expectOp(")", 'para fechar a expressão do "escolha"');
    s.expectOp("{", 'para abrir o bloco do "escolha"');
    const cases: A.Case[] = [];
    while (!s.isOp("}")) {
      if (s.is("eof")) throw s.error('Faltou fechar o bloco do "escolha" com "}"');
      const ck = s.expectKw("caso", 'dentro do "escolha"');
      let values: A.Expr[] | null = null;
      if (s.acceptKw("contrario")) values = null;
      else values = [this.expr()];
      s.expectOp(":", 'depois do valor do "caso"');
      const body: A.Stmt[] = [];
      while (!s.isKw("caso") && !s.isOp("}")) {
        if (s.is("eof")) throw s.error('Faltou fechar o bloco do "escolha" com "}"');
        body.push(this.statement());
      }
      cases.push({ values, body, line: ck.line, col: ck.col });
    }
    s.next();
    return { k: "switch", ...this.pos(t), e, cases };
  }

  // ---------- Expressões ----------
  expr(): A.Expr {
    return this.assignment();
  }

  private assignment(): A.Expr {
    const s = this.s;
    const left = this.binary(0);
    const t = s.cur;
    if (t.type === "op" && ["=", "+=", "-=", "*=", "/=", "%="].includes(t.value)) {
      if (left.k !== "var" && left.k !== "index") throw s.error("Só é possível atribuir valores a variáveis ou posições de vetores", t);
      s.next();
      const value = this.assignment();
      return { k: "assign", ...this.pos(t), op: t.value, target: left, value, t: T_UNK };
    }
    return left;
  }

  private static PREC: Record<string, number> = {
    ou: 1, e: 2, "|": 3, "^": 4, "&": 5,
    "==": 6, "!=": 6, "<": 7, ">": 7, "<=": 7, ">=": 7,
    "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10,
  };

  private binOpToken(): string | null {
    const t = this.s.cur;
    if (t.type === "op" && Parser.PREC[t.value] !== undefined) return t.value;
    if (t.type === "keyword" && (t.value === "e" || t.value === "ou")) return t.value;
    return null;
  }

  private binary(minPrec: number): A.Expr {
    let left = this.unary();
    for (;;) {
      const op = this.binOpToken();
      if (!op) break;
      const prec = Parser.PREC[op];
      if (prec < minPrec) break;
      const t = this.s.next();
      const right = this.binary(prec + 1);
      left = { k: "bin", ...this.pos(t), op, l: left, r: right, t: T_UNK };
    }
    return left;
  }

  private unary(): A.Expr {
    const s = this.s;
    const t = s.cur;
    if ((t.type === "op" && (t.value === "-" || t.value === "+" || t.value === "!" || t.value === "~")) || (t.type === "keyword" && t.value === "nao")) {
      s.next();
      const e = this.unary();
      if (t.value === "+") return e;
      return { k: "un", ...this.pos(t), op: t.value === "!" ? "nao" : t.value, e, t: T_UNK };
    }
    if (t.type === "op" && (t.value === "++" || t.value === "--")) {
      s.next();
      const target = this.unary();
      if (target.k !== "var" && target.k !== "index") throw s.error(`"${t.value}" só pode ser usado em variáveis`, t);
      return { k: "incdec", ...this.pos(t), op: t.value as "++" | "--", target, prefix: true, t: T_UNK };
    }
    return this.postfix();
  }

  private postfix(): A.Expr {
    const s = this.s;
    let e = this.primary();
    for (;;) {
      const t = s.cur;
      if (t.type === "op" && t.value === "[") {
        s.next();
        const idx = this.expr();
        s.expectOp("]", "para fechar o índice");
        if (e.k === "index" && e.indices.length === 1) e.indices.push(idx);
        else e = { k: "index", ...this.pos(t), target: e, indices: [idx], t: T_UNK };
        continue;
      }
      if (t.type === "op" && (t.value === "++" || t.value === "--")) {
        if (e.k !== "var" && e.k !== "index") throw s.error(`"${t.value}" só pode ser usado em variáveis`, t);
        s.next();
        e = { k: "incdec", ...this.pos(t), op: t.value as "++" | "--", target: e, prefix: false, t: T_UNK };
        continue;
      }
      break;
    }
    return e;
  }

  private primary(): A.Expr {
    const s = this.s;
    const t = s.cur;
    switch (t.type) {
      case "int": s.next(); return { k: "lit", ...this.pos(t), value: parseInt(t.value, 10), t: T("inteiro") };
      case "real": s.next(); return { k: "lit", ...this.pos(t), value: parseFloat(t.value), t: T("real") };
      case "string": s.next(); return { k: "lit", ...this.pos(t), value: t.value, t: T("cadeia") };
      case "char": s.next(); return { k: "lit", ...this.pos(t), value: t.value, t: T("caracter") };
      case "keyword":
        if (t.value === "verdadeiro" || t.value === "falso") {
          s.next();
          return { k: "lit", ...this.pos(t), value: t.value === "verdadeiro", t: T("logico") };
        }
        if (TYPES.has(t.value)) throw s.error(`Não esperava o tipo "${t.raw}" aqui. Declarações de variáveis devem ficar no início de um comando`);
        throw s.error(`Não esperava a palavra reservada "${t.raw}" aqui`);
      case "ident": {
        s.next();
        let name = t.value;
        if (s.isOp(".")) {
          s.next();
          const member = s.expectIdent("o nome da função ou constante da biblioteca");
          name = name + "." + member.value;
        }
        if (s.isOp("(")) {
          s.next();
          const args: A.Expr[] = [];
          if (!s.isOp(")")) {
            do {
              args.push(this.expr());
            } while (s.acceptOp(","));
          }
          s.expectOp(")", `para fechar os argumentos de "${name}"`);
          return { k: "call", ...this.pos(t), name, fn: null, builtin: null, args, t: T_UNK };
        }
        return { k: "var", ...this.pos(t), name, slot: -1, global: false, ref: false, t: T_UNK, isConst: false };
      }
      case "op":
        if (t.value === "(") {
          s.next();
          const e = this.expr();
          s.expectOp(")", "para fechar o parêntese aberto");
          return e;
        }
        if (t.value === "{") throw s.error("Listas de valores entre chaves só podem ser usadas na declaração de vetores");
        if (t.value === ")") throw s.error('Parêntese ")" sem o "(" correspondente');
        if (t.value === "}") throw s.error('Chave "}" sem o "{" correspondente');
        throw s.error(`Não esperava o operador "${t.raw}" aqui`);
      case "eof":
        throw s.error("O programa terminou de forma inesperada. Verifique se todos os blocos foram fechados");
    }
    throw s.error(`Não esperava ${s.describe()} aqui`);
  }
}
