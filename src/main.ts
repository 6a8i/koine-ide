import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { Editor } from "./ui/editor";
import { ConsolePanel } from "./ui/console";
import { VariablesPanel } from "./ui/variables";
import { ReferencePanel } from "./ui/reference";
import { Runner } from "./runner";
import { Lang } from "./lang/shared/types";
import { DebugCommand, Snapshot } from "./lang/shared/debug";
import { LANG_INFO, langFromFilename, detectLang } from "./lang";
import { EXAMPLES, NEW_STUDIO, NEW_VISUALG } from "./examples";
import { openFile, saveFile, confirmDialog, setWindowTitle, isTauri, readPath } from "./ui/files";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

// ---------- estado ----------
interface AppState {
  lang: Lang;
  path: string | null;
  name: string;
  dirty: boolean;
  savedText: string;
}
const state: AppState = { lang: "studio", path: null, name: "sem título.por", dirty: false, savedText: NEW_STUDIO };

const prefs = {
  get theme() { return localStorage.getItem("theme") ?? "dark"; },
  set theme(v: string) { localStorage.setItem("theme", v); },
  get lang(): Lang { return (localStorage.getItem("lang") as Lang) ?? "studio"; },
  set lang(v: Lang) { localStorage.setItem("lang", v); },
  get consoleH() { return Number(localStorage.getItem("consoleH") ?? 240); },
  set consoleH(v: number) { localStorage.setItem("consoleH", String(v)); },
  get draft() { return localStorage.getItem("draft"); },
  set draft(v: string | null) { if (v === null) localStorage.removeItem("draft"); else localStorage.setItem("draft", v); },
  get showVars() { return localStorage.getItem("showVars") !== "0"; },
  set showVars(v: boolean) { localStorage.setItem("showVars", v ? "1" : "0"); },
  get showRef() { return localStorage.getItem("showRef") === "1"; },
  set showRef(v: boolean) { localStorage.setItem("showRef", v ? "1" : "0"); },
};

// ---------- tema ----------
function applyTheme(t: string) {
  document.documentElement.dataset.theme = t;
  prefs.theme = t;
}
applyTheme(prefs.theme);

// ---------- elementos ----------
const btnRun = $<HTMLButtonElement>("#btn-run");
const btnDebug = $<HTMLButtonElement>("#btn-debug");
const btnStop = $<HTMLButtonElement>("#btn-stop");
const debugControls = $("#debug-controls");
const btnContinue = $<HTMLButtonElement>("#btn-continue"), btnPause = $<HTMLButtonElement>("#btn-pause");
const btnStepOver = $<HTMLButtonElement>("#btn-step-over"), btnStepInto = $<HTMLButtonElement>("#btn-step-into"), btnStepOut = $<HTMLButtonElement>("#btn-step-out");
const runState = $("#run-state");
const stFile = $("#st-file"), stDirty = $("#st-dirty"), stPos = $("#st-pos"), stLang = $("#st-lang"), stTime = $("#st-time");
const examplesPanel = $("#examples-panel");
const varsPane = $("#vars-pane"), varsState = $("#vars-state"), btnVars = $<HTMLButtonElement>("#btn-vars");
const refPanel = $("#ref-panel"), btnReference = $<HTMLButtonElement>("#btn-reference"), refLang = $("#ref-lang");

// ---------- console e variáveis ----------
const consolePanel = new ConsolePanel($("#console"));
const varsPanel = new VariablesPanel(varsPane);
varsPanel.onGoTo = (l) => editor.goTo(l);
varsPanel.clear();

function setVarsState(cls: string, text: string) {
  varsState.className = "vars-state " + cls;
  varsState.textContent = text;
}

/** Guarda o último estado das variáveis: usado na dica do editor e no painel. */
function applySnapshot(snap: Snapshot | null, live: boolean, label: string) {
  editor.snapshot = snap;
  if (snap) varsPanel.render(snap, state.lang, live);
  else varsPanel.clear();
  setVarsState(live ? "live" : "", label);
}

// ---------- runner ----------
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
    consolePanel.error(`${prefix}: ${e.message}`, e.line, e.col);
    if (e.line > 0) editor.showError(e.line, e.col, e.message);
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
  paused: (line, col, snap) => {
    consolePanel.hideInput();
    editor.setDebugLine(line);
    applySnapshot(snap, true, `pausado na linha ${line}`);
    setVarsState("paused", `pausado na linha ${line}`);
    setRunState("paused", `pausado na linha ${line}`);
    setDebugButtons(true);
    void col;
  },
  resumed: () => {
    editor.setDebugLine(null);
    setRunState("running", "executando");
    setVarsState("live", "ao vivo");
    setDebugButtons(false);
  },
  snapshot: (snap) => applySnapshot(snap, true, "ao vivo"),
});
consolePanel.onSubmit = (v) => { runner.sendInput(v); setRunState("running", "executando"); };
consolePanel.onGoTo = (l, c) => editor.goTo(l, c);

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
  if (!on) { editor.setDebugLine(null); setDebugButtons(false); }
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
  { key: "Ctrl-o", mac: "Cmd-o", run: () => { openProgram(); return true; } },
  { key: "Ctrl-n", mac: "Cmd-n", run: () => { newProgram(); return true; } },
  { key: "Ctrl-l", mac: "Cmd-l", run: () => { consolePanel.clear(); return true; } },
]));

