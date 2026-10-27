import { Lang } from "./shared/types";
import { DebugCommand, Snapshot } from "./shared/debug";

export type ToWorker =
  | { type: "run"; lang: Lang; source: string; debug?: { breakpoints: number[] } }
  | { type: "input"; value: string }
  | { type: "debug"; command: DebugCommand }
  | { type: "breakpoints"; lines: number[] };

export type FromWorker =
  | { type: "out"; text: string }
  | { type: "clear" }
  | { type: "input-request" }
  | { type: "done"; snapshot: Snapshot | null }
  | { type: "error"; message: string; line: number; col: number; kind: string; snapshot: Snapshot | null }
  | { type: "paused"; line: number; col: number; snapshot: Snapshot }
  | { type: "snapshot"; snapshot: Snapshot };
