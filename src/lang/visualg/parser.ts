import { tokenize, Token, TokenStream } from "../shared/lexer";
import { CompileOptions, PortugolError } from "../shared/types";
import { RawImport, RawModuleHeader, linkModules, stemOf } from "../shared/modules";
import { SourceFile } from "../protocol";
import * as A from "./ast";
import { T, T_UNK, TypeRef, typeName, isAggregate, withDims } from "./ast";
import { BUILTINS } from "./builtins";
import { Locale, registerLexerConfig, toCanonicalMap } from "../i18n";

const KEYWORDS = new Set([
  "algoritmo", "var", "inicio", "fimalgoritmo", "const",
  "inteiro", "real", "caractere", "caracter", "literal", "logico", "vetor", "de",
  "se", "entao", "senao", "fimse", "enquanto", "faca", "fimenquanto",
  "para", "ate", "passo", "fimpara", "repita", "escolha", "caso", "outrocaso", "fimescolha",
  "funcao", "fimfuncao", "procedimento", "fimprocedimento", "retorne", "interrompa",
  "e", "ou", "nao", "xou", "div", "mod", "verdadeiro", "falso",
  "escreva", "escreval", "leia", "limpatela", "pausa", "aleatorio", "timer", "eco", "cronometro", "debug", "arquivo",
  "on", "off", "tipo", "registro", "fimregistro", "dos", "fimrepita",
  // módulos, visibilidade, classes, referências
  "modulo", "fimmodulo", "importe", "como", "publico", "privado", "classe", "fimclasse", "herda", "novo", "este", "super", "nulo", "ref",
  "teste", "fimteste",
]);

const OPERATORS = ["<-", ":=", "<=", ">=", "<>", "..", "+", "-", "*", "/", "\\", "^", "%", "=", "<", ">", "(", ")", "[", "]", ",", ":", ";", ".", "&"];

const SECTION_KW = new Set(["var", "const", "tipo", "funcao", "procedimento", "inicio", "fimmodulo", "publico", "privado", "teste"]);
const CLOSERS = new Set(["fimalgoritmo", "fimse", "fimenquanto", "fimpara", "fimescolha", "fimfuncao", "fimprocedimento", "senao", "outrocaso", "caso", "ate", "fimrepita", "fimmodulo", "fimteste"]);

type Loc = { line: number; col: number; file?: number };
const err = (msg: string, n: Loc) => new PortugolError(msg, n.line, n.col, "sintaxe", n.file ?? 0);

interface Sym { name: string; slot: number; global: boolean; t: TypeRef; ref: boolean; isRet?: boolean; isConst?: boolean }

export function same(a: TypeRef, b: TypeRef): boolean {
  if (a.base !== b.base || a.dims !== b.dims) return false;
  if (a.base === "registro" || a.base === "classe") return a.decl === b.decl;
  if (a.base === "ref") return !!a.elem && !!b.elem && same(a.elem, b.elem);
  return true;
}
function assignable(to: TypeRef, from: TypeRef): boolean {
  if (to.base === "?" || from.base === "?") return true;
  if (from.base === "nulo") return to.dims === 0 && (to.base === "classe" || to.base === "ref");
  if (to.dims !== from.dims) return false;
  switch (to.base) {
    case "registro": return from.base === "registro" && to.decl === from.decl;
    case "classe": return from.base === "classe" && (from.decl === to.decl || (from.decl as A.ClassDecl).ancestors.has(to.decl as A.ClassDecl));
    case "ref": return from.base === "ref" && !!to.elem && !!from.elem && same(to.elem, from.elem);
  }
  if (to.base === from.base) return true;
  if (to.base === "real" && from.base === "inteiro") return true;
  return false;
}
const isNum = (t: TypeRef) => t.dims === 0 && (t.base === "inteiro" || t.base === "real");
const needsCopy = (t: TypeRef, e: A.Expr) => t.base === "registro" && t.dims === 0 && A.isLValue(e);

registerLexerConfig("visualg", KEYWORDS, OPERATORS);

function lex(src: string, fileIndex: number, locale: Locale = "pt-BR"): Token[] {
  return tokenize(src, {
    keywords: KEYWORDS,
    caseInsensitive: true,
    operators: OPERATORS,
    blockComments: false,
    braceComments: true,
    singleQuoteChar: false,
    escapes: false,
    translate: toCanonicalMap("visualg", locale),
  }, fileIndex);
}

interface Header extends RawModuleHeader {
  toks: Token[];
  /** posição do primeiro token depois do cabeçalho e das importações */
  bodyPos: number;
  programName: string;
}

/** Lê `algoritmo "x"` / `modulo "x"` e as linhas `importe`. */
function scanHeader(toks: Token[], fileIndex: number, file: string): Header {
  const s = new TokenStream(toks, fileIndex);
  if (s.is("eof")) throw s.error('O arquivo está vazio. Um algoritmo começa com: algoritmo "nome"');
  let importable = false;
  let name = stemOf(file);
  if (s.acceptKw("modulo")) {
    importable = true;
    if (s.is("string")) name = s.next().value;
    else if (s.is("ident")) name = s.next().raw;
    else throw s.error('Depois de "modulo" vem o nome do módulo, entre aspas (ex.: modulo "geometria")');
  } else if (s.acceptKw("algoritmo")) {
    if (s.is("string")) name = s.next().value;
    else if (s.is("ident")) name = s.next().raw;
    else name = "semnome";
  } else {
    throw s.error(`Todo algoritmo deve começar com a palavra "algoritmo" (ou "modulo", para uma biblioteca), mas encontrei ${s.describe()}`);
  }
  const imports: RawImport[] = [];
  while (s.isKw("importe")) {
    const kw = s.next();
    const imp: RawImport = { alias: "", line: kw.line, col: kw.col };
    if (s.is("string")) {
      const p = s.next();
      imp.path = p.value;
      imp.alias = stemOf(p.value).toLowerCase();
    } else {
      const n = s.expectIdent("o nome do módulo (ou o caminho do arquivo entre aspas)");
      imp.name = n.value;
      imp.alias = n.value;
    }
    if (s.acceptKw("como")) imp.alias = s.expectIdent("o apelido do módulo").value;
    imports.push(imp);
    s.acceptOp(";");
  }
  return { fileIndex, file, moduleName: name, importable, imports, toks, bodyPos: s.pos, programName: name };
}

interface Shared {
  nglobals: number;
  globals: A.VarDecl[];
  constInits: { slot: number; value: A.Lit }[];
  subs: Map<string, A.Sub>;
  allSubs: A.Sub[];
  records: A.RecordDecl[];
  classes: A.ClassDecl[];
  modules: A.ModuleInfo[];
  calls: Map<A.Sub, Set<A.Sub>>;
  callNodes: (A.Call | A.MethodCall | A.New)[];
  /** modo de testes (CompileOptions.tests) */
  testMode: boolean;
  tests: A.Sub[];
  bodies: { module: A.ModuleInfo; body: A.Stmt[] }[];
}

/** true se o arquivo tem algum bloco `teste`. */
const headerHasTests = (h: Header) => h.toks.some((t) => t.type === "keyword" && t.value === "teste");

export function parseVisualg(src: string, fileIndex = 0, file = "principal.alg"): A.ProgramAst {
  return parseVisualgProject([{ path: file, source: src }], file, fileIndex);
}

export function parseVisualgProject(files: SourceFile[], entry: string, baseIndex = 0, opts: CompileOptions = {}): A.ProgramAst {
  const names = files.map((f) => f.path);
  let entryIndex = names.indexOf(entry);
  if (entryIndex < 0) entryIndex = 0;
  const headers = files.map((f, i) => scanHeader(lex(f.source, baseIndex + i, opts.locale ?? "pt-BR"), baseIndex + i, f.path));
  const entryHeader = headers[entryIndex];
  if (entryHeader.importable && !opts.tests) {
    throw new PortugolError(`O arquivo ${entryHeader.file} é um módulo (começa com "modulo") e não pode ser executado diretamente. Execute o arquivo do algoritmo principal`, 1, 1, "sintaxe", entryHeader.fileIndex);
  }
  // um arquivo só de testes pode importar o algoritmo que testa
  const link = linkModules(headers, entryHeader, true, { canImportProgram: (from) => !!opts.tests && from.importable && headerHasTests(from) });
  const shared: Shared = { nglobals: 0, globals: [], constInits: [], subs: new Map(), allSubs: [], records: [], classes: [], modules: [], calls: new Map(), callNodes: [], testMode: !!opts.tests, tests: [], bodies: [] };
  const infoOf = new Map<Header, A.ModuleInfo>();
  for (const h of link.order) {
    const info: A.ModuleInfo = {
      index: h.fileIndex, file: h.file, name: h.moduleName, imports: [], scope: { subs: new Map(), globals: new Map(), types: new Map(), modAlias: new Map() },
      isTest: !!opts.tests && h.importable && headerHasTests(h),
    };
    infoOf.set(h, info);
    shared.modules.push(info);
  }
  let body: A.Stmt[] = [];
  for (const h of link.order) {
    const info = infoOf.get(h)!;
    for (const l of link.resolved.get(h) ?? []) {
      const target = infoOf.get(l.target)!;
      const alias = l.alias.toLowerCase();
      if (info.scope.modAlias.has(alias)) throw err(`O apelido "${l.alias}" já está sendo usado por outra importação`, h.imports.find((i) => i.alias.toLowerCase() === alias) ?? { line: 1, col: 1, file: h.fileIndex });
      info.scope.modAlias.set(alias, target);
      info.imports.push({ target, alias });
    }
    const p = new ModuleParser(h, info, shared, h === entryHeader);
    const b = p.parse();
    if (h === entryHeader) body = b;
    else if (!h.importable) shared.bodies.push({ module: info, body: b });
  }
  computeBlocking(shared, body);
  for (const extra of shared.bodies) remarkStmts(extra.body, shared.classes);
  return {
    name: entryHeader.programName, files: names, modules: shared.modules, entry: infoOf.get(entryHeader)!,
    globals: shared.globals, nglobals: shared.nglobals, constInits: shared.constInits, subs: shared.subs,
    records: shared.records, classes: shared.classes, body, nslots: 0, tests: shared.tests, bodies: shared.bodies,
  };
}

