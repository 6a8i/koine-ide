/**
 * Painel "Testes": lista os testes do projeto (por arquivo), executa todos, um arquivo ou um teste,
 * mostra o resultado de cada um e a cobertura (por arquivo e por função).
 */
import { CoverageReport, TestResult } from "../lang/shared/testing";
import { t, tn } from "../i18n";

export type TestStatus = "pendente" | "rodando" | "passou" | "falhou" | "erro";

export interface TestEntry {
  name: string;
  line: number;
  status: TestStatus;
  message?: string;
  errFile?: string;
  errLine?: number;
  errCol?: number;
  ms?: number;
  output?: string;
}

export interface TestFileEntry {
  /** caminho relativo (como o worker recebe) */
  file: string;
  label: string;
  tests: TestEntry[];
  /** o arquivo não compilou */
  error?: { message: string; line: number; col: number; errFile: string };
}

export interface TestsSummary {
  total: number;
  passed: number;
  ms: number;
}

export interface TestsState {
  files: TestFileEntry[];
  running: boolean;
  summary: TestsSummary | null;
  coverage: CoverageReport | null;
  /** arquivos do projeto que não têm testes (para a cobertura listar) */
  otherFiles: string[];
}

const ICON: Record<TestStatus, string> = { pendente: "○", rodando: "◌", passou: "✓", falhou: "✗", erro: "!" };

export class TestsPanel {
  private body: HTMLElement;
  private stateEl: HTMLElement;
  onRunAll: (() => void) | null = null;
  onRunFile: ((file: string) => void) | null = null;
  onRunTest: ((file: string, name: string) => void) | null = null;
  onGoTo: ((file: string, line: number, col: number) => void) | null = null;
  /** memória: cobertura aberta/fechada por arquivo */
  private openCov = new Set<string>();

  constructor(root: HTMLElement) {
    this.body = root.querySelector(".tests-body")!;
    this.stateEl = root.querySelector("#tests-state")!;
    root.querySelector("#btn-tests-run-all")!.addEventListener("click", () => this.onRunAll?.());
  }

  render(st: TestsState) {
    this.body.innerHTML = "";
    this.renderState(st);
    if (!st.files.length) {
      this.empty(
        st.running
          ? t("Procurando testes…")
          : t('Nenhum teste encontrado. Escreva blocos teste "nome" { ... } no próprio programa ou em um arquivo separado que o importe, e use afirme, afirme_igual, saida() e entrada().'),
      );
    }
    for (const f of st.files) this.body.appendChild(this.fileSection(f, st.running));
    if (st.coverage) this.body.appendChild(this.coverageSection(st));
  }

  private renderState(st: TestsState) {
    const el = this.stateEl;
    if (st.running) { el.className = "tests-state running"; el.textContent = t("executando…"); return; }
    if (!st.summary) { el.className = "tests-state"; el.textContent = ""; return; }
    const failed = st.summary.total - st.summary.passed;
    el.className = "tests-state " + (failed ? "fail" : "ok");
    el.textContent = st.summary.total === 0 ? t("nenhum teste executado") : failed ? t("{passed} de {total} passaram", { passed: st.summary.passed, total: st.summary.total }) : tn(st.summary.total, "1 passou", "{n} passaram");
  }

  private empty(msg: string) {
    const e = document.createElement("div");
    e.className = "vars-empty";
    e.textContent = msg;
    this.body.appendChild(e);
  }

