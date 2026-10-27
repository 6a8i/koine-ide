/**
 * Suporte a testes escritos em Koiné: descoberta, host de captura, afirmações e cobertura.
 * O interpretador chama `hit()` antes de cada comando quando há um coletor ligado.
 */
import { Host, KoineError } from "./types";
import { StructVal, ObjVal, structEquals } from "./runtime";
import { describeValue } from "./debug";
import { Locale, escapeRe, wordAlternatives } from "../i18n";

// ======================= descoberta =======================

export interface TestInfo {
  /** índice dentro do programa compilado */
  id: number;
  name: string;
  file: string;
  line: number;
}

/** true se o arquivo tem pelo menos um bloco `teste "..."`. */
export function hasTests(src: string, locale: Locale = "pt-BR"): boolean {
  return discoverTests(src, locale).length > 0;
}

/** Lista rápida (por texto, sem compilar) dos testes de um arquivo: nome e linha. Aceita a palavra do idioma e a portuguesa. */
export function discoverTests(src: string, locale: Locale = "pt-BR"): { name: string; line: number }[] {
  const out: { name: string; line: number }[] = [];
  const kw = wordAlternatives(locale, "teste").map(escapeRe).join("|");
  const re = new RegExp(`^[ \\t]*(?:${kw})[ \\t]+"((?:[^"\\\\]|\\\\.)*)"`, "gimu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const line = src.slice(0, m.index).split("\n").length;
    out.push({ name: m[1], line });
  }
  return out;
}

// ======================= host de teste =======================

/** Console de um teste: guarda a saída, fornece as entradas de `entrada(...)` e não espera nada. */
export class TestHost implements Host {
  out = "";
  private inputs: string[] = [];
  write(text: string) {
    if (this.out.length < 200_000) this.out += text;
  }
  async readLine(): Promise<string> {
    if (this.inputs.length === 0) {
      throw new KoineError('O programa pediu uma entrada ("leia"), mas o teste não forneceu nenhuma. Use entrada("valor") antes de chamar o código testado', 0, 0, "execucao");
    }
    return this.inputs.shift()!;
  }
  clear() { this.out = ""; }
  async sleep() { /* testes não esperam */ }
  captured() { return this.out; }
  feed(text: string) {
    const lines = text.split(/\r?\n/);
    if (lines.length && lines[lines.length - 1] === "" && text.endsWith("\n")) lines.pop();
    this.inputs.push(...lines);
  }
}

// ======================= afirmações =======================

export const ASSERT_NAMES = ["afirme", "afirme_igual", "afirme_diferente", "afirme_aproximado", "saida", "entrada"] as const;

/** Igualdade usada por `afirme_igual`: números por valor, textos, lógicos, estruturas campo a campo, objetos por identidade, listas item a item. */
export function valuesEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === "number" && typeof b === "number") return a === b || (Number.isNaN(a) && Number.isNaN(b));
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (a instanceof ObjVal || b instanceof ObjVal) return false;
  if (a instanceof StructVal && b instanceof StructVal) return structEquals(a, b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => valuesEqual(x, b[i]));
  return false;
}

const show = (v: any) => describeValue(v);
const fail = (msg: string, at: { line: number; col: number; file?: number }) => new KoineError(msg, at.line, at.col, "teste", at.file ?? 0);

/** Implementações das afirmações (afirme, afirme_igual, …). */
export const ASSERTS = {
  afirme(args: any[], at: { line: number; col: number; file?: number }) {
    const [cond, msg] = args;
    if (cond !== true) throw fail(msg !== undefined && msg !== "" ? `Afirmação falhou: ${msg}` : "Afirmação falhou: a condição é falsa", at);
  },
  afirme_igual(args: any[], at: { line: number; col: number; file?: number }) {
    const [expected, got, msg] = args;
    if (!valuesEqual(expected, got)) throw fail(`${msg ? msg + ": " : ""}esperava ${show(expected)}, mas obteve ${show(got)}`, at);
  },
  afirme_diferente(args: any[], at: { line: number; col: number; file?: number }) {
    const [a, b, msg] = args;
    if (valuesEqual(a, b)) throw fail(`${msg ? msg + ": " : ""}esperava um valor diferente de ${show(a)}, mas obteve o mesmo`, at);
  },
  afirme_aproximado(args: any[], at: { line: number; col: number; file?: number }) {
    const [expected, got, tol, msg] = args;
    if (typeof expected !== "number" || typeof got !== "number") throw fail("afirme_aproximado compara números", at);
    if (!(Math.abs(expected - got) <= Math.abs(tol))) throw fail(`${msg ? msg + ": " : ""}esperava ${show(expected)} (± ${show(tol)}), mas obteve ${show(got)}`, at);
  },
};

