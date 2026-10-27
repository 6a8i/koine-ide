/**
 * Destaque de sintaxe e autocompletar do Koiné, no idioma ativo: as listas são canônicas
 * (português) e traduzidas pelo vocabulário do idioma; as palavras em português continuam reconhecidas.
 */
import { StreamLanguage, StringStream, LanguageSupport, indentUnit } from "@codemirror/language";
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { CANON, Locale, translateSource, word } from "../lang/i18n";

interface State { inComment: boolean }

const KW = ["programa", "funcao", "inclua", "biblioteca", "const", "se", "senao", "enquanto", "faca", "para", "escolha", "caso", "contrario", "pare", "retorne", "modulo", "importe", "publico", "privado", "estrutura", "classe", "herda", "este", "super", "nulo", "ref", "teste"];
const TYPES = ["inteiro", "real", "cadeia", "caracter", "logico", "vazio"];
const CONST = ["verdadeiro", "falso"];
const LOGIC = ["e", "ou", "nao"];
const BUILTIN = [...CANON.builtins];
const LIBS = [...CANON.libs];

/** Conjunto com as palavras canônicas E as do idioma (as duas são aceitas pelo compilador). */
function wordSet(locale: Locale, list: string[]): Set<string> {
  const s = new Set<string>();
  for (const w of list) {
    s.add(w);
    s.add(word(locale, w));
  }
  return s;
}

