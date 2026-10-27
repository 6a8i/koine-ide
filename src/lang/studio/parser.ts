import { tokenize, Token, TokenStream } from "../shared/lexer";
import { PortugolError } from "../shared/types";
import { RawImport } from "../shared/modules";
import * as A from "./ast";
import { T, T_UNK, TypeRef, Visibility } from "./ast";

const KEYWORDS = new Set([
  "programa", "funcao", "inclua", "biblioteca", "const",
  "inteiro", "real", "cadeia", "caracter", "logico", "vazio",
  "se", "senao", "enquanto", "faca", "para", "escolha", "caso", "contrario", "pare", "retorne",
  "verdadeiro", "falso", "e", "ou", "nao",
  // módulos, visibilidade, estruturas, classes, referências
  "modulo", "importe", "publico", "privado", "estrutura", "classe", "herda", "este", "super", "nulo", "ref",
  "teste",
]);

const OPERATORS = [
  "-->", "++", "--", "+=", "-=", "*=", "/=", "%=", "==", "!=", "<=", ">=", "<<", ">>",
  "+", "-", "*", "/", "%", "=", "<", ">", "(", ")", "{", "}", "[", "]", ",", ".", ":", ";", "&", "|", "^", "~", "!",
];

const TYPES = new Set(["inteiro", "real", "cadeia", "caracter", "logico", "vazio"]);

/** Estrutura/classe como saem do parser (campos ainda sem índice, tipos ainda "named"). */
export interface RawField { name: string; t: TypeRef; sizes: A.Expr[]; init: A.Expr | null; visibility: Visibility; line: number; col: number; file: number }
export interface RawStruct { name: string; visibility: Visibility; fields: RawField[]; line: number; col: number; file: number }
export interface RawClass {
  name: string; visibility: Visibility; parentName: string | null;
  fields: RawField[]; methods: A.FuncDecl[]; ctor: A.FuncDecl | null;
  line: number; col: number; file: number;
}

export interface RawModule {
  fileIndex: number;
  file: string;
  moduleName: string;
  /** nome declarado explicitamente com `modulo` */
  declaredName: string | null;
  importable: boolean;
  /** blocos `teste "nome" { ... }` */
  tests: A.FuncDecl[];
  imports: RawImport[];
  includes: { lib: string; alias: string; line: number; col: number; file: number }[];
  globals: A.Decl[];
  functions: A.FuncDecl[];
  structs: RawStruct[];
  classes: RawClass[];
}

