import { Lang } from "./shared/types";
import { DebugCommand, Snapshot } from "./shared/debug";

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
  | { type: "run"; lang: Lang; files: SourceFile[]; entry: string; debug?: { breakpoints: FileBreakpoint[] } }
  | { type: "input"; value: string }
  | { type: "debug"; command: DebugCommand }
  | { type: "breakpoints"; breakpoints: FileBreakpoint[] };

export type FromWorker =
  | { type: "out"; text: string }
  | { type: "clear" }
  | { type: "input-request" }
  | { type: "done"; snapshot: Snapshot | null }
  | { type: "error"; message: string; line: number; col: number; kind: string; file: string; snapshot: Snapshot | null }
  | { type: "paused"; file: string; line: number; col: number; snapshot: Snapshot }
  | { type: "snapshot"; snapshot: Snapshot };
