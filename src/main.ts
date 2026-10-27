import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { Editor } from "./ui/editor";
import { ConsolePanel } from "./ui/console";
import { VariablesPanel } from "./ui/variables";
import { ReferencePanel } from "./ui/reference";
import { TabsBar } from "./ui/tabs";
import { FileTree } from "./ui/filetree";
import { showMenu, MenuItem } from "./ui/menu";
import { promptDialog, validateFileName } from "./ui/dialogs";
import { Runner } from "./runner";
import { LANG } from "./lang";
import { DebugCommand, Snapshot } from "./lang/shared/debug";
import { EXAMPLES, NEW_PROGRAM } from "./examples";
import { TestsPanel, TestsState, applyResult } from "./ui/tests";
import { coverageSpec } from "./ui/coverage";
import { discoverTests, hasTests } from "./lang/shared/testing";
import type { TestSelector } from "./lang/protocol";
import { t, tn, getLocale, setLocale, initialLocale, applyStaticTranslations, LOCALES } from "./i18n";
import { translateSource, type Locale } from "./lang/i18n";
import type { TestsSummary as RunnerTestsSummary } from "./runner";
import {
  openFile, saveFile, confirmDialog, setWindowTitle, isTauri, readTextFile, writeTextFile, listDir, pickFolder, statPath,
  createFile, createDir, renamePath, deletePath, revealPath, startupPath, joinPath, dirName,
} from "./ui/files";
import { Project, Doc, TreeNode, baseName } from "./project";
import { debugLineSpec } from "./ui/debug";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const prefs = {
  get theme() { return localStorage.getItem("theme") ?? "dark"; },
  set theme(v: string) { localStorage.setItem("theme", v); },
  get consoleH() { return Number(localStorage.getItem("consoleH") ?? 240); },
  set consoleH(v: number) { localStorage.setItem("consoleH", String(v)); },
  get sidebarW() { return Number(localStorage.getItem("sidebarW") ?? 240); },
  set sidebarW(v: number) { localStorage.setItem("sidebarW", String(v)); },
  get showSidebar() { return localStorage.getItem("showSidebar") !== "0"; },
  set showSidebar(v: boolean) { localStorage.setItem("showSidebar", v ? "1" : "0"); },
  get showVars() { return localStorage.getItem("showVars") !== "0"; },
  set showVars(v: boolean) { localStorage.setItem("showVars", v ? "1" : "0"); },
  get showTests() { return localStorage.getItem("showTests") === "1"; },
  set showTests(v: boolean) { localStorage.setItem("showTests", v ? "1" : "0"); },
  get showRef() { return localStorage.getItem("showRef") === "1"; },
  set showRef(v: boolean) { localStorage.setItem("showRef", v ? "1" : "0"); },
  get lastRoot() { return localStorage.getItem("lastRoot"); },
  set lastRoot(v: string | null) { if (v) localStorage.setItem("lastRoot", v); else localStorage.removeItem("lastRoot"); },
};

// ---------- tema ----------
function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme;
  prefs.theme = theme;
}
applyTheme(prefs.theme);
document.body.classList.toggle("tauri", isTauri);
// idioma da interface e das palavras reservadas (antes de montar qualquer texto)
setLocale(initialLocale());
applyStaticTranslations();

// ---------- elementos ----------
const btnRun = $<HTMLButtonElement>("#btn-run");
const btnDebug = $<HTMLButtonElement>("#btn-debug");
const btnStop = $<HTMLButtonElement>("#btn-stop");
const debugControls = $("#debug-controls");
const btnContinue = $<HTMLButtonElement>("#btn-continue"), btnPause = $<HTMLButtonElement>("#btn-pause");
const btnStepOver = $<HTMLButtonElement>("#btn-step-over"), btnStepInto = $<HTMLButtonElement>("#btn-step-into"), btnStepOut = $<HTMLButtonElement>("#btn-step-out");
const runState = $("#run-state");
const stFile = $("#st-file"), stDirty = $("#st-dirty"), stPos = $("#st-pos"), stTime = $("#st-time");
const stRoot = $("#st-root"), stEntry = $<HTMLButtonElement>("#st-entry"), btnSidebar = $<HTMLButtonElement>("#btn-sidebar");
const examplesPanel = $("#examples-panel");
const varsPane = $("#vars-pane"), varsState = $("#vars-state"), btnVars = $<HTMLButtonElement>("#btn-vars");
const testsPane = $("#tests-pane"), btnTests = $<HTMLButtonElement>("#btn-tests"), btnRunTests = $<HTMLButtonElement>("#btn-run-tests");
const refPanel = $("#ref-panel"), btnReference = $<HTMLButtonElement>("#btn-reference");
const sidebar = $("#sidebar"), sidebarSplitter = $("#sidebar-splitter"), sidebarRoot = $("#sidebar-root");

// ---------- console e variáveis ----------
const consolePanel = new ConsolePanel($("#console"));
const varsPanel = new VariablesPanel(varsPane);
varsPanel.onGoTo = (line, file) => revealLocation(file, line, 1, "goto");
varsPanel.clear();

function setVarsState(cls: string, text: string) {
  varsState.className = "vars-state " + cls;
  varsState.textContent = text;
}

/** Guarda o último estado das variáveis: usado na dica do editor e no painel. */
function applySnapshot(snap: Snapshot | null, live: boolean, label: string) {
  editor.snapshot = snap;
  if (snap) varsPanel.render(snap, live);
  else varsPanel.clear();
  setVarsState(live ? "live" : "", label);
}

// ---------- execução ----------
interface LastRun { entry: string; fileMap: Map<string, string> }
let lastRun: LastRun | null = null;
let debugLoc: { key: string } | null = null;

function fmtMs(ms: number) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function setRunState(cls: string, text: string) {
  runState.className = "run-state " + cls;
  runState.textContent = text;
}

function setRunning(on: boolean) {
  btnRun.disabled = on;
  btnDebug.disabled = on;
  btnRunTests.disabled = on;
  btnStop.disabled = !on;
  debugControls.hidden = !(on && runner.debugging);
  if (!on) { clearDebugLine(); setDebugButtons(false); }
}

/** Habilita os botões de passo quando pausado; "Pausar" só quando executando. */
function setDebugButtons(paused: boolean) {
  btnContinue.disabled = btnStepOver.disabled = btnStepInto.disabled = btnStepOut.disabled = !paused;
  btnPause.disabled = paused;
}

