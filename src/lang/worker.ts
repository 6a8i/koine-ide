/// <reference lib="webworker" />
import { compile } from "./index";
import { FromWorker, ToWorker } from "./protocol";
import { Host, PortugolError, Program } from "./shared/types";
import { Debugger } from "./shared/debug";

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m);

let buf = "";
let lastFlush = 0;
function flush() {
  if (buf.length) {
    post({ type: "out", text: buf });
    buf = "";
  }
  lastFlush = Date.now();
}

let pendingInput: ((v: string) => void) | null = null;
let dbg: Debugger | null = null;
let program: Program | null = null;

const host: Host = {
  write(t) {
    buf += t;
    if (buf.length > 1_000_000) flush();
    else if (Date.now() - lastFlush > 25) flush();
  },
  readLine() {
    flush();
    return new Promise<string>((resolve) => {
      pendingInput = resolve;
      post({ type: "input-request" });
    });
  },
  clear() {
    buf = "";
    post({ type: "clear" });
  },
  sleep(ms) {
    flush();
    return new Promise((r) => setTimeout(r, Math.max(0, ms)));
  },
};

function finalSnapshot() {
  try {
    return program?.snapshot() ?? null;
  } catch {
    return null;
  }
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.type === "input") {
    const r = pendingInput;
    pendingInput = null;
    r?.(m.value);
    return;
  }
  if (m.type === "debug") {
    dbg?.command(m.command);
    return;
  }
  if (m.type === "breakpoints") {
    if (dbg) dbg.breakpoints = new Set(m.lines);
    return;
  }
  if (m.type === "run") {
    buf = "";
    lastFlush = Date.now();
    try {
      program = compile(m.lang, m.source);
      if (m.debug) {
        dbg = new Debugger(
          {
            paused: (line, col, snapshot) => { flush(); post({ type: "paused", line, col, snapshot }); },
            snapshot: (snapshot) => post({ type: "snapshot", snapshot }),
          },
          m.debug.breakpoints,
          m.debug.breakpoints.length === 0,
        );
        program.attachDebugger(dbg);
      }
      await program.run(host);
      flush();
      post({ type: "done", snapshot: finalSnapshot() });
    } catch (e) {
      flush();
      const snapshot = finalSnapshot();
      if (e instanceof PortugolError) post({ type: "error", message: e.message, line: e.line, col: e.col, kind: e.kind, snapshot });
      else if (e instanceof RangeError) post({ type: "error", message: "Estouro de pilha: recursão sem fim?", line: 0, col: 0, kind: "execucao", snapshot });
      else post({ type: "error", message: "Erro interno do interpretador: " + (e as Error)?.message, line: 0, col: 0, kind: "interno", snapshot });
    }
  }
};