interface SubHeader {
  kw: Token;
  name: Token;
  className: string | null;
  isFunction: boolean;
  params: { names: Token[]; t: TypeRef; ranges: A.Range[]; ref: boolean }[];
  ret: TypeRef;
  visibility: A.Visibility;
}

class ModuleParser {
  private s: TokenStream;
  private locals: Map<string, Sym> | null = null;
  private nslots = 0;
  private curSub: A.Sub | null = null;
  private curClass: A.ClassDecl | null = null;
  private loopDepth = 0;
  private pass: 1 | 2 = 1;
  /** corpos qualificados (funcao Classe.metodo) vistos no passe 1 */
  private qualified: { header: SubHeader }[] = [];
  /** blocos `teste` na ordem em que aparecem (criados no passe 1, corpos no passe 2) */
  private tests: A.Sub[] = [];
  private testIndex = 0;

  constructor(private h: Header, private info: A.ModuleInfo, private shared: Shared, private isEntry: boolean) {
    this.s = new TokenStream(h.toks, h.fileIndex);
  }

  private pos(t: Token) { return { line: t.line, col: t.col, file: this.s.fileIndex, blocking: false }; }
  private err(msg: string, n: Loc) { return err(msg, { line: n.line, col: n.col, file: n.file ?? this.s.fileIndex }); }

  parse(): A.Stmt[] {
    const s = this.s;
    // passe 1: tipos e cabeçalhos
    this.pass = 1;
    s.pos = this.h.bodyPos;
    this.sections();
    this.linkTypes();
    // passe 2: constantes, variáveis, corpos
    this.pass = 2;
    s.pos = this.h.bodyPos;
    this.sections();
    this.curClass = null;
    this.curSub = null;
    this.locals = null;
    if (this.h.importable) {
      if (s.isKw("inicio")) throw s.error('Um módulo não tem "inicio": só variáveis, tipos, funções e procedimentos. Para um programa executável comece com "algoritmo"');
      s.expectKw("fimmodulo", "no fim do módulo");
      if (!s.is("eof")) throw s.error(`O módulo já terminou em "fimmodulo", mas ainda há código depois: ${s.describe()}`);
      return [];
    }
    if (!s.isKw("inicio")) {
      if (s.is("eof")) throw s.error('Faltou a seção "inicio" do algoritmo');
      throw s.error(`Esperava "var", "inicio", "funcao" ou "procedimento", mas encontrei ${s.describe()}${s.is("ident") ? '. Variáveis devem ser declaradas depois de "var", e comandos depois de "inicio"' : ""}`);
    }
    s.next();
    const body = this.block(["fimalgoritmo"], "do algoritmo");
    s.expectKw("fimalgoritmo");
    if (!s.is("eof")) throw s.error(`O algoritmo já terminou em "fimalgoritmo", mas ainda há código depois: ${s.describe()}`);
    return body;
  }

  // ======================= seções =======================
  private visibility(): A.Visibility {
    return this.visibilityOpt() ?? "privado";
  }
  /** "publico"/"privado" se estiver escrito; null se não */
  private visibilityOpt(): A.Visibility | null {
    if (this.s.acceptKw("publico")) return "publico";
    if (this.s.acceptKw("privado")) return "privado";
    return null;
  }
  /** Início de uma linha de seção: lê a visibilidade opcional e diz se a linha começa com um identificador. */
  private lineStart(sectionVis: A.Visibility, next: (t: Token) => boolean = (t) => t.type === "ident"): A.Visibility | null {
    const s = this.s;
    const save = s.pos;
    const v = this.visibilityOpt();
    if (!next(s.cur)) { s.pos = save; return null; }
    return v ?? sectionVis;
  }

  private sections() {
    const s = this.s;
    for (;;) {
      const save = s.pos;
      const vis = this.visibility();
      if (s.isKw("var")) {
        s.next();
        if (this.pass === 1) this.skipDeclSection(); else this.varSection(true, vis);
      } else if (s.isKw("const")) {
        s.next();
        if (this.pass === 1) this.skipDeclSection(); else this.constSection(vis);
      } else if (s.isKw("tipo")) {
        s.next();
        this.typeSection(vis);
      } else if (s.isKw("funcao") || s.isKw("procedimento")) {
        this.subprogram(vis);
      } else if (s.isKw("teste")) {
        this.testBlock();
      } else {
        s.pos = save;
        break;
      }
    }
  }

  /** Passe 1: pula uma seção var/const (vai até a próxima palavra de seção). */
  private skipDeclSection() {
    const s = this.s;
    const isSection = (t: Token) => t.type === "keyword" && SECTION_KW.has(t.value) && t.value !== "publico" && t.value !== "privado";
    while (!s.is("eof")) {
      if (isSection(s.cur)) break;
      // "publico"/"privado" só encerra a seção se vier antes de outra seção (publico funcao ...)
      if ((s.isKw("publico") || s.isKw("privado")) && isSection(s.peek())) break;
      s.next();
    }
  }