function debugCmd(c: DebugCommand) {
  if (!runner.running || !runner.debugging) return;
  runner.debug(c);
}

function clearDebugLine() {
  if (debugLoc) project.applyToDoc(debugLoc.key, debugLineSpec(null));
  debugLoc = null;
}

/** Nome curto de um arquivo da execução para mensagens (vazio se for o de entrada). */
function fileLabel(file: string | undefined) {
  if (!file || !lastRun || file === lastRun.entry) return "";
  return baseName(file);
}

/** Abre/foca o documento de um arquivo da última execução e mostra a posição. */
async function revealLocation(file: string | undefined, line: number, col: number, how: "error" | "pause" | "goto", message?: string) {
  let key = (file && lastRun?.fileMap.get(file)) ?? (lastRun ? lastRun.fileMap.get(lastRun.entry) : undefined) ?? project.active;
  if (!key) return;
  if (!project.docs.has(key)) {
    // arquivo do projeto que não estava aberto
    const node = project.files.get(key);
    if (!node) return;
    try { await project.openDoc(node.path, false); } catch { return; }
  }
  if (project.active !== key) project.activate(key);
  if (how === "error") { if (line > 0) editor.showError(line, col, message ?? ""); }
  else if (how === "pause") { clearDebugLine(); editor.setDebugLine(line); debugLoc = { key }; }
  else editor.goTo(line, col);
}

const runner = new Runner({
  testStart: (file, name) => {
    const tst = testsState.files.find((x) => x.file === file)?.tests.find((x) => x.name === name);
    if (tst) tst.status = "rodando";
    testsPanel.render(testsState);
  },
  test: (r) => {
    applyResult(testsState.files, r);
    testsPanel.render(testsState);
    if (r.status === "passou") consolePanel.system(`✓ ${r.name} (${fmtMs(r.ms)})`);
    else consolePanel.error(`✗ ${r.name}: ${r.message ?? ""}`, r.errLine ?? r.line, r.errCol ?? 1, fileLabel(r.errFile ?? r.file));
  },
  testFileError: (file, message, line, col, errFile) => {
    const f = testsState.files.find((x) => x.file === file);
    if (f) f.error = { message, line, col, errFile };
    testsPanel.render(testsState);
    consolePanel.error(t("Erro em {arquivo}: {mensagem}", { arquivo: baseName(file), mensagem: message }), line, col, fileLabel(errFile));
    void revealLocation(errFile, line, col, "error", message);
  },
  testsDone: (s) => {
    const failed = s.total - s.passed;
    setRunState(failed ? "error" : "", failed ? tn(failed, "{n} teste falhou", "{n} testes falharam") : "");
    stTime.textContent = fmtMs(s.ms);
    setRunning(false);
    finishTestsRun(s);
  },
  out: (t) => consolePanel.write(t),
  clear: () => consolePanel.clear(),
  inputRequest: () => { consolePanel.showInput(); setRunState("waiting", t("aguardando entrada")); },
  done: (ms, snap) => {
    consolePanel.hideInput();
    consolePanel.system("\n" + t("Programa finalizado em {ms}.", { ms: fmtMs(ms) }));
    setRunState("", "");
    stTime.textContent = fmtMs(ms);
    applySnapshot(snap, false, t("valores finais"));
    setRunning(false);
  },
  error: (e, ms, snap) => {
    consolePanel.hideInput();
    const prefix = e.kind === "sintaxe" ? t("Erro de sintaxe") : e.kind === "interno" ? t("Erro interno") : t("Erro de execução");
    consolePanel.error(`${prefix}: ${e.message}`, e.line, e.col, fileLabel(e.file));
    void revealLocation(e.file, e.line, e.col, "error", e.message);
    setRunState("error", e.kind === "sintaxe" ? t("erro de sintaxe") : t("erro"));
    stTime.textContent = fmtMs(ms);
    applySnapshot(snap, false, snap ? t("valores no momento do erro") : "");
    setRunning(false);
  },
  stopped: (ms) => {
    if (testsState.running) finishTestsRun(null);
    consolePanel.hideInput();
    consolePanel.system("\n" + t("Programa interrompido após {ms}.", { ms: fmtMs(ms) }));
    setRunState("", "");
    stTime.textContent = fmtMs(ms);
    setVarsState("", editor.snapshot ? t("valores ao interromper") : "");
    setRunning(false);
  },
  paused: (file, line, col, snap) => {
    consolePanel.hideInput();
    void revealLocation(file, line, col, "pause");
    const where = fileLabel(file) ? `${fileLabel(file)}:${line}` : t("linha {n}", { n: line });
    const label = t("pausado em {where}", { where });
    applySnapshot(snap, true, label);
    setVarsState("paused", label);
    setRunState("paused", label);
    setDebugButtons(true);
  },
  resumed: () => {
    clearDebugLine();
    setRunState("running", t("executando"));
    setVarsState("live", t("ao vivo"));
    setDebugButtons(false);
  },
  snapshot: (snap) => applySnapshot(snap, true, t("ao vivo")),
});
consolePanel.onSubmit = (v) => { runner.sendInput(v); setRunState("running", t("executando")); };
consolePanel.onGoTo = (l, c, file) => revealLocation(file, l, c, "goto");

// ---------- painéis laterais ----------
function setVarsVisible(on: boolean) {
  varsPane.hidden = !on;
  btnVars.setAttribute("aria-pressed", String(on));
  prefs.showVars = on;
  if (on && !testsPane.hidden) setTestsVisible(false);
}
function setTestsVisible(on: boolean) {
  testsPane.hidden = !on;
  btnTests.setAttribute("aria-pressed", String(on));
  prefs.showTests = on;
  if (on) {
    if (!varsPane.hidden) setVarsVisible(false);
    void refreshTests();
  }
}
setVarsVisible(prefs.showVars);
btnVars.addEventListener("click", () => setVarsVisible(!!varsPane.hidden));
btnTests.addEventListener("click", () => setTestsVisible(!!testsPane.hidden));
btnRunTests.addEventListener("click", () => void runTests());

