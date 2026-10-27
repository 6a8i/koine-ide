/**
 * Ligador de módulos: resolve `importe` por nome ou caminho, detecta ciclos e produz a ordem
 * topológica (módulos importados antes de quem os importa). Independente da linguagem.
 */
import { PortugolError } from "./types";

export interface RawImport {
  /** nome do módulo (importe Nome) */
  name?: string;
  /** caminho relativo ao arquivo que importa (importe "lib/x.por") */
  path?: string;
  alias: string;
  line: number;
  col: number;
}

export interface RawModuleHeader {
  fileIndex: number;
  /** caminho relativo à raiz do projeto, com "/" */
  file: string;
  /** nome declarado com `modulo` (ou derivado do arquivo) */
  moduleName: string;
  /** true se o arquivo pode ser importado (biblioteca) */
  importable: boolean;
  imports: RawImport[];
}

export interface LinkedImport<M> {
  target: M;
  alias: string;
}

export interface LinkResult<M> {
  /** módulos alcançáveis a partir da entrada, em ordem topológica (entrada por último) */
  order: M[];
  resolved: Map<M, LinkedImport<M>[]>;
}

export function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

export function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

export function stemOf(p: string): string {
  const base = p.slice(p.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function linkModules<M extends RawModuleHeader>(mods: M[], entry: M, caseInsensitive: boolean): LinkResult<M> {
  const fold = (s: string) => (caseInsensitive ? s.toLowerCase() : s);
  const byName = new Map<string, M>();
  const byPath = new Map<string, M>();
  for (const m of mods) {
    byPath.set(fold(normalizePath(m.file)), m);
    if (!m.importable) continue;
    const key = fold(m.moduleName);
    const other = byName.get(key);
    if (other) {
      throw new PortugolError(`Há dois módulos chamados "${m.moduleName}": ${other.file} e ${m.file}. Dê nomes diferentes com "modulo"`, 1, 1, "sintaxe", m.fileIndex);
    }
    byName.set(key, m);
  }

  const resolved = new Map<M, LinkedImport<M>[]>();
  const resolveImport = (from: M, imp: RawImport): M => {
    let target: M | undefined;
    if (imp.path !== undefined) {
      const full = normalizePath((dirOf(from.file) ? dirOf(from.file) + "/" : "") + imp.path);
      target = byPath.get(fold(full)) ?? byPath.get(fold(normalizePath(imp.path)));
      if (!target) {
        throw new PortugolError(`O arquivo "${imp.path}" não foi encontrado no projeto. Arquivos disponíveis: ${mods.map((m) => m.file).join(", ")}`, imp.line, imp.col, "sintaxe", from.fileIndex);
      }
      if (!target.importable) {
        throw new PortugolError(`"${target.file}" é um programa principal e não pode ser importado. Só arquivos de módulo (sem "inicio"/"algoritmo") podem ser importados`, imp.line, imp.col, "sintaxe", from.fileIndex);
      }
    } else {
      target = byName.get(fold(imp.name!));
      if (!target) {
        const available = [...byName.values()].map((m) => m.moduleName);
        throw new PortugolError(
          `O módulo "${imp.name}" não foi encontrado no projeto.` + (available.length ? ` Módulos disponíveis: ${available.join(", ")}` : " Nenhum arquivo do projeto declara um módulo."),
          imp.line, imp.col, "sintaxe", from.fileIndex,
        );
      }
    }
    if (target === from) throw new PortugolError("Um módulo não pode importar a si mesmo", imp.line, imp.col, "sintaxe", from.fileIndex);
    return target;
  };

  const order: M[] = [];
  const state = new Map<M, "visiting" | "done">();
  const stack: M[] = [];
  const visit = (m: M) => {
    const st = state.get(m);
    if (st === "done") return;
    if (st === "visiting") {
      const cycle = [...stack.slice(stack.indexOf(m)), m].map((x) => x.moduleName).join(" → ");
      const importer = stack[stack.length - 1];
      const imp = importer.imports.find((i) => resolveImportSafe(importer, i) === m);
      throw new PortugolError(`Importação circular: ${cycle}`, imp?.line ?? 1, imp?.col ?? 1, "sintaxe", importer.fileIndex);
    }
    state.set(m, "visiting");
    stack.push(m);
    const links: LinkedImport<M>[] = [];
    for (const imp of m.imports) {
      const target = resolveImport(m, imp);
      links.push({ target, alias: imp.alias });
      visit(target);
    }
    resolved.set(m, links);
    stack.pop();
    state.set(m, "done");
    order.push(m);
  };
  const resolveImportSafe = (from: M, imp: RawImport): M | null => {
    try { return resolveImport(from, imp); } catch { return null; }
  };
  visit(entry);
  return { order, resolved };
}