  // ======================= tipos =======================
  /** Tipo: inteiro | real | caractere | logico | ref T | Nome | modulo.Nome */
  private baseTypeRef(): TypeRef {
    const s = this.s;
    const t = s.cur;
    if (t.type === "keyword") {
      switch (t.value) {
        case "inteiro": s.next(); return T("inteiro");
        case "real": s.next(); return T("real");
        case "caractere": case "caracter": case "literal": s.next(); return T("caractere");
        case "logico": s.next(); return T("logico");
        case "ref": s.next(); return { base: "ref", dims: 0, elem: this.baseTypeRef() };
      }
    }
    if (t.type === "ident") {
      if (t.value === "string") { s.next(); return T("caractere"); }
      s.next();
      let name = t.raw;
      if (s.isOp(".") && s.peek().type === "ident") { s.next(); name += "." + s.next().raw; }
      return { base: "named", dims: 0, name };
    }
    throw s.error(`Esperava um tipo (inteiro, real, caractere, logico, um registro ou uma classe), mas encontrei ${s.describe()}`);
  }

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
      const base = this.baseTypeRef();
      return { t: withDims(base, ranges.length), ranges };
    }
    return { t: this.baseTypeRef(), ranges: [] };
  }

  private intLiteral(what: string): number {
    const s = this.s;
    let neg = false;
    if (s.acceptOp("-")) neg = true;
    if (!s.is("int")) throw s.error(`Esperava um número inteiro para ${what}, mas encontrei ${s.describe()}`);
    const v = parseInt(s.next().value, 10);
    return neg ? -v : v;
  }

  private findType(name: string, n: Loc): A.RecordDecl | A.ClassDecl {
    const dot = name.indexOf(".");
    const sc = this.info.scope;
    if (dot > 0) {
      const alias = name.slice(0, dot).toLowerCase(), tn = name.slice(dot + 1).toLowerCase();
      const target = sc.modAlias.get(alias);
      if (!target) throw this.err(`O módulo "${name.slice(0, dot)}" não foi importado. Use: importe ${name.slice(0, dot)}`, n);
      const t = target.scope.types.get(tn);
      if (!t) throw this.err(`O módulo ${target.name} não tem um registro ou classe chamado "${name.slice(dot + 1)}"`, n);
      if (!this.visible(t.visibility)) throw this.err(`"${t.name}" é privado no módulo ${target.name}; declare-o como "publico" para usá-lo em outro arquivo`, n);
      return t;
    }
    const key = name.toLowerCase();
    const local = sc.types.get(key);
    if (local) return local;
    const hits: { m: A.ModuleInfo; t: A.RecordDecl | A.ClassDecl }[] = [];
    for (const imp of this.info.imports) {
      const t = imp.target.scope.types.get(key);
      if (t && this.visible(t.visibility)) hits.push({ m: imp.target, t });
    }
    if (hits.length > 1) throw this.err(`"${name}" existe em ${hits.map((h) => h.m.name).join(" e ")}. Use ${hits[0].m.name}.${name} ou ${hits[1].m.name}.${name}`, n);
    if (hits.length === 1) return hits[0].t;
    for (const imp of this.info.imports) {
      if (imp.target.scope.types.has(key)) throw this.err(`"${name}" é privado no módulo ${imp.target.name}; declare-o como "publico" para usá-lo em outro arquivo`, n);
    }
    throw this.err(`O tipo "${name}" não existe. Use inteiro, real, caractere, logico ou um registro/classe declarado em "tipo"`, n);
  }

  private resolveType(t: TypeRef, n: Loc): TypeRef {
    if (t.base === "named") {
      const decl = this.findType(t.name!, n);
      return { base: decl.kind === "record" ? "registro" : "classe", dims: t.dims, name: decl.name, decl };
    }
    if (t.base === "ref") {
      const elem = this.resolveType(t.elem!, n);
      if (elem.base === "ref") throw this.err("Não é possível ter uma referência para outra referência (ref ref)", n);
      return { base: "ref", dims: t.dims, elem };
    }
    return t;
  }

  /** Seção `tipo`: Nome = registro ... fimregistro | Nome = classe [herda Pai] ... fimclasse */
  private typeSection(sectionVis: A.Visibility) {
    const s = this.s;
    for (;;) {
      const vis = this.lineStart(sectionVis, (t) => t.type === "ident" && s.peek().type === "op" && s.peek().value === "=");
      if (vis === null) break;
      const name = s.next();
      s.next(); // =
      if (s.acceptKw("registro")) this.recordDecl(name, vis);
      else if (s.acceptKw("classe")) this.classDecl(name, vis);
      else throw s.error(`Depois de "${name.raw} =" esperava "registro" ou "classe", mas encontrei ${s.describe()}`);
      s.acceptOp(";");
    }
  }

  private fieldLines(owner: A.RecordDecl | A.ClassDecl, into: A.Field[], allowVis: boolean, stop: Set<string>) {
    const s = this.s;
    while (!(s.is("keyword") && stop.has(s.cur.value))) {
      if (s.is("eof")) throw s.error(`Faltou fechar ${owner.kind === "record" ? `o registro "${owner.name}" com "fimregistro"` : `a classe "${owner.name}" com "fimclasse"`}`);
      let vis: A.Visibility = owner.kind === "record" ? "publico" : "privado";
      if (s.isKw("publico") || s.isKw("privado")) {
        if (!allowVis) throw s.error("Campos de registro são sempre públicos; use uma classe para ter campos privados");
        vis = this.visibility();
      }
      if (owner.kind === "class" && (s.isKw("funcao") || s.isKw("procedimento"))) {
        this.methodHeader(owner, vis);
        continue;
      }
      if (!s.is("ident")) throw s.error(`Esperava o nome de um campo${owner.kind === "class" ? ", funcao ou procedimento" : ""}, mas encontrei ${s.describe()}`);
      const names: Token[] = [];
      do { names.push(s.expectIdent("o nome do campo")); } while (s.acceptOp(","));
      s.expectOp(":", "depois do nome do campo para indicar o tipo");
      const { t, ranges } = this.typeSpec();
      for (const n of names) {
        const key = n.value;
        if (into.some((f) => f.name.toLowerCase() === key)) throw this.err(`O campo "${n.raw}" já existe em ${owner.name}`, n);
        into.push({ name: n.raw, t, ranges, visibility: vis, index: -1, owner, line: n.line, col: n.col, file: this.s.fileIndex });
      }
      s.acceptOp(";");
    }
  }

  private registerType(name: Token, decl: A.RecordDecl | A.ClassDecl) {
    const sc = this.info.scope;
    if (sc.types.has(name.value)) throw this.err(`O tipo "${name.raw}" já foi declarado`, name);
    if (sc.subs.has(name.value)) throw this.err(`"${name.raw}" já é o nome de uma função ou procedimento`, name);
    sc.types.set(name.value, decl);
  }

  private recordDecl(name: Token, vis: A.Visibility) {
    const s = this.s;
    const decl: A.RecordDecl = {
      kind: "record", name: name.raw, qname: `${this.info.name}.${name.raw}`, module: this.info, visibility: vis,
      fields: [], fieldIndex: new Map(), fieldNames: [], line: name.line, col: name.col, file: this.s.fileIndex,
    };
    this.fieldLines(decl, decl.fields, false, new Set(["fimregistro"]));
    s.expectKw("fimregistro");
    if (this.pass === 1) {
      decl.fields.forEach((f, i) => { f.index = i; decl.fieldIndex.set(f.name.toLowerCase(), i); decl.fieldNames.push(f.name); });
      this.registerType(name, decl);
      this.shared.records.push(decl);
    }
  }

  private classDecl(name: Token, vis: A.Visibility) {
    const s = this.s;
    let parentName: string | null = null;
    if (s.acceptKw("herda")) {
      const p = s.expectIdent("o nome da classe mãe");
      parentName = p.raw;
      if (s.isOp(".") && s.peek().type === "ident") { s.next(); parentName += "." + s.next().raw; }
    }
    const decl: A.ClassDecl = {
      kind: "class", name: name.raw, qname: `${this.info.name}.${name.raw}`, module: this.info, visibility: vis,
      parentName, parent: null, ownFields: [], allFields: [], fieldIndex: new Map(), fieldNames: [],
      methods: [], ctor: null, vtable: [], methodIndex: new Map(), ancestors: new Set(), linked: false,
      line: name.line, col: name.col, file: this.s.fileIndex,
    };
    const prevClass = this.curClass;
    this.curClass = decl;
    this.fieldLines(decl, decl.ownFields, true, new Set(["fimclasse"]));
    this.curClass = prevClass;
    s.expectKw("fimclasse");
    if (this.pass === 1) {
      this.registerType(name, decl);
      this.shared.classes.push(decl);
    }
  }

  /** Cabeçalho de método dentro da classe (sem corpo). */
  private methodHeader(cls: A.ClassDecl, vis: A.Visibility) {
    const h = this.subHeader(vis);
    if (h.className) throw this.err("Dentro da classe o método é declarado só pelo nome, sem o prefixo da classe", h.name);
    if (this.pass !== 1) return;
    const key = h.name.value;
    if (cls.methods.some((m) => m.name.toLowerCase() === key)) throw this.err(`O método "${h.name.raw}" já foi declarado na classe ${cls.name}`, h.name);
    if (cls.ownFields.some((f) => f.name.toLowerCase() === key)) throw this.err(`"${h.name.raw}" já é um campo da classe ${cls.name}`, h.name);
    const sub = this.makeSub(h, cls);
    if (key === "iniciar") {
      if (h.isFunction) throw this.err('O construtor "iniciar" deve ser um procedimento', h.name);
      sub.isCtor = true;
      cls.ctor = sub;
    } else cls.methods.push(sub);
  }

  private makeSub(h: SubHeader, cls: A.ClassDecl | null): A.Sub {
    const sub: A.Sub = {
      name: h.name.raw, qname: cls ? `${cls.name}.${h.name.raw}` : (this.isEntry ? h.name.raw : `${this.info.name}.${h.name.raw}`),
      isFunction: h.isFunction, ret: h.ret, params: [], locals: [], body: [], nslots: 0, blocking: false,
      visibility: h.visibility, module: this.info, cls: cls ?? undefined, isCtor: false, vslot: -1, hasBody: false,
      line: h.kw.line, col: h.kw.col, file: this.s.fileIndex, retSlot: -1,
    };
    let slot = 0;
    if (cls) sub.params.push({ name: "este", t: { base: "classe", dims: 0, name: cls.name, decl: cls }, ref: false, slot: slot++, ranges: [] });
    for (const g of h.params) for (const n of g.names) {
      if (sub.params.some((p) => p.name.toLowerCase() === n.value)) throw this.err(`O parâmetro "${n.raw}" está repetido`, n);
      sub.params.push({ name: n.raw, t: g.t, ref: g.ref, slot: slot++, ranges: g.ranges });
    }
    if (h.isFunction) sub.retSlot = slot++;
    sub.nslots = slot;
    this.shared.allSubs.push(sub);
    this.shared.calls.set(sub, new Set());
    return sub;
  }

  /** Lê `funcao [Classe.]nome(params): tipo` / `procedimento [Classe.]nome(params)` (sem o corpo). */
  private subHeader(vis: A.Visibility): SubHeader {
    const s = this.s;
    const kw = s.next();
    const isFunction = kw.value === "funcao";
    let name = s.expectIdent(isFunction ? "o nome da função" : "o nome do procedimento");
    let className: string | null = null;
    if (s.isOp(".") && s.peek().type === "ident") {
      s.next();
      className = name.raw;
      name = s.next();
    }
    const params: SubHeader["params"] = [];
    if (s.acceptOp("(")) {
      if (!s.isOp(")")) {
        do {
          const ref = !!s.acceptKw("var");
          const names: Token[] = [];
          do { names.push(s.expectIdent("o nome do parâmetro")); } while (s.acceptOp(","));
          s.expectOp(":", "depois do nome do parâmetro para indicar o tipo");
          const { t, ranges } = this.typeSpec();
          params.push({ names, t, ranges, ref });
        } while (s.acceptOp(";") || s.acceptOp(","));
      }
      s.expectOp(")", "para fechar os parâmetros");
    }
    let ret: TypeRef = T("vazio");
    if (isFunction) {
      s.expectOp(":", "depois dos parâmetros da função, para indicar o tipo de retorno (ex.: funcao soma(a, b: inteiro): inteiro)");
      ret = this.baseTypeRef();
    }
    return { kw, name, className, isFunction, params, ret, visibility: vis };
  }

  /** Função/procedimento no nível do módulo (ou corpo de método: funcao Classe.metodo). */
  private subprogram(vis: A.Visibility) {
    const s = this.s;
    const h = this.subHeader(vis);
    const end = h.isFunction ? "fimfuncao" : "fimprocedimento";
    if (this.pass === 1) {
      if (h.className) {
        this.qualified.push({ header: h });
      } else {
        const sc = this.info.scope;
        if (sc.subs.has(h.name.value)) throw this.err(`"${h.name.raw}" já foi declarado`, h.name);
        if (sc.types.has(h.name.value)) throw this.err(`"${h.name.raw}" já é o nome de um registro ou classe`, h.name);
        if (BUILTINS[h.name.value]) throw this.err(`"${h.name.raw}" é uma função interna do VisuAlg e não pode ser redeclarada`, h.name);
        const sub = this.makeSub(h, null);
        sub.hasBody = true;
        sc.subs.set(h.name.value, sub);
        this.shared.subs.set(sub.qname, sub);
      }
      // pula o corpo
      let depth = 0;
      while (!s.is("eof")) {
        if (s.isKw(end) && depth === 0) break;
        s.next();
      }
      s.expectKw(end, `para fechar "${h.name.raw}"`);
      void depth;
      return;
    }
    // passe 2: corpo
    let sub: A.Sub;
    if (h.className) {
      const cls = this.findType(h.className, h.name);
      if (cls.kind !== "class") throw this.err(`"${h.className}" é um registro, não uma classe; registros não têm métodos`, h.name);
      sub = (h.name.value === "iniciar" ? cls.ctor : cls.methods.find((m) => m.name.toLowerCase() === h.name.value)) ?? (() => { throw this.err(`A classe ${cls.name} não declara ${h.isFunction ? "a função" : "o procedimento"} "${h.name.raw}". Declare o cabeçalho dentro da classe`, h.name); })();
      this.curClass = cls;
    } else {
      sub = this.info.scope.subs.get(h.name.value)!;
      this.curClass = null;
    }
    this.curSub = sub;
    this.locals = new Map();
    for (const p of sub.params) this.locals.set(p.name.toLowerCase(), { name: p.name, slot: p.slot, global: false, t: p.t, ref: p.ref });
    if (sub.isFunction) this.locals.set(h.name.value, { name: sub.name, slot: sub.retSlot, global: false, t: sub.ret, ref: false, isRet: true });
    this.nslots = sub.nslots;
    sub.locals = [];
    if (s.acceptKw("var")) this.varSection(false, "privado");
    s.expectKw("inicio", `para começar o corpo de "${h.name.raw}"`);
    this.loopDepth = 0;
    sub.body = this.block([end], `de "${h.name.raw}"`);
    s.expectKw(end);
    sub.nslots = this.nslots;
    sub.blocking = sub.body.some((x) => x.blocking);
    this.curSub = null;
    this.curClass = null;
    this.locals = null;
    this.nslots = 0;
  }

  /** `teste "nome"` [var ...] inicio ... fimteste: um procedimento sem parâmetros, identificado pelo título. */
  private testBlock() {
    const s = this.s;
    const kw = s.next();
    if (!s.is("string")) throw s.error('Depois de "teste" vem o nome do teste, entre aspas (ex.: teste "soma de dois números")');
    const title = s.next();
    if (this.pass === 1) {
      const nameTok: Token = { ...title, type: "ident", raw: title.value, value: title.value.toLowerCase() };
      const sub = this.makeSub({ kw, name: nameTok, className: null, isFunction: false, params: [], ret: T("vazio"), visibility: "privado" }, null);
      sub.qname = `teste "${title.value}"`;
      sub.isTest = true;
      sub.hasBody = true;
      this.tests.push(sub);
      if (this.isEntry) this.shared.tests.push(sub);
      while (!s.is("eof") && !s.isKw("fimteste")) {
        if (s.isKw("fimalgoritmo") || s.isKw("fimmodulo")) throw this.err(`Faltou "fimteste" para fechar o teste "${title.value}"`, title);
        s.next();
      }
      s.expectKw("fimteste", `para fechar o teste "${title.value}"`);
      return;
    }
    const sub = this.tests[this.testIndex++];
    this.curSub = sub;
    this.curClass = null;
    this.locals = new Map();
    this.nslots = sub.nslots;
    sub.locals = [];
    if (s.acceptKw("var")) this.varSection(false, "privado");
    s.expectKw("inicio", `para começar o corpo do teste "${title.value}"`);
    this.loopDepth = 0;
    sub.body = this.block(["fimteste"], `do teste "${title.value}"`);
    s.expectKw("fimteste");
    sub.nslots = this.nslots;
    sub.blocking = sub.body.some((x) => x.blocking);
    this.curSub = null;
    this.locals = null;
    this.nslots = 0;
  }

  /** Visibilidade efetiva: público, ou qualquer coisa quando este módulo é um arquivo de testes. */
  private visible(v: A.Visibility): boolean {
    return v === "publico" || !!this.info.isTest;
  }

  /** Depois do passe 1: resolve tipos nomeados, liga herança/vtables e confere os corpos dos métodos. */
  private linkTypes() {
    const own = (d: A.RecordDecl | A.ClassDecl) => d.module === this.info;
    for (const r of this.shared.records) if (own(r)) for (const f of r.fields) {
      f.t = this.resolveType(f.t, f);
      if (f.t.base === "registro" && f.t.decl === r) throw this.err(`O registro ${r.name} não pode conter um campo do próprio tipo (use ref ${r.name} ou uma classe)`, f);
    }
    for (const c of this.shared.classes) {
      if (!own(c)) continue;
      for (const f of c.ownFields) f.t = this.resolveType(f.t, f);
      if (c.parentName) {
        const p = this.findType(c.parentName, c);
        if (p.kind !== "class") throw this.err(`"${c.parentName}" é um registro; só é possível herdar de classes`, c);
        c.parent = p;
      }
      for (const m of [...c.methods, ...(c.ctor ? [c.ctor] : [])]) this.resolveSubTypes(m);
    }
    for (const sub of this.info.scope.subs.values()) this.resolveSubTypes(sub);
    for (const c of this.shared.classes) if (own(c)) this.linkClass(c, []);
    // corpos qualificados
    for (const { header: h } of this.qualified) {
      const cls = this.findType(h.className!, h.name);
      if (cls.kind !== "class") throw this.err(`"${h.className}" é um registro, não uma classe`, h.name);
      if (cls.module !== this.info) throw this.err(`O corpo de ${cls.name}.${h.name.raw} deve ficar no mesmo arquivo da classe (${cls.module.file})`, h.name);
      const m = h.name.value === "iniciar" ? cls.ctor : cls.methods.find((x) => x.name.toLowerCase() === h.name.value);
      if (!m) throw this.err(`A classe ${cls.name} não declara "${h.name.raw}". Declare o cabeçalho dentro da classe: ${h.isFunction ? "funcao" : "procedimento"} ${h.name.raw}(...)`, h.name);
      if (m.hasBody) throw this.err(`O corpo de ${cls.name}.${h.name.raw} já foi escrito`, h.name);
      // confere a assinatura
      const declared = m.params.slice(1);
      const given: { name: string; t: TypeRef; ref: boolean }[] = [];
      for (const g of h.params) for (const n of g.names) given.push({ name: n.raw, t: this.resolveType(g.t, n), ref: g.ref });
      const okRet = same(this.resolveType(h.ret, h.name), m.ret) && h.isFunction === m.isFunction;
      const okParams = given.length === declared.length && given.every((g, i) => same(g.t, declared[i].t) && g.ref === declared[i].ref && g.name.toLowerCase() === declared[i].name.toLowerCase());
      if (!okRet || !okParams) throw this.err(`O cabeçalho de ${cls.name}.${h.name.raw} aqui não confere com o declarado na classe (parâmetros e retorno devem ser iguais)`, h.name);
      m.hasBody = true;
    }
    for (const c of this.shared.classes) {
      if (!own(c)) continue;
      for (const m of [...c.methods, ...(c.ctor ? [c.ctor] : [])]) {
        if (!m.hasBody) throw this.err(`O método ${c.name}.${m.name} foi declarado na classe mas não tem corpo. Escreva: ${m.isFunction ? "funcao" : "procedimento"} ${c.name}.${m.name}(...) ... ${m.isFunction ? "fimfuncao" : "fimprocedimento"}`, m);
      }
    }
  }

  private resolveSubTypes(sub: A.Sub) {
    sub.ret = this.resolveType(sub.ret, sub);
    for (const p of sub.params) p.t = this.resolveType(p.t, sub);
  }

  private linkClass(c: A.ClassDecl, chain: A.ClassDecl[]) {
    if (c.linked) return;
    if (chain.includes(c)) throw this.err(`A classe ${c.name} herda de si mesma (direta ou indiretamente): ${[...chain, c].map((x) => x.name).join(" → ")}`, c);
    if (c.parent) {
      if (!c.parent.linked && c.parent.module === this.info) this.linkClass(c.parent, [...chain, c]);
      if (!c.parent.linked) throw this.err(`A classe ${c.parent.name} ainda não está pronta`, c);
      c.ancestors = new Set([c.parent, ...c.parent.ancestors]);
      c.allFields = [...c.parent.allFields];
      c.vtable = [...c.parent.vtable];
      c.methodIndex = new Map(c.parent.methodIndex);
    }
    for (const f of c.ownFields) {
      if (c.allFields.some((x) => x.name.toLowerCase() === f.name.toLowerCase())) throw this.err(`O campo "${f.name}" já existe na classe ${c.parent!.name}, da qual ${c.name} herda`, f);
      f.index = c.allFields.length;
      c.allFields.push(f);
    }
    c.fieldIndex = new Map(c.allFields.map((f) => [f.name.toLowerCase(), f.index]));
    c.fieldNames = c.allFields.map((f) => f.name);
    for (const m of c.methods) {
      const key = m.name.toLowerCase();
      if (c.fieldIndex.has(key)) throw this.err(`"${m.name}" já é um campo; um método não pode ter o mesmo nome`, m);
      const existing = c.methodIndex.get(key);
      if (existing !== undefined) {
        const base = c.vtable[existing];
        const pa = base.params.slice(1), pb = m.params.slice(1);
        const okSig = base.isFunction === m.isFunction && same(base.ret, m.ret) && pa.length === pb.length && pa.every((p, i) => same(p.t, pb[i].t) && p.ref === pb[i].ref);
        if (!okSig) throw this.err(`O método ${m.name} em ${c.name} sobrescreve ${base.cls!.name}.${m.name} com uma assinatura diferente (os parâmetros e o retorno devem ser iguais)`, m);
        m.vslot = existing;
        c.vtable[existing] = m;
      } else {
        m.vslot = c.vtable.length;
        c.methodIndex.set(key, m.vslot);
        c.vtable.push(m);
      }
    }
    if (!c.ctor) {
      // construtor sintetizado: sem parâmetros, só chama o da classe mãe (que não pode exigir argumentos)
      const pc = c.parent?.ctor;
      if (pc && pc.params.length > 1) throw this.err(`A classe ${c.name} precisa declarar "procedimento iniciar(...)" e chamar super.iniciar(...) com os parâmetros do construtor de ${c.parent!.name}`, c);
      c.ctor = {
        name: "iniciar", qname: `${c.name}.iniciar`, isFunction: false, ret: T("vazio"),
        params: [{ name: "este", t: { base: "classe", dims: 0, name: c.name, decl: c }, ref: false, slot: 0, ranges: [] }],
        locals: [], body: [], nslots: 1, blocking: false, visibility: "publico", module: this.info, cls: c, isCtor: true, vslot: -1, hasBody: true,
        line: c.line, col: c.col, file: c.file, retSlot: -1,
      };
      this.shared.allSubs.push(c.ctor);
      this.shared.calls.set(c.ctor, new Set());
    }
    c.linked = true;
  }

  // ======================= declarações =======================
  private varSection(global: boolean, sectionVis: A.Visibility) {
    const s = this.s;
    for (;;) {
      const vis = global ? this.lineStart(sectionVis) : (s.is("ident") ? "privado" : null);
      if (vis === null) break;
      const names: Token[] = [];
      do {
        names.push(s.expectIdent("o nome da variável"));
      } while (s.acceptOp(","));
      if (!s.isOp(":")) {
        if (s.isOp("<-")) throw s.error('Comandos de atribuição devem ficar depois de "inicio". Na seção "var" apenas declare: nome: tipo');
        throw s.error(`Esperava ":" depois do nome da variável para indicar o tipo (ex.: ${names[0].raw}: inteiro), mas encontrei ${s.describe()}`);
      }
      s.next();
      const spec = this.typeSpec();
      const t = this.resolveType(spec.t, names[0]);
      for (const n of names) this.declareVar(n, t, spec.ranges, global, vis);
      s.acceptOp(";");
    }
    if (s.is("keyword") && ["inteiro", "real", "caractere", "logico"].includes(s.cur.value))
      throw s.error(`Na seção "var" o nome vem antes do tipo: nome: ${s.cur.raw}`);
  }

  private constSection(sectionVis: A.Visibility) {
    const s = this.s;
    for (;;) {
      const vis = this.lineStart(sectionVis);
      if (vis === null) break;
      const n = s.expectIdent("o nome da constante");
      s.expectOp("=", "depois do nome da constante");
      const e = this.expr();
      if (e.k !== "lit") throw this.err("O valor de uma constante deve ser um literal", e);
      const decl = this.declareVar(n, e.t, [], true, vis, true);
      this.shared.constInits.push({ slot: decl.slot, value: e });
      s.acceptOp(";");
    }
  }

  private declareVar(n: Token, t: TypeRef, ranges: A.Range[], global: boolean, vis: A.Visibility, isConst = false): A.VarDecl {
    const sc = this.info.scope;
    if (global) {
      if (sc.globals.has(n.value)) throw this.err(`A variável "${n.raw}" já foi declarada`, n);
    } else if (this.locals!.has(n.value)) throw this.err(`A variável "${n.raw}" já foi declarada`, n);
    if (sc.subs.has(n.value)) throw this.err(`"${n.raw}" já é o nome de uma função ou procedimento`, n);
    if (sc.types.has(n.value)) throw this.err(`"${n.raw}" é o nome de um registro ou classe e não pode ser usado como variável`, n);
    if (BUILTINS[n.value]) throw this.err(`"${n.raw}" é uma função interna do VisuAlg e não pode ser usada como nome de variável`, n);
    if (t.base === "vazio") throw this.err(`A variável "${n.raw}" não pode ser do tipo vazio`, n);
    const slot = global ? this.shared.nglobals++ : this.nslots++;
    if (global) sc.globals.set(n.value, { name: n.raw, slot, t, isConst, visibility: vis, module: this.info });
    else this.locals!.set(n.value, { name: n.value, slot, global: false, t, ref: false, isConst });
    const d: A.VarDecl = { name: n.raw, t, ranges, slot, global, visibility: vis, module: this.info, line: n.line, col: n.col, file: this.s.fileIndex };
    if (global) this.shared.globals.push(d);
    else this.curSub!.locals.push(d);
    return d;
  }

  // ======================= comandos =======================
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
          if (this.loopDepth === 0) throw this.err('"interrompa" só pode ser usado dentro de um laço (enquanto, para, repita)', t);
          return { k: "break", ...this.pos(t) };
        case "retorne": {
          s.next();
          if (!this.curSub || !this.curSub.isFunction) throw this.err('"retorne" só pode ser usado dentro de uma função', t);
          const value = this.expr();
          if (!assignable(this.curSub.ret, value.t))
            throw this.err(`A função "${this.curSub.name}" deve retornar ${typeName(this.curSub.ret)}, mas está retornando ${typeName(value.t)}`, value);
          return { k: "return", ...this.pos(t), value, copy: needsCopy(this.curSub.ret, value), blocking: value.blocking };
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
        case "este": case "super": return this.callOrAssign();
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
    if (t.type === "ident" || (t.type === "op" && t.value === "*")) return this.callOrAssign();
    if (t.type === "op" && t.value === ";") { s.next(); return { k: "nop", ...this.pos(t) }; }
    throw s.error(`Não esperava ${s.describe()} aqui`);
  }

  /** Comando que começa com um nome: chamada de procedimento/método ou atribuição. */
  private callOrAssign(): A.Stmt {
    const s = this.s;
    const t = s.cur;
    if (t.type === "ident") {
      if (s.peek().type === "op" && s.peek().value === ":")
        throw s.error(`Declarações de variáveis devem ficar na seção "var", antes de "inicio" (ex.: var ${t.raw}: inteiro)`);
      // procedimento/função do módulo ou importado (sem ser variável local)
      if (!this.locals?.has(t.value) && !this.fieldOfThis(t.value)) {
        const sub = this.lookupSub(t.value, t);
        if (sub) {
          s.next();
          const call = this.finishCall(t, sub, null);
          return { k: "callstmt", ...this.pos(t), call, blocking: call.blocking };
        }
        // procedimento nativo usado como comando (afirme(...), entrada(...), executar_algoritmo())
        const bi = BUILTINS[t.value];
        if (bi && bi.ret !== "arg0" && bi.ret.base === "vazio" && !this.info.scope.globals.has(t.value)) {
          s.next();
          const call = this.finishCall(t, null, bi);
          return { k: "callstmt", ...this.pos(t), call, blocking: call.blocking };
        }
        // alias de módulo: geo.proc(...)
        const alias = this.info.scope.modAlias.get(t.value);
        if (alias && s.peek().type === "op" && s.peek().value === "." && !this.info.scope.globals.has(t.value)) {
          s.next(); s.next();
          const m = s.expectIdent("o nome da função, procedimento ou variável do módulo");
          const sub2 = alias.scope.subs.get(m.value);
          if (sub2) {
            this.checkExported(sub2.visibility, m.raw, alias, m, "A função");
            const call = this.finishCall(m, sub2, null);
            return { k: "callstmt", ...this.pos(t), call, blocking: call.blocking };
          }
          const g = this.moduleGlobal(alias, m);
          const target = this.postfixChain(g);
          return this.assignTo(target, t);
        }
      }
    }
    const e = this.postfixChain(this.primaryForStmt());
    if (e.k === "mcall") return { k: "callstmt", ...this.pos(t), call: e, blocking: e.blocking };
    if (e.k === "call") return { k: "callstmt", ...this.pos(t), call: e, blocking: e.blocking };
    if (!A.isLValue(e)) {
      if (s.isOp("(")) throw this.err(`"${t.raw}" não é uma função ou procedimento conhecido`, t);
      throw s.error(`Esperava "<-" para atribuir um valor, mas encontrei ${s.describe()}`);
    }
    return this.assignTo(e, t);
  }

  /** Início de um comando: *ref, este, super(...), super.m(...), variável. */
  private primaryForStmt(): A.Expr {
    const s = this.s;
    const t = s.cur;
    if (t.type === "op" && t.value === "*") {
      s.next();
      const inner = this.postfixChain(this.primaryForStmt());
      return this.derefOf(inner, t);
    }
    if (t.type === "keyword" && (t.value === "este" || t.value === "super")) return this.primary();
    const id = s.expectIdent("o nome de uma variável");
    return this.varRef(id);
  }

  private assignTo(target: A.Expr, t: Token): A.Stmt {
    const s = this.s;
    if (!A.isLValue(target)) throw s.error("Só é possível atribuir valores a variáveis, posições de vetores, campos ou referências (*r)", t);
    if (s.isOp("=")) throw s.error('Para atribuir um valor use "<-" (seta). O "=" serve para comparar', s.cur);
    if (!s.isOp("<-") && !s.isOp(":=")) {
      if (s.isOp("(")) throw this.err(`"${t.raw}" não é uma função ou procedimento conhecido`, t);
      throw s.error(`Esperava "<-" para atribuir um valor a "${t.raw}", mas encontrei ${s.describe()}`);
    }
    s.next();
    if (target.k === "var") {
      const sym = this.locals?.get(target.name.toLowerCase()) ?? null;
      const g = this.info.scope.globals.get(target.name.toLowerCase());
      if ((sym && sym.isConst) || (!sym && g && g.isConst)) throw this.err(`"${target.name}" é uma constante e não pode receber um novo valor`, t);
    }
    const value = this.expr();
    if (!assignable(target.t, value.t)) {
      if (target.t.base === "inteiro" && value.t.base === "real")
        throw this.err(`Não é possível guardar um valor real em "${t.raw}", que é inteiro. Use "div" para divisão inteira ou int(...) para truncar`, value);
      if (value.t.base === "nulo") throw this.err(`"nulo" só pode ser guardado em variáveis de classe ou ref, e "${this.describe(target)}" é ${typeName(target.t)}`, value);
      if (target.t.base === "classe" && value.t.base === "classe" && target.t.decl && value.t.decl && (target.t.decl as A.ClassDecl).ancestors.has(value.t.decl as A.ClassDecl))
        throw this.err(`Não é possível guardar um(a) ${typeName(value.t)} em "${this.describe(target)}", que é ${typeName(target.t)}: nem todo(a) ${typeName(value.t)} é um(a) ${typeName(target.t)}`, value);
      throw this.err(`Não é possível guardar um valor do tipo ${typeName(value.t)} em "${this.describe(target)}", que é do tipo ${typeName(target.t)}`, value);
    }
    s.acceptOp(";");
    return { k: "assign", ...this.pos(t), target, value, copy: needsCopy(target.t, value), blocking: target.blocking || value.blocking };
  }

  private describe(e: A.Expr): string {
    switch (e.k) {
      case "var": return e.name;
      case "index": return this.describe(e.target) + "[...]";
      case "member": return this.describe(e.obj) + "." + e.name;
      case "deref": return "*" + this.describe(e.e);
      default: return "expressão";
    }
  }

  private cond(what: string): A.Expr {
    const e = this.expr();
    if (e.t.base !== "logico" && e.t.base !== "?") {
      throw this.err(`A condição ${what} deve ser do tipo lógico (verdadeiro/falso), mas é do tipo ${typeName(e.t)}`, e);
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
          if (e.t.dims > 0) throw this.err("Não é possível escrever um vetor inteiro; escreva uma posição por vez", e);
          if (e.t.base === "ref") throw this.err(`Para escrever o valor apontado por "${this.describe(e)}" use *${this.describe(e)}`, e);
          if (e.t.base === "vazio") throw this.err("Esse procedimento não devolve valor e não pode ser escrito", e);
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
    const targets: A.LValue[] = [];
    do {
      const t = s.cur;
      if (!s.is("ident") && !(t.type === "op" && t.value === "*") && !s.isKw("este")) throw s.error(`"leia" precisa de uma variável para guardar o valor lido, mas encontrei ${s.describe()}`);
      const lv = this.postfixChain(this.primaryForStmt());
      if (!A.isLValue(lv)) throw this.err('"leia" só aceita variáveis, posições de vetor, campos ou *referência', t);
      if (lv.t.dims > 0) throw this.err(`Não é possível ler o vetor "${t.raw}" inteiro; leia uma posição por vez`, t);
      if (isAggregate(lv.t) || lv.t.base === "ref") throw this.err(`"leia" não pode ler ${typeName(lv.t)} de uma vez; leia campo por campo`, t);
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
    if (v.k !== "var") throw this.err('A variável de controle do "para" deve ser uma variável simples', vt);
    if (v.t.base !== "inteiro" && v.t.base !== "?") throw this.err(`A variável de controle do "para" deve ser inteira, mas "${vt.raw}" é ${typeName(v.t)}`, vt);
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
    if (isAggregate(e.t) || e.t.base === "ref") throw this.err('"escolha" só funciona com números, textos e valores lógicos', e);
    const cases: A.Case[] = [];
    while (!s.isKw("fimescolha")) {
      if (s.is("eof")) throw s.error('Faltou "fimescolha"');
      const ck = s.cur;
      if (s.acceptKw("outrocaso")) {
        const body = this.block(["fimescolha", "caso"], 'do "outrocaso"');
        cases.push({ items: null, body, line: ck.line, col: ck.col, file: this.s.fileIndex });
        continue;
      }
      s.expectKw("caso", 'dentro do "escolha"');
      const items: A.CaseItem[] = [];
      do {
        const lo = this.expr();
        let hi: A.Expr | null = null;
        if (s.is("ident") && s.cur.value === "a" && !(s.peek().type === "op" && ["<-", ":=", "["].includes(s.peek().value))) { s.next(); hi = this.expr(); }
        else if (s.acceptKw("ate")) hi = this.expr();
        if (!assignable(e.t, lo.t) && !assignable(lo.t, e.t)) throw this.err(`O valor do "caso" (${typeName(lo.t)}) não é compatível com a expressão do "escolha" (${typeName(e.t)})`, lo);
        items.push({ lo, hi });
      } while (s.acceptOp(","));
      const body = this.block(["fimescolha", "caso", "outrocaso"], 'do "caso"');
      cases.push({ items, body, line: ck.line, col: ck.col, file: this.s.fileIndex });
    }
    s.next();
    return { k: "switch", ...this.pos(t), e, cases, blocking: e.blocking || cases.some((c) => c.body.some((x) => x.blocking)) };
  }

  // ======================= nomes =======================
  private fieldOfThis(key: string): A.Field | null {
    if (!this.curClass) return null;
    const idx = this.curClass.fieldIndex.get(key);
    return idx === undefined ? null : this.curClass.allFields[idx];
  }

  private checkExported(vis: A.Visibility, name: string, mod: A.ModuleInfo, n: Loc, what: string) {
    if (!this.visible(vis)) throw this.err(`${what} "${name}" é privad${what.startsWith("A ") ? "a" : "o"} no módulo ${mod.name}; declare com "publico" para usar em outro arquivo`, n);
  }

  private lookupSub(key: string, n: Loc): A.Sub | null {
    const local = this.info.scope.subs.get(key);
    if (local) return local;
    const hits: { m: A.ModuleInfo; f: A.Sub }[] = [];
    for (const imp of this.info.imports) {
      const f = imp.target.scope.subs.get(key);
      if (f && this.visible(f.visibility)) hits.push({ m: imp.target, f });
    }
    if (hits.length > 1) throw this.err(`"${key}" existe em ${hits.map((h) => h.m.name).join(" e ")}. Use ${hits[0].m.name}.${key} ou ${hits[1].m.name}.${key}`, n);
    return hits[0]?.f ?? null;
  }

  private lookupGlobal(key: string, n: Loc): A.GlobalSym | null {
    const local = this.info.scope.globals.get(key);
    if (local) return local;
    const hits: { m: A.ModuleInfo; g: A.GlobalSym }[] = [];
    for (const imp of this.info.imports) {
      const g = imp.target.scope.globals.get(key);
      if (g && this.visible(g.visibility)) hits.push({ m: imp.target, g });
    }
    if (hits.length > 1) throw this.err(`"${key}" existe em ${hits.map((h) => h.m.name).join(" e ")}. Use ${hits[0].m.name}.${key} ou ${hits[1].m.name}.${key}`, n);
    return hits[0]?.g ?? null;
  }

  private moduleGlobal(mod: A.ModuleInfo, m: Token): A.Var {
    const g = mod.scope.globals.get(m.value);
    if (!g) {
      if (mod.scope.types.has(m.value)) throw this.err(`"${m.raw}" é um tipo do módulo ${mod.name}; para criar um objeto use novo ${mod.name}.${m.raw}(...)`, m);
      throw this.err(`O módulo ${mod.name} não tem "${m.raw}"`, m);
    }
    this.checkExported(g.visibility, m.raw, mod, m, "A variável");
    return { k: "var", ...this.pos(m), name: m.raw, slot: g.slot, global: true, ref: false, t: g.t };
  }

  private canSee(owner: A.RecordDecl | A.ClassDecl, vis: A.Visibility): boolean {
    if (vis === "publico" || owner.kind === "record") return true;
    return !!this.curClass && (this.curClass === owner || this.curClass.ancestors.has(owner as A.ClassDecl));
  }

  private varRef(t: Token): A.Expr {
    const sym = this.locals?.get(t.value);
    if (sym) return { k: "var", ...this.pos(t), name: t.raw, slot: sym.slot, global: false, ref: sym.ref, t: sym.t };
    const f = this.fieldOfThis(t.value);
    if (f) {
      const self: A.Var = { k: "var", ...this.pos(t), name: "este", slot: 0, global: false, ref: false, t: this.curSub!.params[0].t };
      return { k: "member", ...this.pos(t), obj: self, name: f.name, index: f.index, t: f.t };
    }
    const g = this.lookupGlobal(t.value, t);
    if (g) return { k: "var", ...this.pos(t), name: t.raw, slot: g.slot, global: true, ref: false, t: g.t };
    if (this.lookupSub(t.value, t)) throw this.err(`"${t.raw}" é uma função/procedimento, não uma variável`, t);
    if (this.info.scope.modAlias.has(t.value)) throw this.err(`"${t.raw}" é um módulo. Use ${t.raw}.nome`, t);
    for (const imp of this.info.imports) {
      if (imp.target.scope.globals.has(t.value)) throw this.err(`"${t.raw}" é privada no módulo ${imp.target.name}; declare com "publico" para usar em outro arquivo`, t);
    }
    throw this.err(`A variável "${t.raw}" não foi declarada. Declare-a na seção "var" (ex.: ${t.raw}: inteiro)`, t);
  }

  // ======================= expressões =======================
  private indexOf(target: A.Expr): A.Index {
    const s = this.s;
    const open = s.expectOp("[");
    const indices: A.Expr[] = [];
    do {
      indices.push(this.expr());
    } while (s.acceptOp(","));
    s.expectOp("]", "para fechar o índice");
    if (target.t.dims === 0 && target.t.base !== "?") throw this.err(`"${this.describe(target)}" não é um vetor e não pode ser indexado com [ ]`, open);
    if (target.t.base !== "?" && indices.length !== target.t.dims)
      throw this.err(`"${this.describe(target)}" é um ${typeName(target.t)} e precisa de ${target.t.dims} índice(s), mas recebeu ${indices.length}`, open);
    for (const i of indices) if (i.t.base !== "inteiro" && i.t.base !== "?") throw this.err(`O índice de um vetor deve ser inteiro, mas é ${typeName(i.t)}`, i);
    return { k: "index", ...this.pos(open), target, indices, t: withDims(target.t, 0), blocking: target.blocking || indices.some((i) => i.blocking) };
  }

  /** [ ], .campo e .metodo(...) depois de um valor. */
  private postfixChain(e: A.Expr): A.Expr {
    const s = this.s;
    for (;;) {
      if (s.isOp("[")) { e = this.indexOf(e); continue; }
      if (s.isOp(".") && s.peek().type === "ident") {
        s.next();
        const m = s.next();
        if (s.isOp("(")) e = this.methodCall(e, m);
        else e = this.member(e, m);
        continue;
      }
      break;
    }
    return e;
  }

  private member(obj: A.Expr, m: Token): A.Expr {
    const t = obj.t;
    if (t.base === "?") return { k: "member", ...this.pos(m), obj, name: m.raw, index: -1, t: T_UNK };
    if (t.dims > 0) throw this.err(`"${this.describe(obj)}" é um ${typeName(t)}; acesse uma posição com [ ] antes de .${m.raw}`, m);
    if (t.base === "ref") throw this.err(`"${this.describe(obj)}" é uma referência; use (*${this.describe(obj)}).${m.raw}`, m);
    if (!isAggregate(t)) throw this.err(`"${this.describe(obj)}" é ${typeName(t)} e não tem campos`, m);
    const decl = t.decl!;
    const idx = decl.fieldIndex.get(m.value);
    if (idx === undefined) {
      if (decl.kind === "class" && decl.methodIndex.has(m.value)) throw this.err(`"${m.raw}" é um método de ${decl.name}: use .${m.raw}(...)`, m);
      const names = decl.kind === "record" ? decl.fields.map((f) => f.name) : decl.allFields.map((f) => f.name);
      throw this.err(`${decl.kind === "record" ? "O registro" : "A classe"} ${decl.name} não tem o campo "${m.raw}"${names.length ? `. Campos: ${names.join(", ")}` : ""}`, m);
    }
    const f = decl.kind === "record" ? decl.fields[idx] : decl.allFields[idx];
    if (!this.canSee(f.owner, f.visibility)) throw this.err(`O campo "${f.name}" é privado em ${f.owner.name} e só pode ser usado dentro da classe (ou das classes que herdam dela)`, m);
    return { k: "member", ...this.pos(m), obj, name: f.name, index: idx, t: f.t, blocking: obj.blocking };
  }

  private methodCall(obj: A.Expr, m: Token, isSuper = false): A.Expr {
    const t = obj.t;
    if (t.dims > 0) throw this.err(`"${this.describe(obj)}" é um ${typeName(t)}; acesse uma posição com [ ] antes de .${m.raw}(...)`, m);
    if (t.base === "registro") throw this.err(`${t.decl!.name} é um registro e não tem métodos. Use uma classe para ter métodos`, m);
    if (t.base !== "classe") throw this.err(`"${this.describe(obj)}" é ${typeName(t)} e não tem métodos`, m);
    const cls = t.decl as A.ClassDecl;
    const key = m.value;
    let method: A.Sub | undefined;
    let vslot = -1;
    if (isSuper && key === "iniciar") method = cls.ctor ?? undefined;
    else {
      const slot = cls.methodIndex.get(key);
      if (slot !== undefined) { vslot = slot; method = cls.vtable[slot]; }
    }
    if (!method) {
      if (cls.fieldIndex.has(key)) throw this.err(`"${m.raw}" é um campo de ${cls.name}, não um método (sem parênteses)`, m);
      if (key === "iniciar") throw this.err(`O construtor é chamado só na criação do objeto: novo ${cls.name}(...)`, m);
      const names = cls.vtable.map((x) => x.name);
      throw this.err(`A classe ${cls.name} não tem o método "${m.raw}"${names.length ? `. Métodos: ${names.join(", ")}` : ""}`, m);
    }
    if (!this.canSee(method.cls!, method.visibility)) throw this.err(`O método "${m.raw}" é privado em ${method.cls!.name} e só pode ser usado dentro da classe (ou das classes que herdam dela)`, m);
    const args = this.argList(m);
    const copyArgs = this.checkArgs(method.params.slice(1), args, m, `O método "${m.raw}"`);
    if (this.curSub) {
      if (isSuper) this.shared.calls.get(this.curSub)!.add(method);
      else for (const c of this.shared.classes) if (c === cls || c.ancestors.has(cls)) { const mm = c.vtable[vslot]; if (mm) this.shared.calls.get(this.curSub)!.add(mm); }
    }
    const node: A.MethodCall = { k: "mcall", ...this.pos(m), obj, name: method.name, args, copyArgs, method, vslot, isSuper, initsOf: null, t: method.isFunction ? method.ret : T("vazio"), blocking: obj.blocking || args.some((a) => a.blocking) };
    this.shared.callNodes.push(node);
    return node;
  }

  private argList(at: Token): A.Expr[] {
    const s = this.s;
    const args: A.Expr[] = [];
    if (s.acceptOp("(")) {
      if (!s.isOp(")")) {
        do { args.push(this.expr()); } while (s.acceptOp(","));
      }
      s.expectOp(")", `para fechar os argumentos de "${at.raw}"`);
    }
    return args;
  }

  private checkArgs(params: A.Param[], args: A.Expr[], n: Loc, display: string): boolean[] {
    if (args.length !== params.length) throw this.err(`${display} espera ${params.length} parâmetro(s), mas recebeu ${args.length}`, n);
    return params.map((p, i) => {
      const a = args[i];
      if (p.ref) {
        if (!A.isLValue(a)) throw this.err(`O parâmetro "${p.name}" é passado por referência (var) e precisa receber uma variável`, a);
        if (!same(a.t, p.t) && a.t.base !== "?") throw this.err(`O parâmetro por referência "${p.name}" é ${typeName(p.t)}, mas recebeu ${typeName(a.t)}`, a);
        return false;
      }
      if (!assignable(p.t, a.t)) throw this.err(`O parâmetro "${p.name}" de ${display} é ${typeName(p.t)}, mas recebeu ${typeName(a.t)}`, a);
      return needsCopy(p.t, a);
    });
  }

  expr(): A.Expr { return this.binary(0); }

  private static PREC: Record<string, number> = {
    ou: 1, xou: 1, e: 2,
    "=": 3, "<>": 3, "<": 3, ">": 3, "<=": 3, ">=": 3,
    "+": 4, "-": 4, "*": 5, "/": 5, "\\": 5, div: 5, mod: 5, "%": 5, "^": 6,
  };

  private binOp(): string | null {
    const t = this.s.cur;
    if (t.type === "op" && Parser_PREC(t.value) !== undefined) {
      // "*" e "&" no início de uma linha começam um novo comando
      if ((t.value === "*" || t.value === "&") && this.s.pos > 0 && this.s.toks[this.s.pos - 1].line < t.line) return null;
      return t.value;
    }
    if (t.type === "keyword" && ["e", "ou", "xou", "div", "mod"].includes(t.value)) return t.value;
    return null;
  }

  private binary(minPrec: number): A.Expr {
    let left = this.unary();
    for (;;) {
      const op = this.binOp();
      if (!op) break;
      const prec = ModuleParser.PREC[op];
      if (prec < minPrec) break;
      const t = this.s.next();
      const right = this.binary(op === "^" ? prec : prec + 1);
      left = { k: "bin", ...this.pos(t), op, l: left, r: right, t: this.binType(op, left.t, right.t, t), blocking: left.blocking || right.blocking };
    }
    return left;
  }

  private binType(op: string, l: TypeRef, r: TypeRef, n: Loc): TypeRef {
    if (l.base === "?" || r.base === "?") return ["=", "<>", "<", ">", "<=", ">=", "e", "ou", "xou"].includes(op) ? T("logico") : T_UNK;
    if (l.dims > 0 || r.dims > 0) throw this.err(`Não é possível usar o operador "${op}" com um vetor inteiro; acesse uma posição com [ ]`, n);
    if (op === "=" || op === "<>") {
      if (l.base === "registro" && r.base === "registro" && l.decl === r.decl) return T("logico");
      if (l.base === "classe" && r.base === "classe" && (assignable(l, r) || assignable(r, l))) return T("logico");
      if ((l.base === "classe" || l.base === "ref") && r.base === "nulo") return T("logico");
      if ((r.base === "classe" || r.base === "ref") && l.base === "nulo") return T("logico");
      if (l.base === "nulo" && r.base === "nulo") return T("logico");
      if (l.base === "ref" && r.base === "ref") throw this.err(`Não é possível comparar duas referências diretamente; compare os valores apontados com *a ${op} *b`, n);
    }
    if (isAggregate(l) || isAggregate(r) || l.base === "ref" || r.base === "ref" || l.base === "nulo" || r.base === "nulo")
      throw this.err(`Não é possível usar o operador "${op}" entre ${typeName(l)} e ${typeName(r)}${isAggregate(l) || isAggregate(r) ? "; acesse os campos" : ""}`, n);
    switch (op) {
      case "+":
        if (l.base === "caractere" && r.base === "caractere") return T("caractere");
        if (isNum(l) && isNum(r)) return l.base === "real" || r.base === "real" ? T("real") : T("inteiro");
        if (l.base === "caractere" || r.base === "caractere")
          throw this.err(`Não é possível somar ${typeName(l)} com ${typeName(r)}. Para juntar texto e número use numpcarac(numero) ou escreva(texto, numero)`, n);
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
        if (isNum(l) && isNum(r)) throw this.err(`O operador "${op}" só funciona com números inteiros`, n);
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
    throw this.err(`Não é possível usar o operador "${op}" entre ${typeName(l)} e ${typeName(r)}`, n);
  }

  private derefOf(inner: A.Expr, t: Token): A.Deref {
    if (inner.t.base !== "ref" && inner.t.base !== "?") throw this.err(`"*" só pode ser usado em referências (ref), mas "${this.describe(inner)}" é ${typeName(inner.t)}`, t);
    return { k: "deref", ...this.pos(t), e: inner, t: inner.t.elem ?? T_UNK, blocking: inner.blocking };
  }

  private unary(): A.Expr {
    const s = this.s;
    const t = s.cur;
    if (t.type === "op" && (t.value === "-" || t.value === "+")) {
      s.next();
      const e = this.unary();
      if (!isNum(e.t) && e.t.base !== "?") throw this.err(`O sinal "${t.value}" só pode ser usado com números`, t);
      if (t.value === "+") return e;
      return { k: "un", ...this.pos(t), op: "-", e, t: e.t, blocking: e.blocking };
    }
    if (t.type === "op" && t.value === "*") {
      s.next();
      return this.derefOf(this.unary(), t);
    }
    if (t.type === "op" && t.value === "&") {
      s.next();
      const target = this.unary();
      if (!A.isLValue(target)) throw this.err('"&" só pode ser aplicado a variáveis, posições de vetor ou campos', t);
      if (target.k === "var") {
        const g = this.info.scope.globals.get(target.name.toLowerCase());
        if (g?.isConst && !this.locals?.has(target.name.toLowerCase())) throw this.err(`Não é possível criar uma referência para a constante "${target.name}"`, t);
      }
      return { k: "addr", ...this.pos(t), target, t: { base: "ref", dims: 0, elem: target.t }, blocking: target.blocking };
    }
    if (t.type === "keyword" && t.value === "nao") {
      s.next();
      const e = this.unary();
      if (e.t.base !== "logico" && e.t.base !== "?") throw this.err(`O operador "nao" só pode ser usado com valores lógicos, mas recebeu ${typeName(e.t)}`, t);
      return { k: "un", ...this.pos(t), op: "nao", e, t: T("logico"), blocking: e.blocking };
    }
    return this.postfixChain(this.primary());
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
        if (t.value === "nulo") { s.next(); return { k: "lit", ...this.pos(t), value: null, t: T("nulo") }; }
        if (t.value === "este") {
          s.next();
          if (!this.curClass || !this.curSub) throw this.err('"este" só pode ser usado dentro de métodos de uma classe', t);
          return { k: "var", ...this.pos(t), name: "este", slot: 0, global: false, ref: false, t: this.curSub.params[0].t };
        }
        if (t.value === "super") {
          s.next();
          if (!this.curClass || !this.curSub) throw this.err('"super" só pode ser usado dentro de métodos de uma classe', t);
          const parent = this.curClass.parent;
          if (!parent) throw this.err(`A classe ${this.curClass.name} não herda de nenhuma classe; "super" não existe aqui`, t);
          const self: A.Var = { k: "var", ...this.pos(t), name: "este", slot: 0, global: false, ref: false, t: { base: "classe", dims: 0, name: parent.name, decl: parent } };
          if (s.isOp("(")) {
            // super(...) = super.iniciar(...)
            const fake: Token = { ...t, type: "ident", value: "iniciar", raw: "iniciar" };
            if (!this.curSub.isCtor) throw this.err('"super(...)" só pode ser usado dentro do construtor "iniciar"', t);
            return this.methodCall(self, fake, true);
          }
          s.expectOp(".", 'depois de "super" (use super(...) ou super.metodo(...))');
          const m = s.expectIdent("o nome do método da classe mãe");
          if (m.value === "iniciar" && !this.curSub.isCtor) throw this.err('"super.iniciar(...)" só pode ser usado dentro do construtor "iniciar"', m);
          return this.methodCall(self, m, true);
        }
        if (t.value === "novo") {
          s.next();
          const n = s.expectIdent("o nome da classe");
          let name = n.raw;
          if (s.isOp(".") && s.peek().type === "ident") { s.next(); name += "." + s.next().raw; }
          const decl = this.findType(name, n);
          if (decl.kind !== "class") throw this.err(`${decl.name} é um registro; registros não precisam de "novo" (basta declarar a variável)`, n);
          const args = this.argList(n);
          const copyArgs = this.checkArgs(decl.ctor!.params.slice(1), args, n, `O construtor de ${decl.name}`);
          if (this.curSub) this.shared.calls.get(this.curSub)!.add(decl.ctor!);
          const node: A.New = { k: "new", ...this.pos(t), name: decl.name, decl, args, copyArgs, t: { base: "classe", dims: 0, name: decl.name, decl }, blocking: args.some((a) => a.blocking) };
          this.shared.callNodes.push(node);
          return node;
        }
        throw s.error(`Não esperava a palavra reservada "${t.raw}" aqui`);
      case "ident": {
        s.next();
        const local = this.locals?.get(t.value);
        if (local && !(local.isRet && s.isOp("("))) {
          return { k: "var", ...this.pos(t), name: t.raw, slot: local.slot, global: false, ref: local.ref, t: local.t };
        }
        const f = this.fieldOfThis(t.value);
        if (f) {
          const self: A.Var = { k: "var", ...this.pos(t), name: "este", slot: 0, global: false, ref: false, t: this.curSub!.params[0].t };
          return { k: "member", ...this.pos(t), obj: self, name: f.name, index: f.index, t: f.t };
        }
        if (this.curClass && this.curClass.methodIndex.has(t.value)) {
          const self: A.Var = { k: "var", ...this.pos(t), name: "este", slot: 0, global: false, ref: false, t: this.curSub!.params[0].t };
          return this.methodCall(self, t);
        }
        const sub = this.lookupSub(t.value, t);
        if (sub) {
          if (!sub.isFunction) throw this.err(`"${t.raw}" é um procedimento e não devolve valor; não pode ser usado em uma expressão`, t);
          return this.finishCall(t, sub, null);
        }
        const bi = BUILTINS[t.value];
        if (bi && !this.info.scope.globals.has(t.value)) return this.finishCall(t, null, bi);
        const alias = this.info.scope.modAlias.get(t.value);
        if (alias && s.isOp(".") && s.peek().type === "ident" && !this.info.scope.globals.has(t.value)) {
          s.next();
          const m = s.next();
          const sub2 = alias.scope.subs.get(m.value);
          if (sub2) {
            this.checkExported(sub2.visibility, m.raw, alias, m, "A função");
            if (!sub2.isFunction) throw this.err(`"${m.raw}" é um procedimento e não devolve valor`, m);
            return this.finishCall(m, sub2, null);
          }
          return this.moduleGlobal(alias, m);
        }
        const g = this.lookupGlobal(t.value, t);
        if (g) return { k: "var", ...this.pos(t), name: t.raw, slot: g.slot, global: true, ref: false, t: g.t };
        if (s.isOp("(")) {
          for (const imp of this.info.imports) if (imp.target.scope.subs.has(t.value)) throw this.err(`A função "${t.raw}" é privada no módulo ${imp.target.name}; declare com "publico" para usar em outro arquivo`, t);
          throw this.err(`A função "${t.raw}" não existe ou ainda não foi declarada`, t);
        }
        for (const imp of this.info.imports) if (imp.target.scope.globals.has(t.value)) throw this.err(`"${t.raw}" é privada no módulo ${imp.target.name}; declare com "publico" para usar em outro arquivo`, t);
        throw this.err(`A variável "${t.raw}" não foi declarada. Declare-a na seção "var" (ex.: ${t.raw}: inteiro)`, t);
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
    const args = this.argList(t);
    let ret: TypeRef;
    let copyArgs: boolean[] = [];
    const blocking = args.some((a) => a.blocking);
    if (sub) {
      copyArgs = this.checkArgs(sub.params, args, t, `"${sub.name}"`);
      ret = sub.ret;
      if (this.curSub) this.shared.calls.get(this.curSub)!.add(sub);
    } else {
      const b = bi!;
      const min = b.params.length - (b.optional ?? 0);
      if (args.length < min || args.length > b.params.length)
        throw this.err(`A função "${b.name}" espera ${min === b.params.length ? `${min}` : `de ${min} a ${b.params.length}`} parâmetro(s), mas recebeu ${args.length}`, t);
      if (!b.anyType) b.params.forEach((p, i) => {
        if (i < args.length && !assignable(p, args[i].t)) throw this.err(`O parâmetro ${i + 1} de "${b.name}" deve ser ${typeName(p)}, mas recebeu ${typeName(args[i].t)}`, args[i]);
      });
      if ((b.name === "saida" || b.name === "entrada" || b.name === "executar_algoritmo") && !this.shared.testMode) throw this.err(`"${b.name}" só pode ser usada em testes (teste "nome" ... fimteste)`, t);
      ret = b.ret === "arg0" ? args[0].t : b.ret;
    }
    // executar_algoritmo roda o corpo principal, que pode ler dados: sempre pelo caminho assíncrono
    const node: A.Call = { k: "call", ...this.pos(t), name: t.raw, fn: sub, builtin: bi, args, copyArgs, t: ret, blocking: blocking || bi?.name === "executar_algoritmo" };
    if (sub) this.shared.callNodes.push(node);
    return node;
  }
}

function Parser_PREC(op: string): number | undefined {
  return (ModuleParser as unknown as { PREC: Record<string, number> }).PREC[op];
}

// ======================= bloqueio =======================
/** Ponto fixo da marca de bloqueio por chamadas (inclui referências futuras e despacho virtual) e remarca os corpos. */
function computeBlocking(shared: Shared, mainBody: A.Stmt[]) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const [f, callees] of shared.calls) {
      if (f.blocking) continue;
      for (const c of callees) if (c.blocking) { f.blocking = true; changed = true; break; }
    }
  }
  for (const f of shared.allSubs) {
    remarkStmts(f.body, shared.classes);
    f.blocking = f.blocking || f.body.some((s) => s.blocking);
  }
  // segunda rodada para quem chama funções remarcadas
  changed = true;
  while (changed) {
    changed = false;
    for (const [f, callees] of shared.calls) {
      if (f.blocking) continue;
      for (const c of callees) if (c.blocking) { f.blocking = true; changed = true; break; }
    }
  }
  for (const f of shared.allSubs) remarkStmts(f.body, shared.classes);
  remarkStmts(mainBody, shared.classes);
}