// ---------- testes ----------
const testsPanel = new TestsPanel(testsPane);
const testsState: TestsState = { files: [], running: false, summary: null, coverage: null, otherFiles: [] };
/** documentos editados depois da última medição: as marcas de cobertura não valem mais para eles */
const coverageStale = new Set<string>();
let lastTestsPartial = false;
testsPanel.onRunAll = () => void runTests();
testsPanel.onRunFile = (file) => void runTests([{ file }]);
testsPanel.onRunTest = (file, name) => void runTests([{ file, name }]);
testsPanel.onGoTo = (file, line, col) => void revealLocation(file, line, col, "goto");

/** Lista (sem compilar) os arquivos com blocos `teste` do projeto, preservando os últimos resultados. */
async function refreshTests() {
  const doc = project.activeDoc;
  if (!doc) return;
  const set = await project.collectRunFiles(false);
  const files = "error" in set ? [] : set.files;
  const prev = new Map(testsState.files.map((f) => [f.file, f]));
  const locale = getLocale();
  testsState.files = files.filter((f) => hasTests(f.source, locale)).map((f) => {
    const old = prev.get(f.path);
    return {
      file: f.path, label: baseName(f.path), error: old?.error,
      tests: discoverTests(f.source, locale).map((found) => {
        const o = old?.tests.find((x) => x.name === found.name);
        return o ? { ...o, line: found.line } : { name: found.name, line: found.line, status: "pendente" as const };
      }),
    };
  });
  testsState.otherFiles = files.filter((f) => !hasTests(f.source, locale)).map((f) => f.path);
  testsPanel.render(testsState);
}
let refreshTestsTimer = 0;
function refreshTestsSoon() {
  if (testsPane.hidden || testsState.running) return;
  clearTimeout(refreshTestsTimer);
  refreshTestsTimer = window.setTimeout(() => void refreshTests(), 400);
}

/** Executa todos os testes do projeto (ou só os de `only`). */
async function runTests(only?: TestSelector[]) {
  if (runner.running) return;
  const doc = project.activeDoc;
  if (!doc) return;
  const set = await project.collectRunFiles(false);
  if ("error" in set) { toast(set.error, true); return; }
  if (!testsPane.hidden) { /* já visível */ } else setTestsVisible(true);
  await refreshTests();
  if (!testsState.files.length) {
    toast(t('Nenhum teste encontrado. Escreva blocos teste "nome" no programa ou em um arquivo de testes que o importe.'), true);
    return;
  }
  consolePanel.clear();
  editor.clearError();
  stTime.textContent = "";
  lastRun = { entry: "", fileMap: set.fileMap };
  const selected = (file: string, name?: string) => !only || only.some((s) => s.file === file && (s.name === undefined || name === undefined || s.name === name));
  for (const f of testsState.files) {
    if (!selected(f.file)) continue;
    f.error = undefined;
    for (const tst of f.tests) {
      if (!selected(f.file, tst.name)) continue;
      tst.status = "pendente"; tst.message = undefined; tst.errLine = undefined; tst.ms = undefined; tst.output = undefined;
    }
  }
  lastTestsPartial = !!only;
  testsState.running = true;
  testsState.summary = null;
  if (!only) testsState.coverage = null;
  testsPanel.render(testsState);
  setRunState("running", t("testando"));
  setRunning(true);
  const what = !only
    ? tn(testsState.files.length, "todos os testes ({n} arquivo)", "todos os testes ({n} arquivos)")
    : only.length === 1 && only[0].name ? t('o teste "{nome}"', { nome: only[0].name }) : t("os testes de {arquivos}", { arquivos: only.map((s) => baseName(s.file)).join(", ") });
  consolePanel.system(t("Executando {oque}…", { oque: what }));
  runner.runTests(set.files, only, getLocale());
}

function finishTestsRun(s: RunnerTestsSummary | null) {
  testsState.running = false;
  for (const f of testsState.files) for (const tst of f.tests) if (tst.status === "rodando") tst.status = "pendente";
  if (s) {
    testsState.summary = { total: s.total, passed: s.passed, ms: s.ms };
    if (!lastTestsPartial) { testsState.coverage = s.coverage; coverageStale.clear(); }
    const failed = s.total - s.passed;
    const summary = s.total === 0 ? t("Nenhum teste executado")
      : failed ? tn(s.total, "{passaram} de {n} teste passaram", "{passaram} de {n} testes passaram", { passaram: s.passed })
      : s.total === 1 ? t("O teste passou") : t("Todos os {n} testes passaram", { n: s.total });
    consolePanel.system("\n" + t("{resumo} em {ms}.", { resumo: summary, ms: fmtMs(s.ms) }) + (!lastTestsPartial && testsState.coverage ? " " + coverageLine(testsState.coverage) : ""));
  } else {
    consolePanel.system("\n" + t("Testes interrompidos."));
  }
  testsPanel.render(testsState);
  applyCoverageToActive();
}

function coverageLine(cov: NonNullable<TestsState["coverage"]>) {
  let exec = 0, hit = 0;
  for (const f of Object.values(cov.files)) { exec += f.executable.length; hit += f.hit.length; }
  const untested = cov.functions.filter((f) => f.hit === 0).length;
  if (!exec) return "";
  const extra = untested ? "; " + tn(untested, "{n} função sem nenhum teste", "{n} funções sem nenhum teste") : "";
  return t("Cobertura: {pct}% das linhas{extra}.", { pct: Math.round((hit / exec) * 100), extra });
}

/** Pinta no editor as linhas cobertas/não cobertas do documento ativo (quando há medição válida para ele). */
function applyCoverageToActive() {
  const doc = project.activeDoc;
  const cov = testsState.coverage;
  if (!doc || !cov || !lastRun || coverageStale.has(doc.key)) { editor.view.dispatch(coverageSpec(null)); return; }
  const rel = [...lastRun.fileMap.entries()].find(([, k]) => k === doc.key)?.[0];
  const fc = rel ? cov.files[rel] : undefined;
  if (!fc) { editor.view.dispatch(coverageSpec(null)); return; }
  const hit = new Set(fc.hit);
  editor.view.dispatch(coverageSpec({ hit: fc.hit, miss: fc.executable.filter((l) => !hit.has(l)) }));
}

