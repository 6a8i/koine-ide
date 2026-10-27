import type { Debugger, Snapshot } from "./debug";

export type Lang = "studio" | "visualg";

export type ErrorKind = "sintaxe" | "execucao" | "interno";

/** Erro gerado pela análise ou pela execução de um programa. Posições são 1-based. */
export class PortugolError extends Error {
  /** nome do arquivo (preenchido na borda do projeto a partir de `fileIndex`) */
  file?: string;
  constructor(
    message: string,
    public line: number,
    public col: number,
    public kind: ErrorKind = "execucao",
    /** índice do arquivo dentro do projeto compilado */
    public fileIndex: number = 0,
  ) {
    super(message);
    this.name = "PortugolError";
  }
}

/** Posição de um nó/erro (índice do arquivo opcional para código antigo). */
export interface Loc {
  line: number;
  col: number;
  file?: number;
}

/** Interface entre o interpretador e o mundo exterior (console, entrada, relógio). */
export interface Host {
  write(text: string): void;
  /** Lê uma linha digitada pelo usuário. Resolve quando o usuário confirmar. */
  readLine(): Promise<string>;
  clear(): void;
  sleep(ms: number): Promise<void>;
}

export interface Program {
  /** nomes dos arquivos do projeto, na ordem dos índices usados em `PortugolError.fileIndex` */
  files: string[];
  run(host: Host): Promise<void>;
  /** Liga o depurador (antes de `run`): a execução passa a ser passo a passo. */
  attachDebugger(d: Debugger): void;
  /** Estado atual das variáveis (globais + função principal, ou a pilha toda em depuração). */
  snapshot(): Snapshot;
}

export interface Pos {
  line: number;
  col: number;
}

/** Sinal interno usado para implementar `pare`/`interrompa` e `retorne`. */
export class BreakSignal {}
export class ContinueSignal {}
export class ReturnSignal {
  constructor(public value: unknown) {}
}
export const BREAK = new BreakSignal();
export const CONTINUE = new ContinueSignal();