const initialLang = prefs.lang;
const draft = prefs.draft;
const editor = new Editor($("#editor"), initialLang, draft ?? (initialLang === "visualg" ? NEW_VISUALG : NEW_STUDIO), shortcuts);
state.lang = initialLang;
state.savedText = draft ?? editor.text;
state.name = "sem título." + LANG_INFO[initialLang].ext;
if (draft !== null) state.dirty = draft !== (initialLang === "visualg" ? NEW_VISUALG : NEW_STUDIO);

editor.onCursor = (l, c) => { stPos.textContent = `Ln ${l}, Col ${c}`; };
editor.onBreakpoints = (lines) => runner.setBreakpoints(lines);
let draftTimer = 0;
editor.onChange = () => {
  setDirty(editor.text !== state.savedText);
  editor.clearError();
  clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => { prefs.draft = state.path ? null : editor.text; }, 400);
};

function setDirty(d: boolean) {
  state.dirty = d;
  stDirty.hidden = !d;
  updateTitle();
}

function updateTitle() {
  stFile.textContent = state.path ?? state.name;
  stFile.title = state.path ?? "";
  setWindowTitle(`${state.dirty ? "● " : ""}${state.name} — Portugol IDE`);
}

function setLang(lang: Lang, swapTemplate = true) {
  const prev = state.lang;
  state.lang = lang;
  prefs.lang = lang;
  editor.setLang(lang);
  document.querySelectorAll<HTMLButtonElement>(".seg-btn").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.lang === lang)));
  stLang.textContent = LANG_INFO[lang].name;
  refLang.textContent = LANG_INFO[lang].name;
  refPanelUi.setLang(lang);
  if (swapTemplate && prev !== lang) {
    // se o editor só tem o modelo vazio da outra linguagem, troca pelo modelo desta
    const cur = editor.text.trim();
    if (cur === NEW_STUDIO.trim() || cur === NEW_VISUALG.trim() || cur === "") {
      editor.setText(lang === "visualg" ? NEW_VISUALG : NEW_STUDIO);
      state.savedText = editor.text;
      setDirty(false);
    }
  }
  if (!state.path && /^sem título\./.test(state.name)) { state.name = "sem título." + LANG_INFO[lang].ext; updateTitle(); }
}
setLang(initialLang, false);
updateTitle();
refPanelUi.render();
if (prefs.showRef) setRefVisible(true);

// ---------- ações ----------
function runProgram(debug = false) {
  if (runner.running) return;
  consolePanel.clear();
  editor.clearError();
  stTime.textContent = "";
  applySnapshot(null, debug, debug ? "iniciando…" : "");
  setRunState("running", debug ? "depurando" : "executando");
  const bps = editor.breakpoints;
  runner.run(state.lang, editor.text, debug ? { breakpoints: bps } : undefined);
  setRunning(true);
  if (debug) {
    setDebugButtons(false);
    if (!bps.length) consolePanel.system("Depuração iniciada: nenhum ponto de parada, o programa vai pausar na primeira linha. Use Passo (F10) para avançar.");
    else consolePanel.system(`Depuração iniciada: executando até o primeiro ponto de parada (linhas ${bps.join(", ")}).`);
  }
}

function stopProgram() {
  if (runner.running) runner.stop();
}

async function confirmDiscard(): Promise<boolean> {
  if (!state.dirty) return true;
  return confirmDialog(`"${state.name}" tem alterações não salvas. Deseja descartá-las?`, "Alterações não salvas");
}

async function newProgram() {
  if (!(await confirmDiscard())) return;
  stopProgram();
  loadDocument(state.lang === "visualg" ? NEW_VISUALG : NEW_STUDIO, null, "sem título." + LANG_INFO[state.lang].ext, state.lang);
  editor.focus();
}

function loadDocument(text: string, path: string | null, name: string, lang: Lang) {
  editor.setText(text);
  state.path = path;
  state.name = name;
  state.savedText = text;
  prefs.draft = path ? null : text;
  setLang(lang, false);
  setDirty(false);
  consolePanel.clear();
  setRunState("", "");
  stTime.textContent = "";
  applySnapshot(null, false, "");
  editor.clearBreakpoints();
}

async function openProgram() {
  if (!(await confirmDiscard())) return;
  try {
    const f = await openFile();
    if (!f) return;
    stopProgram();
    const lang = langFromFilename(f.name) ?? detectLang(f.content);
    loadDocument(f.content, f.path, f.name, lang);
    editor.focus();
  } catch (e) {
    toast("Não foi possível abrir o arquivo: " + (e as Error).message, true);
  }
}

