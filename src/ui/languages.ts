/**
 * Destaque de sintaxe e autocompletar das duas linguagens, no idioma ativo: as listas são canônicas
 * (português) e traduzidas pelo vocabulário do idioma; as palavras em português continuam reconhecidas.
 */
import { StreamLanguage, StringStream, LanguageSupport, indentUnit } from "@codemirror/language";
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { Lang } from "../lang/shared/types";
import { CANON, Locale, translateSource, word } from "../lang/i18n";

interface State { inComment: boolean }

const STUDIO_KW = ["programa", "funcao", "inclua", "biblioteca", "const", "se", "senao", "enquanto", "faca", "para", "escolha", "caso", "contrario", "pare", "retorne", "modulo", "importe", "publico", "privado", "estrutura", "classe", "herda", "este", "super", "nulo", "ref", "teste"];
const STUDIO_TYPES = ["inteiro", "real", "cadeia", "caracter", "logico", "vazio"];
const STUDIO_CONST = ["verdadeiro", "falso"];
const STUDIO_LOGIC = ["e", "ou", "nao"];
const STUDIO_BUILTIN = [...CANON.studio.builtins];
const STUDIO_LIBS = [...CANON.studio.libs];

const VA_KW = ["algoritmo", "var", "inicio", "fimalgoritmo", "const", "se", "entao", "senao", "fimse", "enquanto", "faca", "fimenquanto", "para", "de", "ate", "passo", "fimpara", "repita", "fimrepita", "escolha", "caso", "outrocaso", "fimescolha", "funcao", "fimfuncao", "procedimento", "fimprocedimento", "retorne", "interrompa", "vetor", "tipo", "registro", "fimregistro", "modulo", "fimmodulo", "importe", "como", "publico", "privado", "classe", "fimclasse", "herda", "novo", "este", "super", "nulo", "ref", "teste", "fimteste"];
const VA_TYPES = ["inteiro", "real", "caractere", "caracter", "literal", "logico"];
const VA_CONST = ["verdadeiro", "falso"];
const VA_LOGIC = ["e", "ou", "nao", "xou", "div", "mod"];
const VA_BUILTIN = ["escreva", "escreval", "leia", "limpatela", "pausa", "aleatorio", "timer", "eco", "cronometro", "debug", "arquivo"];
const VA_FUNCS = [...CANON.visualg.builtins];

/** Conjunto com as palavras canônicas E as do idioma (as duas são aceitas pelo compilador). */
function wordSet(lang: Lang, locale: Locale, list: string[], lower = false): Set<string> {
  const s = new Set<string>();
  for (const w of list) {
    s.add(lower ? w.toLowerCase() : w);
    const l = word(lang, locale, w);
    s.add(lower ? l.toLowerCase() : l);
  }
  return s;
}

