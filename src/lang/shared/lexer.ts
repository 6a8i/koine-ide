import { PortugolError } from "./types";

export type TokType =
  | "ident"
  | "keyword"
  | "int"
  | "real"
  | "string"
  | "char"
  | "op"
  | "eof";

export interface Token {
  type: TokType;
  /** Texto do token. Para keywords em linguagens case-insensitive, já em minúsculas. */
  value: string;
  /** Texto original (para mensagens). */
  raw: string;
  line: number;
  col: number;
  /** Índice do início do token na fonte. */
  start: number;
  end: number;
}

export interface LexerOptions {
  keywords: Set<string>;
  caseInsensitive: boolean;
  /** Operadores, do mais longo para o mais curto. */
  operators: string[];
  blockComments: boolean; // /* */
  braceComments: boolean; // { }  (VisuAlg)
  /** Se true, 'x' é caractere (Studio). Se false, '...' é string. */
  singleQuoteChar: boolean;
  /** Permite escapes \n \t \" dentro de strings. */
  escapes: boolean;
}

const isIdentStart = (c: string) => /[\p{L}_]/u.test(c);
const isIdentPart = (c: string) => /[\p{L}\p{N}_]/u.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

export function tokenize(src: string, opt: LexerOptions, fileIndex = 0): Token[] {
  const toks: Token[] = [];
  const ops = [...opt.operators].sort((a, b) => b.length - a.length);
  let i = 0,
    line = 1,
    col = 1;
  const n = src.length;

  const err = (msg: string, l = line, c = col) => new PortugolError(msg, l, c, "sintaxe", fileIndex);
  const adv = (k = 1) => {
    for (let j = 0; j < k; j++) {
      if (src[i] === "\n") {
        line++;
        col = 1;
      } else col++;
      i++;
    }
  };
  const push = (type: TokType, value: string, raw: string, l: number, c: number, start: number) =>
    toks.push({ type, value, raw, line: l, col: c, start, end: i });

  while (i < n) {
    const ch = src[i];
    // espaços
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === " ") {
      adv();
      continue;
    }
    // comentários
    if (ch === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") adv();
      continue;
    }
    if (opt.blockComments && ch === "/" && src[i + 1] === "*") {
      const l = line,
        c = col;
      adv(2);
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) adv();
      if (i >= n) throw err("Comentário de bloco não foi fechado (faltou */)", l, c);
      adv(2);
      continue;
    }
    if (opt.braceComments && ch === "{") {
      const l = line,
        c = col;
      while (i < n && src[i] !== "}") adv();
      if (i >= n) throw err("Comentário não foi fechado (faltou })", l, c);
      adv();
      continue;
    }
    const l = line,
      c = col,
      start = i;
    // números
    if (isDigit(ch) || (ch === "." && isDigit(src[i + 1] ?? ""))) {
      if (ch === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        adv(2);
        while (i < n && /[0-9a-fA-F]/.test(src[i])) adv();
        push("int", String(parseInt(src.slice(start + 2, i), 16)), src.slice(start, i), l, c, start);
        continue;
      }
      if (ch === "0" && (src[i + 1] === "b" || src[i + 1] === "B")) {
        adv(2);
        while (i < n && (src[i] === "0" || src[i] === "1")) adv();
        push("int", String(parseInt(src.slice(start + 2, i), 2)), src.slice(start, i), l, c, start);
        continue;
      }
      let isReal = false;
      while (i < n && isDigit(src[i])) adv();
      if (src[i] === "." && isDigit(src[i + 1] ?? "")) {
        isReal = true;
        adv();
        while (i < n && isDigit(src[i])) adv();
      }
      if ((src[i] === "e" || src[i] === "E") && /[-+0-9]/.test(src[i + 1] ?? "")) {
        const save = i;
        adv();
        if (src[i] === "+" || src[i] === "-") adv();
        if (isDigit(src[i] ?? "")) {
          isReal = true;
          while (i < n && isDigit(src[i])) adv();
        } else {
          // não era expoente: volta
          const back = i - save;
          i = save;
          col -= back;
        }
      }
      const raw = src.slice(start, i);
      if (isIdentStart(src[i] ?? "")) throw err(`Número inválido: "${raw}${src[i]}"`, l, c);
      push(isReal ? "real" : "int", raw, raw, l, c, start);
      continue;
    }
    // identificadores / palavras-chave
    if (isIdentStart(ch)) {
      while (i < n && isIdentPart(src[i])) adv();
      const raw = src.slice(start, i);
      const key = opt.caseInsensitive ? raw.toLowerCase() : raw;
      if (opt.keywords.has(key)) push("keyword", key, raw, l, c, start);
      else push("ident", opt.caseInsensitive ? key : raw, raw, l, c, start);
      continue;
    }
    // strings
    if (ch === '"' || (ch === "'" && !opt.singleQuoteChar)) {
      const quote = ch;
      adv();
      let s = "";
      while (i < n && src[i] !== quote) {
        if (src[i] === "\n") throw err("Texto não foi fechado (faltou aspas)", l, c);
        if (opt.escapes && src[i] === "\\") {
          adv();
          const e = src[i];
          switch (e) {
            case "n": s += "\n"; break;
            case "t": s += "\t"; break;
            case "r": s += "\r"; break;
            case "0": s += "\0"; break;
            case "\\": s += "\\"; break;
            case '"': s += '"'; break;
            case "'": s += "'"; break;
            default: s += "\\" + (e ?? "");
          }
          adv();
          continue;
        }
        s += src[i];
        adv();
      }
      if (i >= n) throw err("Texto não foi fechado (faltou aspas)", l, c);
      adv();
      push("string", s, src.slice(start, i), l, c, start);
      continue;
    }
    if (ch === "'" && opt.singleQuoteChar) {
      adv();
      let s = "";
      if (src[i] === "\\" && opt.escapes) {
        adv();
        const e = src[i];
        s = e === "n" ? "\n" : e === "t" ? "\t" : e === "0" ? "\0" : e;
        adv();
      } else if (src[i] === "'" ) {
        throw err("Caractere vazio: use ' ' para espaço", l, c);
      } else {
        s = src[i];
        adv();
      }
      if (src[i] !== "'") throw err("Caractere inválido: use apenas um caractere entre aspas simples, ou aspas duplas para texto", l, c);
      adv();
      push("char", s, src.slice(start, i), l, c, start);
      continue;
    }
    // operadores
    let matched = false;
    for (const op of ops) {
      if (src.startsWith(op, i)) {
        adv(op.length);
        push("op", op, op, l, c, start);
        matched = true;
        break;
      }
    }
    if (matched) continue;
    throw err(`Caractere inesperado: "${ch}"`);
  }
  toks.push({ type: "eof", value: "<fim>", raw: "", line, col, start: i, end: i });
  return toks;
}