const refPanelUi = new ReferencePanel(refPanel);
refPanelUi.onInsert = (code) => editor.insertSnippet(code);
refPanelUi.onClose = () => setRefVisible(false);
function setRefVisible(on: boolean, word: string | null = null) {
  refPanel.hidden = !on;
  btnReference.setAttribute("aria-pressed", String(on));
  prefs.showRef = on;
  if (on) { refPanelUi.show(word); if (word === null) refPanelUi.focusSearch(); }
}
function toggleReference(fromEditor: boolean) {
  if (!refPanel.hidden && !fromEditor) { setRefVisible(false); editor.focus(); return; }
  setRefVisible(true, fromEditor ? editor.wordAtCursor() : null);
}

function setSidebarVisible(on: boolean) {
  sidebar.hidden = !on;
  sidebarSplitter.hidden = !on;
  btnSidebar.setAttribute("aria-pressed", String(on));
  prefs.showSidebar = on;
}

// ---------- editor ----------
const shortcuts = Prec.highest(keymap.of([
  { key: "F5", run: () => { runProgram(); return true; } },
  { key: "Ctrl-Enter", mac: "Cmd-Enter", run: () => { runProgram(); return true; } },
  { key: "Shift-F5", run: () => { stopProgram(); return true; } },
  { key: "F6", run: () => { runProgram(true); return true; } },
  { key: "F7", run: () => { void runTests(); return true; } },
  { key: "F8", run: () => { debugCmd("continue"); return true; } },
  { key: "F10", run: () => { debugCmd("over"); return true; } },
  { key: "F11", run: () => { debugCmd("into"); return true; } },
  { key: "Shift-F11", run: () => { debugCmd("out"); return true; } },
  { key: "F1", run: () => { toggleReference(true); return true; } },
  { key: "Ctrl-s", mac: "Cmd-s", run: () => { save(false); return true; } },
  { key: "Ctrl-Shift-s", mac: "Cmd-Shift-s", run: () => { save(true); return true; } },
  { key: "Ctrl-Alt-s", run: () => { saveAll(); return true; } },
  { key: "Ctrl-o", mac: "Cmd-o", run: () => { openProgram(); return true; } },
  { key: "Ctrl-Shift-o", mac: "Cmd-Shift-o", run: () => { openFolder(); return true; } },
  { key: "Ctrl-n", mac: "Cmd-n", run: () => { newProgram(); return true; } },
  { key: "Ctrl-l", mac: "Cmd-l", run: () => { consolePanel.clear(); return true; } },
  { key: "Ctrl-w", mac: "Cmd-w", run: () => { closeActive(); return true; } },
  { key: "Ctrl-Tab", run: () => { cycleTab(1); return true; } },
  { key: "Ctrl-Shift-Tab", run: () => { cycleTab(-1); return true; } },
  { key: "Ctrl-PageDown", run: () => { cycleTab(1); return true; } },
  { key: "Ctrl-PageUp", run: () => { cycleTab(-1); return true; } },
  { key: "Ctrl-b", mac: "Cmd-b", run: () => { if (isTauri) setSidebarVisible(!!sidebar.hidden); return true; } },
]));

const editor = new Editor($("#editor"), "", shortcuts);
editor.locale = getLocale();

// ---------- projeto ----------
const tabs = new TabsBar($("#tabs"));
const project = new Project(
  editor,
  { read: readTextFile, write: writeTextFile, listDir },
  {
    tree: () => renderTree(),
    docs: () => { tabs.render(project.order.map((k) => project.docs.get(k)!), project.active, (d) => project.rel(d)); renderTree(); updateTitle(); },
    active: (doc) => {
      tabs.setActive(doc.key);
      editor.clearError();
      updateTitle();
      renderTree();
      applyCoverageToActive();
      refreshTestsSoon();
    },
    meta: (doc) => { tabs.updateMeta(doc, project.rel(doc)); if (doc.key === project.active) updateTitle(); },
    entry: () => renderEntry(),
  },
);
tabs.onActivate = (k) => { project.activate(k); editor.focus(); };
tabs.onClose = (k) => closeDoc(k);
tabs.onContext = (k, x, y) => {
  const doc = project.docs.get(k)!;
  const items: MenuItem[] = [
    { label: t("Fechar"), action: () => closeDoc(k) },
    { label: t("Fechar outras"), action: async () => { for (const o of [...project.order]) if (o !== k) await closeDoc(o); } },
    { label: t("Fechar todas"), action: async () => { for (const o of [...project.order]) await closeDoc(o); } },
  ];
  if (doc.path && isTauri) {
    items.push({ separator: true }, { label: t("Mostrar no Explorador"), action: () => revealPath(doc.path!) }, { label: t("Copiar caminho"), action: () => navigator.clipboard.writeText(doc.path!) });
  }
  showMenu(items, x, y);
};

const fileTree = new FileTree(sidebar, {
  open: (n) => project.openDoc(n.path).then(() => editor.focus()).catch((e) => toast(t("Não foi possível abrir: {erro}", { erro: (e as Error).message }), true)),
  toggle: (n) => project.toggleExpanded(n.key),
  context: (n, x, y) => treeMenu(n, x, y),
  openFolder: () => openFolder(),
  openRecent: (r) => openRootSafe(r),
  forgetRecent: (r) => { project.forgetRecent(r); renderTree(); },
});

function renderTree() {
  if (!isTauri) return;
  fileTree.render(project.tree, project.expanded, project.active, entryKey(), project.recentProjects());
  sidebarRoot.textContent = project.rootName;
  sidebarRoot.title = project.root ?? "";
  stRoot.textContent = project.rootName;
  stRoot.title = project.root ?? "";
}

function entryKey(): string | null {
  if (project.entryMode !== "auto") return project.entryMode;
  return project.lastEntry;
}

function renderEntry() {
  if (!isTauri) return;
  if (!project.root) { stEntry.textContent = ""; return; }
  if (project.entryMode === "auto") {
    const last = project.lastEntry ? project.docs.get(project.lastEntry)?.name ?? project.files.get(project.lastEntry)?.name : null;
    stEntry.textContent = last ? t("{arquivo} (automático)", { arquivo: last }) : t("automático");
  } else {
    stEntry.textContent = project.files.get(project.entryMode)?.name ?? t("automático");
  }
  renderTree();
}

