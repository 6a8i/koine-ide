import { FromWorker, ToWorker } from "./lang/protocol";
import { Lang } from "./lang/shared/types";
import { DebugCommand, Snapshot } from "./lang/shared/debug";

export interface RunError { message: string; line: number; col: number; kind: string }

export interface RunnerEvents {
  out(text: string): void;
  clear(): void;
  inputRequest(): void;
  done(ms: number, snapshot: Snapshot | null): void;
  error(e: RunError, ms: number, snapshot: Snapshot | null): void;
  stopped(ms: number): void;
  /** depuração: parou numa linha */
  paused(line: number, col: number, snapshot: Snapshot): void;
  /** depuração: voltou a executar */
  resumed(): void;
  /** foto periódica das variáveis (em depuração) */
  snapshot(snapshot: Snapshot): void;
}

/**
 * Controla o worker que executa os programas. Um worker por execução: parar = terminar.
 * O tempo medido exclui o que o programa passou esperando o usuário (entrada ou pausa do depurador).
 */
export class Runner {
  private worker: Worker | null = null;
  private start = 0;
  running = false;
  debugging = false;
  waitingInput = false;
  paused = false;
  /** tempo total gasto esperando o usuário (não conta como execução) */
  private waited = 0;
  private waitStart = 0;

  constructor(private ev: RunnerEvents) {}

  run(lang: Lang, source: string, debug?: { breakpoints: number[] }) {
    this.stop(true);
    this.worker = new Worker(new URL("./lang/worker.ts", import.meta.url), { type: "module" });
    this.running = true;
    this.debugging = !!debug;
    this.waitingInput = false;
    this.paused = false;
    this.pendingStep = null;
    this.start = performance.now();
    this.waited = 0;
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      switch (m.type) {
        case "out": this.ev.out(m.text); break;
        case "clear": this.ev.clear(); break;
        case "input-request": this.waitingInput = true; this.beginWait(); this.ev.inputRequest(); break;
        case "done": this.finish(); this.ev.done(this.elapsed(), m.snapshot); break;
        case "error": this.finish(); this.ev.error(m, this.elapsed(), m.snapshot); break;
        case "paused": {
          this.paused = true;
          this.beginWait();
          this.ev.paused(m.line, m.col, m.snapshot);
          const next = this.pendingStep;
          if (next) { this.pendingStep = null; this.debug(next); }
          break;
        }
        case "snapshot": this.ev.snapshot(m.snapshot); break;
      }
    };
    this.worker.onerror = (e) => {
      this.finish();
      this.ev.error({ message: "Falha ao executar: " + e.message, line: 0, col: 0, kind: "interno" }, this.elapsed(), null);
    };
    this.post({ type: "run", lang, source, debug });
  }

  sendInput(value: string) {
    if (!this.running || !this.waitingInput) return;
    this.waitingInput = false;
    this.endWait();
    this.post({ type: "input", value });
  }

  /** passo pedido enquanto o worker ainda não confirmou a pausa anterior (teclas rápidas) */
  private pendingStep: DebugCommand | null = null;

  /** Comando do depurador (continuar, passo, entrar, sair, pausar). */
  debug(command: DebugCommand) {
    if (!this.running || !this.debugging) return;
    if (command === "pause") {
      this.pendingStep = null;
      if (!this.paused) this.post({ type: "debug", command });
      return;
    }
    if (!this.paused) {
      // só passos ficam na fila; "continuar" nunca, para não pular um ponto de parada
      if (command !== "continue") this.pendingStep = command;
      return;
    }
    this.pendingStep = null;
    this.paused = false;
    this.endWait();
    this.post({ type: "debug", command });
    this.ev.resumed();
  }

  setBreakpoints(lines: number[]) {
    if (this.running && this.debugging) this.post({ type: "breakpoints", lines });
  }

  stop(silent = false) {
    if (!this.worker) return;
    const ms = this.elapsed();
    this.finish();
    if (!silent) this.ev.stopped(ms);
  }

  private beginWait() {
    if (!this.waitingInput && !this.paused) return;
    if (this.waitStart === 0) this.waitStart = performance.now();
  }

  private endWait() {
    if (this.waitingInput || this.paused) return; // ainda esperando por outro motivo
    if (this.waitStart) { this.waited += performance.now() - this.waitStart; this.waitStart = 0; }
  }

  private finish() {
    this.worker?.terminate();
    this.worker = null;
    this.running = false;
    this.debugging = false;
    this.waitingInput = false;
    this.paused = false;
  }

  private elapsed() {
    const waiting = this.waitStart ? performance.now() - this.waitStart : 0;
    return Math.max(0, performance.now() - this.start - this.waited - waiting);
  }

  private post(m: ToWorker) {
    this.worker?.postMessage(m);
  }
}
