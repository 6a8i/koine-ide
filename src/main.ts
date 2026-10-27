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
import { Lang } from "./lang/shared/types";
import { LANG_INFO, langFromFilename, detectLang } from "./lang";
import { DebugCommand, Snapshot } from "./lang/shared/debug";
import { EXAMPLES, NEW_STUDIO, NEW_VISUALG } from "./examples";
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
  /** linguagem padrão para novos documentos */
  get lang(): Lang { return (localStorage.getItem("lang") as Lang) ?? "studio"; },
  set lang(v: Lang) { localStorage.setItem("lang", v); },
  get consoleH() { return Number(localStorage.getItem("consoleH") ?? 240); },
  set consoleH(v: number) { localStorage.setItem("consoleH", String(v)); },
  get sidebarW() { return Number(localStorage.getItem("sidebarW") ?? 240); },
  set sidebarW(v: number) { localStorage.setItem("sidebarW", String(v)); },
  get showSidebar() { return localStorage.getItem("showSidebar") !== "0"; },
  set showSidebar(v: boolean) { localStorage.setItem("showSidebar", v ? "1" : "0"); },
  get showVars() { return localStorage.getItem("showVars") !== "0"; },
  set showVars(v: boolean) { localStorage.setItem("showVars", v ? "1" : "0"); },
  get showRef() { return localStorage.getItem("showRef") === "1"; },
  set showRef(v: boolean) { localStorage.setItem("showRef", v ? "1" : "0"); },
  get lastRoot() { return localStorage.getItem("lastRoot"); },
  set lastRoot(v: string | null) { if (v) localStorage.setItem("lastRoot", v); else localStorage.removeItem("lastRoot"); },
};

// ---------- tema ----------
function applyTheme(t: string) {
  document.documentElement.dataset.theme = t;
  prefs.theme = t;
}
applyTheme(prefs.theme);
document.body.classList.toggle("tauri", isTauri);

// ---------- elementos ----------
const btnRun = $<HTMLButtonElement>("#btn-run");
const btnDebug = $<HTMLButtonElement>("#btn-debug");
const btnStop = $<HTMLButtonElement>("#btn-stop");
const debugControls = $("#debug-controls");
const btnContinue = $<HTMLButtonElement>("#btn-continue"), btnPause = $<HTMLButtonElement>("#btn-pause");
const btnStepOver = $<HTMLButtonElement>("#btn-step-over"), btnStepInto = $<HTMLButtonElement>("#btn-step-into"), btnStepOut = $<HTMLButtonElement>("#btn-step-out");
const runState = $("#run-state");
const stFile = $("#st-file"), stDirty = $("#st-dirty"), stPos = $("#st-pos"), stLang = $("#st-lang"), stTime = $("#st-time");
const stRoot = $("#st-root"), stEntry = $<HTMLButtonElement>("#st-entry"), btnSidebar = $<HTMLButtonElement>("#btn-sidebar");
const examplesPanel = $("#examples-panel");
const varsPane = $("#vars-pane"), varsState = $("#vars-state"), btnVars = $<HTMLButtonElement>("#btn-vars");
const refPanel = $("#ref-panel"), btnReference = $<HTMLButtonElement>("#btn-reference"), refLang = $("#ref-lang");
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
  if (snap) varsPanel.render(snap, lastRun?.lang ?? prefs.lang, live);
  else varsPanel.clear();
  setVarsState(live ? "live" : "", label);
}