stEntry.addEventListener("click", (e) => {
  const items: MenuItem[] = [{ label: t("Automático (aba ativa, depois principal.*)"), checked: project.entryMode === "auto", action: () => project.setEntry("auto") }, { separator: true }];
  const files = [...project.files.values()].sort((a, b) => a.path.localeCompare(b.path));
  for (const f of files) items.push({ label: project.rel(f), checked: project.entryMode === f.key, action: () => project.setEntry(f.key) });
  if (!files.length) items.push({ label: t("Nenhum arquivo .koi no projeto"), disabled: true });
  const r = stEntry.getBoundingClientRect();
  showMenu(items, r.left, r.top - 8 - Math.min(400, 32 * (items.length + 1)));
  e.preventDefault();
});

// ---------- título / status ----------
function updateTitle() {
  const doc = project.activeDoc;
  const name = doc?.name ?? "";
  stFile.textContent = doc ? (doc.path ? project.rel(doc) : doc.name) : "";
  stFile.title = doc?.path ?? "";
  stDirty.hidden = !doc?.dirty;
  const parts = [`${doc?.dirty ? "● " : ""}${name}`];
  if (project.root) parts.push(project.rootName);
  parts.push("Koiné IDE");
  setWindowTitle(parts.join(" — "));
}

editor.onCursor = (l, c) => { stPos.textContent = t("Ln {l}, Col {c}", { l, c }); };
editor.onBreakpoints = (lines) => {
  project.persistBreakpoints(lines);
  const doc = project.activeDoc;
  if (doc && lastRun) {
    const rel = [...lastRun.fileMap.entries()].find(([, k]) => k === doc.key)?.[0];
    if (rel) runner.setBreakpoints(allBreakpoints(lastRun));
  }
};
editor.onChange = () => {
  project.noteChange();
  editor.clearError();
  if (project.active) coverageStale.add(project.active);
  refreshTestsSoon();
};

/** Pontos de parada de todos os documentos da última execução. */
function allBreakpoints(run: LastRun) {
  const out: { file: string; line: number }[] = [];
  for (const [rel, key] of run.fileMap) {
    const doc = project.docs.get(key);
    if (!doc) { for (const line of project.persistedBreakpoints(rel)) out.push({ file: rel, line }); continue; }
    const lines = doc.key === project.active ? editor.breakpoints : breakpointLinesOf(doc);
    for (const line of lines) out.push({ file: rel, line });
  }
  return out;
}
import { breakpointLines } from "./ui/debug";
function breakpointLinesOf(doc: Doc) {
  return breakpointLines(project.stateOf(doc));
}

// ---------- ações ----------
async function runProgram(debug = false) {
  if (runner.running) return;
  const doc = project.activeDoc;
  if (!doc) return;
  const set = await project.collectRunFiles();
  if ("error" in set) { toast(set.error, true); return; }
  consolePanel.clear();
  editor.clearError();
  stTime.textContent = "";
  applySnapshot(null, debug, debug ? t("iniciando…") : "");
  setRunState("running", debug ? t("depurando") : t("executando"));
  lastRun = { entry: set.entry, fileMap: set.fileMap };
  renderEntry();
  const bps = allBreakpoints(lastRun);
  runner.run(set.files, set.entry, debug ? { breakpoints: bps } : undefined, getLocale());
  setRunning(true);
  if (set.files.length > 1) {
    const extra = set.files.length - 1;
    const extras = tn(extra, "+{n} arquivo", "+{n} arquivos");
    const naoSalvo = set.unsaved.length ? t("; não salvo: {arquivos}", { arquivos: set.unsaved.join(", ") }) : "";
    consolePanel.system(t("Executando {arquivo} ({extras}{naoSalvo}).", { arquivo: set.entry, extras, naoSalvo }));
  }
  if (debug) {
    setDebugButtons(false);
    if (!bps.length) consolePanel.system(t("Depuração iniciada: nenhum ponto de parada, o programa vai pausar na primeira linha. Use Passo (F10) para avançar."));
    else consolePanel.system(t("Depuração iniciada: executando até o primeiro ponto de parada ({pontos}).", { pontos: bps.map((b) => (b.file === set.entry ? t("linha {n}", { n: b.line }) : `${baseName(b.file)}:${b.line}`)).join(", ") }));
  }
}

function stopProgram() {
  if (runner.running) runner.stop();
}

async function confirmDiscardDocs(docs: Doc[]): Promise<boolean> {
  if (!docs.length) return true;
  const names = docs.map((d) => d.name);
  const msg = docs.length === 1
    ? t('"{nome}" tem alterações não salvas. Deseja descartá-las?', { nome: names[0] })
    : t("Há {n} arquivos com alterações não salvas ({nomes}). Deseja descartá-las?", { n: docs.length, nomes: names.join(", ") });
  return confirmDialog(msg, t("Alterações não salvas"));
}

function newProgram() {
  project.newUntitled();
  editor.focus();
}

async function closeDoc(key: string) {
  const doc = project.docs.get(key);
  if (!doc) return;
  if (doc.dirty && !(await confirmDiscardDocs([doc]))) return;
  project.closeDoc(key, true);
  if (!project.order.length) project.newUntitled();
  editor.focus();
}
function closeActive() {
  if (project.active) void closeDoc(project.active);
}
function cycleTab(dir: 1 | -1) {
  const i = project.order.indexOf(project.active ?? "");
  if (i < 0 || project.order.length < 2) return;
  project.activate(project.order[(i + dir + project.order.length) % project.order.length]);
}

async function openProgram() {
  try {
    const f = await openFile();
    if (!f) return;
    if (f.path) await openPathAsDoc(f.path);
    else project.newUntitled(f.content, f.name);
    editor.focus();
  } catch (e) {
    toast(t("Não foi possível abrir o arquivo: {erro}", { erro: (e as Error).message }), true);
  }
}

/** Abre um arquivo do disco; sem projeto aberto, a pasta dele vira o projeto. */
async function openPathAsDoc(path: string) {
  if (isTauri && !project.root) {
    try { await project.openRoot(dirName(path)); prefs.lastRoot = dirName(path); } catch { /* fica sem projeto */ }
  }
  await project.openDoc(path);
}

