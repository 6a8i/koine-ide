import { m } from "../i18n/messages";
import { Builtin, T, TypeRef } from "./ast";
import { KoineError } from "../shared/types";
import { formatRealJava, parseIntStrict, parseRealStrict, StructVal, ObjVal, formatBool, parseBool } from "../shared/runtime";
import { ASSERTS } from "../shared/testing";

const INT = T("inteiro"), REAL = T("real"), CAD = T("cadeia"), CAR = T("caracter"), LOG = T("logico"), VAZ = T("vazio");

const rt = (msg: string, c: { line: number; col: number; file?: number }) => new KoineError(msg, c.line, c.col, "execucao", c.file ?? 0);

export function formatValue(v: unknown, t: TypeRef | null, depth = 0): string {
  if (typeof v === "boolean") return formatBool(v);
  if (typeof v === "number") {
    if (t && t.base === "inteiro") return String(v);
    if (t && t.base === "real") return formatRealJava(v);
    return Number.isInteger(v) ? String(v) : formatRealJava(v);
  }
  if (v === null) return "nulo";
  if (v === undefined) return "";
  if (typeof v === "string") return depth > 0 ? JSON.stringify(v) : v;
  if (Array.isArray(v)) return "[" + v.map((x) => formatValue(x, null, depth + 1)).join(", ") + "]";
  if (v instanceof StructVal || v instanceof ObjVal) {
    const decl = v instanceof StructVal ? v.decl : v.cls;
    if (depth > 3) return `${decl.name}{…}`;
    const types = (decl as { fieldTypes?: TypeRef[] }).fieldTypes;
    const fields = (decl as { fields?: { t: TypeRef }[]; allFields?: { t: TypeRef }[] });
    const ft = (i: number): TypeRef | null => types?.[i] ?? fields.fields?.[i]?.t ?? fields.allFields?.[i]?.t ?? null;
    return `${decl.name}{${v.f.map((x, i) => `${decl.fieldNames[i]}: ${formatValue(x, ft(i), depth + 1)}`).join(", ")}}`;
  }
  return String(v);
}

const startTime = Date.now();

function b(name: string, params: (TypeRef | "*")[], ret: TypeRef | "arg0", impl: Builtin["impl"], extra: Partial<Builtin> = {}): Builtin {
  return { name, params, ret, impl, ...extra };
}

