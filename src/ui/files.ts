/** Abertura/salvamento de arquivos: usa o Tauri quando disponível; no navegador usa fallbacks. */

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const FILTERS = [
  { name: "Programas Portugol", extensions: ["por", "alg"] },
  { name: "Portugol Studio", extensions: ["por"] },
  { name: "VisuAlg", extensions: ["alg"] },
  { name: "Todos os arquivos", extensions: ["*"] },
];

export interface OpenedFile {
  path: string | null;
  name: string;
  content: string;
}

export async function openFile(): Promise<OpenedFile | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, directory: false, filters: FILTERS, title: "Abrir programa" });
    if (!path) return null;
    const content = await readTextFile(path);
    return { path, name: baseName(path), content };
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".por,.alg,.txt";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      resolve({ path: null, name: f.name, content: await f.text() });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function inv<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export async function readTextFile(path: string): Promise<string> {
  return inv<string>("read_file", { path });
}
export async function writeTextFile(path: string, content: string): Promise<void> {
  await inv("write_file", { path, content });
}

// ---------- projeto (pasta) ----------
export interface DirEntry {
  name: string;
  path: string;
  kind: "dir" | "file";
  children?: DirEntry[];
}
export interface PathInfo { exists: boolean; isDir: boolean; mtimeMs: number }

/** Pergunta uma pasta ao usuário (só no Tauri). */
export async function pickFolder(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const p = await open({ directory: true, multiple: false, title: "Abrir pasta do projeto" });
  return typeof p === "string" ? p : null;
}
/** Lista recursivamente a pasta (só .por/.alg e subpastas). */
export const listDir = (root: string) => inv<DirEntry>("list_dir", { root });
export const statPath = (path: string) => inv<PathInfo>("stat_path", { path });
export const createFile = (path: string, content = "") => inv<void>("create_file", { path, content });
export const createDir = (path: string) => inv<void>("create_dir", { path });
export const renamePath = (from: string, to: string) => inv<void>("rename_path", { from, to });
/** Envia para a lixeira. */
export const deletePath = (path: string) => inv<void>("delete_path", { path });
export const revealPath = (path: string) => inv<void>("reveal_path", { path });
/** Caminho passado na linha de comando (arquivo ou pasta). */
export const startupPath = () => inv<{ path: string; isDir: boolean } | null>("startup_path");

export function dirName(p: string) {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i <= 0 ? p : p.slice(0, i);
}
export function joinPath(dir: string, name: string) {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return dir.replace(/[\\/]+$/, "") + sep + name;
}

export async function readPath(path: string): Promise<OpenedFile | null> {
  if (!isTauri) return null;
  const content = await readTextFile(path);
  return { path, name: baseName(path), content };
}

/** Salva; se `path` for nulo (ou forceDialog), pergunta onde. Retorna o caminho usado ou null se cancelado. */
export async function saveFile(content: string, path: string | null, suggestedName: string, forceDialog = false): Promise<{ path: string | null; name: string } | null> {
  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    let target = path;
    if (!target || forceDialog) {
      target = await save({ defaultPath: path ?? suggestedName, filters: FILTERS, title: "Salvar programa" });
      if (!target) return null;
      if (!/\.[^./\\]+$/.test(target)) target += "." + (suggestedName.split(".").pop() ?? "por");
    }
    await writeTextFile(target, content);
    return { path: target, name: baseName(target) };
  }
  // navegador: download
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return { path: null, name: suggestedName };
}

export async function confirmDialog(message: string, title = "Portugol IDE"): Promise<boolean> {
  if (isTauri) {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return ask(message, { title, kind: "warning", okLabel: "Sim", cancelLabel: "Não" });
  }
  return window.confirm(message);
}

export async function setWindowTitle(title: string) {
  if (isTauri) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setTitle(title);
    } catch { /* ignora */ }
  }
  document.title = title;
}

export function baseName(p: string) {
  return p.split(/[\\/]/).pop() ?? p;
}
