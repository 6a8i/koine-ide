/**
 * Modelo do projeto: pasta raiz, árvore de arquivos, documentos abertos (abas) e arquivo principal.
 * Não toca no DOM; a interface se liga pelos eventos. As funções puras do fim do arquivo são testáveis em Node.
 */
import { EditorState, StateEffect, TransactionSpec } from "@codemirror/state";
import { Lang } from "./lang/shared/types";
import { LANG_INFO, langFromFilename, detectLang, hasEntryPoint } from "./lang";
import { NEW_STUDIO, NEW_VISUALG } from "./examples";
import { translateSource } from "./lang/i18n";
import { SourceFile } from "./lang/protocol";
import type { Editor } from "./ui/editor";
import type { DirEntry } from "./ui/files";
import { t, getLocale } from "./i18n";

export interface Doc {
  /** chave única: caminho normalizado ou "untitled:N" */
  key: string;
  /** caminho absoluto; null = sem título */
  path: string | null;
  name: string;
  lang: Lang;
  state: EditorState;
  scroll: StateEffect<unknown> | null;
  savedText: string;
  dirty: boolean;
  /** apagado no disco enquanto estava aberto */
  missing: boolean;
  /** abas sem título do mesmo grupo (ex.: um exemplo de vários arquivos) são executadas juntas */
  group?: string;
}

export interface TreeNode {
  name: string;
  path: string;
  key: string;
  kind: "dir" | "file";
  lang?: Lang;
  children?: TreeNode[];
}

/** Acesso ao disco (injetado para o modelo não depender do Tauri). */
export interface ProjectFs {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  listDir(root: string): Promise<DirEntry>;
}

export interface ProjectEvents {
  /** árvore mudou */
  tree(): void;
  /** lista/ordem de abas mudou */
  docs(): void;
  /** aba ativa mudou (depois do swap no editor) */
  active(doc: Doc): void;
  /** nome/sujo/missing de uma aba mudou */
  meta(doc: Doc): void;
  /** arquivo principal mudou */
  entry(): void;
}

export interface RunSet {
  files: SourceFile[];
  entry: string;
  /** caminho relativo -> chave do documento (quando aberto) ou caminho absoluto */
  fileMap: Map<string, string>;
  unsaved: string[];
}

const store = {
  get<T>(k: string, def: T): T {
    try { const v = localStorage.getItem(k); return v === null ? def : (JSON.parse(v) as T); } catch { return def; }
  },
  set(k: string, v: unknown) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignora */ }
  },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignora */ } },
};

export class Project {
  root: string | null = null;
  rootKey = "";
  tree: TreeNode | null = null;
  /** arquivos da árvore por chave */
  files = new Map<string, TreeNode>();
  docs = new Map<string, Doc>();
  order: string[] = [];
  active: string | null = null;
  /** "auto" ou chave do arquivo fixado como principal */
  entryMode: "auto" | string = "auto";
  lastEntry: string | null = null;
  expanded = new Set<string>();
  private untitledSeq = 1;
  private draftTimer = 0;

  constructor(private editor: Editor, private fs: ProjectFs, private ev: ProjectEvents) {}

  get activeDoc(): Doc | null {
    return this.active ? this.docs.get(this.active) ?? null : null;
  }

  get rootName() {
    return this.root ? baseName(this.root) : "";
  }

  // ======================= pasta =======================
  async openRoot(root: string) {
    const entry = await this.fs.listDir(root);
    this.root = root;
    this.rootKey = normKey(root);
    this.tree = toTree(entry, this.rootKey);
    this.files.clear();
    walkFiles(this.tree, (n) => this.files.set(n.key, n));
    const session = store.get<{ open?: string[]; active?: string; entry?: string; expanded?: string[] }>("session:" + this.rootKey, {});
    this.expanded = new Set(session.expanded ?? [this.tree.key]);
    this.entryMode = session.entry && this.files.has(session.entry) ? session.entry : "auto";
    this.lastEntry = null;
    // recentes
    const recents = store.get<string[]>("recentProjects", []).filter((r) => normKey(r) !== this.rootKey);
    store.set("recentProjects", [root, ...recents].slice(0, 8));
    this.ev.tree();
    this.ev.entry();
    // reabre as abas da sessão anterior
    for (const k of session.open ?? []) {
      const node = this.files.get(k);
      if (node) await this.openDoc(node.path, false).catch(() => null);
    }
    if (session.active && this.docs.has(session.active)) this.activate(session.active);
    else if (!this.active && this.order.length) this.activate(this.order[this.order.length - 1]);
    this.saveSession();
  }