async function openRootSafe(root: string): Promise<boolean> {
  // abas da pasta anterior que estejam sujas
  const prevDirty = project.dirtyDocs().filter((d) => d.path && project.files.has(d.key));
  if (!(await confirmDiscardDocs(prevDirty))) return false;
  try {
    stopProgram();
    const prevRoot = project.rootKey;
    for (const d of [...project.docs.values()]) if (d.path && prevRoot && project.files.has(d.key)) project.closeDoc(d.key, true);
    await project.openRoot(root);
    prefs.lastRoot = root;
    if (!project.order.length) project.newUntitled();
    return true;
  } catch (e) {
    toast(t("Não foi possível abrir a pasta: {erro}", { erro: (e as Error).message }), true);
    project.forgetRecent(root);
    renderTree();
    return false;
  }
}

async function openFolder() {
  if (!isTauri) return;
  const root = await pickFolder();
  if (root) await openRootSafe(root);
}

async function save(as: boolean, doc: Doc | null = project.activeDoc): Promise<boolean> {
  if (!doc) return false;
  try {
    const text = project.textOf(doc);
    const suggested = doc.path ? doc.name : (project.root ? joinPath(project.root, doc.name) : doc.name);
    const r = await saveFile(text, doc.path, suggested, as);
    if (!r) return false;
    if (r.path && r.path !== doc.path) project.rekeyDoc(doc, r.path);
    else if (r.name !== doc.name && !r.path) doc.name = r.name;
    project.markSaved(doc, text);
    project.saveDrafts();
    if (r.path && project.root) await project.refreshTree();
    updateTitle();
    toast(isTauri ? t("Salvo em {caminho}", { caminho: r.path ?? "" }) : t("Download iniciado"));
    return true;
  } catch (e) {
    toast(t("Não foi possível salvar: {erro}", { erro: (e as Error).message }), true);
    return false;
  }
}

async function saveAll() {
  for (const d of project.dirtyDocs()) {
    if (!d.path) { project.activate(d.key); }
    if (!(await save(false, d))) break;
  }
}

let toastTimer = 0;
function toast(msg: string, error = false) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.remove(), error ? 5000 : 2200);
}

// ---------- ações da árvore ----------
function dirOf(n: TreeNode | null): string {
  if (!n) return project.root!;
  return n.kind === "dir" ? n.path : dirName(n.path);
}

function defaultExt(): string {
  return LANG.ext;
}

async function treeNewFile(n: TreeNode | null) {
  if (!project.root) return;
  const dir = dirOf(n);
  const ext = defaultExt();
  const name = await promptDialog({ title: t("Novo arquivo"), label: t("Em {pasta}/", { pasta: baseName(dir) }), value: `novo.${ext}`, okLabel: t("Criar"), validate: validateFileName, selectStem: true });
  if (!name) return;
  const full = /\.[a-z0-9]+$/i.test(name) ? name : `${name}.${ext}`;
  const path = joinPath(dir, full);
  try {
    await createFile(path, translateSource(NEW_PROGRAM, "pt-BR", getLocale()));
    if (n) project.expanded.add(n.kind === "dir" ? n.key : dirName(n.key));
    await project.refreshTree();
    await project.openDoc(path);
    editor.focus();
  } catch (e) {
    toast(t("Não foi possível criar o arquivo: {erro}", { erro: (e as Error).message }), true);
  }
}

async function treeNewFolder(n: TreeNode | null) {
  if (!project.root) return;
  const dir = dirOf(n);
  const name = await promptDialog({ title: t("Nova pasta"), label: t("Em {pasta}/", { pasta: baseName(dir) }), value: "nova-pasta", okLabel: t("Criar"), validate: validateFileName });
  if (!name) return;
  try {
    await createDir(joinPath(dir, name));
    if (n) project.expanded.add(n.kind === "dir" ? n.key : dirName(n.key));
    await project.refreshTree();
  } catch (e) {
    toast(t("Não foi possível criar a pasta: {erro}", { erro: (e as Error).message }), true);
  }
}

async function treeRename(n: TreeNode) {
  const name = await promptDialog({ title: n.kind === "dir" ? t("Renomear pasta") : t("Renomear arquivo"), value: n.name, okLabel: t("Renomear"), validate: validateFileName, selectStem: n.kind === "file" });
  if (!name || name === n.name) return;
  const to = joinPath(dirName(n.path), name);
  try {
    await renamePath(n.path, to);
    if (n.kind === "dir") project.rekeyFolder(n.path, to);
    else { const d = project.docs.get(n.key); if (d) project.rekeyDoc(d, to); }
    await project.refreshTree();
    updateTitle();
  } catch (e) {
    toast(t("Não foi possível renomear: {erro}", { erro: (e as Error).message }), true);
  }
}

async function treeDelete(n: TreeNode) {
  const openInside = [...project.docs.values()].filter((d) => d.path && (d.key === n.key || d.key.startsWith(n.key + "/")));
  const what = n.kind === "dir" ? t('a pasta "{nome}" e todo o seu conteúdo', { nome: n.name }) : t('o arquivo "{nome}"', { nome: n.name });
  const extra = openInside.length ? " " + tn(openInside.length, "({n} aba aberta será fechada)", "({n} abas abertas serão fechadas)") : "";
  if (!(await confirmDialog(t("Enviar {oque} para a lixeira?{extra}", { oque: what, extra }), t("Excluir")))) return;
  try {
    await deletePath(n.path);
    for (const d of openInside) project.closeDoc(d.key, true);
    if (!project.order.length) project.newUntitled();
    await project.refreshTree();
  } catch (e) {
    toast(t("Não foi possível excluir: {erro}", { erro: (e as Error).message }), true);
  }
}

function treeMenu(n: TreeNode, x: number, y: number) {
  const isRoot = n.key === project.tree?.key;
  const items: MenuItem[] = [
    { label: t("Novo arquivo…"), action: () => treeNewFile(n) },
    { label: t("Nova pasta…"), action: () => treeNewFolder(n) },
  ];
  if (n.kind === "file") {
    items.push({ separator: true });
    items.push({ label: t("Abrir"), action: () => project.openDoc(n.path) });
    items.push({ label: t("Definir como arquivo principal"), checked: project.entryMode === n.key, action: () => project.setEntry(project.entryMode === n.key ? "auto" : n.key) });
  }
  if (!isRoot) {
    items.push({ separator: true });
    items.push({ label: t("Renomear…"), action: () => treeRename(n) });
    items.push({ label: t("Excluir…"), danger: true, action: () => treeDelete(n) });
  }
  items.push({ separator: true });
  items.push({ label: t("Mostrar no Explorador"), action: () => revealPath(n.path) });
  items.push({ label: t("Copiar caminho"), action: () => navigator.clipboard.writeText(n.path) });
  if (isRoot) {
    items.push({ separator: true });
    items.push({ label: t("Atualizar"), action: () => project.refreshTree() });
    items.push({ label: t("Fechar pasta"), action: () => closeFolder() });
  }
  showMenu(items, x, y);
}

