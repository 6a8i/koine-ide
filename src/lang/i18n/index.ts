/**
 * Idiomas das linguagens: o vocabulário interno (canônico) é o português; cada idioma tem uma tabela
 * canônico → palavra localizada para as palavras reservadas, funções nativas, bibliotecas e literais lógicos
 * das duas linguagens. O lexer traduz as palavras do idioma ativo para o canônico, então parsers e
 * interpretadores não mudam. As palavras em português continuam valendo em qualquer idioma.
 */
import type { Lang } from "../shared/types";
import { tokenize, type LexerOptions } from "../shared/lexer";

export type Locale = "pt-BR" | "en" | "es" | "el" | "ru" | "uk" | "ja" | "ko" | "zh" | "pl";

export const LOCALES: { id: Locale; name: string; native: string }[] = [
  { id: "pt-BR", name: "Português (Brasil)", native: "Português (Brasil)" },
  { id: "en", name: "Inglês", native: "English" },
  { id: "es", name: "Espanhol", native: "Español" },
  { id: "el", name: "Grego", native: "Ελληνικά" },
  { id: "ru", name: "Russo", native: "Русский" },
  { id: "uk", name: "Ucraniano", native: "Українська" },
  { id: "pl", name: "Polonês", native: "Polski" },
  { id: "ja", name: "Japonês", native: "日本語" },
  { id: "ko", name: "Coreano", native: "한국어" },
  { id: "zh", name: "Chinês", native: "中文" },
];

export const DEFAULT_LOCALE: Locale = "pt-BR";

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && LOCALES.some((l) => l.id === x);
}

/** Vocabulário de um idioma: canônico (português) → localizado, por linguagem. Entradas ausentes ficam em português. */
export interface Vocabulary {
  studio: Record<string, string>;
  visualg: Record<string, string>;
}

/** Palavras canônicas de cada linguagem, por grupo (a ordem é a usada na referência/autocompletar). */
export const CANON = {
  studio: {
    keywords: ["programa", "funcao", "inclua", "biblioteca", "const", "inteiro", "real", "cadeia", "caracter", "logico", "vazio",
      "se", "senao", "enquanto", "faca", "para", "escolha", "caso", "contrario", "pare", "retorne", "verdadeiro", "falso", "e", "ou", "nao",
      "modulo", "importe", "publico", "privado", "estrutura", "classe", "herda", "este", "super", "nulo", "ref", "teste"],
    /** identificadores com significado especial */
    special: ["inicio"],
    builtins: ["escreva", "leia", "limpa", "afirme", "afirme_igual", "afirme_diferente", "afirme_aproximado", "saida", "entrada"],
    libs: ["Matematica", "Texto", "Util", "Tipos"],
    members: ["PI", "E", "raiz", "potencia", "arredondar", "valor_absoluto", "seno", "cosseno", "tangente", "logaritmo", "maior_numero", "menor_numero",
      "numero_caracteres", "caixa_alta", "caixa_baixa", "obter_caractere", "posicao_texto", "substituir", "extrair_subtexto", "preencher_a_esquerda",
      "preencher_a_direita", "inverter", "remover_espacos", "aguarde", "sorteia", "tempo_decorrido", "numero_elementos", "numero_linhas", "numero_colunas",
      "inteiro_para_cadeia", "inteiro_para_real", "inteiro_para_caracter", "inteiro_para_logico", "real_para_cadeia", "real_para_inteiro",
      "cadeia_para_inteiro", "cadeia_para_real", "cadeia_para_caracter", "cadeia_para_logico", "caracter_para_cadeia", "caracter_para_inteiro",
      "logico_para_cadeia", "logico_para_inteiro", "e_inteiro", "e_real"],
  },
  visualg: {
    keywords: ["algoritmo", "var", "inicio", "fimalgoritmo", "const", "inteiro", "real", "caractere", "caracter", "literal", "logico", "vetor", "de",
      "se", "entao", "senao", "fimse", "enquanto", "faca", "fimenquanto", "para", "ate", "passo", "fimpara", "repita", "fimrepita", "escolha", "caso",
      "outrocaso", "fimescolha", "funcao", "fimfuncao", "procedimento", "fimprocedimento", "retorne", "interrompa", "e", "ou", "nao", "xou", "div", "mod",
      "verdadeiro", "falso", "escreva", "escreval", "leia", "limpatela", "pausa", "aleatorio", "timer", "eco", "cronometro", "debug", "arquivo", "on", "off",
      "tipo", "registro", "fimregistro", "dos", "modulo", "fimmodulo", "importe", "como", "publico", "privado", "classe", "fimclasse", "herda", "novo",
      "este", "super", "nulo", "ref", "teste", "fimteste"],
    special: ["iniciar"],
    builtins: ["abs", "arccos", "arcsen", "arctan", "cos", "cotan", "exp", "grauprad", "int", "log", "logn", "pi", "quad", "radpgrau", "raizq", "rand",
      "randi", "sen", "tan", "asc", "carac", "caracpnum", "compr", "copia", "maiusc", "minusc", "numpcarac", "pos",
      "afirme", "afirme_igual", "afirme_diferente", "afirme_aproximado", "saida", "entrada", "executar_algoritmo"],
    libs: [] as string[],
    members: [] as string[],
  },
} as const;