  closeRoot() {
    this.root = null;
    this.rootKey = "";
    this.tree = null;
    this.files.clear();
    this.entryMode = "auto";
    this.ev.tree();
    this.ev.entry();
  }

  async refreshTree() {
    if (!this.root) return;
    try {
      const entry = await this.fs.listDir(this.root);
      this.tree = toTree(entry, this.rootKey);
      this.files.clear();
      walkFiles(this.tree, (n) => this.files.set(n.key, n));
    } catch {
      return;
    }
    for (const d of this.docs.values()) {
      if (d.path && isInside(this.rootKey, d.key)) {
        const missing = !this.files.has(d.key);
        if (missing !== d.missing) { d.missing = missing; this.ev.meta(d); }
      }
    }
    if (this.entryMode !== "auto" && !this.files.has(this.entryMode)) { this.entryMode = "auto"; this.ev.entry(); }
    this.ev.tree();
  }

  recentProjects(): string[] {
    return store.get<string[]>("recentProjects", []);
  }
  forgetRecent(root: string) {
    store.set("recentProjects", this.recentProjects().filter((r) => normKey(r) !== normKey(root)));
  }

  toggleExpanded(key: string) {
    if (this.expanded.has(key)) this.expanded.delete(key); else this.expanded.add(key);
    this.saveSession();
    this.ev.tree();
  }

  saveSession() {
    if (!this.rootKey) return;
    store.set("session:" + this.rootKey, {
      open: this.order.filter((k) => this.files.has(k)),
      active: this.active && this.files.has(this.active) ? this.active : undefined,
      entry: this.entryMode === "auto" ? undefined : this.entryMode,
      expanded: [...this.expanded],
    });
  }

  // ======================= documentos =======================
  /** Caminho relativo à raiz (com "/"), ou o nome quando é externo/sem título. */
  rel(doc: Doc | TreeNode): string {
    const p = "path" in doc && doc.path ? doc.path : null;
    if (p && this.root && isInside(this.rootKey, normKey(p))) return relPath(this.root, p);
    return doc.name;
  }

  async openDoc(path: string, activate = true): Promise<Doc> {
    const key = normKey(path);
    let doc = this.docs.get(key);
    if (!doc) {
      const text = await this.fs.read(path);
      const name = baseName(path);
      const lang = langFromFilename(name) ?? detectLang(text, getLocale());
      const bps = this.persistedBreakpoints(relPath(this.root ?? dirName(path), path));
      doc = { key, path, name, lang, state: this.editor.createState(text, lang, bps), scroll: null, savedText: text, dirty: false, missing: false };
      this.docs.set(key, doc);
      this.order.push(key);
      this.ev.docs();
    }
    if (activate) this.activate(key);
    this.saveSession();
    return doc;
  }

  /** Abre um texto sem caminho (arquivo do navegador, exemplo, novo). */
  newUntitled(lang: Lang, text?: string, name?: string, activate = true, clean = text === undefined, group?: string): Doc {
    const n = this.untitledSeq++;
    const key = "untitled:" + n;
    const content = text ?? translateSource(lang, lang === "visualg" ? NEW_VISUALG : NEW_STUDIO, "pt-BR", getLocale());
    const doc: Doc = {
      key, path: null, name: name ?? `${t("sem título")}${n > 1 ? "-" + n : ""}.${LANG_INFO[lang].ext}`, lang,
      state: this.editor.createState(content, lang), scroll: null, savedText: clean ? content : "\0", dirty: !clean, missing: false,
      group,
    };
    this.docs.set(key, doc);
    this.order.push(key);
    this.ev.docs();
    if (activate) this.activate(key);
    if (!this.restoring) this.saveDrafts();
    return doc;
  }
  private restoring = false;