// ---------- execução ----------
interface LastRun { lang: Lang; entry: string; fileMap: Map<string, string> }
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
  out: (t) => consolePanel.write(t),
  clear: () => consolePanel.clear(),
  inputRequest: () => { consolePanel.showInput(); setRunState("waiting", "aguardando entrada"); },
  done: (ms, snap) => {
    consolePanel.hideInput();
    consolePanel.system(`\nPrograma finalizado em ${fmtMs(ms)}.`);
    setRunState("", "");
    stTime.textContent = fmtMs(ms);
    applySnapshot(snap, false, "valores finais");
    setRunning(false);
  },
  error: (e, ms, snap) => {
    consolePanel.hideInput();
    const prefix = e.kind === "sintaxe" ? "Erro de sintaxe" : e.kind === "interno" ? "Erro interno" : "Erro de execução";
    consolePanel.error(`${prefix}: ${e.message}`, e.line, e.col, fileLabel(e.file));
    void revealLocation(e.file, e.line, e.col, "error", e.message);
    setRunState("error", e.kind === "sintaxe" ? "erro de sintaxe" : "erro");
    stTime.textContent = fmtMs(ms);
    applySnapshot(snap, false, snap ? "valores no momento do erro" : "");
    setRunning(false);
  },
  stopped: (ms) => {
    consolePanel.hideInput();
    consolePanel.system(`\nPrograma interrompido após ${fmtMs(ms)}.`);
    setRunState("", "");
    stTime.textContent = fmtMs(ms);
    setVarsState("", editor.snapshot ? "valores ao interromper" : "");
    setRunning(false);
  },
  paused: (file, line, col, snap) => {
    consolePanel.hideInput();
    void revealLocation(file, line, col, "pause");
    const where = fileLabel(file) ? `${fileLabel(file)}:${line}` : `linha ${line}`;
    applySnapshot(snap, true, `pausado em ${where}`);
    setVarsState("paused", `pausado em ${where}`);
    setRunState("paused", `pausado em ${where}`);
    setDebugButtons(true);
  },
  resumed: () => {
    clearDebugLine();
    setRunState("running", "executando");
    setVarsState("live", "ao vivo");
    setDebugButtons(false);
  },
  snapshot: (snap) => applySnapshot(snap, true, "ao vivo"),
});
consolePanel.onSubmit = (v) => { runner.sendInput(v); setRunState("running", "executando"); };
consolePanel.onGoTo = (l, c, file) => revealLocation(file, l, c, "goto");

// ---------- painéis laterais ----------
function setVarsVisible(on: boolean) {
  varsPane.hidden = !on;
  btnVars.setAttribute("aria-pressed", String(on));
  prefs.showVars = on;
}
setVarsVisible(prefs.showVars);
btnVars.addEventListener("click", () => setVarsVisible(varsPane.hidden));

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
  { key: "Ctrl-b", mac: "Cmd-b", run: () => { if (isTauri) setSidebarVisible(sidebar.hidden); return true; } },
]));

const editor = new Editor($("#editor"), prefs.lang, "", shortcuts);

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
      setLangUi(doc.lang);
      updateTitle();
      renderTree();
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
    { label: "Fechar", action: () => closeDoc(k) },
    { label: "Fechar outras", action: async () => { for (const o of [...project.order]) if (o !== k) await closeDoc(o); } },
    { label: "Fechar todas", action: async () => { for (const o of [...project.order]) await closeDoc(o); } },
  ];
  if (doc.path && isTauri) {
    items.push({ separator: true }, { label: "Mostrar no Explorador", action: () => revealPath(doc.path!) }, { label: "Copiar caminho", action: () => navigator.clipboard.writeText(doc.path!) });
  }
  showMenu(items, x, y);
};

const fileTree = new FileTree(sidebar, {
  open: (n) => project.openDoc(n.path).then(() => editor.focus()).catch((e) => toast("Não foi possível abrir: " + (e as Error).message, true)),
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
    stEntry.textContent = last ? `${last} (automático)` : "automático";
  } else {
    stEntry.textContent = project.files.get(project.entryMode)?.name ?? "automático";
  }
  renderTree();
}

stEntry.addEventListener("click", (e) => {
  const lang = project.activeDoc?.lang ?? prefs.lang;
  const items: MenuItem[] = [{ label: "Automático (aba ativa, depois principal.*)", checked: project.entryMode === "auto", action: () => project.setEntry("auto") }, { separator: true }];
  const files = [...project.files.values()].filter((f) => f.lang === lang).sort((a, b) => a.path.localeCompare(b.path));
  for (const f of files) items.push({ label: project.rel(f), checked: project.entryMode === f.key, action: () => project.setEntry(f.key) });
  if (!files.length) items.push({ label: `Nenhum arquivo ${LANG_INFO[lang].name} no projeto`, disabled: true });
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
  parts.push("Portugol IDE");
  setWindowTitle(parts.join(" — "));
}

editor.onCursor = (l, c) => { stPos.textContent = `Ln ${l}, Col ${c}`; };
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

/** Atualiza o seletor de linguagem, a referência e a barra de status para a linguagem do documento ativo. */
function setLangUi(lang: Lang) {
  document.querySelectorAll<HTMLButtonElement>(".seg-btn").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.lang === lang)));
  stLang.textContent = LANG_INFO[lang].name;
  refLang.textContent = LANG_INFO[lang].name;
  refPanelUi.setLang(lang);
}

