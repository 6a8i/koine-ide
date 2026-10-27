/**
 * Idioma da interface. As chaves são os textos em português (pt-BR); cada idioma tem um dicionário
 * português → tradução. Chaves ausentes caem no inglês e, por fim, no próprio texto em português.
 * `{nome}` dentro do texto é substituído pelos parâmetros.
 */
import { DEFAULT_LOCALE, isLocale, type Locale } from "../lang/i18n";
import { UI_EN } from "./ui/en";
import { UI_ES } from "./ui/es";
import { UI_EL } from "./ui/el";
import { UI_RU } from "./ui/ru";
import { UI_UK } from "./ui/uk";
import { UI_PL } from "./ui/pl";
import { UI_JA } from "./ui/ja";
import { UI_KO } from "./ui/ko";
import { UI_ZH } from "./ui/zh";

export type { Locale };
export { LOCALES, DEFAULT_LOCALE } from "../lang/i18n";

export type Dictionary = Record<string, string>;

const DICTS: Record<Locale, Dictionary> = {
  "pt-BR": {}, en: UI_EN, es: UI_ES, el: UI_EL, ru: UI_RU, uk: UI_UK, pl: UI_PL, ja: UI_JA, ko: UI_KO, zh: UI_ZH,
};

let current: Locale = DEFAULT_LOCALE;
const listeners = new Set<(l: Locale) => void>();

/** Idioma salvo, ou o do navegador quando reconhecido, ou pt-BR. */
export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem("locale");
    if (isLocale(saved)) return saved;
  } catch { /* sem storage */ }
  const nav = (typeof navigator !== "undefined" ? navigator.language : "") || "";
  const base = nav.toLowerCase().split("-")[0];
  if (nav.toLowerCase().startsWith("pt")) return "pt-BR";
  if (isLocale(base)) return base;
  return DEFAULT_LOCALE;
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(l: Locale) {
  if (l === current) return;
  current = l;
  try { localStorage.setItem("locale", l); } catch { /* ignora */ }
  for (const fn of listeners) fn(l);
}

/** Avisa quando o idioma muda (para re-renderizar). Devolve a função de cancelar. */
export function onLocaleChange(fn: (l: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Traduz um texto da interface (chave = texto em português). */
export function t(text: string, params?: Record<string, string | number>): string {
  // em pt-BR a chave já é o texto; nos outros idiomas, chave ausente cai no inglês e depois no português
  let s = current === "pt-BR" ? text : DICTS[current]?.[text] ?? DICTS.en[text] ?? text;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Plural simples: `one` quando n === 1, senão `many` (ambos passam por t()). */
export function tn(n: number, one: string, many: string, params: Record<string, string | number> = {}): string {
  return t(n === 1 ? one : many, { n, ...params });
}

/**
 * Aplica as traduções aos elementos estáticos do HTML:
 * data-i18n (texto), data-i18n-title (title), data-i18n-placeholder, data-i18n-aria (aria-label).
 * O texto em português original fica guardado na primeira passagem.
 */
export function applyStaticTranslations(root: ParentNode = document) {
  const attrs: [string, (el: HTMLElement, v: string) => void][] = [
    ["data-i18n", (el, v) => { el.textContent = v; }],
    ["data-i18n-title", (el, v) => el.setAttribute("title", v)],
    ["data-i18n-placeholder", (el, v) => el.setAttribute("placeholder", v)],
    ["data-i18n-aria", (el, v) => el.setAttribute("aria-label", v)],
  ];
  for (const [attr, apply] of attrs) {
    root.querySelectorAll<HTMLElement>(`[${attr}]`).forEach((el) => {
      let key = el.getAttribute(attr) ?? "";
      if (!key) {
        // chave vazia: usa o conteúdo/atributo atual (português) e guarda
        key = attr === "data-i18n" ? (el.textContent ?? "").trim() : attr === "data-i18n-title" ? el.getAttribute("title") ?? "" : attr === "data-i18n-placeholder" ? el.getAttribute("placeholder") ?? "" : el.getAttribute("aria-label") ?? "";
        el.setAttribute(attr, key);
      }
      if (key) apply(el, t(key));
    });
  }
}
