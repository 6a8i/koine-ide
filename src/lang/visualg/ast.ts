export type Base =
  | "inteiro" | "real" | "caractere" | "logico" | "vazio" | "?"
  | "named" // tipo escrito pelo usuário, ainda não resolvido
  | "registro" | "classe"
  | "ref" | "nulo";

export interface Range { lo: number; hi: number }

export interface TypeRef {
  base: Base;
  /** vazio para escalares; 1 ou 2 faixas para vetores/matrizes (faixas conhecidas na declaração). */
  dims: number;
  /** nome escrito (tipos nomeados) */
  name?: string;
  decl?: RecordDecl | ClassDecl;
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
    case "named": case "registro": case "classe": base = t.name ?? t.decl?.name ?? t.base; break;
    default: base = t.base;
  }
  if (t.dims === 1) return `vetor de ${base}`;
  if (t.dims === 2) return `matriz de ${base}`;
  return base;
}

export const isAggregate = (t: TypeRef) => t.dims === 0 && (t.base === "registro" || t.base === "classe");

interface NodeBase { line: number; col: number; file: number; blocking: boolean }

export interface Lit extends NodeBase { k: "lit"; value: number | string | boolean | null; t: TypeRef }
export interface Var extends NodeBase { k: "var"; name: string; slot: number; global: boolean; ref: boolean; t: TypeRef }
export interface Index extends NodeBase { k: "index"; target: Expr; indices: Expr[]; t: TypeRef }
export interface Member extends NodeBase { k: "member"; obj: Expr; name: string; index: number; t: TypeRef }
export interface Deref extends NodeBase { k: "deref"; e: Expr; t: TypeRef }
export interface AddrOf extends NodeBase { k: "addr"; target: LValue; t: TypeRef }
export interface Bin extends NodeBase { k: "bin"; op: string; l: Expr; r: Expr; t: TypeRef }
export interface Un extends NodeBase { k: "un"; op: string; e: Expr; t: TypeRef }
export interface Call extends NodeBase {
  k: "call";
  name: string;
  fn: Sub | null;
  builtin: Builtin | null;
  args: Expr[];
  copyArgs: boolean[];
  t: TypeRef;
}
export interface MethodCall extends NodeBase {
  k: "mcall";
  obj: Expr;
  name: string;
  args: Expr[];
  copyArgs: boolean[];
  method: Sub | null;
  vslot: number;
  isSuper: boolean;
  /** super.iniciar(...) de construtor: classe cujos inicializadores rodam depois (reservado) */
  initsOf: ClassDecl | null;
  t: TypeRef;
}
export interface New extends NodeBase { k: "new"; name: string; decl: ClassDecl | null; args: Expr[]; copyArgs: boolean[]; t: TypeRef }

export type LValue = Var | Index | Member | Deref;
export type Expr = Lit | Var | Index | Member | Deref | AddrOf | Bin | Un | Call | MethodCall | New;
export const isLValue = (e: Expr): e is LValue => e.k === "var" || e.k === "index" || e.k === "member" || e.k === "deref";

export interface WriteArg { e: Expr; width: Expr | null; decimals: Expr | null }

export interface Assign extends NodeBase { k: "assign"; target: LValue; value: Expr; copy: boolean }
export interface Write extends NodeBase { k: "write"; args: WriteArg[]; newline: boolean }
export interface Read extends NodeBase { k: "read"; targets: LValue[] }
export interface CallStmt extends NodeBase { k: "callstmt"; call: Call | MethodCall }
export interface If extends NodeBase { k: "if"; cond: Expr; then: Stmt[]; else: Stmt[] | null }
export interface While extends NodeBase { k: "while"; cond: Expr; body: Stmt[] }
export interface Repeat extends NodeBase { k: "repeat"; body: Stmt[]; cond: Expr | null }
export interface For extends NodeBase { k: "for"; v: Var; from: Expr; to: Expr; step: Expr | null; body: Stmt[] }
export interface CaseItem { lo: Expr; hi: Expr | null }
export interface Case { items: CaseItem[] | null; body: Stmt[]; line: number; col: number; file: number }
export interface Switch extends NodeBase { k: "switch"; e: Expr; cases: Case[] }
export interface Break extends NodeBase { k: "break" }
export interface Return extends NodeBase { k: "return"; value: Expr | null; copy: boolean }
export interface Clear extends NodeBase { k: "clear" }
export interface Pause extends NodeBase { k: "pause"; ms: Expr | null }
export interface Nop extends NodeBase { k: "nop" }

export type Stmt = Assign | Write | Read | CallStmt | If | While | Repeat | For | Switch | Break | Return | Clear | Pause | Nop;

export type Visibility = "publico" | "privado";

export interface VarDecl {
  name: string;
  t: TypeRef;
  ranges: Range[];
  slot: number;
  global: boolean;
  visibility: Visibility;
  module?: ModuleInfo;
  line: number;
  col: number;
  file: number;
}

export interface Param { name: string; t: TypeRef; ref: boolean; slot: number; ranges: Range[] }

export interface Sub {
  name: string;
  qname: string;
  isFunction: boolean;
  ret: TypeRef;
  params: Param[];
  locals: VarDecl[];
  body: Stmt[];
  nslots: number;
  blocking: boolean;
  visibility: Visibility;
  module?: ModuleInfo;
  /** classe dona (método/construtor) */
  cls?: ClassDecl;
  isCtor: boolean;
  vslot: number;
  /** o corpo já foi fornecido (métodos declarados na classe precisam de corpo fora) */
  hasBody: boolean;
  line: number;
  col: number;
  file: number;
  /** slot reservado para o valor de retorno (atribuição `nome <- valor` dentro da função) */
  retSlot: number;
}

export interface Field {
  name: string;
  t: TypeRef;
  ranges: Range[];
  visibility: Visibility;
  index: number;
  owner: RecordDecl | ClassDecl;
  line: number;
  col: number;
  file: number;
}

export interface RecordDecl {
  kind: "record";
  name: string;
  qname: string;
  module: ModuleInfo;
  visibility: Visibility;
  fields: Field[];
  fieldIndex: Map<string, number>; // chave minúscula
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
  allFields: Field[];
  fieldIndex: Map<string, number>;
  fieldNames: string[];
  methods: Sub[];
  ctor: Sub | null;
  vtable: Sub[];
  methodIndex: Map<string, number>;
  ancestors: Set<ClassDecl>;
  linked: boolean;
  line: number;
  col: number;
  file: number;
}

export interface GlobalSym {
  name: string;
  slot: number;
  t: TypeRef;
  isConst: boolean;
  visibility: Visibility;
  module: ModuleInfo;
}

export interface ModuleScope {
  subs: Map<string, Sub>;
  globals: Map<string, GlobalSym>;
  types: Map<string, RecordDecl | ClassDecl>;
  modAlias: Map<string, ModuleInfo>;
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
  params: TypeRef[];
  ret: TypeRef | "arg0";
  impl: (args: any[], at: { line: number; col: number; file?: number }) => any;
}

export interface ProgramAst {
  name: string;
  files: string[];
  modules: ModuleInfo[];
  entry: ModuleInfo;
  globals: VarDecl[];
  nglobals: number;
  /** valores das constantes (aplicados antes de executar) */
  constInits: { slot: number; value: Lit }[];
  subs: Map<string, Sub>;
  records: RecordDecl[];
  classes: ClassDecl[];
  body: Stmt[];
  nslots: number; // slots do bloco principal (sempre 0, variáveis do principal são globais)
}
