/**
 * Idiomas da linguagem: o vocabulário interno (canônico) é o português; cada idioma tem uma tabela
 * canônico → palavra localizada para as palavras reservadas, funções nativas, bibliotecas e literais lógicos.
 * O lexer traduz as palavras do idioma ativo para o canônico, então parser e interpretador não mudam.
 * As palavras em português continuam valendo em qualquer idioma.
 */
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

/** Vocabulário de um idioma: canônico (português) → localizado. Entradas ausentes ficam em português. */
export type Vocabulary = Record<string, string>;

/** Palavras canônicas, por grupo (a ordem é a usada na referência/autocompletar). */
export const CANON = {
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
} as const;

/** Todas as palavras canônicas. */
export function canonWords(): string[] {
  return [...CANON.keywords, ...CANON.special, ...CANON.builtins, ...CANON.libs, ...CANON.members];
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

export const VOCAB: Record<Locale, Vocabulary> = {
  "pt-BR": {}, en: VOCAB_EN, es: VOCAB_ES, el: VOCAB_EL, ru: VOCAB_RU, uk: VOCAB_UK, pl: VOCAB_PL, ja: VOCAB_JA, ko: VOCAB_KO, zh: VOCAB_ZH,
};

/** Palavra localizada de um canônico (ou o próprio canônico, se o idioma não traduz). */
export function word(locale: Locale, canonical: string): string {
  return VOCAB[locale]?.[canonical] ?? canonical;
}

const toCanonCache = new Map<Locale, Map<string, string>>();
/** Mapa localizado → canônico que o lexer usa. Vazio para pt-BR. */
export function toCanonicalMap(locale: Locale): Map<string, string> | undefined {
  if (locale === "pt-BR") return undefined;
  let m = toCanonCache.get(locale);
  if (!m) {
    m = new Map();
    for (const [canon, local] of Object.entries(VOCAB[locale] ?? {})) {
      if (local !== canon) m.set(local, canon);
    }
    toCanonCache.set(locale, m);
  }
  return m;
}

/** Opções de lexer da linguagem (as mesmas do parser), já com a tradução do idioma. */
export function lexerOptions(locale: Locale, keywords: Set<string>, operators: string[]): LexerOptions {
  return { keywords, operators, translate: toCanonicalMap(locale) };
}

let lexerConfig: { keywords: Set<string>; operators: string[] } | null = null;
/** O parser registra aqui suas palavras-chave e operadores (evita dependência circular). */
export function registerLexerConfig(keywords: Set<string>, operators: string[]) {
  lexerConfig = { keywords, operators };
}

/**
 * Converte as palavras reservadas/funções nativas de um código de um idioma para outro, preservando
 * textos, comentários e identificadores do usuário. Se o código não puder ser tokenizado, volta inalterado.
 */
export function translateSource(src: string, from: Locale, to: Locale): string {
  if (from === to || !lexerConfig) return src;
  const canon = new Set(canonWords());
  let toks;
  try {
    toks = tokenize(src, lexerOptions(from, lexerConfig.keywords, lexerConfig.operators), 0);
  } catch {
    return src;
  }
  let out = "";
  let last = 0;
  for (const t of toks) {
    if (t.type !== "keyword" && t.type !== "ident") continue;
    if (!canon.has(t.value)) continue;
    const target = word(to, t.value);
    if (target === t.raw) continue;
    out += src.slice(last, t.start) + target;
    last = t.end;
  }
  return out + src.slice(last);
}

/** Palavras de verdadeiro/falso no idioma (para escrever e ler valores lógicos). */
export function booleanWords(locale: Locale): { yes: string; no: string } {
  return { yes: word(locale, "verdadeiro"), no: word(locale, "falso") };
}

/** Expressão para achar a palavra canônica ou a localizada (ex.: detectar `funcao inicio`). */
export function wordAlternatives(locale: Locale, canonical: string): string[] {
  const w = word(locale, canonical);
  return w === canonical ? [canonical] : [canonical, w];
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
