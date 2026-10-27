export type Base =
  | "inteiro" | "real" | "cadeia" | "caracter" | "logico" | "vazio" | "?"
  | "named" // tipo escrito pelo usuário, ainda não resolvido ("Ponto", "Geo.Ponto")
  | "estrutura" | "classe"
  | "ref" | "nulo";

export interface TypeRef {
  base: Base;
  dims: number; // 0 = escalar, 1 = vetor, 2 = matriz
  /** nome escrito (tipos nomeados), para mensagens */
  name?: string;
  /** identidade do tipo (estrutura/classe); comparar por === */
  decl?: StructDecl | ClassDecl;
  /** tipo apontado (ref) */
  elem?: TypeRef;
}

export const T = (base: Base, dims = 0): TypeRef => ({ base, dims });
export const T_UNK: TypeRef = { base: "?", dims: 0 };
export const withDims = (t: TypeRef, dims: number): TypeRef => ({ ...t, dims });

export function typeName(t: TypeRef): string {
  if (t.base === "?") return "desconhecido";
  let base: string;
  switch (t.base) {
    case "ref": base = "ref " + (t.elem ? typeName(t.elem) : "?"); break;
    case "named": case "estrutura": case "classe": base = t.name ?? t.decl?.name ?? t.base; break;
    default: base = t.base;
  }
  if (t.dims === 1) return `vetor de ${base}`;
  if (t.dims === 2) return `matriz de ${base}`;
  return base;
}

export const isAggregate = (t: TypeRef) => t.dims === 0 && (t.base === "estrutura" || t.base === "classe");

interface NodeBase {
  line: number;
  col: number;
  /** índice do arquivo no projeto */
  file: number;
  /** true se a subárvore pode precisar esperar (leia / aguarde / função bloqueante). */
  blocking: boolean;
}

// ---------- Expressões ----------
export interface Lit extends NodeBase { k: "lit"; value: number | string | boolean | null; t: TypeRef }
export interface Var extends NodeBase {
  k: "var";
  name: string;
  slot: number;
  global: boolean;
  ref: boolean; // parâmetro por referência (&)
  t: TypeRef;
  isConst: boolean;
}
export interface Index extends NodeBase { k: "index"; target: Expr; indices: Expr[]; t: TypeRef }
/** acesso a campo: obj.nome (índice resolvido em tempo de compilação) */
export interface Member extends NodeBase { k: "member"; obj: Expr; name: string; index: number; t: TypeRef }
/** *r */
export interface Deref extends NodeBase { k: "deref"; e: Expr; t: TypeRef }
/** &alvo */
export interface AddrOf extends NodeBase { k: "addr"; target: LValue; t: TypeRef }
export interface Bin extends NodeBase { k: "bin"; op: string; l: Expr; r: Expr; t: TypeRef }
export interface Un extends NodeBase { k: "un"; op: string; e: Expr; t: TypeRef }
export interface Call extends NodeBase {
  k: "call";
  name: string;
  fn: FuncDecl | null; // função do usuário
  builtin: Builtin | null; // função nativa
  args: Expr[];
  /** argumentos de estrutura que precisam ser copiados */
  copyArgs: boolean[];
  t: TypeRef;
}
/** obj.metodo(args) — ou super(args) / super.metodo(args) quando isSuper */
export interface MethodCall extends NodeBase {
  k: "mcall";
  obj: Expr;
  name: string;
  args: Expr[];
  copyArgs: boolean[];
  /** método ligado estaticamente (super) ou o da classe declarada (vtable[vslot] em execução) */
  method: MethodDecl | null;
  vslot: number;
  isSuper: boolean;
  /** chamada super(...) de construtor: classe cujos inicializadores de campo rodam depois */
  initsOf: ClassDecl | null;
  t: TypeRef;
}
/** construção: Ponto(1, 2) / Circulo(2.0) */
export interface New extends NodeBase { k: "new"; name: string; decl: StructDecl | ClassDecl | null; args: Expr[]; copyArgs: boolean[]; t: TypeRef }
export interface Assign extends NodeBase { k: "assign"; op: string; target: LValue; value: Expr; copy: boolean; t: TypeRef }
export interface IncDec extends NodeBase { k: "incdec"; op: "++" | "--"; target: LValue; prefix: boolean; t: TypeRef }
export interface ArrayLit extends NodeBase { k: "arr"; items: Expr[]; copyItems: boolean[]; t: TypeRef }

export type LValue = Var | Index | Member | Deref;
export type Expr = Lit | Var | Index | Member | Deref | AddrOf | Bin | Un | Call | MethodCall | New | Assign | IncDec | ArrayLit;

export const isLValue = (e: Expr): e is LValue => e.k === "var" || e.k === "index" || e.k === "member" || e.k === "deref";

