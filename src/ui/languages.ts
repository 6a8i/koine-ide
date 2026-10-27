import { StreamLanguage, StringStream, LanguageSupport, indentUnit } from "@codemirror/language";
import { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { Lang } from "../lang/shared/types";

// ---------------- Portugol Studio ----------------
const STUDIO_KW = ["programa", "funcao", "inclua", "biblioteca", "const", "se", "senao", "enquanto", "faca", "para", "escolha", "caso", "contrario", "pare", "retorne"];
const STUDIO_TYPES = ["inteiro", "real", "cadeia", "caracter", "logico", "vazio"];
const STUDIO_CONST = ["verdadeiro", "falso"];
const STUDIO_LOGIC = ["e", "ou", "nao"];
const STUDIO_BUILTIN = ["escreva", "leia", "limpa"];
const STUDIO_LIBS = ["Matematica", "Texto", "Util", "Tipos"];

interface State { inComment: boolean }

function words(list: string[]) {
  return new Set(list);
}
const sKw = words(STUDIO_KW), sTy = words(STUDIO_TYPES), sCo = words(STUDIO_CONST), sLo = words(STUDIO_LOGIC), sBi = words(STUDIO_BUILTIN), sLib = words(STUDIO_LIBS);

const studioStream = StreamLanguage.define<State>({
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

// ---------------- VisuAlg ----------------
const VA_KW = ["algoritmo", "var", "inicio", "fimalgoritmo", "const", "se", "entao", "senao", "fimse", "enquanto", "faca", "fimenquanto", "para", "de", "ate", "passo", "fimpara", "repita", "escolha", "caso", "outrocaso", "fimescolha", "funcao", "fimfuncao", "procedimento", "fimprocedimento", "retorne", "interrompa", "vetor", "tipo", "registro", "fimregistro"];
const VA_TYPES = ["inteiro", "real", "caractere", "caracter", "literal", "logico"];
const VA_CONST = ["verdadeiro", "falso"];
const VA_LOGIC = ["e", "ou", "nao", "xou", "div", "mod"];
const VA_BUILTIN = ["escreva", "escreval", "leia", "limpatela", "pausa", "aleatorio", "timer", "eco", "cronometro", "debug", "arquivo"];
const VA_FUNCS = ["abs", "arccos", "arcsen", "arctan", "cos", "cotan", "exp", "grauprad", "int", "log", "logn", "pi", "quad", "radpgrau", "raizq", "rand", "randi", "sen", "tan", "asc", "carac", "caracpnum", "compr", "copia", "maiusc", "minusc", "numpcarac", "pos"];
const vKw = words(VA_KW), vTy = words(VA_TYPES), vCo = words(VA_CONST), vLo = words(VA_LOGIC), vBi = words(VA_BUILTIN), vFn = words(VA_FUNCS);

const visualgStream = StreamLanguage.define<State>({
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
    if (stream.match(/^(<-|:=|<=|>=|<>|\.\.|[-+*/\\^%=<>])/)) return "operator";
    if (stream.match(/^[()[\],:;]/)) return "punctuation";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "//" }, closeBrackets: { brackets: ["(", "[", '"'] } },
});

// ---------------- Autocompletar ----------------
function completions(lang: Lang): Completion[] {
  const mk = (list: string[], type: string, boost = 0): Completion[] => list.map((label) => ({ label, type, boost }));
  if (lang === "studio") {
    return [
      ...mk(STUDIO_KW, "keyword", 1),
      ...mk(STUDIO_TYPES, "type", 1),
      ...mk(STUDIO_CONST, "constant"),
      ...mk(STUDIO_LOGIC, "keyword"),
      ...mk(STUDIO_BUILTIN, "function", 2),
      ...mk(STUDIO_LIBS, "namespace"),
      { label: "Matematica.raiz", type: "function", detail: "(x, indice)" },
      { label: "Matematica.potencia", type: "function", detail: "(base, expoente)" },
      { label: "Matematica.arredondar", type: "function", detail: "(x, casas)" },
      { label: "Matematica.valor_absoluto", type: "function", detail: "(x)" },
      { label: "Matematica.maior_numero", type: "function", detail: "(a, b)" },
      { label: "Matematica.menor_numero", type: "function", detail: "(a, b)" },
      { label: "Matematica.PI", type: "constant" },
      { label: "Texto.numero_caracteres", type: "function", detail: "(texto)" },
      { label: "Texto.caixa_alta", type: "function", detail: "(texto)" },
      { label: "Texto.caixa_baixa", type: "function", detail: "(texto)" },
      { label: "Texto.obter_caractere", type: "function", detail: "(texto, posicao)" },
      { label: "Texto.extrair_subtexto", type: "function", detail: "(texto, inicio, fim)" },
      { label: "Texto.posicao_texto", type: "function", detail: "(busca, texto, inicio)" },
      { label: "Texto.substituir", type: "function", detail: "(texto, de, para)" },
      { label: "Util.sorteia", type: "function", detail: "(min, max)" },
      { label: "Util.aguarde", type: "function", detail: "(milissegundos)" },
      { label: "Util.numero_elementos", type: "function", detail: "(vetor)" },
      { label: "Util.tempo_decorrido", type: "function", detail: "()" },
      { label: "Tipos.inteiro_para_cadeia", type: "function", detail: "(x)" },
      { label: "Tipos.cadeia_para_inteiro", type: "function", detail: "(texto)" },
      { label: "Tipos.real_para_inteiro", type: "function", detail: "(x)" },
      { label: "Tipos.cadeia_para_real", type: "function", detail: "(texto)" },
      { label: "funcao inicio", type: "keyword", apply: "funcao inicio()\n{\n\t\n}", detail: "modelo" },
      { label: "se …", type: "keyword", apply: "se (condicao)\n{\n\t\n}", detail: "modelo" },
      { label: "enquanto …", type: "keyword", apply: "enquanto (condicao)\n{\n\t\n}", detail: "modelo" },
      { label: "para …", type: "keyword", apply: "para (inteiro i = 0; i < 10; i++)\n{\n\t\n}", detail: "modelo" },
    ];
  }
  return [
    ...mk(VA_KW, "keyword", 1),
    ...mk(VA_TYPES, "type", 1),
    ...mk(VA_CONST, "constant"),
    ...mk(VA_LOGIC, "keyword"),
    ...mk(VA_BUILTIN, "function", 2),
    ...mk(VA_FUNCS, "function"),
    { label: "se … fimse", type: "keyword", apply: "se condicao entao\n\t\nfimse", detail: "modelo" },
    { label: "enquanto … fimenquanto", type: "keyword", apply: "enquanto condicao faca\n\t\nfimenquanto", detail: "modelo" },
    { label: "para … fimpara", type: "keyword", apply: "para i de 1 ate 10 faca\n\t\nfimpara", detail: "modelo" },
    { label: "repita … ate", type: "keyword", apply: "repita\n\t\nate condicao", detail: "modelo" },
    { label: "escolha … fimescolha", type: "keyword", apply: "escolha x\n\tcaso 1\n\t\t\n\toutrocaso\n\t\t\nfimescolha", detail: "modelo" },
  ];
}

export function completionSource(lang: Lang) {
  const list = completions(lang);
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[\p{L}\p{N}_.]*/u);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    // identificadores já usados no documento
    const seen = new Set(list.map((c) => c.label));
    const extra: Completion[] = [];
    const text = ctx.state.doc.toString();
    const re = /[\p{L}_][\p{L}\p{N}_]{2,}/gu;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(text)) && count < 2000) {
      count++;
      if (m.index === word.from) continue;
      if (!seen.has(m[0])) { seen.add(m[0]); extra.push({ label: m[0], type: "variable", boost: -1 }); }
    }
    return { from: word.from, options: [...list, ...extra], validFor: /^[\p{L}\p{N}_.]*$/u };
  };
}

export function languageSupport(lang: Lang): LanguageSupport {
  const l = lang === "studio" ? studioStream : visualgStream;
  return new LanguageSupport(l, [indentUnit.of("    ")]);
}