async function closeFolder() {
  const dirty = project.dirtyDocs().filter((d) => d.path && project.files.has(d.key));
  if (!(await confirmDiscardDocs(dirty))) return;
  for (const d of [...project.docs.values()]) if (d.path && project.files.has(d.key)) project.closeDoc(d.key, true);
  project.closeRoot();
  prefs.lastRoot = null;
  if (!project.order.length) project.newUntitled();
  updateTitle();
}

// ---------- exemplos ----------
function buildExamples() {
  const list = $("#examples-list");
  list.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "ex-grid";
  for (const ex of EXAMPLES) {
    const b = document.createElement("button");
    b.className = "ex-item";
    b.innerHTML = `<span class="ex-title"></span><span class="ex-desc"></span>`;
    b.querySelector(".ex-title")!.textContent = t(ex.title);
    b.querySelector(".ex-desc")!.textContent = ex.files ? t("{desc} ({n} arquivos)", { desc: t(ex.description), n: ex.files.length }) : t(ex.description);
    b.addEventListener("click", () => {
      hideExamples();
      const slug = ex.title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      if (ex.files) {
        // cada arquivo vira uma aba; o grupo faz todas serem executadas juntas; o primeiro (principal) fica ativo
        const group = `ex:${slug}:${Date.now()}`;
        const docs = ex.files.map((f) => project.newUntitled(translateSource(f.code, "pt-BR", getLocale()), f.name, false, true, group));
        project.activate(docs[0].key);
      } else {
        project.newUntitled(translateSource(ex.code ?? "", "pt-BR", getLocale()), `${slug}.${LANG.ext}`, true, true);
      }
      editor.focus();
    });
    grid.appendChild(b);
  }
  list.appendChild(grid);
}
buildExamples();
function showExamples() { examplesPanel.hidden = false; (examplesPanel.querySelector("button") as HTMLElement)?.focus(); }
function hideExamples() { examplesPanel.hidden = true; }
document.addEventListener("mousedown", (e) => {
  if (!examplesPanel.hidden && !examplesPanel.contains(e.target as Node) && !(e.target as HTMLElement).closest("#btn-examples")) hideExamples();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!examplesPanel.hidden) { hideExamples(); editor.focus(); }
    return;
  }
  // atalhos globais (fora do editor; dentro dele o keymap do CodeMirror já trata)
  const target = e.target as HTMLElement;
  if (target.closest?.(".cm-editor")) return;
  const typing = target.matches?.("input, textarea, [contenteditable]");
  if (e.key === "F5") { e.preventDefault(); if (e.shiftKey) stopProgram(); else runProgram(); }
  else if (e.key === "F6") { e.preventDefault(); runProgram(true); }
  else if (e.key === "F7") { e.preventDefault(); void runTests(); }
  else if (e.key === "F8") { e.preventDefault(); debugCmd("continue"); }
  else if (e.key === "F10") { e.preventDefault(); debugCmd("over"); }
  else if (e.key === "F11") { e.preventDefault(); debugCmd(e.shiftKey ? "out" : "into"); }
  else if (e.key === "F1") { e.preventDefault(); toggleReference(false); }
  else if ((e.ctrlKey || e.metaKey)) {
    const k = e.key.toLowerCase();
    if (e.altKey) { if (k === "s") { e.preventDefault(); saveAll(); } return; }
    if (k === "s") { e.preventDefault(); save(e.shiftKey); }
    else if (k === "o") { e.preventDefault(); if (e.shiftKey) openFolder(); else openProgram(); }
    else if (k === "n") { e.preventDefault(); newProgram(); }
    else if (k === "l" && !typing) { e.preventDefault(); consolePanel.clear(); }
    else if (k === "enter") { e.preventDefault(); runProgram(); }
    else if (k === "w" && !typing) { e.preventDefault(); closeActive(); }
    else if (k === "b" && !typing) { e.preventDefault(); if (isTauri) setSidebarVisible(!!sidebar.hidden); }
    else if (k === "tab" || k === "pagedown") { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); }
    else if (k === "pageup") { e.preventDefault(); cycleTab(-1); }
  }
});

// ---------- botões ----------
$("#btn-new").addEventListener("click", newProgram);
$("#btn-open").addEventListener("click", openProgram);
$("#btn-open-folder").addEventListener("click", openFolder);
$("#btn-save").addEventListener("click", () => save(false));
$("#btn-save-all").addEventListener("click", saveAll);
btnRun.addEventListener("click", () => runProgram());
btnDebug.addEventListener("click", () => runProgram(true));
btnStop.addEventListener("click", stopProgram);
btnContinue.addEventListener("click", () => debugCmd("continue"));
btnPause.addEventListener("click", () => debugCmd("pause"));
btnStepOver.addEventListener("click", () => debugCmd("over"));
btnStepInto.addEventListener("click", () => debugCmd("into"));
btnStepOut.addEventListener("click", () => debugCmd("out"));
btnReference.addEventListener("click", () => toggleReference(false));
btnSidebar.addEventListener("click", () => setSidebarVisible(!!sidebar.hidden));
$("#btn-tree-new-file").addEventListener("click", () => (project.root ? treeNewFile(null) : openFolder()));
$("#btn-tree-new-folder").addEventListener("click", () => (project.root ? treeNewFolder(null) : openFolder()));
$("#btn-tree-refresh").addEventListener("click", () => project.refreshTree());
$("#btn-clear").addEventListener("click", () => consolePanel.clear());
$("#btn-theme").addEventListener("click", () => applyTheme(prefs.theme === "dark" ? "light" : "dark"));