function remarkStmts(list: A.Stmt[], classes: A.ClassDecl[]): boolean {
  let any = false;
  for (const s of list) if (remarkStmt(s, classes)) any = true;
  return any;
}
function remarkStmt(s: A.Stmt, classes: A.ClassDecl[]): boolean {
  let b = false;
  const E = (e: A.Expr | null | undefined) => { if (e && remarkExpr(e, classes)) b = true; };
  const S = (l: A.Stmt[] | null | undefined) => { if (l && remarkStmts(l, classes)) b = true; };
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
    case "break": case "clear": case "nop": break;
    default: assertNever(s);
  }
  s.blocking = b;
  return b;
}
function remarkExpr(e: A.Expr, classes: A.ClassDecl[]): boolean {
  let b = false;
  const rx = (x: A.Expr) => remarkExpr(x, classes);
  switch (e.k) {
    case "lit": case "var": break;
    case "index": if (rx(e.target)) b = true; for (const i of e.indices) if (rx(i)) b = true; break;
    case "member": b = rx(e.obj); break;
    case "deref": b = rx(e.e); break;
    case "addr": b = rx(e.target); break;
    case "bin": if (rx(e.l)) b = true; if (rx(e.r)) b = true; break;
    case "un": b = rx(e.e); break;
    case "call": for (const a of e.args) if (rx(a)) b = true; if (e.fn?.blocking || e.builtin?.name === "executar_algoritmo") b = true; break;
    case "new": for (const a of e.args) if (rx(a)) b = true; if (e.decl?.ctor?.blocking) b = true; break;
    case "mcall": {
      b = rx(e.obj);
      for (const a of e.args) if (rx(a)) b = true;
      if (e.isSuper) { if (e.method?.blocking) b = true; }
      else if (e.method?.cls) {
        const cls = e.method.cls;
        if (classes.some((k) => (k === cls || k.ancestors.has(cls)) && k.vtable[e.vslot]?.blocking)) b = true;
      }
      break;
    }
    default: assertNever(e);
  }
  e.blocking = b;
  return b;
}
function assertNever(x: never): never {
  throw new Error("nó inesperado: " + JSON.stringify((x as any)?.k));
}
