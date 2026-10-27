import { Host, PortugolError } from "./types";

export const MAX_CALL_DEPTH = 1200;

export function stackOverflow(line: number, col: number) {
  return new PortugolError(
    "Estouro de pilha: a função chamou a si mesma vezes demais (recursão sem fim?)",
    line,
    col,
  );
}

/** Converte um RangeError do JS (pilha estourada) num erro amigável. */
export function wrapJsError(e: unknown, line: number, col: number): unknown {
  // Perto do limite da pilha qualquer chamada pode falhar de novo; por isso só
  // usamos operadores aqui e deixamos a conversão final para o topo (run()).
  if (e instanceof RangeError) return e;
  return e;
}

/** No topo da execução (pilha rasa) converte RangeError em erro amigável. */
export function finalizeError(e: unknown): unknown {
  if (e instanceof RangeError) return stackOverflow(0, 0);
  return e;
}

export function parseIntStrict(s: string): number | null {
  const t = s.trim();
  if (!/^[-+]?\d+$/.test(t)) return null;
  return parseInt(t, 10);
}

export function parseRealStrict(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
  return parseFloat(t);
}

export function formatRealJava(v: number): string {
  // Imita a saída do Java/Portugol Studio: sempre com casa decimal.
  if (!isFinite(v)) return v > 0 ? "Infinito" : v < 0 ? "-Infinito" : "NaN";
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return v.toFixed(1);
  let s = String(v);
  if (/e/i.test(s)) s = s.replace("e+", "E").replace("e", "E");
  return s;
}

/** Host que acumula saída em memória, útil para testes. */
export class BufferHost implements Host {
  out = "";
  inputs: string[];
  constructor(inputs: string[] = []) {
    this.inputs = [...inputs];
  }
  write(t: string) {
    this.out += t;
  }
  async readLine() {
    if (this.inputs.length === 0) throw new PortugolError("Teste pediu entrada, mas não há mais linhas", 0, 0);
    return this.inputs.shift()!;
  }
  clear() {
    this.out = "";
  }
  async sleep(_ms: number) {}
}
