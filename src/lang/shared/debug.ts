/**
 * Depurador: executa o programa passo a passo, com pontos de parada,
 * e tira "fotos" (snapshots) das variáveis para a interface.
 *
 * Funciona no worker. Os interpretadores chamam `before()` antes de cada
 * comando e `enter()/leave()` ao entrar/sair de funções.
 */
import { formatBool } from "./runtime";

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
  /** arquivo do comando (caminho relativo ao projeto) */
  file?: string;
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
  file: number;
}

const MAX_ITEMS = 60;
const MAX_STR = 200;

/** Converte um valor em texto legível (sem depender da linguagem). */
export function describeValue(v: any, depth = 0, refType = false): string {
  if (v === undefined) return "(sem valor)";
  if (v === null) return "nulo";
  if (typeof v === "boolean") return formatBool(v);
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    if (!isFinite(v)) return v > 0 ? "Infinito" : v < 0 ? "-Infinito" : "NaN";
    return String(Number(v.toPrecision(12)));
  }
  if (typeof v === "string") {
    const s = v.length > MAX_STR ? v.slice(0, MAX_STR) + "…" : v;
    return JSON.stringify(s);
  }
  // referência: variável `ref` mostra o alvo; parâmetro por &/var é transparente
  if (typeof v.get === "function" && typeof v.set === "function") {
    try { const inner = describeValue(v.get(), depth); return refType ? "ref -> " + inner : inner; } catch { return refType ? "ref -> ?" : "(sem valor)"; }
  }
  if (Array.isArray(v)) return describeList(v, depth);
  // estrutura/registro ou objeto: { decl|cls, f }
  if (Array.isArray(v.f) && (v.decl || v.cls)) {
    const decl = v.decl ?? v.cls;
    if (depth > 2) return `${decl.name}{…}`;
    const names: string[] = decl.fieldNames ?? [];
    const items = v.f.slice(0, MAX_ITEMS).map((x: any, i: number) => `${names[i] ?? i}: ${describeValue(x, depth + 1)}`);
    return `${decl.name}{${items.join(", ")}${v.f.length > MAX_ITEMS ? ", …" : ""}}`;
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
  for (const s of names.slots) out.push({ name: s.name, type: s.type, value: describeValue(F[s.slot], 0, s.type.startsWith("ref ")) });
  return out;
}

export interface DebugEvents {
  /** `file` é o nome do arquivo em que parou (índice traduzido via `setFiles`) */
  paused(line: number, col: number, snapshot: Snapshot, file: string): void;
  snapshot(snapshot: Snapshot): void;
}

export class Debugger {
  /** pontos de parada por índice de arquivo */
  breakpoints = new Map<number, Set<number>>();
  private files: string[] = [];
  private mode: DebugCommand = "into";
  private targetDepth = 0;
  private stack: Frame[] = [];
  private globals: FrameNames = { name: "globais", slots: [] };
  private G: any[] = [];
  private resume: (() => void) | null = null;
  private lastYield = 0;
  private lastSnap = 0;
  private lastStop: { line: number; file: number; frame: Frame | null } | null = null;
  private channel = new MessageChannel();
  paused = false;

  constructor(private ev: DebugEvents, breakpoints: { file: string; line: number }[], startPaused: boolean, files: string[] = []) {
    this.files = files;
    this.setBreakpoints(breakpoints);
    this.mode = startPaused ? "into" : "continue";
    // No Node (testes) as portas segurariam o processo para sempre: o handler é único e a porta só fica
    // "segura" (ref) enquanto há uma mensagem em trânsito.
    this.channel.port1.onmessage = () => {
      (this.channel.port1 as any).unref?.();
      const r = this.yielded;
      this.yielded = null;
      r?.();
    };
    (this.channel.port1 as any).unref?.();
    (this.channel.port2 as any).unref?.();
  }
  private yielded: (() => void) | null = null;

  /** Nomes dos arquivos do programa (índice = `NodeBase.file`). */
  setFiles(files: string[]) {
    this.files = files;
  }

  setBreakpoints(list: { file: string; line: number }[]) {
    this.breakpoints.clear();
    for (const b of list) {
      const idx = this.files.indexOf(b.file);
      const i = idx < 0 ? (this.files.length === 0 ? 0 : -1) : idx;
      if (i < 0) continue;
      let set = this.breakpoints.get(i);
      if (!set) this.breakpoints.set(i, (set = new Set()));
      set.add(b.line);
    }
  }

  setGlobals(names: FrameNames, G: any[]) {
    this.globals = names;
    this.G = G;
  }

  enter(names: FrameNames, F: any[]) {
    this.stack.push({ names, F, line: 0, file: 0 });
  }

  leave() {
    this.stack.pop();
  }

  get depth() {
    return this.stack.length;
  }

  snapshot(): Snapshot {
    return {
      frames: this.stack.map((f) => ({ name: f.names.name, line: f.line, file: this.files[f.file], vars: describeFrame(f.names, f.F) })),
      globals: describeFrame(this.globals, this.G),
    };
  }

  /** Chamado pelo interpretador antes de executar cada comando. */
  async before(s: { line: number; col: number; file?: number }): Promise<void> {
    const depth = this.stack.length;
    const top = this.stack[depth - 1] ?? null;
    const file = s.file ?? 0;
    if (top) { top.line = s.line; top.file = file; }

    let stop = false;
    switch (this.mode) {
      case "pause": case "into": stop = true; break;
      case "over": stop = depth <= this.targetDepth; break;
      case "out": stop = depth < this.targetDepth; break;
      case "continue": break;
    }
    // Comandos seguidos na mesma linha do mesmo quadro contam como um único passo;
    // ao mudar de linha (ou voltar a ela num laço) o controle é zerado.
    if (this.lastStop && (this.lastStop.line !== s.line || this.lastStop.file !== file || this.lastStop.frame !== top)) this.lastStop = null;
    const sameAsLast = this.lastStop !== null;
    if (stop && this.mode !== "pause" && sameAsLast) stop = false;
    if (!stop && !sameAsLast && this.breakpoints.get(file)?.has(s.line)) stop = true;

    if (stop) {
      this.lastStop = { line: s.line, file, frame: top };
      this.paused = true;
      this.ev.paused(s.line, s.col, this.snapshot(), this.files[file] ?? "");
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
      this.yielded = r;
      (this.channel.port1 as any).ref?.();
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