/** Troca a linguagem do documento ativo (seletor da toolbar). */
function switchLang(lang: Lang) {
  const doc = project.activeDoc;
  prefs.lang = lang;
  if (!doc) return;
  if (doc.lang === lang) return;
  if (doc.path) {
    toast(`Este arquivo é ${LANG_INFO[doc.lang].name} pela extensão .${LANG_INFO[doc.lang].ext}. Crie um novo arquivo .${LANG_INFO[lang].ext} para usar ${LANG_INFO[lang].name}.`);
    setLangUi(doc.lang);
    return;
  }
  doc.lang = lang;
  editor.setLang(lang);
  const cur = editor.text.trim();
  if (cur === NEW_STUDIO.trim() || cur === NEW_VISUALG.trim() || cur === "") {
    editor.setText(lang === "visualg" ? NEW_VISUALG : NEW_STUDIO);
    doc.savedText = editor.text;
    doc.dirty = false;
  }
  if (/^sem título/.test(doc.name)) doc.name = doc.name.replace(/\.[a-z]+$/, "." + LANG_INFO[lang].ext);
  project.saveDrafts();
  tabs.updateMeta(doc, project.rel(doc));
  setLangUi(lang);
  updateTitle();
}

// ---------- ações ----------
async function runProgram(debug = false) {
  if (runner.running) return;
  const doc = project.activeDoc;
  if (!doc) return;
  const set = await project.collectRunFiles(doc.lang);
  if ("error" in set) { toast(set.error, true); return; }
  consolePanel.clear();
  editor.clearError();
  stTime.textContent = "";
  applySnapshot(null, debug, debug ? "iniciando…" : "");
  setRunState("running", debug ? "depurando" : "executando");
  lastRun = { lang: doc.lang, entry: set.entry, fileMap: set.fileMap };
  renderEntry();
  const bps = allBreakpoints(lastRun);
  runner.run(doc.lang, set.files, set.entry, debug ? { breakpoints: bps } : undefined);
  setRunning(true);
  if (set.files.length > 1) {
    const extra = set.files.length - 1;
    consolePanel.system(`Executando ${set.entry} (+${extra} arquivo${extra > 1 ? "s" : ""}${set.unsaved.length ? `; não salvo: ${set.unsaved.join(", ")}` : ""}).`);
  }
  if (debug) {
    setDebugButtons(false);
    if (!bps.length) consolePanel.system("Depuração iniciada: nenhum ponto de parada, o programa vai pausar na primeira linha. Use Passo (F10) para avançar.");
    else consolePanel.system(`Depuração iniciada: executando até o primeiro ponto de parada (${bps.map((b) => (b.file === set.entry ? `linha ${b.line}` : `${baseName(b.file)}:${b.line}`)).join(", ")}).`);
  }
}

function stopProgram() {
  if (runner.running) runner.stop();
}

async function confirmDiscardDocs(docs: Doc[]): Promise<boolean> {
  if (!docs.length) return true;
  const names = docs.map((d) => d.name);
  const msg = docs.length === 1
    ? `"${names[0]}" tem alterações não salvas. Deseja descartá-las?`
    : `Há ${docs.length} arquivos com alterações não salvas (${names.join(", ")}). Deseja descartá-las?`;
  return confirmDialog(msg, "Alterações não salvas");
}

function newProgram() {
  project.newUntitled(prefs.lang);
  editor.focus();
}

async function closeDoc(key: string) {
  const doc = project.docs.get(key);
  if (!doc) return;
  if (doc.dirty && !(await confirmDiscardDocs([doc]))) return;
  project.closeDoc(key, true);
  if (!project.order.length) project.newUntitled(prefs.lang);
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
    else project.newUntitled(langFromFilename(f.name) ?? detectLang(f.content), f.content, f.name);
    editor.focus();
  } catch (e) {
    toast("Não foi possível abrir o arquivo: " + (e as Error).message, true);
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
    if (!project.order.length) project.newUntitled(prefs.lang);
    return true;
  } catch (e) {
    toast("Não foi possível abrir a pasta: " + (e as Error).message, true);
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
    toast(isTauri ? `Salvo em ${r.path}` : "Download iniciado");
    return true;
  } catch (e) {
    toast("Não foi possível salvar: " + (e as Error).message, true);
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
  const t = document.createElement("div");
  t.className = "toast" + (error ? " error" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), error ? 5000 : 2200);
}

