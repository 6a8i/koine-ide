/**
 * Textos dos exemplos (comentários e literais de texto) no idioma do usuário.
 * `translateSource` cuida das palavras reservadas; aqui, cada idioma tem um dicionário
 * texto em português → tradução, aplicado aos comentários `// ...` e ao conteúdo dos literais "...".
 * Texto sem tradução fica em português. Só vale para os exemplos da IDE, nunca para código do usuário.
 */
import type { Locale } from "../../lang/i18n";
import { EX_EN } from "./en";
import { EX_ES } from "./es";
import { EX_EL } from "./el";
import { EX_RU } from "./ru";
import { EX_UK } from "./uk";
import { EX_PL } from "./pl";
import { EX_JA } from "./ja";
import { EX_KO } from "./ko";
import { EX_ZH } from "./zh";

export type ExampleTexts = Record<string, string>;

export const EXAMPLE_I18N: Record<Locale, ExampleTexts> = {
  "pt-BR": {}, en: EX_EN, es: EX_ES, el: EX_EL, ru: EX_RU, uk: EX_UK, pl: EX_PL, ja: EX_JA, ko: EX_KO, zh: EX_ZH,
};

/** Um literal "..." (com escapes) ou um comentário de linha, fora de literais. */
const TOKEN = /"((?:[^"\\\n]|\\.)*)"|\/\/([^\n]*)/g;
const hasLetter = (s: string) => /\p{L}/u.test(s);

/** Comentários e literais de um código de exemplo que merecem tradução (têm letras). */
export function exampleTexts(code: string): string[] {
  const out = new Set<string>();
  for (const mt of code.matchAll(TOKEN)) {
    const text = mt[1] !== undefined ? mt[1] : mt[2].trim();
    if (hasLetter(text)) out.add(text);
  }
  return [...out];
}

/** Aplica o dicionário do idioma aos comentários e literais do código (identidade em pt-BR). */
export function localizeExample(code: string, locale: Locale): string {
  if (locale === "pt-BR") return code;
  const dict = EXAMPLE_I18N[locale];
  if (!dict) return code;
  return code.replace(TOKEN, (whole, str: string | undefined, comment: string | undefined) => {
    if (str !== undefined) {
      const tr = dict[str];
      return tr === undefined ? whole : `"${tr}"`;
    }
    const body = comment!;
    const key = body.trim();
    const tr = dict[key];
    if (tr === undefined) return whole;
    const lead = body.slice(0, body.length - body.trimStart().length);
    return "//" + lead + tr;
  });
}
