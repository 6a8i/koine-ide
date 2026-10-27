import { compileStudio, compileStudioProject } from "./studio/interpreter";
import { compileVisualg, compileVisualgProject } from "./visualg/interpreter";
import { Lang, Program } from "./shared/types";
import { SourceFile } from "./protocol";

/** Compila um único arquivo (atalho usado pelos testes). */
export function compile(lang: Lang, src: string): Program {
  return lang === "visualg" ? compileVisualg(src) : compileStudio(src);
}

/** Compila um projeto: todos os arquivos da linguagem, com `entry` como ponto de partida. */
export function compileProject(lang: Lang, files: SourceFile[], entry: string): Program {
  return lang === "visualg" ? compileVisualgProject(files, entry) : compileStudioProject(files, entry);
}

export const LANG_INFO: Record<Lang, { name: string; ext: string; short: string }> = {
  studio: { name: "Portugol Studio", ext: "por", short: "Studio" },
  visualg: { name: "VisuAlg", ext: "alg", short: "VisuAlg" },
};

export function langFromFilename(name: string): Lang | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "por") return "studio";
  if (ext === "alg") return "visualg";
  return null;
}

/** true se o arquivo tem um ponto de entrada (funcao inicio / algoritmo) e pode ser executado. */
export function hasEntryPoint(lang: Lang, src: string): boolean {
  return lang === "visualg" ? /^\s*algoritmo\b/im.test(src) : /\bfuncao\s+inicio\s*\(/.test(src);
}

/** Detecta a linguagem pelo conteúdo (quando o arquivo não tem extensão conhecida). */
export function detectLang(src: string): Lang {
  const head = src.slice(0, 2000).toLowerCase();
  if (/^\s*(\/\/.*\n\s*)*programa\s*\{/.test(head) || /\bfuncao\s+inicio\s*\(/.test(head)) return "studio";
  if (/\balgoritmo\b/.test(head) || /\bfimalgoritmo\b/.test(head)) return "visualg";
  return "studio";
}

export type { Lang, Program };
export { PortugolError } from "./shared/types";
