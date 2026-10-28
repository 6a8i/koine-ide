import { compileKoine, compileKoineProject } from "./koine/interpreter";
import { CompileOptions, Program } from "./shared/types";
import { SourceFile } from "./protocol";
import { Locale, escapeRe, wordAlternatives } from "./i18n";
import { setMessageLocale } from "./i18n/messages";

/** Nome da linguagem e extensão dos arquivos. */
export const LANG = { name: "Koiné", ext: "koi" } as const;

/** Compila um único arquivo (atalho usado pelos testes). */
export function compile(src: string): Program {
  setMessageLocale("pt-BR");
  return compileKoine(src);
}

/** Compila um projeto: todos os arquivos, com `entry` como ponto de partida. */
export function compileProject(files: SourceFile[], entry: string, opts: CompileOptions = {}): Program {
  setMessageLocale(opts.locale ?? "pt-BR");
  return compileKoineProject(files, entry, opts);
}

/** true se o nome de arquivo tem a extensão da linguagem (.koi). */
export function isKoineFile(name: string): boolean {
  return name.split(".").pop()?.toLowerCase() === LANG.ext;
}

const alt = (locale: Locale, canonical: string) => wordAlternatives(locale, canonical).map(escapeRe).join("|");

/** true se o arquivo tem um ponto de entrada (funcao inicio) e pode ser executado. Aceita as palavras do idioma e as portuguesas. */
export function hasEntryPoint(src: string, locale: Locale = "pt-BR"): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alt(locale, "funcao")})\\s+(?:${alt(locale, "inicio")})\\s*\\(`, "u").test(src);
}

export type { Program };
export { KoineError } from "./shared/types";
