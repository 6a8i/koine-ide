import { Builtin, T, TypeRef } from "./ast";
import { PortugolError } from "../shared/types";

const INT = T("inteiro"), REAL = T("real"), CAR = T("caractere");
const rt = (m: string, at: { line: number; col: number }) => new PortugolError(m, at.line, at.col);

function b(name: string, params: TypeRef[], ret: TypeRef | "arg0", impl: Builtin["impl"]): Builtin {
  return { name, params, ret, impl };
}

export const BUILTINS: Record<string, Builtin> = {};
for (const f of [
  b("abs", [REAL], "arg0", ([x]) => Math.abs(x)),
  b("arccos", [REAL], REAL, ([x]) => Math.acos(x)),
  b("arcsen", [REAL], REAL, ([x]) => Math.asin(x)),
  b("arctan", [REAL], REAL, ([x]) => Math.atan(x)),
  b("cos", [REAL], REAL, ([x]) => Math.cos(x)),
  b("cotan", [REAL], REAL, ([x]) => 1 / Math.tan(x)),
  b("exp", [REAL, REAL], REAL, ([x, y]) => Math.pow(x, y)),
  b("grauprad", [REAL], REAL, ([x]) => (x * Math.PI) / 180),
  b("int", [REAL], INT, ([x]) => Math.trunc(x)),
  b("log", [REAL], REAL, ([x], at) => { if (x <= 0) throw rt("Logaritmo de número não positivo", at); return Math.log10(x); }),
  b("logn", [REAL], REAL, ([x], at) => { if (x <= 0) throw rt("Logaritmo de número não positivo", at); return Math.log(x); }),
  b("pi", [], REAL, () => Math.PI),
  b("quad", [REAL], "arg0", ([x]) => x * x),
  b("radpgrau", [REAL], REAL, ([x]) => (x * 180) / Math.PI),
  b("raizq", [REAL], REAL, ([x], at) => { if (x < 0) throw rt("Raiz quadrada de número negativo", at); return Math.sqrt(x); }),
  b("rand", [], REAL, () => Math.random()),
  b("randi", [INT], INT, ([n]) => Math.floor(Math.random() * n)),
  b("sen", [REAL], REAL, ([x]) => Math.sin(x)),
  b("tan", [REAL], REAL, ([x]) => Math.tan(x)),
  b("asc", [CAR], INT, ([s]) => String(s).charCodeAt(0) || 0),
  b("carac", [INT], CAR, ([c]) => String.fromCharCode(c)),
  b("caracpnum", [CAR], REAL, ([s], at) => {
    const v = Number(String(s).trim().replace(",", "."));
    if (String(s).trim() === "" || isNaN(v)) throw rt(`"${s}" não é um número válido`, at);
    return v;
  }),
  b("compr", [CAR], INT, ([s]) => String(s).length),
  b("copia", [CAR, INT, INT], CAR, ([s, p, n]) => String(s).substr(p - 1, n)),
  b("maiusc", [CAR], CAR, ([s]) => String(s).toUpperCase()),
  b("minusc", [CAR], CAR, ([s]) => String(s).toLowerCase()),
  b("numpcarac", [REAL], CAR, ([x]) => formatNumberVisualg(x, false)),
  b("pos", [CAR, CAR], INT, ([sub, s]) => String(s).indexOf(String(sub)) + 1),
]) BUILTINS[f.name] = f;

/** Formata um número como o VisuAlg: inteiros com espaço à esquerda; reais com casas necessárias. */
export function formatNumberVisualg(v: number, leadingSpace = true): string {
  let s: string;
  if (Number.isInteger(v)) s = String(v);
  else {
    s = Number(v.toPrecision(15)).toString();
    if (/e/i.test(s)) s = v.toExponential(10).replace(/\.?0+e/, "e").replace("e+", "E+").replace("e-", "E-");
  }
  if (leadingSpace && v >= 0) s = " " + s;
  return s;
}

export function formatVisualg(v: unknown, t: TypeRef): string {
  if (typeof v === "boolean") return v ? " VERDADEIRO" : " FALSO";
  if (typeof v === "number") return formatNumberVisualg(v);
  if (v === undefined || v === null) return "";
  void t;
  return String(v);
}

export function formatWithWidth(v: unknown, width: number | null, decimals: number | null, t: TypeRef): string {
  if (typeof v === "number") {
    let s: string;
    if (decimals !== null) s = v.toFixed(Math.max(0, decimals));
    else if (width !== null && t.base === "real" && !Number.isInteger(v)) s = formatNumberVisualg(v, false);
    else s = formatNumberVisualg(v, false);
    if (width !== null) s = s.padStart(width, " ");
    else if (v >= 0 && decimals === null) s = " " + s;
    return s;
  }
  let s = typeof v === "boolean" ? (v ? "VERDADEIRO" : "FALSO") : String(v ?? "");
  if (width !== null) s = s.padStart(width, " ");
  return s;
}