  private fileSection(f: TestFileEntry, running: boolean): HTMLElement {
    const sec = document.createElement("div");
    sec.className = "tests-file";
    const head = document.createElement("div");
    head.className = "tests-file-head";
    const name = document.createElement("a");
    name.href = "#"; name.className = "tests-file-name"; name.textContent = f.label; name.title = f.file;
    name.addEventListener("click", (e) => { e.preventDefault(); this.onGoTo?.(f.file, f.tests[0]?.line ?? 1, 1); });
    const counts = document.createElement("span");
    counts.className = "tests-counts";
    const passed = f.tests.filter((t) => t.status === "passou").length;
    const bad = f.tests.filter((t) => t.status === "falhou" || t.status === "erro").length;
    counts.textContent = f.error ? t("não compilou") : bad ? `${passed} ✓ ${bad} ✗` : passed ? `${passed} ✓` : tn(f.tests.length, "{n} teste", "{n} testes");
    if (f.error || bad) counts.classList.add("fail"); else if (passed) counts.classList.add("ok");
    const run = this.runButton(t("Executar os testes deste arquivo"), running, () => this.onRunFile?.(f.file));
    head.append(run, name, counts);
    sec.appendChild(head);
    if (f.error) {
      const err = document.createElement("div");
      err.className = "tests-msg fail";
      const link = document.createElement("a");
      link.href = "#"; link.textContent = (f.error.errFile === f.file ? "" : f.error.errFile + ":") + t("linha {line}", { line: f.error.line });
      const errAt = f.error;
      link.addEventListener("click", (e) => { e.preventDefault(); this.onGoTo?.(errAt.errFile, errAt.line, errAt.col); });
      err.append(document.createTextNode(f.error.message + " "), link);
      sec.appendChild(err);
    }
    for (const te of f.tests) sec.appendChild(this.testRow(f, te, running));
    return sec;
  }

  private testRow(f: TestFileEntry, te: TestEntry, running: boolean): HTMLElement {
    const row = document.createElement("div");
    row.className = "tests-row " + te.status;
    const icon = document.createElement("span");
    icon.className = "tests-icon"; icon.textContent = ICON[te.status];
    const name = document.createElement("a");
    name.href = "#"; name.className = "tests-name"; name.textContent = te.name; name.title = t("linha {line}", { line: te.line });
    name.addEventListener("click", (e) => { e.preventDefault(); this.onGoTo?.(f.file, te.line, 1); });
    const ms = document.createElement("span");
    ms.className = "tests-ms"; ms.textContent = te.ms !== undefined ? fmt(te.ms) : "";
    const run = this.runButton(t("Executar só este teste"), running, () => this.onRunTest?.(f.file, te.name));
    row.append(run, icon, name, ms);
    const wrap = document.createElement("div");
    wrap.appendChild(row);
    if (te.message) {
      const msg = document.createElement("div");
      msg.className = "tests-msg " + (te.status === "erro" ? "err" : "fail");
      msg.appendChild(document.createTextNode(te.message + " "));
      if (te.errLine) {
        const link = document.createElement("a");
        link.href = "#";
        link.textContent = te.errFile && te.errFile !== f.file ? `(${te.errFile}:${te.errLine})` : t("(linha {line})", { line: te.errLine });
        link.addEventListener("click", (e) => { e.preventDefault(); this.onGoTo?.(te.errFile ?? f.file, te.errLine!, te.errCol ?? 1); });
        msg.appendChild(link);
      }
      wrap.appendChild(msg);
    }
    if (te.output && te.status !== "passou") {
      const out = document.createElement("pre");
      out.className = "tests-output";
      out.textContent = te.output.length > 2000 ? te.output.slice(0, 2000) + "…" : te.output;
      out.title = t("Saída escrita durante o teste");
      wrap.appendChild(out);
    }
    return wrap;
  }

