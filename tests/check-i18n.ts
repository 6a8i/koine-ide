/**
 * Valida as tabelas de idioma: node --import tsx tests/check-i18n.ts [locale]
 * - vocabulário completo (todas as palavras canônicas), valores únicos por linguagem (VisuAlg: sem distinguir maiúsculas),
 *   valores válidos como identificador e que não colidem com OUTRA palavra canônica;
 * - código de exemplo convertido para o idioma compila e volta igual ao português;
 * - referência: toda entrada tem resumo traduzido.
 */
import { CANON, LOCALES, VOCAB, canonWords, translateSource, type Locale } from "../src/lang/i18n";
import { REF_I18N } from "../src/reference/i18n";
import { REFERENCE } from "../src/reference";
import { compileProject } from "../src/lang";
import { BufferHost, setBooleanWords } from "../src/lang/shared/runtime";
import { EXAMPLES } from "../src/examples";
import { createRequire } from "module";
import { UI_EN } from "../src/i18n/ui/en";
import { UI_ES } from "../src/i18n/ui/es";
import { UI_EL } from "../src/i18n/ui/el";
import { UI_RU } from "../src/i18n/ui/ru";
import { UI_UK } from "../src/i18n/ui/uk";
import { UI_PL } from "../src/i18n/ui/pl";
import { UI_JA } from "../src/i18n/ui/ja";
import { UI_KO } from "../src/i18n/ui/ko";
import { UI_ZH } from "../src/i18n/ui/zh";
const UI: Record<string, Record<string, string>> = { en: UI_EN, es: UI_ES, el: UI_EL, ru: UI_RU, uk: UI_UK, pl: UI_PL, ja: UI_JA, ko: UI_KO, zh: UI_ZH };
const { extract } = createRequire(import.meta.url)("./ui-keys.cjs") as { extract: () => string[] };
const UI_KEYS: string[] = extract();

const IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const only = process.argv[2] as Locale | undefined;
let problems = 0;
const bad = (msg: string) => { console.log("✗ " + msg); problems++; };

async function checkLocale(locale: Locale) {
  if (locale === "pt-BR") return;
  const vocab = VOCAB[locale];
  for (const lang of ["studio", "visualg"] as const) {
    const table = vocab[lang] ?? {};
    const canon = canonWords(lang);
    const canonSet = new Set(canon);
    const missing = canon.filter((w) => !(w in table));
    if (missing.length) bad(`${locale}/${lang}: faltam ${missing.length} palavras: ${missing.join(", ")}`);
    const seen = new Map<string, string>();
    for (const [k, v] of Object.entries(table)) {
      if (!canonSet.has(k)) bad(`${locale}/${lang}: "${k}" não é uma palavra canônica`);
      if (!IDENT.test(v)) bad(`${locale}/${lang}: "${k}" → "${v}" não é um identificador válido (só letras, dígitos e _, sem espaços)`);
      const key = lang === "visualg" ? v.toLowerCase() : v;
      const other = seen.get(key);
      if (other) bad(`${locale}/${lang}: "${v}" usado para "${other}" e "${k}"`);
      seen.set(key, k);
      if (v !== k && canonSet.has(v)) bad(`${locale}/${lang}: "${k}" → "${v}" colide com a palavra canônica "${v}"`);
      if (lang === "visualg" && v !== k && canon.some((c) => c.toLowerCase() === v.toLowerCase() && c !== k)) bad(`${locale}/${lang}: "${k}" → "${v}" colide (sem maiúsculas) com outra palavra canônica`);
    }
    const E = table["E"], e = table["e"];
    if (lang === "studio" && E && e && E === e) bad(`${locale}/studio: "E" (constante) e "e" (operador) não podem ser iguais`);
  }
  // exemplos: converter, compilar e voltar
  setBooleanWords(vocab.studio?.verdadeiro ?? "verdadeiro", vocab.studio?.falso ?? "falso");
  for (const ex of EXAMPLES) {
    const files = ex.files ? ex.files.map((f) => ({ path: f.name, source: f.code })) : [{ path: "principal." + (ex.lang === "visualg" ? "alg" : "por"), source: ex.code ?? "" }];
    const translated = files.map((f) => ({ path: f.path, source: translateSource(ex.lang, f.source, "pt-BR", locale) }));
    for (let i = 0; i < files.length; i++) {
      const back = translateSource(ex.lang, translated[i].source, locale, "pt-BR");
      if (back !== files[i].source) bad(`${locale}: exemplo "${ex.title}" (${files[i].path}) não volta igual ao português depois de converter`);
    }
    const w = vocab[ex.lang] ?? {};
    setBooleanWords(w.verdadeiro ?? "verdadeiro", w.falso ?? "falso");
    try {
      const p = compileProject(ex.lang, translated, translated[0].path, { locale, tests: true });
      if (!p.tests.length) {
        const h = new BufferHost(["1", "2", "3", "4", "5", "6", "7", "8"]);
        try { await p.run(h); } catch (err) { if (!/não há mais linhas/.test(String(err))) throw err; }
      }
    } catch (err) {
      bad(`${locale}: exemplo "${ex.title}" convertido não compila/executa: ${(err as Error).message}`);
    }
  }
  setBooleanWords("verdadeiro", "falso");
  // referência
  const ref = REF_I18N[locale] ?? {};
  for (const lang of ["studio", "visualg"] as const) {
    const missing = REFERENCE[lang].filter((e) => !ref[`${lang}:${e.name}`]?.summary).map((e) => e.name);
    if (missing.length) bad(`${locale}/${lang}: referência sem resumo traduzido para ${missing.length} entradas: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? "…" : ""}`);
  }
  // dicionário da interface
  const dict = UI[locale] ?? {};
  const missingUi = UI_KEYS.filter((k) => !dict[k]);
  if (missingUi.length) bad(`${locale}: interface sem tradução para ${missingUi.length} de ${UI_KEYS.length} textos: ${missingUi.slice(0, 6).map((k) => JSON.stringify(k)).join(", ")}${missingUi.length > 6 ? "…" : ""}`);
  for (const k of Object.keys(dict)) {
    if (!UI_KEYS.includes(k)) bad(`${locale}: texto de interface desconhecido no dicionário: ${JSON.stringify(k)}`);
    const params = (k.match(/{[a-zA-Z]+}/g) ?? []).sort().join(",");
    const got = ((dict[k] ?? "").match(/{[a-zA-Z]+}/g) ?? []).sort().join(",");
    if (params !== got) bad(`${locale}: parâmetros diferentes em ${JSON.stringify(k)} → ${JSON.stringify(dict[k])}`);
  }
  for (const k of Object.keys(ref)) {
    const [lang, ...rest] = k.split(":");
    const name = rest.join(":");
    if ((lang !== "studio" && lang !== "visualg") || !REFERENCE[lang].some((e) => e.name === name)) bad(`${locale}: chave de referência desconhecida "${k}"`);
  }
}

(async () => {
  for (const l of LOCALES) {
    if (only && l.id !== only) continue;
    await checkLocale(l.id);
  }
  console.log(problems ? `\n${problems} problema(s)` : "\nTabelas de idioma OK");
  if (problems) process.exit(1);
})();
