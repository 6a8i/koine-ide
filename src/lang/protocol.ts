
import { DebugCommand, Snapshot } from "./shared/debug";
import { CoverageReport, TestResult } from "./shared/testing";
import { Locale } from "./i18n";

/** Um arquivo-fonte do projeto. `path` é relativo à raiz do projeto, com "/" como separador. */
export interface SourceFile {
  path: string;
  source: string;
}

export interface FileBreakpoint {
  file: string;
  line: number;
}

export type ToWorker =
  | { type: "run"; files: SourceFile[]; entry: string; debug?: { breakpoints: FileBreakpoint[] }; locale?: Locale }
  | { type: "input"; value: string }
  | { type: "debug"; command: DebugCommand }
  | { type: "breakpoints"; breakpoints: FileBreakpoint[] }
  /** executa os testes dos arquivos (todos, ou só os de `only`) e mede a cobertura */
  | { type: "runTests"; files: SourceFile[]; only?: TestSelector[]; locale?: Locale };

/** Identifica um teste: arquivo + nome (ou só o arquivo, para todos os testes dele). */
export interface TestSelector {
  file: string;
  name?: string;
}

export type FromWorker =
  | { type: "out"; text: string }
  | { type: "clear" }
  | { type: "input-request" }
  | { type: "done"; snapshot: Snapshot | null }
  | { type: "error"; message: string; line: number; col: number; kind: string; file: string; snapshot: Snapshot | null }
  | { type: "paused"; file: string; line: number; col: number; snapshot: Snapshot }
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "test-start"; file: string; name: string; line: number }
  | { type: "test"; result: TestResult }
  /** um arquivo de testes não compilou */
  | { type: "test-file-error"; file: string; message: string; line: number; col: number; errFile: string }
  | { type: "tests-done"; coverage: CoverageReport; total: number; passed: number };
