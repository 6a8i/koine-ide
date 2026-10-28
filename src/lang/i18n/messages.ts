/**
 * Mensagens do compilador e do interpretador no idioma do usuário.
 * A chave é o texto em português com `{nome}` para as partes variáveis; cada idioma tem um
 * dicionário chave → tradução em `./messages/<idioma>.ts`. Chave ausente cai no português.
 * O idioma é definido por `setMessageLocale` (o worker chama a cada execução; `compileProject` também).
 */
import type { Locale } from "./index";
import { MSG_EN } from "./messages/en";
import { MSG_ES } from "./messages/es";
import { MSG_EL } from "./messages/el";
import { MSG_RU } from "./messages/ru";
import { MSG_UK } from "./messages/uk";
import { MSG_PL } from "./messages/pl";
import { MSG_JA } from "./messages/ja";
import { MSG_KO } from "./messages/ko";
import { MSG_ZH } from "./messages/zh";

export type Messages = Record<string, string>;

export const MESSAGES: Record<Locale, Messages> = {
  "pt-BR": {}, en: MSG_EN, es: MSG_ES, el: MSG_EL, ru: MSG_RU, uk: MSG_UK, pl: MSG_PL, ja: MSG_JA, ko: MSG_KO, zh: MSG_ZH,
};

let current: Locale = "pt-BR";

export function setMessageLocale(locale: Locale) {
  current = locale;
}
export function getMessageLocale(): Locale {
  return current;
}

/** Traduz uma mensagem (chave em português) e preenche os `{parâmetros}`. */
export function m(key: string, params?: Record<string, unknown>): string {
  const text = current === "pt-BR" ? key : MESSAGES[current]?.[key] ?? key;
  if (!params) return text;
  return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (s, k) => (k in params ? String(params[k]) : s));
}