function stem(file: string) {
  const base = file.slice(file.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function parseStudio(src: string, fileIndex = 0, file = "principal.por"): RawModule {
  const toks = tokenize(src, {
    keywords: KEYWORDS,
    caseInsensitive: false,
    operators: OPERATORS,
    blockComments: true,
    braceComments: false,
    singleQuoteChar: true,
    escapes: true,
  }, fileIndex);
  return new Parser(new TokenStream(toks, fileIndex), file).program();
}

class Parser {
  constructor(private s: TokenStream, private file: string) {}

  private pos(t: Token) {
    return { line: t.line, col: t.col, file: this.s.fileIndex, blocking: false };
  }

  program(): RawModule {
    const s = this.s;
    const out: RawModule = {
      fileIndex: s.fileIndex, file: this.file, moduleName: stem(this.file), declaredName: null, importable: true,
      imports: [], includes: [], globals: [], functions: [], structs: [], classes: [], tests: [],
    };
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
      if (s.isKw("modulo")) {
        const kw = s.next();
        if (out.declaredName) throw s.error('"modulo" só pode aparecer uma vez por arquivo', kw);
        const name = s.expectIdent("o nome do módulo");
        out.declaredName = name.value;
        out.moduleName = name.value;
        s.acceptOp(";");
        continue;
      }
      if (s.isKw("importe")) {
        const kw = s.next();
        const imp: RawImport = { alias: "", line: kw.line, col: kw.col };
        if (s.is("string")) {
          const p = s.next();
          imp.path = p.value;
          imp.alias = stem(p.value);
        } else {
          const name = s.expectIdent("o nome do módulo (ou o caminho do arquivo entre aspas)");
          imp.name = name.value;
          imp.alias = name.value;
        }
        if (s.acceptOp("-->")) imp.alias = s.expectIdent("o apelido do módulo").value;
        out.imports.push(imp);
        s.acceptOp(";");
        continue;
      }
      if (s.acceptKw("inclua")) {
        s.expectKw("biblioteca", 'depois de "inclua"');
        const lib = s.expectIdent("o nome da biblioteca");
        let alias = lib.value;
        if (s.acceptOp("-->")) alias = s.expectIdent("o apelido da biblioteca").value;
        out.includes.push({ lib: lib.value, alias, line: lib.line, col: lib.col, file: this.s.fileIndex });
        s.acceptOp(";");
        continue;
      }
      if (s.isKw("teste")) {
        const kw = s.next();
        if (!s.is("string")) throw s.error('Depois de "teste" vem o nome do teste, entre aspas (ex.: teste "soma de dois números" { ... })');
        const title = s.next();
        if (s.isOp("(")) throw s.error('Um teste não tem parâmetros: teste "nome" { ... }');
        const body = this.block(`do teste "${title.value}"`);
        out.tests.push({ name: title.value, qname: `teste "${title.value}"`, ret: T("vazio"), params: [], body, nslots: 0, blocking: false, visibility: "privado", isTest: true, line: kw.line, col: kw.col, file: this.s.fileIndex });
        continue;
      }
      const visibility = this.visibility();
      if (s.isKw("funcao")) {
        out.functions.push(this.funcDecl(visibility));
        continue;
      }
      if (this.looksLikeFuncHeader()) {
        // forma curta, sem "funcao": tipo nome(parâmetros) { ... }
        const t = s.cur;
        const ret = this.typeRef();
        const name = s.expectIdent("o nome da função");
        const params = this.params();
        const body = this.block(`da função "${name.value}"`);
        out.functions.push({ name: name.value, qname: name.value, ret, params, body, nslots: 0, blocking: false, visibility, line: t.line, col: t.col, file: this.s.fileIndex });
        continue;
      }
      if (s.isKw("estrutura")) {
        out.structs.push(this.structDecl(visibility));
        continue;
      }
      if (s.isKw("classe")) {
        out.classes.push(this.classDecl(visibility));
        continue;
      }
      if (this.isTypeStart()) {
        const decls = this.declaration(true);
        for (const d of decls) d.visibility = visibility;
        out.globals.push(...decls);
        s.acceptOp(";");
        continue;
      }
      if (s.is("ident")) {
        throw s.error(
          `Comando "${s.cur.raw}" fora de uma função. Comandos devem ficar dentro de "funcao inicio()" ou de outra função`,
        );
      }
      throw s.error(`Não esperava ${s.describe()} aqui. Dentro de "programa" só podem existir módulos, importações, bibliotecas, variáveis globais, estruturas, classes e funções`);
    }
    s.next();
    if (!s.is("eof")) throw s.error(`O programa já terminou, mas ainda há código depois do "}" final: ${s.describe()}`);
    out.importable = !out.functions.some((f) => f.name === "inicio");
    return out;
  }

  private visibility(): Visibility {
    if (this.s.acceptKw("publico")) return "publico";
    if (this.s.acceptKw("privado")) return "privado";
    return "privado";
  }

  // ---------- tipos ----------
  /** Tipo: inteiro | ... | ref T | Nome | Modulo.Nome */
  private typeRef(): TypeRef {
    const s = this.s;
    if (s.acceptKw("ref")) return { base: "ref", dims: 0, elem: this.typeRef() };
    if (s.is("keyword") && TYPES.has(s.cur.value)) return T(s.next().value as A.Base);
    if (s.is("ident")) {
      const id = s.next();
      let name = id.value;
      if (s.isOp(".") && s.peek().type === "ident") {
        s.next();
        name += "." + s.next().value;
      }
      return { base: "named", dims: 0, name };
    }
    throw s.error(`Esperava um tipo (inteiro, real, cadeia, caracter, logico, uma estrutura ou uma classe), mas encontrei ${s.describe()}`);
  }

  /** O comando atual começa com um tipo (declaração)? `Tipo nome`, `Mod.Tipo nome`, `ref ...`, `inteiro ...`, `const` */
  private isTypeStart(): boolean {
    const s = this.s, t = s.cur;
    if (t.type === "keyword") return TYPES.has(t.value) || t.value === "ref" || t.value === "const";
    if (t.type !== "ident") return false;
    const p1 = s.peek(1);
    if (p1.type === "ident") return true;
    const p2 = s.peek(2), p3 = s.peek(3);
    return p1.type === "op" && p1.value === "." && p2.type === "ident" && p3.type === "ident";
  }

  /** `tipo nome(` — cabeçalho de função sem a palavra "funcao"? (não consome nada) */
  private looksLikeFuncHeader(): boolean {
    const s = this.s;
    const save = s.pos;
    try {
      if (!(this.isTypeStart() && !s.isKw("const"))) return false;
      this.typeRef();
      return s.is("ident") && s.peek().type === "op" && s.peek().value === "(";
    } catch {
      return false;
    } finally {
      s.pos = save;
    }
  }

  /** `funcao` seguida de tipo de retorno? */
  private hasReturnType(): boolean {
    const s = this.s, t = s.cur;
    if (t.type === "keyword") return TYPES.has(t.value) || t.value === "ref";
    if (t.type !== "ident") return false;
    const p1 = s.peek(1), p2 = s.peek(2), p3 = s.peek(3);
    if (p1.type === "ident") return true;
    return p1.type === "op" && p1.value === "." && p2.type === "ident" && p3.type === "ident";
  }

  private params(): A.Param[] {
    const s = this.s;
    const params: A.Param[] = [];
    s.expectOp("(", "depois do nome");
    if (!s.isOp(")")) {
      do {
        const t = this.typeRef();
        const ref = !!s.acceptOp("&");
        const pn = s.expectIdent("o nome do parâmetro");
        let dims = 0;
        while (s.acceptOp("[")) {
          s.expectOp("]", "(parâmetros de vetor não têm tamanho)");
          dims++;
        }
        params.push({ name: pn.value, t: A.withDims(t, dims), ref, slot: -1 });
      } while (s.acceptOp(","));
    }
    s.expectOp(")", "para fechar os parâmetros");
    return params;
  }

  private funcDecl(visibility: Visibility): A.FuncDecl {
    const s = this.s;
    const kw = s.expectKw("funcao");
    let ret: TypeRef = T("vazio");
    if (this.hasReturnType()) ret = this.typeRef();
    const name = s.expectIdent("o nome da função");
    const params = this.params();
    const body = this.block(`da função "${name.value}"`);
    return { name: name.value, qname: name.value, ret, params, body, nslots: 0, blocking: false, visibility, line: kw.line, col: kw.col, file: this.s.fileIndex };
  }

  private structDecl(visibility: Visibility): RawStruct {
    const s = this.s;
    const kw = s.expectKw("estrutura");
    const name = s.expectIdent("o nome da estrutura");
    s.expectOp("{", `para abrir a estrutura "${name.value}"`);
    const fields: RawField[] = [];
    while (!s.isOp("}")) {
      if (s.is("eof")) throw s.error(`Faltou fechar a estrutura "${name.value}" com "}"`);
      if (s.isKw("publico") || s.isKw("privado")) throw s.error("Campos de estrutura são sempre públicos; use uma classe para ter campos privados");
      if (s.isKw("funcao")) throw s.error("Estruturas só têm campos. Para ter métodos, use uma classe");
      fields.push(...this.fieldDecl("privado", false));
      s.acceptOp(";");
    }
    s.next();
    return { name: name.value, visibility, fields, line: kw.line, col: kw.col, file: this.s.fileIndex };
  }

  private fieldDecl(visibility: Visibility, allowInit: boolean): RawField[] {
    const s = this.s;
    const t = this.typeRef();
    const out: RawField[] = [];
    do {
      const name = s.expectIdent("o nome do campo");
      const sizes: A.Expr[] = [];
      while (s.acceptOp("[")) {
        sizes.push(this.expr());
        s.expectOp("]", "para fechar o tamanho do vetor");
      }
      if (sizes.length > 2) throw s.error("Só são permitidos vetores (1 dimensão) e matrizes (2 dimensões)");
      let init: A.Expr | null = null;
      if (s.acceptOp("=")) {
        if (!allowInit) throw s.error("Campos de estrutura não têm valor inicial; eles começam zerados", name);
        init = this.expr();
      }
      out.push({ name: name.value, t: A.withDims(t, sizes.length), sizes, init, visibility, line: name.line, col: name.col, file: this.s.fileIndex });
    } while (s.acceptOp(","));
    return out;
  }

  private classDecl(visibility: Visibility): RawClass {
    const s = this.s;
    const kw = s.expectKw("classe");
    const name = s.expectIdent("o nome da classe");
    let parentName: string | null = null;
    if (s.acceptKw("herda")) {
      const p = s.expectIdent("o nome da classe mãe");
      parentName = p.value;
      if (s.isOp(".") && s.peek().type === "ident") { s.next(); parentName += "." + s.next().value; }
    }
    s.expectOp("{", `para abrir a classe "${name.value}"`);
    const cls: RawClass = { name: name.value, visibility, parentName, fields: [], methods: [], ctor: null, line: kw.line, col: kw.col, file: this.s.fileIndex };
    while (!s.isOp("}")) {
      if (s.is("eof")) throw s.error(`Faltou fechar a classe "${name.value}" com "}"`);
      const vis = this.visibility();
      const t = s.cur;
      // construtor: Nome(
      if (t.type === "ident" && t.value === name.value && s.peek().type === "op" && s.peek().value === "(") {
        s.next();
        const params = this.params();
        const body = this.block(`do construtor de "${name.value}"`);
        if (cls.ctor) throw s.error(`A classe "${name.value}" já tem um construtor`, t);
        cls.ctor = { name: name.value, qname: `${name.value}.${name.value}`, ret: T("vazio"), params, body, nslots: 0, blocking: false, visibility: vis, line: t.line, col: t.col, file: this.s.fileIndex };
        continue;
      }
      if (s.isKw("funcao")) {
        const m = this.funcDecl(vis);
        m.qname = `${name.value}.${m.name}`;
        cls.methods.push(m);
        continue;
      }
      // método sem a palavra "funcao": tipo nome( ... ) — ou campo: tipo nome [= valor]
      const save = s.pos;
      const ft = this.typeRef();
      const fname = s.cur;
      if (fname.type === "ident" && s.peek().type === "op" && s.peek().value === "(") {
        s.next();
        const params = this.params();
        const body = this.block(`do método "${fname.value}"`);
        cls.methods.push({ name: fname.value, qname: `${name.value}.${fname.value}`, ret: ft, params, body, nslots: 0, blocking: false, visibility: vis, line: fname.line, col: fname.col, file: this.s.fileIndex });
        continue;
      }
      s.pos = save;
      cls.fields.push(...this.fieldDecl(vis, true));
      s.acceptOp(";");
    }
    s.next();
    return cls;
  }

  private block(what: string): A.Stmt[] {
    const s = this.s;
    const open = s.expectOp("{", what ? `para abrir o bloco ${what}` : "");
    const body: A.Stmt[] = [];
    while (!s.isOp("}")) {
      if (s.is("eof")) throw new PortugolError(`Faltou fechar com "}" o bloco ${what} aberto aqui`, open.line, open.col, "sintaxe", s.fileIndex);
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
    const t = this.typeRef();
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
        t: A.withDims(t, sizes.length), sizes, init, copy: false, isConst, visibility: "privado",
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
    return { k: "arr", ...this.pos(open), items, copyItems: [], t: T_UNK };
  }

  private statement(): A.Stmt {
    const s = this.s;
    const t = s.cur;
    if (this.isTypeStart()) {
      const decls = this.declaration(false);
      s.acceptOp(";");
      if (decls.length === 1) return decls[0];
      return { k: "block", ...this.pos(t), body: decls, inline: true };
    }
    if (t.type === "keyword") {
      switch (t.value) {
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
          return { k: "return", ...this.pos(t), value, copy: false };
        }
        case "senao": throw s.error('"senao" só pode aparecer logo depois do bloco de um "se"');
        case "caso": throw s.error('"caso" só pode aparecer dentro de um "escolha"');
        case "funcao": throw s.error("Não é possível declarar uma função dentro de outra função");
        case "programa": throw s.error('"programa" só pode aparecer uma vez, no início do arquivo');
        case "estrutura": case "classe": throw s.error(`"${t.raw}" só pode ser declarada fora das funções, diretamente dentro de "programa"`);
        case "publico": case "privado": throw s.error(`"${t.raw}" só é usado em declarações do módulo e em membros de classe`);
        case "verdadeiro": case "falso": case "nao": case "este": case "super": case "nulo": break; // expressão
        default:
          throw s.error(`Não esperava ${s.describe()} aqui`);
      }
    }
    if (t.type === "op" && t.value === "{") {
      return { k: "block", ...this.pos(t), body: this.block("") };
    }
    if (t.type === "op" && t.value === ";") { s.next(); return { k: "block", ...this.pos(t), body: [] }; }
    const e = this.expr();
    if (e.k !== "call" && e.k !== "mcall" && e.k !== "new" && e.k !== "assign" && e.k !== "incdec") {
      if (e.k === "bin" && (e as A.Bin).op === "==") throw s.error('Use "=" (um sinal de igual) para atribuir um valor; "==" serve para comparar', t);
      throw s.error("Esta expressão não faz nada. Esperava uma atribuição, uma chamada de função ou um comando", t);
    }
    s.acceptOp(";");
    return { k: "expr", ...this.pos(t), e };
  }

  private startsStatementKeyword(): boolean {
    const t = this.s.cur;
    return t.type === "keyword" && ["se", "enquanto", "faca", "para", "escolha", "pare", "retorne", "inteiro", "real", "cadeia", "caracter", "logico", "const", "ref"].includes(t.value);
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
      if (this.isTypeStart()) {
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
      cases.push({ values, body, line: ck.line, col: ck.col, file: this.s.fileIndex });
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
      if (!A.isLValue(left)) throw s.error("Só é possível atribuir valores a variáveis, posições de vetores, campos ou referências (*r)", t);
      s.next();
      const value = this.assignment();
      return { k: "assign", ...this.pos(t), op: t.value, target: left, value, copy: false, t: T_UNK };
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
    if (t.type === "op" && Parser.PREC[t.value] !== undefined) {
      // "*" e "&" no início de uma linha começam um novo comando (*r = 1, &x), não continuam a expressão anterior
      if ((t.value === "*" || t.value === "&") && this.s.pos > 0 && this.s.toks[this.s.pos - 1].line < t.line) return null;
      return t.value;
    }
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
    // *r (acesso pela referência) e &x (endereço): só aparecem antes de um operando
    if (t.type === "op" && t.value === "*") {
      s.next();
      const e = this.unary();
      return { k: "deref", ...this.pos(t), e, t: T_UNK };
    }
    if (t.type === "op" && t.value === "&") {
      s.next();
      const target = this.unary();
      if (!A.isLValue(target)) throw s.error('"&" só pode ser aplicado a variáveis, posições de vetor ou campos', t);
      return { k: "addr", ...this.pos(t), target, t: T_UNK };
    }
    if (t.type === "op" && (t.value === "++" || t.value === "--")) {
      s.next();
      const target = this.unary();
      if (!A.isLValue(target)) throw s.error(`"${t.value}" só pode ser usado em variáveis`, t);
      return { k: "incdec", ...this.pos(t), op: t.value as "++" | "--", target, prefix: true, t: T_UNK };
    }
    return this.postfix();
  }

  private argList(what: string): A.Expr[] {
    const s = this.s;
    const args: A.Expr[] = [];
    if (!s.isOp(")")) {
      do {
        args.push(this.expr());
      } while (s.acceptOp(","));
    }
    s.expectOp(")", `para fechar os argumentos de "${what}"`);
    return args;
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
      if (t.type === "op" && t.value === ".") {
        s.next();
        const m = s.expectIdent("o nome do campo ou do método");
        if (s.acceptOp("(")) {
          const args = this.argList(m.value);
          e = { k: "mcall", ...this.pos(m), obj: e, name: m.value, args, copyArgs: [], method: null, vslot: -1, isSuper: false, initsOf: null, t: T_UNK };
        } else {
          e = { k: "member", ...this.pos(m), obj: e, name: m.value, index: -1, t: T_UNK };
        }
        continue;
      }
      if (t.type === "op" && (t.value === "++" || t.value === "--")) {
        if (!A.isLValue(e)) throw s.error(`"${t.value}" só pode ser usado em variáveis`, t);
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
        if (t.value === "nulo") {
          s.next();
          return { k: "lit", ...this.pos(t), value: null, t: T("nulo") };
        }
        if (t.value === "este") {
          s.next();
          return { k: "var", ...this.pos(t), name: "este", slot: -1, global: false, ref: false, t: T_UNK, isConst: false };
        }
        if (t.value === "super") {
          s.next();
          const self: A.Var = { k: "var", ...this.pos(t), name: "este", slot: -1, global: false, ref: false, t: T_UNK, isConst: false };
          if (s.acceptOp("(")) {
            const args = this.argList("super");
            return { k: "mcall", ...this.pos(t), obj: self, name: "<construtor>", args, copyArgs: [], method: null, vslot: -1, isSuper: true, initsOf: null, t: T_UNK };
          }
          s.expectOp(".", 'depois de "super" (use super(...) ou super.metodo(...))');
          const m = s.expectIdent("o nome do método da classe mãe");
          s.expectOp("(", `para chamar super.${m.value}`);
          const args = this.argList(m.value);
          return { k: "mcall", ...this.pos(t), obj: self, name: m.value, args, copyArgs: [], method: null, vslot: -1, isSuper: true, initsOf: null, t: T_UNK };
        }
        if (TYPES.has(t.value)) throw s.error(`Não esperava o tipo "${t.raw}" aqui. Declarações de variáveis devem ficar no início de um comando`);
        throw s.error(`Não esperava a palavra reservada "${t.raw}" aqui`);
      case "ident": {
        s.next();
        if (s.isOp("(")) {
          s.next();
          const args = this.argList(t.value);
          return { k: "call", ...this.pos(t), name: t.value, fn: null, builtin: null, args, copyArgs: [], t: T_UNK };
        }
        return { k: "var", ...this.pos(t), name: t.value, slot: -1, global: false, ref: false, t: T_UNK, isConst: false };
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