  activate(key: string) {
    const doc = this.docs.get(key);
    if (!doc || key === this.active) return;
    const prev = this.activeDoc;
    // `active` muda antes do swap para que os callbacks do editor (cursor, pontos de parada) já vejam o novo documento
    this.active = key;
    this.editor.swap(doc, (state, scroll) => { if (prev) { prev.state = state; prev.scroll = scroll; } });
    this.ev.active(doc);
    this.saveSession();
  }

  /** Estado atual do documento (o ativo vive no editor). */
  stateOf(doc: Doc): EditorState {
    return doc.key === this.active ? this.editor.view.state : doc.state;
  }
  textOf(doc: Doc): string {
    return this.stateOf(doc).doc.toString();
  }

  /** Aplica uma transação a um documento, esteja ele no editor ou em segundo plano. */
  applyToDoc(key: string, spec: TransactionSpec) {
    const doc = this.docs.get(key);
    if (!doc) return;
    if (key === this.active) this.editor.view.dispatch(spec);
    else doc.state = doc.state.update(spec).state;
  }

  /** Chamado pelo editor quando o texto ativo muda. */
  noteChange() {
    const doc = this.activeDoc;
    if (doc) this.noteChangeOf(doc);
  }

  /** Recalcula sujo/rascunho de um documento (ativo ou não) depois de uma mudança programática. */
  noteChangeOf(doc: Doc) {
    const dirty = this.textOf(doc) !== doc.savedText;
    if (dirty !== doc.dirty) { doc.dirty = dirty; this.ev.meta(doc); }
    if (!doc.path) {
      clearTimeout(this.draftTimer);
      this.draftTimer = window.setTimeout(() => this.saveDrafts(), 400);
    }
  }

  markSaved(doc: Doc, text: string) {
    doc.savedText = text;
    doc.dirty = false;
    doc.missing = false;
    this.ev.meta(doc);
  }

  /** Reposiciona um documento salvo/renomeado para outro caminho. */
  rekeyDoc(doc: Doc, newPath: string) {
    const oldKey = doc.key;
    const newKey = normKey(newPath);
    if (oldKey !== newKey && this.docs.has(newKey)) {
      // já havia uma aba desse caminho: fecha a antiga
      this.closeDoc(newKey, true);
    }
    this.docs.delete(oldKey);
    doc.key = newKey;
    doc.path = newPath;
    doc.name = baseName(newPath);
    const lang = langFromFilename(doc.name);
    if (lang && lang !== doc.lang) { doc.lang = lang; if (oldKey === this.active) this.editor.setLang(lang); }
    this.docs.set(newKey, doc);
    this.order = this.order.map((k) => (k === oldKey ? newKey : k));
    if (this.active === oldKey) this.active = newKey;
    if (this.entryMode === oldKey) this.entryMode = newKey;
    if (this.lastEntry === oldKey) this.lastEntry = newKey;
    this.ev.docs();
    this.ev.meta(doc);
    this.saveDrafts();
    this.saveSession();
  }

  /** Quando uma pasta é renomeada, atualiza as abas dentro dela. */
  rekeyFolder(oldPath: string, newPath: string) {
    const oldKey = normKey(oldPath);
    for (const d of [...this.docs.values()]) {
      if (d.path && isInside(oldKey, d.key)) this.rekeyDoc(d, newPath + d.path.slice(oldPath.length));
    }
  }

  closeDoc(key: string, force = false): boolean {
    const doc = this.docs.get(key);
    if (!doc) return true;
    if (doc.dirty && !force) return false;
    const idx = this.order.indexOf(key);
    this.order.splice(idx, 1);
    this.docs.delete(key);
    if (this.active === key) {
      this.active = null;
      const next = this.order[idx] ?? this.order[idx - 1];
      if (next) this.activate(next);
    }
    this.ev.docs();
    this.saveDrafts();
    this.saveSession();
    return true;
  }

