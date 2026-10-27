/**
 * Valida as tabelas de idioma: node --import tsx tests/check-i18n.ts [locale]
 * - vocabulário completo (todas as palavras canônicas), valores únicos, válidos como identificador
 *   e que não colidem com OUTRA palavra canônica;
 * - código de exemplo convertido para o idioma compila e volta igual ao português;
 * - referência: toda entrada tem resumo traduzido;
 * - interface: todo texto tem tradução, com os mesmos parâmetros {x}.
 */
import { LOCALES, VOCAB, canonWords, translateSource, type Locale } from "../src/lang/i18n";
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
  const table = VOCAB[locale] ?? {};
  const canon = canonWords();
  const canonSet = new Set(canon);
  const missing = canon.filter((w) => !(w in table));
  if (missing.length) bad(`${locale}: faltam ${missing.length} palavras: ${missing.join(", ")}`);
  const seen = new Map<string, string>();
  for (const [k, v] of Object.entries(table)) {
    if (!canonSet.has(k)) bad(`${locale}: "${k}" não é uma palavra canônica`);
    if (!IDENT.test(v)) bad(`${locale}: "${k}" → "${v}" não é um identificador válido (só letras, dígitos e _, sem espaços)`);
    const other = seen.get(v);
    if (other) bad(`${locale}: "${v}" usado para "${other}" e "${k}"`);
    seen.set(v, k);
    if (v !== k && canonSet.has(v)) bad(`${locale}: "${k}" → "${v}" colide com a palavra canônica "${v}"`);
  }
  if (table["E"] && table["e"] && table["E"] === table["e"]) bad(`${locale}: "E" (constante) e "e" (operador) não podem ser iguais`);
  // exemplos: converter, compilar e voltar
  setBooleanWords(table.verdadeiro ?? "verdadeiro", table.falso ?? "falso");
  for (const ex of EXAMPLES) {
    const files = ex.files ? ex.files.map((f) => ({ path: f.name, source: f.code })) : [{ path: "principal.koi", source: ex.code ?? "" }];
    const translated = files.map((f) => ({ path: f.path, source: translateSource(f.source, "pt-BR", locale) }));
    for (let i = 0; i < files.length; i++) {
      const back = translateSource(translated[i].source, locale, "pt-BR");
      if (back !== files[i].source) bad(`${locale}: exemplo "${ex.title}" (${files[i].path}) não volta igual ao português depois de converter`);
    }
    try {
      const p = compileProject(translated, translated[0].path, { locale, tests: true });
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
  const missingRef = REFERENCE.filter((e) => !ref[e.name]?.summary).map((e) => e.name);
  if (missingRef.length) bad(`${locale}: referência sem resumo traduzido para ${missingRef.length} entradas: ${missingRef.slice(0, 12).join(", ")}${missingRef.length > 12 ? "…" : ""}`);
  for (const k of Object.keys(ref)) {
    if (!REFERENCE.some((e) => e.name === k)) bad(`${locale}: chave de referência desconhecida "${k}"`);
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
}

(async () => {
  for (const l of LOCALES) {
    if (only && l.id !== only) continue;
    await checkLocale(l.id);
  }
  console.log(problems ? `\n${problems} problema(s)` : "\nTabelas de idioma OK");
  if (problems) process.exit(1);
})();
