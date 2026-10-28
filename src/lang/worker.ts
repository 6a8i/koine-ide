/// <reference lib="webworker" />
import { m as msg, setMessageLocale } from "./i18n/messages";
import { compileProject } from "./index";
import { FromWorker, ToWorker } from "./protocol";
import { Host, KoineError, Program } from "./shared/types";
import { Debugger } from "./shared/debug";
import { CoverageCollector, TestHost, hasTests } from "./shared/testing";
import { booleanWords, type Locale } from "./i18n";
import { setBooleanWords } from "./shared/runtime";

function useLocale(locale: Locale | undefined): Locale {
  setMessageLocale(locale ?? "pt-BR");
  const l = locale ?? "pt-BR";
  const w = booleanWords(l);
  setBooleanWords(w.yes, w.no);
  return l;
}

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
let entryFile = "";
let fileNames: string[] = [];

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

function fileOf(e: KoineError): string {
  return e.file ?? fileNames[e.fileIndex] ?? entryFile;
}

/** Executa os testes de todos os arquivos com blocos `teste` (ou só os selecionados) e mede a cobertura. */
async function runTests(m: Extract<ToWorker, { type: "runTests" }>) {
  const cov = new CoverageCollector();
  const locale = useLocale(m.locale);
  const wanted = (file: string, name?: string) => !m.only || m.only.some((s) => s.file === file && (s.name === undefined || name === undefined || s.name === name));
  const testFiles = m.files.filter((f) => hasTests(f.source, locale) && wanted(f.path));
  const compiledFiles = new Set<string>();
  let total = 0, passed = 0;
  for (const tf of testFiles) {
    let program: Program;
    try {
      program = compileProject(m.files, tf.path, { tests: true, locale });
    } catch (e) {
      const pe = e instanceof KoineError ? e : new KoineError(msg("Erro interno: {erro}", { erro: (e as Error)?.message }), 0, 0, "interno");
      post({ type: "test-file-error", file: tf.path, message: pe.message, line: pe.line, col: pe.col, errFile: pe.file ?? m.files[pe.fileIndex]?.path ?? tf.path });
      continue;
    }
    program.attachCoverage(cov);
    for (const f of program.files) compiledFiles.add(f);
    for (const t of program.tests) {
      if (!wanted(tf.path, t.name)) continue;
      total++;
      post({ type: "test-start", file: tf.path, name: t.name, line: t.line });
      const host = new TestHost();
      const t0 = performance.now();
      try {
        await program.runTest(host, t.id);
        passed++;
        post({ type: "test", result: { file: tf.path, name: t.name, line: t.line, status: "passou", ms: performance.now() - t0, output: host.out } });
      } catch (e) {
        const ms = performance.now() - t0;
        if (e instanceof KoineError) {
          post({ type: "test", result: { file: tf.path, name: t.name, line: t.line, status: e.kind === "teste" ? "falhou" : "erro", message: e.message, errFile: e.file ?? program.files[e.fileIndex] ?? tf.path, errLine: e.line, errCol: e.col, ms, output: host.out } });
        } else if (e instanceof RangeError) {
          post({ type: "test", result: { file: tf.path, name: t.name, line: t.line, status: "erro", message: "Estouro de pilha: recursão sem fim?", ms, output: host.out } });
        } else {
          post({ type: "test", result: { file: tf.path, name: t.name, line: t.line, status: "erro", message: msg("Erro interno do interpretador: {erro}", { erro: (e as Error)?.message }), ms, output: host.out } });
        }
      }
    }
  }
  // arquivos que nenhum teste alcançou entram no relatório com 0% (só para saber o que falta cobrir)
  if (!m.only) {
    for (const f of m.files) {
      if (compiledFiles.has(f.path) || hasTests(f.source, locale)) continue;
      try {
        const p = compileProject(m.files, f.path, { tests: true, locale });
        p.attachCoverage(cov);
        for (const x of p.files) compiledFiles.add(x);
      } catch { /* arquivo com erro: fica fora do relatório */ }
    }
  }
  post({ type: "tests-done", coverage: cov.report(), total, passed });
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.type === "runTests") {
    await runTests(m);
    return;
  }
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
    dbg?.setBreakpoints(m.breakpoints);
    return;
  }
  if (m.type === "run") {
    buf = "";
    lastFlush = Date.now();
    entryFile = m.entry;
    fileNames = m.files.map((f) => f.path);
    try {
      if (!m.files.length) throw new KoineError(msg("Nenhum arquivo para executar"), 0, 0, "interno");
      program = compileProject(m.files, m.entry, { locale: useLocale(m.locale) });
      fileNames = program!.files;
      if (m.debug) {
        dbg = new Debugger(
          {
            paused: (line, col, snapshot, file) => { flush(); post({ type: "paused", file, line, col, snapshot }); },
            snapshot: (snapshot) => post({ type: "snapshot", snapshot }),
          },
          m.debug.breakpoints,
          m.debug.breakpoints.length === 0,
          program!.files,
        );
        program!.attachDebugger(dbg);
      }
      await program!.run(host);
      flush();
      post({ type: "done", snapshot: finalSnapshot() });
    } catch (e) {
      flush();
      const snapshot = finalSnapshot();
      if (e instanceof KoineError) post({ type: "error", message: e.message, line: e.line, col: e.col, kind: e.kind, file: fileOf(e), snapshot });
      else if (e instanceof RangeError) post({ type: "error", message: "Estouro de pilha: recursão sem fim?", line: 0, col: 0, kind: "execucao", file: entryFile, snapshot });
      else post({ type: "error", message: msg("Erro interno do interpretador: {erro}", { erro: (e as Error)?.message }), line: 0, col: 0, kind: "interno", file: entryFile, snapshot });
    }
  }
};
