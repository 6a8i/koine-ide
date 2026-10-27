/**
 * Traduções da referência: chave = nome em português da entrada,
 * valor com o resumo traduzido e, opcionalmente, a forma de uso. Código (sintaxe/exemplo) é convertido
 * automaticamente pelo vocabulário do idioma.
 */
import type { Locale } from "../../lang/i18n";
import { REF_EN } from "./en";
import { REF_ES } from "./es";
import { REF_EL } from "./el";
import { REF_RU } from "./ru";
import { REF_UK } from "./uk";
import { REF_PL } from "./pl";
import { REF_JA } from "./ja";
import { REF_KO } from "./ko";
import { REF_ZH } from "./zh";

export type RefTranslations = Record<string, { summary: string; syntax?: string }>;

export const REF_I18N: Record<Locale, RefTranslations> = {
  "pt-BR": {}, en: REF_EN, es: REF_ES, el: REF_EL, ru: REF_RU, uk: REF_UK, pl: REF_PL, ja: REF_JA, ko: REF_KO, zh: REF_ZH,
};