// ---------- ações da árvore ----------
function dirOf(n: TreeNode | null): string {
  if (!n) return project.root!;
  return n.kind === "dir" ? n.path : dirName(n.path);
}

function defaultExt(): string {
  const lang = project.activeDoc?.lang ?? prefs.lang;
  return LANG_INFO[lang].ext;
}

async function treeNewFile(n: TreeNode | null) {
  if (!project.root) return;
  const dir = dirOf(n);
  const ext = defaultExt();
  const name = await promptDialog({ title: "Novo arquivo", label: `Em ${baseName(dir)}/`, value: `novo.${ext}`, okLabel: "Criar", validate: validateFileName, selectStem: true });
  if (!name) return;
  const full = /\.[a-z0-9]+$/i.test(name) ? name : `${name}.${ext}`;
  const path = joinPath(dir, full);
  const lang = langFromFilename(full) ?? (ext === "alg" ? "visualg" : "studio");
  try {
    await createFile(path, lang === "visualg" ? NEW_VISUALG : NEW_STUDIO);
    if (n) project.expanded.add(n.kind === "dir" ? n.key : dirName(n.key));
    await project.refreshTree();
    await project.openDoc(path);
    editor.focus();
  } catch (e) {
    toast("Não foi possível criar o arquivo: " + (e as Error).message, true);
  }
}

async function treeNewFolder(n: TreeNode | null) {
  if (!project.root) return;
  const dir = dirOf(n);
  const name = await promptDialog({ title: "Nova pasta", label: `Em ${baseName(dir)}/`, value: "nova-pasta", okLabel: "Criar", validate: validateFileName });
  if (!name) return;
  try {
    await createDir(joinPath(dir, name));
    if (n) project.expanded.add(n.kind === "dir" ? n.key : dirName(n.key));
    await project.refreshTree();
  } catch (e) {
    toast("Não foi possível criar a pasta: " + (e as Error).message, true);
  }
}

async function treeRename(n: TreeNode) {
  const name = await promptDialog({ title: n.kind === "dir" ? "Renomear pasta" : "Renomear arquivo", value: n.name, okLabel: "Renomear", validate: validateFileName, selectStem: n.kind === "file" });
  if (!name || name === n.name) return;
  const to = joinPath(dirName(n.path), name);
  try {
    await renamePath(n.path, to);
    if (n.kind === "dir") project.rekeyFolder(n.path, to);
    else { const d = project.docs.get(n.key); if (d) project.rekeyDoc(d, to); }
    await project.refreshTree();
    updateTitle();
  } catch (e) {
    toast("Não foi possível renomear: " + (e as Error).message, true);
  }
}

async function treeDelete(n: TreeNode) {
  const openInside = [...project.docs.values()].filter((d) => d.path && (d.key === n.key || d.key.startsWith(n.key + "/")));
  const what = n.kind === "dir" ? `a pasta "${n.name}" e todo o seu conteúdo` : `o arquivo "${n.name}"`;
  const extra = openInside.length ? ` (${openInside.length} aba${openInside.length > 1 ? "s" : ""} aberta${openInside.length > 1 ? "s" : ""} será${openInside.length > 1 ? "ão" : ""} fechada${openInside.length > 1 ? "s" : ""})` : "";
  if (!(await confirmDialog(`Enviar ${what} para a lixeira?${extra}`, "Excluir"))) return;
  try {
    await deletePath(n.path);
    for (const d of openInside) project.closeDoc(d.key, true);
    if (!project.order.length) project.newUntitled(prefs.lang);
    await project.refreshTree();
  } catch (e) {
    toast("Não foi possível excluir: " + (e as Error).message, true);
  }
}

