import type { Debugger, Snapshot } from "./debug";
import type { CoverageCollector, TestInfo } from "./testing";
import type { Locale } from "../i18n";



/** "teste": uma afirmação de teste falhou */
export type ErrorKind = "sintaxe" | "execucao" | "interno" | "teste";

/** Erro gerado pela análise ou pela execução de um programa. Posições são 1-based. */
export class KoineError extends Error {
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
    this.name = "KoineError";
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
  /** (testes) tudo o que o programa escreveu até agora */
  captured?(): string;
  /** (testes) fornece linhas para os próximos `leia` */
  feed?(text: string): void;
}

/** Opções de compilação de um projeto. */
export interface CompileOptions {
  /** modo de testes: a entrada pode ser um módulo (arquivo só de testes) e módulos de teste enxergam membros privados */
  tests?: boolean;
  /** idioma das palavras reservadas do código (padrão: português) */
  locale?: Locale;
}

export interface Program {
  /** nomes dos arquivos do projeto, na ordem dos índices usados em `KoineError.fileIndex` */
  files: string[];
  run(host: Host): Promise<void>;
  /** Liga o depurador (antes de `run`): a execução passa a ser passo a passo. */
  attachDebugger(d: Debugger): void;
  /** Estado atual das variáveis (globais + função principal, ou a pilha toda em depuração). */
  snapshot(): Snapshot;
  /** testes (`teste "nome"`) do arquivo de entrada */
  tests: TestInfo[];
  /** Executa um teste isoladamente (globais reiniciadas). Lança KoineError de tipo "teste" quando uma afirmação falha. */
  runTest(host: Host, id: number): Promise<void>;
  /** Liga um coletor de cobertura (antes de executar). */
  attachCoverage(c: CoverageCollector): void;
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