function koineStream(locale: Locale) {
  const sKw = wordSet(locale, KW), sTy = wordSet(locale, TYPES), sCo = wordSet(locale, CONST);
  const sLo = wordSet(locale, LOGIC), sBi = wordSet(locale, BUILTIN), sLib = wordSet(locale, LIBS);
  return StreamLanguage.define<State>({
    name: "koine",
    startState: () => ({ inComment: false }),
    token(stream: StringStream, st: State) {
      if (st.inComment) {
        if (stream.skipTo("*/")) { stream.match("*/"); st.inComment = false; } else stream.skipToEnd();
        return "comment";
      }
      if (stream.eatSpace()) return null;
      if (stream.match("//")) { stream.skipToEnd(); return "comment"; }
      if (stream.match("/*")) { st.inComment = true; return "comment"; }
      if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return "string";
      if (stream.match(/^'(?:[^'\\]|\\.)'?/)) return "character";
      if (stream.match(/^0[xX][0-9a-fA-F]+|^0[bB][01]+|^\d+\.\d+([eE][-+]?\d+)?|^\d+/)) return "number";
      if (stream.match(/^[\p{L}_][\p{L}\p{N}_]*/u)) {
        const w = stream.current();
        if (sKw.has(w)) return "keyword";
        if (sTy.has(w)) return "typeName";
        if (sCo.has(w)) return "bool";
        if (sLo.has(w)) return "operatorKeyword";
        if (sBi.has(w)) return "variableName.standard";
        if (sLib.has(w)) return "namespace";
        if (stream.match(/^\s*\(/, false)) return "variableName.function";
        return "variableName";
      }
      if (stream.match(/^(-->|\+\+|--|[-+*/%]=|==|!=|<=|>=|<<|>>|[-+*/%=<>!&|^~])/)) return "operator";
      if (stream.match(/^[{}()[\],.:;]/)) return "punctuation";
      stream.next();
      return null;
    },
    languageData: { commentTokens: { line: "//", block: { open: "/*", close: "*/" } }, closeBrackets: { brackets: ["(", "[", "{", '"', "'"] } },
  });
}

// ---------------- Autocompletar ----------------
/** Traduz as palavras canônicas de um texto curto (rótulos), sem tratar strings/comentários. */
function translateText(locale: Locale, text: string): string {
  return text.replace(/[\p{L}_][\p{L}\p{N}_]*/gu, (w) => word(locale, w));
}

function completions(locale: Locale): Completion[] {
  const tr = (w: string) => word(locale, w);
  const mk = (list: string[], type: string, boost = 0): Completion[] => list.map((w) => ({ label: tr(w), type, boost }));
  const code = (src: string) => translateSource(src, "pt-BR", locale);
  const model = (label: string, apply: string): Completion => ({ label: translateText(locale, label), type: "keyword", apply: code(apply), detail: "modelo" });
  const member = (lib: string, name: string, detail?: string, type = "function"): Completion => ({ label: `${tr(lib)}.${tr(name)}`, type, detail });
  return [
    ...mk(KW, "keyword", 1),
    ...mk(TYPES, "type", 1),
    ...mk(CONST, "constant"),
    ...mk(LOGIC, "keyword"),
    ...mk(BUILTIN, "function", 2),
    ...mk(LIBS, "namespace"),
    member("Matematica", "raiz", "(x, indice)"),
    member("Matematica", "potencia", "(base, expoente)"),
    member("Matematica", "arredondar", "(x, casas)"),
    member("Matematica", "valor_absoluto", "(x)"),
    member("Matematica", "maior_numero", "(a, b)"),
    member("Matematica", "menor_numero", "(a, b)"),
    member("Matematica", "PI", undefined, "constant"),
    member("Texto", "numero_caracteres", "(texto)"),
    member("Texto", "caixa_alta", "(texto)"),
    member("Texto", "caixa_baixa", "(texto)"),
    member("Texto", "obter_caractere", "(texto, posicao)"),
    member("Texto", "extrair_subtexto", "(texto, inicio, fim)"),
    member("Texto", "posicao_texto", "(busca, texto, inicio)"),
    member("Texto", "substituir", "(texto, de, para)"),
    member("Util", "sorteia", "(min, max)"),
    member("Util", "aguarde", "(milissegundos)"),
    member("Util", "numero_elementos", "(vetor)"),
    member("Util", "tempo_decorrido", "()"),
    member("Tipos", "inteiro_para_cadeia", "(x)"),
    member("Tipos", "cadeia_para_inteiro", "(texto)"),
    member("Tipos", "real_para_inteiro", "(x)"),
    member("Tipos", "cadeia_para_real", "(texto)"),
    model("funcao inicio", "funcao inicio()\n{\n\t\n}"),
    model("se …", "se (condicao)\n{\n\t\n}"),
    model("enquanto …", "enquanto (condicao)\n{\n\t\n}"),
    model("para …", "para (inteiro i = 0; i < 10; i++)\n{\n\t\n}"),
    model("estrutura …", "estrutura Nome\n{\n\tinteiro campo\n}"),
    model("classe …", "classe Nome\n{\n\tprivado inteiro valor\n\n\tpublico Nome(inteiro v) { este.valor = v }\n\tpublico inteiro obter() { retorne valor }\n}"),
    model("importe …", "importe Modulo"),
    model("teste …", 'teste "nome"\n{\n\tafirme_igual(esperado, obtido)\n}'),
  ];
}

const completionCache = new Map<Locale, Completion[]>();
export function completionSource(locale: Locale) {
  let list = completionCache.get(locale);
  if (!list) completionCache.set(locale, (list = completions(locale)));
  const fixed = list;
  return (ctx: CompletionContext): CompletionResult | null => {
    const w = ctx.matchBefore(/[\p{L}\p{N}_.]*/u);
    if (!w || (w.from === w.to && !ctx.explicit)) return null;
    // identificadores já usados no documento
    const seen = new Set(fixed.map((c) => c.label));
    const extra: Completion[] = [];
    const text = ctx.state.doc.toString();
    const re = /[\p{L}_][\p{L}\p{N}_]{2,}/gu;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(text)) && count < 2000) {
      count++;
      if (m.index === w.from) continue;
      if (!seen.has(m[0])) { seen.add(m[0]); extra.push({ label: m[0], type: "variable", boost: -1 }); }
    }
    return { from: w.from, options: [...fixed, ...extra], validFor: /^[\p{L}\p{N}_.]*$/u };
  };
}

const supportCache = new Map<Locale, LanguageSupport>();
export function languageSupport(locale: Locale): LanguageSupport {
  let s = supportCache.get(locale);
  if (!s) {
    s = new LanguageSupport(koineStream(locale), [indentUnit.of("    ")]);
    supportCache.set(locale, s);
  }
  return s;
}