function studioStream(locale: Locale) {
  const sKw = wordSet("studio", locale, STUDIO_KW), sTy = wordSet("studio", locale, STUDIO_TYPES), sCo = wordSet("studio", locale, STUDIO_CONST);
  const sLo = wordSet("studio", locale, STUDIO_LOGIC), sBi = wordSet("studio", locale, STUDIO_BUILTIN), sLib = wordSet("studio", locale, STUDIO_LIBS);
  return StreamLanguage.define<State>({
    name: "portugol-studio",
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

function visualgStream(locale: Locale) {
  const vKw = wordSet("visualg", locale, VA_KW, true), vTy = wordSet("visualg", locale, VA_TYPES, true), vCo = wordSet("visualg", locale, VA_CONST, true);
  const vLo = wordSet("visualg", locale, VA_LOGIC, true), vBi = wordSet("visualg", locale, VA_BUILTIN, true), vFn = wordSet("visualg", locale, VA_FUNCS, true);
  return StreamLanguage.define<State>({
    name: "visualg",
    startState: () => ({ inComment: false }),
    token(stream: StringStream, st: State) {
      if (st.inComment) {
        if (stream.skipTo("}")) { stream.next(); st.inComment = false; } else stream.skipToEnd();
        return "comment";
      }
      if (stream.eatSpace()) return null;
      if (stream.match("//")) { stream.skipToEnd(); return "comment"; }
      if (stream.peek() === "{") { stream.next(); st.inComment = true; return "comment"; }
      if (stream.match(/^"[^"]*"?/)) return "string";
      if (stream.match(/^\d+\.\d+([eE][-+]?\d+)?|^\d+/)) return "number";
      if (stream.match(/^[\p{L}_][\p{L}\p{N}_]*/u)) {
        const w = stream.current().toLowerCase();
        if (vKw.has(w)) return "keyword";
        if (vTy.has(w)) return "typeName";
        if (vCo.has(w)) return "bool";
        if (vLo.has(w)) return "operatorKeyword";
        if (vBi.has(w)) return "variableName.standard";
        if (vFn.has(w)) return "variableName.function";
        if (stream.match(/^\s*\(/, false)) return "variableName.function";
        return "variableName";
      }
      if (stream.match(/^(<-|:=|<=|>=|<>|\.\.|[-+*/\\^%=<>&])/)) return "operator";
      if (stream.match(/^[()[\],:;.]/)) return "punctuation";
      stream.next();
      return null;
    },
    languageData: { commentTokens: { line: "//" }, closeBrackets: { brackets: ["(", "[", '"'] } },
  });
}

// ---------------- Autocompletar ----------------
/** Traduz as palavras canônicas de um texto curto (rótulos), sem tratar strings/comentários. */
function translateText(lang: Lang, locale: Locale, text: string): string {
  return text.replace(/[\p{L}_][\p{L}\p{N}_]*/gu, (w) => word(lang, locale, w));
}

function completions(lang: Lang, locale: Locale): Completion[] {
  const tr = (w: string) => word(lang, locale, w);
  const mk = (list: string[], type: string, boost = 0): Completion[] => list.map((w) => ({ label: tr(w), type, boost }));
  const code = (src: string) => translateSource(lang, src, "pt-BR", locale);
  const model = (label: string, apply: string): Completion => ({ label: translateText(lang, locale, label), type: "keyword", apply: code(apply), detail: "modelo" });
  const member = (lib: string, name: string, detail?: string, type = "function"): Completion => ({ label: `${tr(lib)}.${tr(name)}`, type, detail });
  if (lang === "studio") {
    return [
      ...mk(STUDIO_KW, "keyword", 1),
      ...mk(STUDIO_TYPES, "type", 1),
      ...mk(STUDIO_CONST, "constant"),
      ...mk(STUDIO_LOGIC, "keyword"),
      ...mk(STUDIO_BUILTIN, "function", 2),
      ...mk(STUDIO_LIBS, "namespace"),
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
  return [
    ...mk(VA_KW, "keyword", 1),
    ...mk(VA_TYPES, "type", 1),
    ...mk(VA_CONST, "constant"),
    ...mk(VA_LOGIC, "keyword"),
    ...mk(VA_BUILTIN, "function", 2),
    ...mk(VA_FUNCS, "function"),
    model("se … fimse", "se condicao entao\n\t\nfimse"),
    model("enquanto … fimenquanto", "enquanto condicao faca\n\t\nfimenquanto"),
    model("para … fimpara", "para i de 1 ate 10 faca\n\t\nfimpara"),
    model("repita … ate", "repita\n\t\nate condicao"),
    model("escolha … fimescolha", "escolha x\n\tcaso 1\n\t\t\n\toutrocaso\n\t\t\nfimescolha"),
    model("registro … fimregistro", "tipo\n\tNome = registro\n\t\tcampo: inteiro\n\tfimregistro"),
    model("classe … fimclasse", "tipo\n\tNome = classe\n\t\tprivado valor: inteiro\n\t\tpublico procedimento iniciar(v: inteiro)\n\t\tpublico funcao obter(): inteiro\n\tfimclasse"),
    model("teste … fimteste", 'teste "nome"\ninicio\n\tafirme_igual(esperado, obtido)\nfimteste'),
  ];
}

const completionCache = new Map<string, Completion[]>();
export function completionSource(lang: Lang, locale: Locale) {
  const key = lang + ":" + locale;
  let list = completionCache.get(key);
  if (!list) completionCache.set(key, (list = completions(lang, locale)));
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

const supportCache = new Map<string, LanguageSupport>();
export function languageSupport(lang: Lang, locale: Locale): LanguageSupport {
  const key = lang + ":" + locale;
  let s = supportCache.get(key);
  if (!s) {
    const l = lang === "studio" ? studioStream(locale) : visualgStream(locale);
    s = new LanguageSupport(l, [indentUnit.of("    ")]);
    supportCache.set(key, s);
  }
  return s;
}