// ---------- Comandos ----------
export interface Decl extends NodeBase {
  k: "decl";
  name: string;
  slot: number;
  global: boolean;
  t: TypeRef;
  sizes: (Expr | null)[]; // tamanhos declarados do vetor/matriz
  init: Expr | null;
  copy: boolean;
  isConst: boolean;
  visibility: Visibility;
  module?: ModuleInfo;
}
export interface ExprStmt extends NodeBase { k: "expr"; e: Expr }
export interface If extends NodeBase { k: "if"; cond: Expr; then: Stmt[]; else: Stmt[] | null }
export interface While extends NodeBase { k: "while"; cond: Expr; body: Stmt[] }
export interface DoWhile extends NodeBase { k: "dowhile"; cond: Expr; body: Stmt[] }
export interface For extends NodeBase { k: "for"; init: Stmt | null; cond: Expr | null; step: Expr | null; body: Stmt[] }
export interface Case { values: Expr[] | null; body: Stmt[]; line: number; col: number; file: number }
export interface Switch extends NodeBase { k: "switch"; e: Expr; cases: Case[] }
export interface Break extends NodeBase { k: "break" }
export interface Return extends NodeBase { k: "return"; value: Expr | null; copy: boolean }
export interface Block extends NodeBase { k: "block"; body: Stmt[]; inline?: boolean }

export type Stmt = Decl | ExprStmt | If | While | DoWhile | For | Switch | Break | Return | Block;

// ---------- Declarações de topo ----------
export type Visibility = "publico" | "privado";

export interface Param {
  name: string;
  t: TypeRef;
  ref: boolean;
  slot: number;
}
export interface FuncDecl {
  name: string;
  /** nome qualificado para mensagens/depurador (Modulo.funcao, Classe.metodo) */
  qname: string;
  ret: TypeRef;
  params: Param[];
  body: Stmt[];
  nslots: number;
  blocking: boolean;
  visibility: Visibility;
  module?: ModuleInfo;
  /** classe dona, quando é método/construtor */
  cls?: ClassDecl;
  line: number;
  col: number;
  file: number;
}

export interface MethodDecl extends FuncDecl {
  cls: ClassDecl;
  vslot: number;
  isCtor: boolean;
}

export interface Field {
  name: string;
  t: TypeRef;
  /** tamanhos fixos (literais) de campos vetor/matriz */
  dims: number[];
  init: Expr | null;
  visibility: Visibility;
  /** posição no vetor de campos (em classes, inclui os herdados) */
  index: number;
  owner: StructDecl | ClassDecl;
  line: number;
  col: number;
  file: number;
}

export interface StructDecl {
  kind: "struct";
  name: string;
  qname: string;
  module: ModuleInfo;
  visibility: Visibility;
  fields: Field[];
  fieldIndex: Map<string, number>;
  /** para o runtime/depurador (AggDecl) */
  fieldNames: string[];
  line: number;
  col: number;
  file: number;
}

export interface ClassDecl {
  kind: "class";
  name: string;
  qname: string;
  module: ModuleInfo;
  visibility: Visibility;
  parentName: string | null;
  parent: ClassDecl | null;
  ownFields: Field[];
  /** campos do pai primeiro */
  allFields: Field[];
  fieldIndex: Map<string, number>;
  fieldNames: string[];
  methods: MethodDecl[];
  ctor: MethodDecl | null;
  vtable: MethodDecl[];
  methodIndex: Map<string, number>;
  ancestors: Set<ClassDecl>;
  linked: boolean;
  line: number;
  col: number;
  file: number;
}

export interface ModuleScope {
  fns: Map<string, FuncDecl>;
  globals: Map<string, GlobalSym>;
  types: Map<string, StructDecl | ClassDecl>;
  libAlias: Map<string, string>;
  modAlias: Map<string, ModuleInfo>;
}

export interface GlobalSym {
  name: string;
  slot: number;
  t: TypeRef;
  isConst: boolean;
  visibility: Visibility;
  module: ModuleInfo;
}

export interface ModuleInfo {
  index: number;
  file: string;
  name: string;
  imports: { target: ModuleInfo; alias: string }[];
  scope: ModuleScope;
}

export interface Builtin {
  name: string;
  /** tipos dos parâmetros; "*" aceita qualquer; `variadic` aceita qualquer quantidade. */
  params: (TypeRef | "*")[];
  variadic?: boolean;
  ret: TypeRef | "arg0"; // "arg0": mesmo tipo do primeiro argumento (ex.: maior_numero)
  blocking?: boolean;
  /** Implementação. Recebe valores já avaliados. Para bloqueantes, pode retornar Promise. */
  impl?: (args: any[], ctx: BuiltinCtx) => any;
}

export interface BuiltinCtx {
  line: number;
  col: number;
  file?: number;
}

export interface ProgramAst {
  files: string[];
  modules: ModuleInfo[];
  globals: Decl[]; // declarações globais em ordem (todos os módulos, importados primeiro)
  nglobals: number;
  functions: Map<string, FuncDecl>; // chave = qname
  structs: StructDecl[];
  classes: ClassDecl[];
  main: FuncDecl;
  /** módulo de entrada */
  entry: ModuleInfo;
}