export const LIBS: Record<string, Record<string, Builtin | { constValue: number; t: TypeRef }>> = {
  Matematica: {
    PI: { constValue: Math.PI, t: REAL },
    E: { constValue: Math.E, t: REAL },
    raiz: b("raiz", [REAL, REAL], REAL, ([x, i], c) => {
      if (i === 0) throw rt(m("Índice da raiz não pode ser zero"), c);
      if (x < 0 && i % 2 === 0) throw rt(m("Não existe raiz de índice par de número negativo"), c);
      return x < 0 ? -Math.pow(-x, 1 / i) : Math.pow(x, 1 / i);
    }),
    potencia: b("potencia", [REAL, REAL], REAL, ([x, y]) => Math.pow(x, y)),
    arredondar: b("arredondar", [REAL, INT], REAL, ([x, n]) => {
      const f = Math.pow(10, n);
      return Math.round(x * f) / f;
    }),
    valor_absoluto: b("valor_absoluto", [REAL], "arg0", ([x]) => Math.abs(x)),
    seno: b("seno", [REAL], REAL, ([x]) => Math.sin(x)),
    cosseno: b("cosseno", [REAL], REAL, ([x]) => Math.cos(x)),
    tangente: b("tangente", [REAL], REAL, ([x]) => Math.tan(x)),
    logaritmo: b("logaritmo", [REAL, REAL], REAL, ([x, base], c) => {
      if (x <= 0 || base <= 0 || base === 1) throw rt(m("Logaritmo inválido"), c);
      return Math.log(x) / Math.log(base);
    }),
    maior_numero: b("maior_numero", [REAL, REAL], "arg0", ([a, bb]) => Math.max(a, bb)),
    menor_numero: b("menor_numero", [REAL, REAL], "arg0", ([a, bb]) => Math.min(a, bb)),
  },
  Texto: {
    numero_caracteres: b("numero_caracteres", [CAD], INT, ([s]) => String(s).length),
    caixa_alta: b("caixa_alta", [CAD], CAD, ([s]) => String(s).toUpperCase()),
    caixa_baixa: b("caixa_baixa", [CAD], CAD, ([s]) => String(s).toLowerCase()),
    obter_caractere: b("obter_caractere", [CAD, INT], CAR, ([s, i], c) => {
      if (i < 0 || i >= String(s).length) throw rt(m("Posição {i} fora dos limites do texto (tamanho {n})", { i, n: String(s).length }), c);
      return String(s)[i];
    }),
    posicao_texto: b("posicao_texto", [CAD, CAD, INT], INT, ([sub, s, ini]) => String(s).indexOf(String(sub), ini)),
    substituir: b("substituir", [CAD, CAD, CAD], CAD, ([s, a, bb]) => String(s).split(String(a)).join(String(bb))),
    extrair_subtexto: b("extrair_subtexto", [CAD, INT, INT], CAD, ([s, i, f], c) => {
      const str = String(s);
      if (i < 0 || f > str.length || i > f) throw rt(m("Intervalo [{i}, {f}] fora dos limites do texto (tamanho {length})", { i, f, length: str.length }), c);
      return str.substring(i, f);
    }),
    preencher_a_esquerda: b("preencher_a_esquerda", [CAR, INT, CAD], CAD, ([ch, n, s]) => String(s).padStart(n, String(ch))),
    preencher_a_direita: b("preencher_a_direita", [CAR, INT, CAD], CAD, ([ch, n, s]) => String(s).padEnd(n, String(ch))),
    inverter: b("inverter", [CAD], CAD, ([s]) => [...String(s)].reverse().join("")),
    remover_espacos: b("remover_espacos", [CAD], CAD, ([s]) => String(s).trim()),
  },
  Util: {
    aguarde: b("aguarde", [INT], VAZ, undefined, { blocking: true }),
    sorteia: b("sorteia", [INT, INT], INT, ([a, bb], c) => {
      if (a > bb) throw rt(m("O valor mínimo de sorteia não pode ser maior que o máximo"), c);
      return a + Math.floor(Math.random() * (bb - a + 1));
    }),
    tempo_decorrido: b("tempo_decorrido", [], INT, () => Date.now() - startTime),
    numero_elementos: b("numero_elementos", ["*"], INT, ([v], c) => {
      if (!Array.isArray(v)) throw rt(m("numero_elementos espera um vetor"), c);
      return v.length;
    }),
    numero_linhas: b("numero_linhas", ["*"], INT, ([m], c) => {
      if (!Array.isArray(m)) throw rt(m("numero_linhas espera uma matriz"), c);
      return m.length;
    }),
    numero_colunas: b("numero_colunas", ["*"], INT, ([m], c) => {
      if (!Array.isArray(m) || !Array.isArray(m[0])) throw rt(m("numero_colunas espera uma matriz"), c);
      return m[0].length;
    }),
  },
  Tipos: {
    inteiro_para_cadeia: b("inteiro_para_cadeia", [INT], CAD, ([x]) => String(x)),
    inteiro_para_real: b("inteiro_para_real", [INT], REAL, ([x]) => x),
    inteiro_para_caracter: b("inteiro_para_caracter", [INT], CAR, ([x]) => String.fromCharCode(x)),
    inteiro_para_logico: b("inteiro_para_logico", [INT], LOG, ([x]) => x !== 0),
    real_para_cadeia: b("real_para_cadeia", [REAL], CAD, ([x]) => formatRealJava(x)),
    real_para_inteiro: b("real_para_inteiro", [REAL], INT, ([x]) => Math.trunc(x)),
    cadeia_para_inteiro: b("cadeia_para_inteiro", [CAD], INT, ([s], c) => {
      const v = parseIntStrict(String(s));
      if (v === null) throw rt(m("Não foi possível converter \"{s}\" para inteiro", { s }), c);
      return v;
    }),
    cadeia_para_real: b("cadeia_para_real", [CAD], REAL, ([s], c) => {
      const v = parseRealStrict(String(s));
      if (v === null) throw rt(m("Não foi possível converter \"{s}\" para real", { s }), c);
      return v;
    }),
    cadeia_para_caracter: b("cadeia_para_caracter", [CAD], CAR, ([s]) => String(s)[0] ?? ""),
    cadeia_para_logico: b("cadeia_para_logico", [CAD], LOG, ([s], c) => {
      const v = parseBool(String(s));
      if (v !== null) return v;
      throw rt(m("Não foi possível converter \"{s}\" para lógico", { s }), c);
    }),
    caracter_para_cadeia: b("caracter_para_cadeia", [CAR], CAD, ([x]) => String(x)),
    caracter_para_inteiro: b("caracter_para_inteiro", [CAR], INT, ([x]) => String(x).charCodeAt(0)),
    logico_para_cadeia: b("logico_para_cadeia", [LOG], CAD, ([x]) => formatBool(x)),
    logico_para_inteiro: b("logico_para_inteiro", [LOG], INT, ([x]) => (x ? 1 : 0)),
    e_inteiro: b("e_inteiro", [CAD], LOG, ([s]) => parseIntStrict(String(s)) !== null),
    e_real: b("e_real", [CAD], LOG, ([s]) => parseRealStrict(String(s)) !== null),
  },
};

/** Funções globais (sem biblioteca). escreva/leia são tratadas de forma especial pelo interpretador. */
export const GLOBAL_BUILTINS: Record<string, Builtin> = {
  escreva: { name: "escreva", params: [], variadic: true, ret: VAZ },
  leia: { name: "leia", params: [], variadic: true, ret: VAZ, blocking: true },
  limpa: { name: "limpa", params: [], ret: VAZ },
  // testes (ver shared/testing.ts); saida/entrada são tratadas pelo interpretador, que tem o console
  afirme: { name: "afirme", params: [LOG, CAD], optional: 1, ret: VAZ, impl: ASSERTS.afirme },
  afirme_igual: { name: "afirme_igual", params: ["*", "*", CAD], optional: 1, ret: VAZ, impl: ASSERTS.afirme_igual },
  afirme_diferente: { name: "afirme_diferente", params: ["*", "*", CAD], optional: 1, ret: VAZ, impl: ASSERTS.afirme_diferente },
  afirme_aproximado: { name: "afirme_aproximado", params: [REAL, REAL, REAL, CAD], optional: 1, ret: VAZ, impl: ASSERTS.afirme_aproximado },
  saida: { name: "saida", params: [], ret: CAD },
  entrada: { name: "entrada", params: [CAD], ret: VAZ },
};
