import { m } from "../i18n/messages";
import { Host, KoineError } from "./types";

export const MAX_CALL_DEPTH = 1200;

/** Palavras usadas para escrever/ler valores lógicos no idioma ativo (o worker define por execução). */
export const BOOL_WORDS = { yes: "verdadeiro", no: "falso" };
export function setBooleanWords(yes: string, no: string) {
  BOOL_WORDS.yes = yes;
  BOOL_WORDS.no = no;
}
export const formatBool = (v: boolean) => (v ? BOOL_WORDS.yes : BOOL_WORDS.no);
/** Interpreta um texto como lógico: aceita o idioma ativo, português e inglês. */
export function parseBool(s: string): boolean | null {
  const k = s.trim().toLowerCase();
  if (k === BOOL_WORDS.yes.toLowerCase() || ["verdadeiro", "v", "true", "1", "sim", "s"].includes(k)) return true;
  if (k === BOOL_WORDS.no.toLowerCase() || ["falso", "f", "false", "0", "nao", "não", "n"].includes(k)) return false;
  return null;
}

// ======================= valores de execução compartilhados =======================

/** Referência a uma posição de memória (parâmetros por & / var e variáveis `ref`). */
export class Ref {
  constructor(public get: () => any, public set: (v: any) => void) {}
}

/** Descrição mínima de um tipo agregado (estrutura/registro ou classe) usada pelo runtime e pelo depurador. */
export interface AggDecl {
  name: string;
  fieldNames: string[];
  /** tipos dos campos (texto, para formatação); opcional */
  fieldTypes?: string[];
}

/** Valor de estrutura/registro: copiado na atribuição. */
export class StructVal {
  constructor(public decl: AggDecl, public f: any[]) {}
}

/** Objeto (instância de classe): compartilhado por referência. `cls` tem a vtable. */
export class ObjVal {
  constructor(public cls: AggDecl & { vtable: any[] }, public f: any[]) {}
}

function copyArrayDeep(a: any[]): any[] {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    out[i] = x instanceof StructVal ? copyStruct(x) : Array.isArray(x) ? copyArrayDeep(x) : x;
  }
  return out;
}

/** Cópia profunda de uma estrutura (vetores internos e estruturas aninhadas também; objetos e refs são compartilhados). */
export function copyStruct(v: StructVal): StructVal {
  const f = v.f.slice();
  for (let i = 0; i < f.length; i++) {
    const x = f[i];
    if (x instanceof StructVal) f[i] = copyStruct(x);
    else if (Array.isArray(x)) f[i] = copyArrayDeep(x);
  }
  return new StructVal(v.decl, f);
}

export function structEquals(a: any, b: any): boolean {
  if (a instanceof StructVal && b instanceof StructVal) {
    if (a.decl !== b.decl || a.f.length !== b.f.length) return false;
    for (let i = 0; i < a.f.length; i++) if (!structEquals(a.f[i], b.f[i])) return false;
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!structEquals(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a.data) && Array.isArray(b.data)) return structEquals(a.data, b.data);
  return a === b;
}

export function stackOverflow(line: number, col: number) {
  return new KoineError(
    m("Estouro de pilha: a função chamou a si mesma vezes demais (recursão sem fim?)"),
    line,
    col,
  );
}

/** Converte um RangeError do JS (pilha estourada) num erro amigável. */
export function wrapJsError(e: unknown, line: number, col: number): unknown {
  // Perto do limite da pilha qualquer chamada pode falhar de novo; por isso só
  // usamos operadores aqui e deixamos a conversão final para o topo (run()).
  if (e instanceof RangeError) return e;
  return e;
}

/** No topo da execução (pilha rasa) converte RangeError em erro amigável. */
export function finalizeError(e: unknown): unknown {
  if (e instanceof RangeError) return stackOverflow(0, 0);
  return e;
}

export function parseIntStrict(s: string): number | null {
  const t = s.trim();
  if (!/^[-+]?\d+$/.test(t)) return null;
  return parseInt(t, 10);
}

export function parseRealStrict(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
  return parseFloat(t);
}

export function formatRealJava(v: number): string {
  // Imita a saída do Java: sempre com casa decimal.
  if (!isFinite(v)) return v > 0 ? "Infinito" : v < 0 ? "-Infinito" : "NaN";
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toFixed(1);
  let s = String(v);
  if (/e/i.test(s)) s = s.replace("e+", "E").replace("e", "E");
  return s;
}

/** Host que acumula saída em memória, útil para testes. */
export class BufferHost implements Host {
  out = "";
  inputs: string[];
  constructor(inputs: string[] = []) {
    this.inputs = [...inputs];
  }
  write(t: string) {
    this.out += t;
  }
  async readLine() {
    if (this.inputs.length === 0) throw new KoineError(m("Teste pediu entrada, mas não há mais linhas"), 0, 0);
    return this.inputs.shift()!;
  }
  clear() {
    this.out = "";
  }
  async sleep(_ms: number) {}
}