function treeMenu(n: TreeNode, x: number, y: number) {
  const isRoot = n.key === project.tree?.key;
  const items: MenuItem[] = [
    { label: "Novo arquivo…", action: () => treeNewFile(n) },
    { label: "Nova pasta…", action: () => treeNewFolder(n) },
  ];
  if (n.kind === "file") {
    items.push({ separator: true });
    items.push({ label: "Abrir", action: () => project.openDoc(n.path) });
    if (n.lang) items.push({ label: "Definir como arquivo principal", checked: project.entryMode === n.key, action: () => project.setEntry(project.entryMode === n.key ? "auto" : n.key) });
  }
  if (!isRoot) {
    items.push({ separator: true });
    items.push({ label: "Renomear…", action: () => treeRename(n) });
    items.push({ label: "Excluir…", danger: true, action: () => treeDelete(n) });
  }
  items.push({ separator: true });
  items.push({ label: "Mostrar no Explorador", action: () => revealPath(n.path) });
  items.push({ label: "Copiar caminho", action: () => navigator.clipboard.writeText(n.path) });
  if (isRoot) {
    items.push({ separator: true });
    items.push({ label: "Atualizar", action: () => project.refreshTree() });
    items.push({ label: "Fechar pasta", action: () => closeFolder() });
  }
  showMenu(items, x, y);
}

async function closeFolder() {
  const dirty = project.dirtyDocs().filter((d) => d.path && project.files.has(d.key));
  if (!(await confirmDiscardDocs(dirty))) return;
  for (const d of [...project.docs.values()]) if (d.path && project.files.has(d.key)) project.closeDoc(d.key, true);
  project.closeRoot();
  prefs.lastRoot = null;
  if (!project.order.length) project.newUntitled(prefs.lang);
  updateTitle();
}

// ---------- exemplos ----------
function buildExamples() {
  const list = $("#examples-list");
  list.innerHTML = "";
  for (const lang of ["studio", "visualg"] as Lang[]) {
    const g = document.createElement("div");
    g.className = "ex-group";
    g.textContent = LANG_INFO[lang].name;
    list.appendChild(g);
    const grid = document.createElement("div");
    grid.className = "ex-grid";
    for (const ex of EXAMPLES.filter((e) => e.lang === lang)) {
      const b = document.createElement("button");
      b.className = "ex-item";
      b.innerHTML = `<span class="ex-title"></span><span class="ex-desc"></span>`;
      b.querySelector(".ex-title")!.textContent = ex.title;
      b.querySelector(".ex-desc")!.textContent = ex.description;
      b.addEventListener("click", () => {
        hideExamples();
        const slug = ex.title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        project.newUntitled(ex.lang, ex.code, `${slug}.${LANG_INFO[ex.lang].ext}`, true, true);
        editor.focus();
      });
      grid.appendChild(b);
    }
    list.appendChild(grid);
  }
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
    else if (k === "b" && !typing) { e.preventDefault(); if (isTauri) setSidebarVisible(sidebar.hidden); }
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
btnSidebar.addEventListener("click", () => setSidebarVisible(sidebar.hidden));
$("#btn-tree-new-file").addEventListener("click", () => (project.root ? treeNewFile(null) : openFolder()));
$("#btn-tree-new-folder").addEventListener("click", () => (project.root ? treeNewFolder(null) : openFolder()));
$("#btn-tree-refresh").addEventListener("click", () => project.refreshTree());
$("#btn-clear").addEventListener("click", () => consolePanel.clear());
$("#btn-theme").addEventListener("click", () => applyTheme(prefs.theme === "dark" ? "light" : "dark"));
$("#btn-examples").addEventListener("click", () => (examplesPanel.hidden ? showExamples() : hideExamples()));
document.querySelectorAll<HTMLButtonElement>(".seg-btn").forEach((b) => b.addEventListener("click", () => switchLang(b.dataset.lang as Lang)));

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
    toast("Não foi possível abrir: " + (e as Error).message, true);
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
        const st = editor.createState(text, d.lang, lines);
        if (d.key === project.active) editor.swap({ state: st, lang: d.lang, scroll: null });
        else d.state = st;
        project.markSaved(d, text);
      } else {
        toast(`"${d.name}" foi modificado fora da IDE. Suas alterações aqui não foram substituídas.`);
        d.savedText = text; // evita avisar de novo; a aba continua suja
      }
    } catch { /* ignora */ }
  }
}

window.addEventListener("beforeunload", (e) => {
  if (!isTauri && project.dirtyDocs().length) e.preventDefault();
});

// ---------- início ----------
if (!project.restoreDrafts()) project.newUntitled(prefs.lang, undefined, undefined, false);
project.activate(project.order[project.order.length - 1]);
refPanelUi.render();
if (prefs.showRef) setRefVisible(true);
renderTree();
renderEntry();
updateTitle();
setupTauri();
editor.focus();