  dirtyDocs(): Doc[] {
    return this.order.map((k) => this.docs.get(k)!).filter((d) => d.dirty);
  }

  // ======================= rascunhos (docs sem título) =======================
  saveDrafts() {
    const drafts = this.order
      .map((k) => this.docs.get(k)!)
      .filter((d) => !d.path)
      .map((d) => ({ lang: d.lang, name: d.name, text: this.textOf(d), dirty: d.dirty, group: d.group }));
    if (drafts.length) store.set("drafts", drafts); else store.del("drafts");
  }

  restoreDrafts(): boolean {
    let drafts = store.get<{ lang: Lang; name: string; text: string; dirty: boolean; group?: string }[]>("drafts", []);
    // migra o rascunho único da versão anterior
    const legacy = localStorage.getItem("draft");
    if (legacy !== null) {
      const lang = (localStorage.getItem("lang") as Lang) ?? "studio";
      drafts = [{ lang, name: t("sem título") + "." + LANG_INFO[lang].ext, text: legacy, dirty: legacy !== (lang === "visualg" ? NEW_VISUALG : NEW_STUDIO) }, ...drafts];
      localStorage.removeItem("draft");
    }
    this.restoring = true;
    for (const d of drafts) this.newUntitled(d.lang, d.text, d.name, false, !d.dirty, d.group);
    this.restoring = false;
    this.saveDrafts();
    return drafts.length > 0;
  }

  // ======================= pontos de parada =======================
  private bpKey() {
    return "bp:" + (this.rootKey || "-");
  }
  persistedBreakpoints(rel: string): number[] {
    return store.get<Record<string, number[]>>(this.bpKey(), {})[rel] ?? [];
  }
  /** Guarda os pontos de parada do documento ativo. */
  persistBreakpoints(lines: number[]) {
    const doc = this.activeDoc;
    if (!doc || !doc.path) return;
    const all = store.get<Record<string, number[]>>(this.bpKey(), {});
    const rel = this.rel(doc);
    if (lines.length) all[rel] = lines; else delete all[rel];
    store.set(this.bpKey(), all);
  }

  // ======================= arquivo principal =======================
  setEntry(mode: "auto" | string) {
    this.entryMode = mode;
    this.saveSession();
    this.ev.entry();
  }