// ======================= cobertura =======================

/** Unidade de cobertura: função/procedimento/método/programa principal, com as linhas de comando do seu corpo. */
export interface CoverageUnit {
  name: string;
  file: string;
  line: number;
  lines: number[];
}

export interface FileCoverage {
  /** linhas com comandos (excluindo testes) */
  executable: number[];
  hit: number[];
}

export interface FunctionCoverage {
  name: string;
  file: string;
  line: number;
  total: number;
  hit: number;
}

export interface CoverageReport {
  files: Record<string, FileCoverage>;
  functions: FunctionCoverage[];
}

/** Coleta as linhas executadas, por nome de arquivo (vale para vários programas compilados dos mesmos arquivos). */
export class CoverageCollector {
  private byFile = new Map<string, Set<number>>();
  private files: string[] = [];
  private current: Set<number>[] = [];
  private units: CoverageUnit[] = [];
  private unitKeys = new Set<string>();

  /** Prepara o coletor para um programa: `files` traduz o índice de arquivo dos nós. */
  bind(files: string[], units: CoverageUnit[]) {
    this.files = files;
    this.current = files.map((f) => {
      let set = this.byFile.get(f);
      if (!set) this.byFile.set(f, (set = new Set()));
      return set;
    });
    for (const u of units) {
      const key = `${u.file}\u0000${u.name}\u0000${u.line}`;
      if (this.unitKeys.has(key)) continue;
      this.unitKeys.add(key);
      this.units.push(u);
    }
  }

  hit(file: number, line: number) {
    const set = this.current[file];
    if (set) set.add(line);
  }

  report(): CoverageReport {
    const files: Record<string, FileCoverage> = {};
    const execByFile = new Map<string, Set<number>>();
    for (const u of this.units) {
      let s = execByFile.get(u.file);
      if (!s) execByFile.set(u.file, (s = new Set()));
      for (const l of u.lines) s.add(l);
    }
    for (const [file, exec] of execByFile) {
      const hits = this.byFile.get(file) ?? new Set<number>();
      const executable = [...exec].sort((a, b) => a - b);
      files[file] = { executable, hit: executable.filter((l) => hits.has(l)) };
    }
    const functions: FunctionCoverage[] = this.units.map((u) => {
      const hits = this.byFile.get(u.file) ?? new Set<number>();
      return { name: u.name, file: u.file, line: u.line, total: u.lines.length, hit: u.lines.filter((l) => hits.has(l)).length };
    });
    return { files, functions };
  }
}

const SKIP_KINDS = new Set(["block", "nop"]);
const CHILD_KEYS = ["body", "then", "else", "init", "cases"];

/** Linhas dos comandos de um corpo (recursivo), sem blocos vazios. */
export function statementLines(body: unknown[]): number[] {
  const lines = new Set<number>();
  const visit = (s: any) => {
    if (!s || typeof s !== "object") return;
    if (Array.isArray(s)) { for (const x of s) visit(x); return; }
    if (typeof s.k === "string" && typeof s.line === "number" && !SKIP_KINDS.has(s.k)) lines.add(s.line);
    for (const key of CHILD_KEYS) {
      const v = s[key];
      if (v && typeof v === "object") visit(v);
    }
  };
  visit(body);
  return [...lines].sort((a, b) => a - b);
}

/** Resultado de um teste, como o worker envia para a interface. */
export interface TestResult {
  file: string;
  name: string;
  line: number;
  status: "passou" | "falhou" | "erro";
  message?: string;
  /** onde a afirmação falhou / o erro aconteceu */
  errFile?: string;
  errLine?: number;
  errCol?: number;
  ms: number;
  output: string;
}