/** Utilitário de navegação sobre tokens, compartilhado pelos parsers. */
export class TokenStream {
  pos = 0;
  constructor(public toks: Token[], public fileIndex = 0) {}
  get cur(): Token {
    return this.toks[this.pos];
  }
  peek(k = 1): Token {
    return this.toks[Math.min(this.pos + k, this.toks.length - 1)];
  }
  next(): Token {
    const t = this.toks[this.pos];
    if (this.pos < this.toks.length - 1) this.pos++;
    return t;
  }
  is(type: TokType, value?: string): boolean {
    const t = this.cur;
    return t.type === type && (value === undefined || t.value === value);
  }
  isOp(v: string) {
    return this.is("op", v);
  }
  isKw(v: string) {
    return this.is("keyword", v);
  }
  accept(type: TokType, value?: string): Token | null {
    if (this.is(type, value)) return this.next();
    return null;
  }
  acceptOp(v: string) {
    return this.accept("op", v);
  }
  acceptKw(v: string) {
    return this.accept("keyword", v);
  }
  error(msg: string, t: Token = this.cur): PortugolError {
    return new PortugolError(msg, t.line, t.col, "sintaxe", this.fileIndex);
  }
  describe(t: Token = this.cur): string {
    if (t.type === "eof") return "o fim do programa";
    if (t.type === "string") return `o texto ${t.raw}`;
    return `"${t.raw}"`;
  }
  expectOp(v: string, what?: string): Token {
    if (this.isOp(v)) return this.next();
    throw this.error(`Esperava "${v}"${what ? ` ${what}` : ""}, mas encontrei ${this.describe()}`);
  }
  expectKw(v: string, what?: string): Token {
    if (this.isKw(v)) return this.next();
    throw this.error(`Esperava "${v}"${what ? ` ${what}` : ""}, mas encontrei ${this.describe()}`);
  }
  expectIdent(what = "um nome"): Token {
    if (this.is("ident")) return this.next();
    if (this.is("keyword"))
      throw this.error(`"${this.cur.raw}" é uma palavra reservada e não pode ser usada como ${what}`);
    throw this.error(`Esperava ${what}, mas encontrei ${this.describe()}`);
  }
}