  /** Monta o conjunto de arquivos da execução para a linguagem dada. Com `needEntry = false` (testes) não exige ponto de entrada. */
  async collectRunFiles(lang: Lang, needEntry = true): Promise<RunSet | { error: string }> {
    const files: SourceFile[] = [];
    const fileMap = new Map<string, string>();
    const unsaved: string[] = [];
    const active = this.activeDoc;
    if (this.root) {
      for (const node of this.files.values()) {
        if (node.lang !== lang) continue;
        const doc = this.docs.get(node.key);
        let source: string;
        if (doc) { source = this.textOf(doc); if (doc.dirty) unsaved.push(doc.name); }
        else {
          try { source = await this.fs.read(node.path); } catch { continue; }
        }
        const rel = relPath(this.root, node.path);
        files.push({ path: rel, source });
        fileMap.set(rel, node.key);
      }
    }
    if (active && active.lang === lang && !fileMap.has(this.rel(active)) && !(active.path && this.files.has(active.key))) {
      files.push({ path: active.name, source: this.textOf(active) });
      fileMap.set(active.name, active.key);
      if (active.dirty && active.path) unsaved.push(active.name);
    }
    // as outras abas sem título do mesmo grupo (exemplo de vários arquivos) entram junto
    if (active?.group) {
      for (const k of this.order) {
        const d = this.docs.get(k)!;
        if (d === active || d.path || d.group !== active.group || d.lang !== lang || fileMap.has(d.name)) continue;
        files.push({ path: d.name, source: this.textOf(d) });
        fileMap.set(d.name, d.key);
      }
    }
    if (!needEntry) {
      if (!files.length) return { error: t("Nenhum arquivo {lang} para testar.", { lang: LANG_INFO[lang].name }) };
      return { files, entry: "", fileMap, unsaved };
    }
    const candidates = files.map((f) => ({ path: f.path, hasEntry: hasEntryPoint(lang, f.source, getLocale()) }));
    const entry = resolveEntry({
      candidates,
      pinned: this.entryMode === "auto" ? null : [...fileMap.entries()].find(([, k]) => k === this.entryMode)?.[0] ?? null,
      active: active && active.lang === lang ? [...fileMap.entries()].find(([, k]) => k === active.key)?.[0] ?? null : null,
      last: this.lastEntry ? [...fileMap.entries()].find(([, k]) => k === this.lastEntry)?.[0] ?? null : null,
    });
    if (!entry) {
      if (this.entryMode !== "auto") { this.entryMode = "auto"; this.ev.entry(); }
      return { error: files.length ? t("Nenhum arquivo {lang} tem um ponto de entrada ({entry}).", { lang: LANG_INFO[lang].name, entry: lang === "visualg" ? "algoritmo" : "funcao inicio" }) : t("Nenhum arquivo {lang} para executar.", { lang: LANG_INFO[lang].name }) };
    }
    this.lastEntry = fileMap.get(entry) ?? null;
    return { files, entry, fileMap, unsaved };
  }
}

// ======================= funções puras =======================

export function baseName(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}
export function dirName(p: string) {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i <= 0 ? p : p.slice(0, i);
}

/** Chave normalizada de um caminho: "/" como separador, sem barra final, minúsculas no Windows. */
export function normKey(p: string): string {
  let k = p.replace(/\\/g, "/").replace(/\/+$/, "");
  if (/^[a-z]:\//i.test(k) || k.startsWith("//")) k = k.toLowerCase();
  return k;
}

export function isInside(rootKey: string, key: string): boolean {
  return key === rootKey || key.startsWith(rootKey + "/");
}

/** Caminho relativo à raiz, com "/" (os dois absolutos). */
export function relPath(root: string, p: string): string {
  const r = normKey(root), k = normKey(p);
  if (isInside(r, k)) {
    // mantém a grafia original do trecho relativo
    return p.replace(/\\/g, "/").slice(r.length + 1);
  }
  return baseName(p);
}

export interface EntryInput {
  candidates: { path: string; hasEntry: boolean }[];
  pinned: string | null;
  active: string | null;
  last: string | null;
}

/**
 * Regra do arquivo principal: fixado → aba ativa com entrada → principal/main → último usado →
 * único arquivo com entrada → nenhum.
 */
export function resolveEntry(i: EntryInput): string | null {
  const has = (p: string | null) => !!p && i.candidates.some((c) => c.path === p && c.hasEntry);
  if (has(i.pinned)) return i.pinned;
  if (has(i.active)) return i.active;
  const named = i.candidates.filter((c) => c.hasEntry && /^(principal|main)\.[a-z]+$/i.test(baseName(c.path)));
  if (named.length) return named.sort((a, b) => a.path.length - b.path.length)[0].path;
  if (has(i.last)) return i.last;
  const withEntry = i.candidates.filter((c) => c.hasEntry);
  if (withEntry.length === 1) return withEntry[0].path;
  return null;
}

function toTree(e: DirEntry, rootKey: string): TreeNode {
  const key = normKey(e.path);
  const node: TreeNode = { name: e.name, path: e.path, key, kind: e.kind };
  if (e.kind === "file") node.lang = langFromFilename(e.name) ?? undefined;
  else node.children = (e.children ?? []).map((c) => toTree(c, rootKey));
  return node;
}

function walkFiles(n: TreeNode, f: (n: TreeNode) => void) {
  if (n.kind === "file") f(n);
  else for (const c of n.children ?? []) walkFiles(c, f);
}
