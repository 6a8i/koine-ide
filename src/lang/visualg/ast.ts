export type Base = "inteiro" | "real" | "caractere" | "logico" | "vazio" | "?";

export interface Range { lo: number; hi: number }

export interface TypeRef {
  base: Base;
  /** vazio para escalares; 1 ou 2 faixas para vetores/matrizes (faixas conhecidas na declaração). */
  dims: number;
}
export const T = (base: Base, dims = 0): TypeRef => ({ base, dims });
export const T_UNK: TypeRef = { base: "?", dims: 0 };

export function typeName(t: TypeRef): string {
  if (t.base === "?") return "desconhecido";
  if (t.dims === 1) return `vetor de ${t.base}`;
  if (t.dims === 2) return `matriz de ${t.base}`;
  return t.base;
}

interface NodeBase { line: number; col: number; blocking: boolean }

export interface Lit extends NodeBase { k: "lit"; value: number | string | boolean; t: TypeRef }
export interface Var extends NodeBase { k: "var"; name: string; slot: number; global: boolean; ref: boolean; t: TypeRef }
export interface Index extends NodeBase { k: "index"; target: Expr; indices: Expr[]; t: TypeRef }
export interface Bin extends NodeBase { k: "bin"; op: string; l: Expr; r: Expr; t: TypeRef }
export interface Un extends NodeBase { k: "un"; op: string; e: Expr; t: TypeRef }
export interface Call extends NodeBase {
  k: "call";
  name: string;
  fn: Sub | null;
  builtin: Builtin | null;
  args: Expr[];
  t: TypeRef;
}
export type Expr = Lit | Var | Index | Bin | Un | Call;

export interface WriteArg { e: Expr; width: Expr | null; decimals: Expr | null }

export interface Assign extends NodeBase { k: "assign"; target: Var | Index; value: Expr }
export interface Write extends NodeBase { k: "write"; args: WriteArg[]; newline: boolean }
export interface Read extends NodeBase { k: "read"; targets: (Var | Index)[] }
export interface CallStmt extends NodeBase { k: "callstmt"; call: Call }
export interface If extends NodeBase { k: "if"; cond: Expr; then: Stmt[]; else: Stmt[] | null }
export interface While extends NodeBase { k: "while"; cond: Expr; body: Stmt[] }
export interface Repeat extends NodeBase { k: "repeat"; body: Stmt[]; cond: Expr | null }
export interface For extends NodeBase { k: "for"; v: Var; from: Expr; to: Expr; step: Expr | null; body: Stmt[] }
export interface CaseItem { lo: Expr; hi: Expr | null }
export interface Case { items: CaseItem[] | null; body: Stmt[]; line: number; col: number }
export interface Switch extends NodeBase { k: "switch"; e: Expr; cases: Case[] }
export interface Break extends NodeBase { k: "break" }
export interface Return extends NodeBase { k: "return"; value: Expr | null }
export interface Clear extends NodeBase { k: "clear" }
export interface Pause extends NodeBase { k: "pause"; ms: Expr | null }
export interface Nop extends NodeBase { k: "nop" }

export type Stmt = Assign | Write | Read | CallStmt | If | While | Repeat | For | Switch | Break | Return | Clear | Pause | Nop;

export interface VarDecl {
  name: string;
  t: TypeRef;
  ranges: Range[];
  slot: number;
  global: boolean;
  line: number;
  col: number;
}

export interface Param { name: string; t: TypeRef; ref: boolean; slot: number; ranges: Range[] }

export interface Sub {
  name: string;
  isFunction: boolean;
  ret: TypeRef;
  params: Param[];
  locals: VarDecl[];
  body: Stmt[];
  nslots: number;
  blocking: boolean;
  line: number;
  col: number;
  /** slot reservado para o valor de retorno (atribuição `nome <- valor` dentro da função) */
  retSlot: number;
}

export interface Builtin {
  name: string;
  params: TypeRef[];
  ret: TypeRef | "arg0";
  impl: (args: any[], at: { line: number; col: number }) => any;
}

export interface ProgramAst {
  name: string;
  globals: VarDecl[];
  nglobals: number;
  subs: Map<string, Sub>;
  body: Stmt[];
  nslots: number; // slots do bloco principal (sempre 0, variáveis do principal são globais)
}