  private runButton(title: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "tests-run"; b.title = title; b.textContent = "▶"; b.disabled = disabled;
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  private coverageSection(st: TestsState): HTMLElement {
    const cov = st.coverage!;
    const sec = document.createElement("div");
    sec.className = "tests-cov";
    const h = document.createElement("div");
    h.className = "tests-cov-title";
    const files = Object.keys(cov.files).sort();
    let totalExec = 0, totalHit = 0;
    for (const f of files) { totalExec += cov.files[f].executable.length; totalHit += cov.files[f].hit.length; }
    h.textContent = t("Cobertura {pct}", { pct: pct(totalHit, totalExec) });
    h.title = t("Linhas de comando executadas por algum teste (os próprios testes não contam)");
    sec.appendChild(h);
    if (!files.length) {
      const e = document.createElement("div"); e.className = "vars-none"; e.textContent = t("nenhum código para medir"); sec.appendChild(e);
      return sec;
    }
    for (const file of files) {
      const fc = cov.files[file];
      const row = document.createElement("div");
      row.className = "tests-cov-file" + (this.openCov.has(file) ? " open" : "");
      const head = document.createElement("div");
      head.className = "tests-cov-head";
      const caret = document.createElement("span"); caret.className = "tests-cov-caret"; caret.textContent = this.openCov.has(file) ? "▾" : "▸";
      const name = document.createElement("span"); name.className = "tests-cov-name"; name.textContent = file; name.title = file;
      const bar = this.bar(fc.hit.length, fc.executable.length);
      const p = document.createElement("span"); p.className = "tests-cov-pct " + level(fc.hit.length, fc.executable.length);
      p.textContent = pct(fc.hit.length, fc.executable.length);
      p.title = t("{hit} de {total} linhas", { hit: fc.hit.length, total: fc.executable.length });
      head.append(caret, name, bar, p);
      head.addEventListener("click", () => {
        if (this.openCov.has(file)) this.openCov.delete(file); else this.openCov.add(file);
        row.classList.toggle("open");
        caret.textContent = row.classList.contains("open") ? "▾" : "▸";
      });
      row.appendChild(head);
      const fns = document.createElement("div");
      fns.className = "tests-cov-fns";
      const list = cov.functions.filter((fn) => fn.file === file).sort((a, b) => (a.hit / a.total) - (b.hit / b.total) || a.line - b.line);
      for (const fn of list) {
        const r = document.createElement("a");
        r.href = "#"; r.className = "tests-cov-fn " + level(fn.hit, fn.total);
        r.textContent = fn.name;
        const fp = document.createElement("span"); fp.className = "tests-cov-fn-pct";
        fp.textContent = fn.hit === 0 ? t("sem testes") : pct(fn.hit, fn.total);
        r.appendChild(fp);
        r.title = t("linha {line}: {hit} de {total} linhas executadas", { line: fn.line, hit: fn.hit, total: fn.total });
        r.addEventListener("click", (e) => { e.preventDefault(); this.onGoTo?.(fn.file, fn.line, 1); });
        fns.appendChild(r);
      }
      row.appendChild(fns);
      sec.appendChild(row);
    }
    return sec;
  }

  private bar(hit: number, total: number): HTMLElement {
    const b = document.createElement("span");
    b.className = "tests-bar";
    const fill = document.createElement("span");
    fill.className = "tests-bar-fill " + level(hit, total);
    fill.style.width = total ? `${Math.round((hit / total) * 100)}%` : "0%";
    b.appendChild(fill);
    return b;
  }
}

function pct(hit: number, total: number) {
  return total ? `${Math.round((hit / total) * 100)}%` : "—";
}
function level(hit: number, total: number) {
  if (!total) return "none";
  const r = hit / total;
  return r >= 0.999 ? "full" : r > 0 ? "part" : "zero";
}
function fmt(ms: number) {
  return ms < 1 ? t("<1 ms") : ms < 1000 ? t("{ms} ms", { ms: Math.round(ms) }) : t("{s} s", { s: (ms / 1000).toFixed(2) });
}

/** Aplica um resultado vindo do worker na lista. */
export function applyResult(files: TestFileEntry[], r: TestResult) {
  const f = files.find((x) => x.file === r.file);
  if (!f) return;
  let t = f.tests.find((x) => x.name === r.name);
  if (!t) { t = { name: r.name, line: r.line, status: "pendente" }; f.tests.push(t); }
  t.line = r.line;
  t.status = r.status;
  t.message = r.message;
  t.errFile = r.errFile;
  t.errLine = r.errLine;
  t.errCol = r.errCol;
  t.ms = r.ms;
  t.output = r.output;
}