/** Todas as palavras canônicas de uma linguagem. */
export function canonWords(lang: Lang): string[] {
  const c = CANON[lang];
  return [...c.keywords, ...c.special, ...c.builtins, ...c.libs, ...c.members];
}

// ---------- tabelas (carregadas estaticamente; pt-BR é a identidade) ----------
import { VOCAB_EN } from "./vocab/en";
import { VOCAB_ES } from "./vocab/es";
import { VOCAB_EL } from "./vocab/el";
import { VOCAB_RU } from "./vocab/ru";
import { VOCAB_UK } from "./vocab/uk";
import { VOCAB_PL } from "./vocab/pl";
import { VOCAB_JA } from "./vocab/ja";
import { VOCAB_KO } from "./vocab/ko";
import { VOCAB_ZH } from "./vocab/zh";

const EMPTY: Vocabulary = { studio: {}, visualg: {} };
export const VOCAB: Record<Locale, Vocabulary> = {
  "pt-BR": EMPTY, en: VOCAB_EN, es: VOCAB_ES, el: VOCAB_EL, ru: VOCAB_RU, uk: VOCAB_UK, pl: VOCAB_PL, ja: VOCAB_JA, ko: VOCAB_KO, zh: VOCAB_ZH,
};

/** Palavra localizada de um canônico (ou o próprio canônico, se o idioma não traduz). */
export function word(lang: Lang, locale: Locale, canonical: string): string {
  return VOCAB[locale]?.[lang]?.[canonical] ?? canonical;
}

const toCanonCache = new Map<string, Map<string, string>>();
/** Mapa localizado → canônico que o lexer usa (chaves em minúsculas no VisuAlg). Vazio para pt-BR. */
export function toCanonicalMap(lang: Lang, locale: Locale): Map<string, string> | undefined {
  if (locale === "pt-BR") return undefined;
  const key = lang + ":" + locale;
  let m = toCanonCache.get(key);
  if (!m) {
    m = new Map();
    const table = VOCAB[locale]?.[lang] ?? {};
    for (const [canon, local] of Object.entries(table)) {
      if (local === canon) continue;
      m.set(lang === "visualg" ? local.toLowerCase() : local, canon);
    }
    toCanonCache.set(key, m);
  }
  return m;
}

/** Opções de lexer de cada linguagem (as mesmas dos parsers), já com a tradução do idioma. */
export function lexerOptions(lang: Lang, locale: Locale, keywords: Set<string>, operators: string[]): LexerOptions {
  return lang === "visualg"
    ? { keywords, caseInsensitive: true, operators, blockComments: false, braceComments: true, singleQuoteChar: false, escapes: false, translate: toCanonicalMap(lang, locale) }
    : { keywords, caseInsensitive: false, operators, blockComments: true, braceComments: false, singleQuoteChar: true, escapes: true, translate: toCanonicalMap(lang, locale) };
}

let lexerConfigs: Record<Lang, { keywords: Set<string>; operators: string[] }> | null = null;
/** Os parsers registram aqui suas palavras-chave e operadores (evita dependência circular). */
export function registerLexerConfig(lang: Lang, keywords: Set<string>, operators: string[]) {
  lexerConfigs ??= { studio: { keywords: new Set(), operators: [] }, visualg: { keywords: new Set(), operators: [] } };
  lexerConfigs[lang] = { keywords, operators };
}

/**
 * Converte as palavras reservadas/funções nativas de um código de um idioma para outro, preservando
 * textos, comentários e identificadores do usuário. Se o código não puder ser tokenizado, volta inalterado.
 */
export function translateSource(lang: Lang, src: string, from: Locale, to: Locale): string {
  if (from === to || !lexerConfigs) return src;
  const cfg = lexerConfigs[lang];
  const canon = new Set(canonWords(lang));
  let toks;
  try {
    toks = tokenize(src, lexerOptions(lang, from, cfg.keywords, cfg.operators), 0);
  } catch {
    return src;
  }
  let out = "";
  let last = 0;
  for (const t of toks) {
    if (t.type !== "keyword" && t.type !== "ident") continue;
    if (!canon.has(t.value)) continue;
    const target = word(lang, to, t.value);
    if (target === t.raw) continue;
    out += src.slice(last, t.start) + target;
    last = t.end;
  }
  return out + src.slice(last);
}

/** Palavras de verdadeiro/falso no idioma (para escrever e ler valores lógicos). */
export function booleanWords(lang: Lang, locale: Locale): { yes: string; no: string } {
  return { yes: word(lang, locale, "verdadeiro"), no: word(lang, locale, "falso") };
}

/** Expressão para achar a palavra canônica ou a localizada (ex.: detectar `funcao inicio` / `algoritmo`). */
export function wordAlternatives(lang: Lang, locale: Locale, canonical: string): string[] {
  const w = word(lang, locale, canonical);
  return w === canonical ? [canonical] : [canonical, w];
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
