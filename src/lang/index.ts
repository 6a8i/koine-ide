import { compileStudio, compileStudioProject } from "./studio/interpreter";
import { compileVisualg, compileVisualgProject } from "./visualg/interpreter";
import { CompileOptions, Lang, Program } from "./shared/types";
import { SourceFile } from "./protocol";
import { Locale, escapeRe, wordAlternatives } from "./i18n";

/** Compila um único arquivo (atalho usado pelos testes). */
export function compile(lang: Lang, src: string): Program {
  return lang === "visualg" ? compileVisualg(src) : compileStudio(src);
}

/** Compila um projeto: todos os arquivos da linguagem, com `entry` como ponto de partida. */
export function compileProject(lang: Lang, files: SourceFile[], entry: string, opts: CompileOptions = {}): Program {
  return lang === "visualg" ? compileVisualgProject(files, entry, opts) : compileStudioProject(files, entry, opts);
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

const alt = (lang: Lang, locale: Locale, canonical: string) => wordAlternatives(lang, locale, canonical).map(escapeRe).join("|");

/** true se o arquivo tem um ponto de entrada (funcao inicio / algoritmo) e pode ser executado. Aceita as palavras do idioma e as portuguesas. */
export function hasEntryPoint(lang: Lang, src: string, locale: Locale = "pt-BR"): boolean {
  return lang === "visualg"
    ? new RegExp(`^\\s*(?:${alt(lang, locale, "algoritmo")})(?![\\p{L}\\p{N}_])`, "imu").test(src)
    : new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alt(lang, locale, "funcao")})\\s+(?:${alt(lang, locale, "inicio")})\\s*\\(`, "u").test(src);
}

/** Detecta a linguagem pelo conteúdo (quando o arquivo não tem extensão conhecida). */
export function detectLang(src: string, locale: Locale = "pt-BR"): Lang {
  const head = src.slice(0, 2000);
  const low = head.toLowerCase();
  if (new RegExp(`^\\s*(\\/\\/.*\\n\\s*)*(?:${alt("studio", locale, "programa")})\\s*\\{`, "u").test(head) || hasEntryPoint("studio", head, locale)) return "studio";
  if (new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alt("visualg", locale, "algoritmo")}|${alt("visualg", locale, "fimalgoritmo")})(?![\\p{L}\\p{N}_])`, "iu").test(low)) return "visualg";
  return "studio";
}

export type { Lang, Program };
export { PortugolError } from "./shared/types";