// ---------- idioma ----------
const localeSelect = document.createElement("select");
localeSelect.id = "locale-select";
localeSelect.className = "locale-select";
for (const l of LOCALES) {
  const o = document.createElement("option");
  o.value = l.id;
  o.textContent = l.native;
  localeSelect.appendChild(o);
}
localeSelect.value = getLocale();
localeSelect.title = t("Idioma da interface e das palavras reservadas");
$("#btn-theme").before(localeSelect);
localeSelect.addEventListener("change", () => void changeLocale(localeSelect.value as Locale));

const localeName = (l: Locale) => LOCALES.find((x) => x.id === l)?.native ?? l;

/** Troca o idioma: textos da interface, destaque/autocompletar, referência, exemplos; oferece converter o código aberto. */
async function changeLocale(next: Locale) {
  const prev = getLocale();
  if (next === prev) return;
  setLocale(next);
  localeSelect.value = next;
  localeSelect.title = t("Idioma da interface e das palavras reservadas");
  applyStaticTranslations();
  editor.setLocale(next);
  for (const k of project.order) {
    if (k === project.active) continue;
    const d = project.docs.get(k)!;
    project.applyToDoc(k, editor.relocalize());
  }
  buildExamples();
  refPanelUi.refresh();
  tabs.render(project.order.map((k) => project.docs.get(k)!), project.active, (d) => project.rel(d));
  renderTree();
  renderEntry();
  updateTitle();
  testsPanel.render(testsState);
  if (!editor.snapshot) varsPanel.clear();
  const docs = project.order.map((k) => project.docs.get(k)!);
  const changed = docs.filter((d) => translateSource(project.textOf(d), prev, next) !== project.textOf(d));
  if (changed.length && await confirmDialog(t("Converter as palavras reservadas dos arquivos abertos de {de} para {para}?", { de: localeName(prev), para: localeName(next) }), t("Idioma"))) {
    for (const d of changed) {
      const src = project.textOf(d);
      const out = translateSource(src, prev, next);
      project.applyToDoc(d.key, { changes: { from: 0, to: src.length, insert: out } });
      project.noteChangeOf(d);
    }
  }
  editor.focus();
}
$("#btn-examples").addEventListener("click", () => (examplesPanel.hidden ? showExamples() : hideExamples()));

// ---------- splitters ----------
function makeSplitter(el: HTMLElement, axis: "x" | "y", startSize: () => number, apply: (size: number) => void, reset: () => void) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    const start = axis === "y" ? e.clientY : e.clientX;
    const size = startSize();
    const move = (ev: PointerEvent) => apply(axis === "y" ? size + (start - ev.clientY) : size + (ev.clientX - start));
    const up = () => {
      el.classList.remove("dragging");
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
  el.addEventListener("dblclick", reset);
}
const mainCol = $("#main-col");
function setConsoleH(h: number) {
  const max = mainCol.clientHeight - 150;
  h = Math.max(80, Math.min(max, h));
  mainCol.style.setProperty("--console-h", h + "px");
  prefs.consoleH = h;
}
setConsoleH(prefs.consoleH);
makeSplitter($("#splitter"), "y", () => $("#console-pane").clientHeight, setConsoleH, () => setConsoleH(240));
function setSidebarW(w: number) {
  w = Math.max(160, Math.min(window.innerWidth / 2, w));
  sidebar.style.setProperty("--sidebar-w", w + "px");
  prefs.sidebarW = w;
}
setSidebarW(prefs.sidebarW);
makeSplitter(sidebarSplitter, "x", () => sidebar.clientWidth, setSidebarW, () => setSidebarW(240));
window.addEventListener("resize", () => setConsoleH(prefs.consoleH));

// ---------- Tauri: arrastar, argumento, fechar, foco ----------
async function openDropped(p: string) {
  try {
    const info = await statPath(p);
    if (info.isDir) await openRootSafe(p);
    else await openPathAsDoc(p);
  } catch (e) {
    toast(t("Não foi possível abrir: {erro}", { erro: (e as Error).message }), true);
  }
}

async function setupTauri() {
  if (!isTauri) return;
  setSidebarVisible(prefs.showSidebar);
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.onDragDropEvent(async (ev) => {
      if (ev.payload.type !== "drop" || !ev.payload.paths.length) return;
      for (const p of ev.payload.paths) await openDropped(p);
    });
    await win.onCloseRequested(async (ev) => {
      const dirty = project.dirtyDocs();
      if (dirty.length && !(await confirmDiscardDocs(dirty))) ev.preventDefault();
    });
    await win.onFocusChanged(({ payload: focused }) => { if (focused) void onWindowFocus(); });
    const arg = await startupPath().catch(() => null);
    if (arg) await openDropped(arg.path);
    else if (prefs.lastRoot) {
      const ok = await openRootSafe(prefs.lastRoot).catch(() => false);
      if (!ok) prefs.lastRoot = null;
    }
  } catch (e) {
    console.warn("Integração Tauri indisponível:", e);
  }
}

/** Ao voltar para a janela: atualiza a árvore e detecta arquivos mudados/apagados fora da IDE. */
async function onWindowFocus() {
  if (!project.root) return;
  await project.refreshTree();
  for (const d of [...project.docs.values()]) {
    if (!d.path) continue;
    try {
      const info = await statPath(d.path);
      if (!info.exists) { if (!d.missing) { d.missing = true; tabs.updateMeta(d, project.rel(d)); } continue; }
      const text = await readTextFile(d.path);
      if (text === d.savedText) continue;
      if (!d.dirty) {
        // recarrega silenciosamente mantendo os pontos de parada
        const lines = breakpointLinesOf(d);
        const st = editor.createState(text, lines);
        if (d.key === project.active) editor.swap({ state: st, scroll: null });
        else d.state = st;
        project.markSaved(d, text);
      } else {
        toast(t('"{nome}" foi modificado fora da IDE. Suas alterações aqui não foram substituídas.', { nome: d.name }));
        d.savedText = text; // evita avisar de novo; a aba continua suja
      }
    } catch { /* ignora */ }
  }
}

window.addEventListener("beforeunload", (e) => {
  if (!isTauri && project.dirtyDocs().length) e.preventDefault();
});

// ---------- início ----------
if (!project.restoreDrafts()) project.newUntitled(undefined, undefined, false);
if (prefs.showTests) setTestsVisible(true);
project.activate(project.order[project.order.length - 1]);
refPanelUi.render();
if (prefs.showRef) setRefVisible(true);
renderTree();
renderEntry();
updateTitle();
setupTauri();
editor.focus();
