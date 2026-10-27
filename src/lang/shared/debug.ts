/**
 * Depurador: executa o programa passo a passo, com pontos de parada,
 * e tira "fotos" (snapshots) das variáveis para a interface.
 *
 * Funciona no worker. Os interpretadores chamam `before()` antes de cada
 * comando e `enter()/leave()` ao entrar/sair de funções.
 */

export interface VarInfo {
  name: string;
  type: string;
  value: string;
}

export interface FrameInfo {
  /** nome da função (ex.: "inicio", "fatorial") */
  name: string;
  /** linha do comando sendo executado neste quadro */
  line: number;
  vars: VarInfo[];
}

export interface Snapshot {
  /** quadros da pilha de chamadas, do mais externo para o mais interno */
  frames: FrameInfo[];
  globals: VarInfo[];
}

/** Mapeamento slot → nome/tipo de um quadro (função). */
export interface FrameNames {
  name: string;
  slots: { slot: number; name: string; type: string }[];
}

export type DebugCommand = "continue" | "over" | "into" | "out" | "pause";

interface Frame {
  names: FrameNames;
  F: any[];
  line: number;
}

const MAX_ITEMS = 60;
const MAX_STR = 200;

/** Converte um valor em texto legível (sem depender da linguagem). */
export function describeValue(v: any, depth = 0): string {
  if (v === undefined || v === null) return "(sem valor)";
  if (typeof v === "boolean") return v ? "verdadeiro" : "falso";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    if (!isFinite(v)) return v > 0 ? "Infinito" : v < 0 ? "-Infinito" : "NaN";
    return String(Number(v.toPrecision(12)));
  }
  if (typeof v === "string") {
    const s = v.length > MAX_STR ? v.slice(0, MAX_STR) + "…" : v;
    return JSON.stringify(s);
  }
  // referência (parâmetro por &/var)
  if (typeof v.get === "function" && typeof v.set === "function") {
    try { return describeValue(v.get(), depth); } catch { return "(sem valor)"; }
  }
  if (Array.isArray(v)) return describeList(v, depth);
  // VArray do VisuAlg: { lo, hi, data }
  if (Array.isArray(v.data) && typeof v.lo === "number") {
    return (v.lo !== 0 ? `[${v.lo}..${v.hi}] ` : "") + describeList(v.data, depth);
  }
  return String(v);
}

function describeList(arr: any[], depth: number): string {
  if (depth > 2) return `[… ${arr.length} itens]`;
  const items = arr.slice(0, MAX_ITEMS).map((x) => describeValue(x, depth + 1));
  const tail = arr.length > MAX_ITEMS ? `, … (+${arr.length - MAX_ITEMS})` : "";
  return `[${items.join(", ")}${tail}]`;
}

export function describeFrame(names: FrameNames, F: any[]): VarInfo[] {
  const out: VarInfo[] = [];
  for (const s of names.slots) out.push({ name: s.name, type: s.type, value: describeValue(F[s.slot]) });
  return out;
}

export interface DebugEvents {
  paused(line: number, col: number, snapshot: Snapshot): void;
  snapshot(snapshot: Snapshot): void;
}

export class Debugger {
  breakpoints = new Set<number>();
  private mode: DebugCommand = "into";
  private targetDepth = 0;
  private stack: Frame[] = [];
  private globals: FrameNames = { name: "globais", slots: [] };
  private G: any[] = [];
  private resume: (() => void) | null = null;
  private lastYield = 0;
  private lastSnap = 0;
  private lastStop: { line: number; frame: Frame | null } | null = null;
  private channel = new MessageChannel();
  paused = false;

  constructor(private ev: DebugEvents, breakpoints: number[], startPaused: boolean) {
    for (const b of breakpoints) this.breakpoints.add(b);
    this.mode = startPaused ? "into" : "continue";
    // no Node (testes) as portas manteriam o processo vivo
    (this.channel.port1 as any).unref?.();
    (this.channel.port2 as any).unref?.();
  }

  setGlobals(names: FrameNames, G: any[]) {
    this.globals = names;
    this.G = G;
  }

  enter(names: FrameNames, F: any[]) {
    this.stack.push({ names, F, line: 0 });
  }

  leave() {
    this.stack.pop();
  }

  get depth() {
    return this.stack.length;
  }

  snapshot(): Snapshot {
    return {
      frames: this.stack.map((f) => ({ name: f.names.name, line: f.line, vars: describeFrame(f.names, f.F) })),
      globals: describeFrame(this.globals, this.G),
    };
  }

  /** Chamado pelo interpretador antes de executar cada comando. */
  async before(s: { line: number; col: number }): Promise<void> {
    const depth = this.stack.length;
    const top = this.stack[depth - 1] ?? null;
    if (top) top.line = s.line;

    let stop = false;
    switch (this.mode) {
      case "pause": case "into": stop = true; break;
      case "over": stop = depth <= this.targetDepth; break;
      case "out": stop = depth < this.targetDepth; break;
      case "continue": break;
    }
    // Comandos seguidos na mesma linha do mesmo quadro contam como um único passo;
    // ao mudar de linha (ou voltar a ela num laço) o controle é zerado.
    if (this.lastStop && (this.lastStop.line !== s.line || this.lastStop.frame !== top)) this.lastStop = null;
    const sameAsLast = this.lastStop !== null;
    if (stop && this.mode !== "pause" && sameAsLast) stop = false;
    if (!stop && !sameAsLast && this.breakpoints.has(s.line)) stop = true;

    if (stop) {
      this.lastStop = { line: s.line, frame: top };
      this.paused = true;
      this.ev.paused(s.line, s.col, this.snapshot());
      await new Promise<void>((r) => { this.resume = r; });
      this.paused = false;
      return;
    }

    const now = Date.now();
    if (now - this.lastSnap > 100) {
      this.lastSnap = now;
      this.ev.snapshot(this.snapshot());
    }
    if (now - this.lastYield > 20) {
      // cede a vez para o worker receber mensagens (pausar, novos pontos de parada...)
      await this.yield();
      this.lastYield = Date.now();
    }
  }

  /** Recebe um comando da interface. */
  command(c: DebugCommand) {
    if (c === "pause") {
      if (!this.paused) this.mode = "pause";
      return;
    }
    if (!this.paused) return;
    this.mode = c;
    this.targetDepth = this.stack.length;
    // "continue" não deve parar de novo na linha atual; os passos também não.
    const r = this.resume;
    this.resume = null;
    r?.();
  }

  private yield(): Promise<void> {
    return new Promise<void>((r) => {
      this.channel.port1.onmessage = () => r();
      this.channel.port2.postMessage(0);
    });
  }
}

/** Marca toda a árvore como bloqueante, forçando o caminho assíncrono (com ganchos do depurador). */
export function markAllBlocking(root: unknown) {
  const seen = new Set<object>();
  const walk = (o: any) => {
    if (!o || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    if (o instanceof Map) { for (const v of o.values()) walk(v); return; }
    if (Array.isArray(o)) { for (const v of o) walk(v); return; }
    if ("blocking" in o && ("k" in o || "body" in o)) o.blocking = true;
    for (const key of Object.keys(o)) {
      if (key === "builtin" || key === "impl") continue;
      const v = o[key];
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(root);
}
