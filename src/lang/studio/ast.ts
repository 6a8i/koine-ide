export type Base = "inteiro" | "real" | "cadeia" | "caracter" | "logico" | "vazio" | "?";

export interface TypeRef {
  base: Base;
  dims: number; // 0 = escalar, 1 = vetor, 2 = matriz
}

export const T = (base: Base, dims = 0): TypeRef => ({ base, dims });
export const T_UNK: TypeRef = { base: "?", dims: 0 };

export function typeName(t: TypeRef): string {
  if (t.base === "?") return "desconhecido";
  if (t.dims === 1) return `vetor de ${t.base}`;
  if (t.dims === 2) return `matriz de ${t.base}`;
  return t.base;
}

interface NodeBase {
  line: number;
  col: number;
  /** true se a subárvore pode precisar esperar (leia / aguarde / função bloqueante). */
  blocking: boolean;
}

// ---------- Expressões ----------
export interface Lit extends NodeBase { k: "lit"; value: number | string | boolean; t: TypeRef }
export interface Var extends NodeBase {
  k: "var";
  name: string;
  slot: number;
  global: boolean;
  ref: boolean; // parâmetro por referência
  t: TypeRef;
  isConst: boolean;
}
export interface Index extends NodeBase { k: "index"; target: Expr; indices: Expr[]; t: TypeRef }
export interface Bin extends NodeBase { k: "bin"; op: string; l: Expr; r: Expr; t: TypeRef }
export interface Un extends NodeBase { k: "un"; op: string; e: Expr; t: TypeRef }
export interface Call extends NodeBase {
  k: "call";
  name: string;
  fn: FuncDecl | null; // função do usuário
  builtin: Builtin | null; // função nativa
  args: Expr[];
  t: TypeRef;
}
export interface Assign extends NodeBase { k: "assign"; op: string; target: Var | Index; value: Expr; t: TypeRef }
export interface IncDec extends NodeBase { k: "incdec"; op: "++" | "--"; target: Var | Index; prefix: boolean; t: TypeRef }
export interface ArrayLit extends NodeBase { k: "arr"; items: Expr[]; t: TypeRef }

export type Expr = Lit | Var | Index | Bin | Un | Call | Assign | IncDec | ArrayLit;

// ---------- Comandos ----------
export interface Decl extends NodeBase {
  k: "decl";
  name: string;
  slot: number;
  global: boolean;
  t: TypeRef;
  sizes: (Expr | null)[]; // tamanhos declarados do vetor/matriz
  init: Expr | null;
  isConst: boolean;
}
export interface ExprStmt extends NodeBase { k: "expr"; e: Expr }
export interface If extends NodeBase { k: "if"; cond: Expr; then: Stmt[]; else: Stmt[] | null }
export interface While extends NodeBase { k: "while"; cond: Expr; body: Stmt[] }
export interface DoWhile extends NodeBase { k: "dowhile"; cond: Expr; body: Stmt[] }
export interface For extends NodeBase { k: "for"; init: Stmt | null; cond: Expr | null; step: Expr | null; body: Stmt[] }
export interface Case { values: Expr[] | null; body: Stmt[]; line: number; col: number }
export interface Switch extends NodeBase { k: "switch"; e: Expr; cases: Case[] }
export interface Break extends NodeBase { k: "break" }
export interface Return extends NodeBase { k: "return"; value: Expr | null }
export interface Block extends NodeBase { k: "block"; body: Stmt[]; inline?: boolean }

export type Stmt = Decl | ExprStmt | If | While | DoWhile | For | Switch | Break | Return | Block;

// ---------- Declarações de topo ----------
export interface Param {
  name: string;
  t: TypeRef;
  ref: boolean;
  slot: number;
}
export interface FuncDecl {
  name: string;
  ret: TypeRef;
  params: Param[];
  body: Stmt[];
  nslots: number;
  blocking: boolean;
  line: number;
  col: number;
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
}

export interface ProgramAst {
  globals: Decl[]; // declarações globais em ordem
  nglobals: number;
  functions: Map<string, FuncDecl>;
  main: FuncDecl;
}