async function save(as: boolean) {
  try {
    const suggested = state.path ? state.name : `programa.${LANG_INFO[state.lang].ext}`;
    const r = await saveFile(editor.text, state.path, suggested, as);
    if (!r) return;
    state.path = r.path;
    state.name = r.name;
    state.savedText = editor.text;
    if (r.path) prefs.draft = null;
    const l = langFromFilename(r.name);
    if (l && l !== state.lang) setLang(l, false);
    setDirty(false);
    toast(isTauri ? `Salvo em ${r.path}` : "Download iniciado");
  } catch (e) {
    toast("Não foi possível salvar: " + (e as Error).message, true);
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
      b.addEventListener("click", async () => {
        hideExamples();
        if (!(await confirmDiscard())) return;
        stopProgram();
        const slug = ex.title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        loadDocument(ex.code, null, `${slug}.${LANG_INFO[ex.lang].ext}`, ex.lang);
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
  if ((e.target as HTMLElement).closest?.(".cm-editor")) return;
  if (e.key === "F5") { e.preventDefault(); if (e.shiftKey) stopProgram(); else runProgram(); }
  else if (e.key === "F6") { e.preventDefault(); runProgram(true); }
  else if (e.key === "F8") { e.preventDefault(); debugCmd("continue"); }
  else if (e.key === "F10") { e.preventDefault(); debugCmd("over"); }
  else if (e.key === "F11") { e.preventDefault(); debugCmd(e.shiftKey ? "out" : "into"); }
  else if (e.key === "F1") { e.preventDefault(); toggleReference(false); }
  else if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === "s") { e.preventDefault(); save(e.shiftKey); }
    else if (k === "o") { e.preventDefault(); openProgram(); }
    else if (k === "n") { e.preventDefault(); newProgram(); }
    else if (k === "l") { e.preventDefault(); consolePanel.clear(); }
    else if (k === "enter") { e.preventDefault(); runProgram(); }
  }
});

// ---------- botões ----------
$("#btn-new").addEventListener("click", newProgram);
$("#btn-open").addEventListener("click", openProgram);
$("#btn-save").addEventListener("click", () => save(false));
btnRun.addEventListener("click", () => runProgram());
btnDebug.addEventListener("click", () => runProgram(true));
btnStop.addEventListener("click", stopProgram);
btnContinue.addEventListener("click", () => debugCmd("continue"));
btnPause.addEventListener("click", () => debugCmd("pause"));
btnStepOver.addEventListener("click", () => debugCmd("over"));
btnStepInto.addEventListener("click", () => debugCmd("into"));
btnStepOut.addEventListener("click", () => debugCmd("out"));
btnReference.addEventListener("click", () => toggleReference(false));
$("#btn-clear").addEventListener("click", () => consolePanel.clear());
$("#btn-theme").addEventListener("click", () => applyTheme(prefs.theme === "dark" ? "light" : "dark"));
$("#btn-examples").addEventListener("click", () => (examplesPanel.hidden ? showExamples() : hideExamples()));
document.querySelectorAll<HTMLButtonElement>(".seg-btn").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang as Lang)));

// ---------- splitter ----------
const workspace = $("#main-col");
const splitter = $("#splitter");
function setConsoleH(h: number) {
  const max = workspace.clientHeight - 120;
  h = Math.max(80, Math.min(max, h));
  workspace.style.setProperty("--console-h", h + "px");
  prefs.consoleH = h;
}
setConsoleH(prefs.consoleH);
splitter.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  splitter.setPointerCapture(e.pointerId);
  splitter.classList.add("dragging");
  const startY = e.clientY;
  const startH = $("#console-pane").clientHeight;
  const move = (ev: PointerEvent) => setConsoleH(startH + (startY - ev.clientY));
  const up = () => {
    splitter.classList.remove("dragging");
    splitter.removeEventListener("pointermove", move);
    splitter.removeEventListener("pointerup", up);
  };
  splitter.addEventListener("pointermove", move);
  splitter.addEventListener("pointerup", up);
});
splitter.addEventListener("dblclick", () => setConsoleH(240));
window.addEventListener("resize", () => setConsoleH(prefs.consoleH));

// ---------- arrastar arquivo para a janela / abrir por argumento ----------
async function setupTauri() {
  if (!isTauri) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.onDragDropEvent(async (ev) => {
      if (ev.payload.type !== "drop" || !ev.payload.paths.length) return;
      const p = ev.payload.paths[0];
      if (!(await confirmDiscard())) return;
      const f = await readPath(p);
      if (f) loadDocument(f.content, f.path, f.name, langFromFilename(f.name) ?? detectLang(f.content));
    });
    await win.onCloseRequested(async (ev) => {
      if (state.dirty && !(await confirmDiscard())) ev.preventDefault();
    });
    // arquivo passado por argumento (clique duplo num .por/.alg)
    const { invoke } = await import("@tauri-apps/api/core");
    const arg = await invoke<string | null>("startup_file").catch(() => null);
    if (arg) {
      const f = await readPath(arg);
      if (f) loadDocument(f.content, f.path, f.name, langFromFilename(f.name) ?? detectLang(f.content));
    }
  } catch (e) {
    console.warn("Integração Tauri indisponível:", e);
  }
}
setupTauri();

window.addEventListener("beforeunload", (e) => {
  if (!isTauri && state.dirty) { e.preventDefault(); }
});

editor.focus();
