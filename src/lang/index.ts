import { compileStudio } from "./studio/interpreter";
import { compileVisualg } from "./visualg/interpreter";
import { Lang, Program } from "./shared/types";

export function compile(lang: Lang, src: string): Program {
  return lang === "visualg" ? compileVisualg(src) : compileStudio(src);
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

/** Detecta a linguagem pelo conteúdo (quando o arquivo não tem extensão conhecida). */
export function detectLang(src: string): Lang {
  const head = src.slice(0, 2000).toLowerCase();
  if (/^\s*(\/\/.*\n\s*)*programa\s*\{/.test(head) || /\bfuncao\s+inicio\s*\(/.test(head)) return "studio";
  if (/\balgoritmo\b/.test(head) || /\bfimalgoritmo\b/.test(head)) return "visualg";
  return "studio";
}

export type { Lang, Program };
export { PortugolError } from "./shared/types";
