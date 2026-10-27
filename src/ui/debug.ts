/**
 * Extensões do editor para depuração: pontos de parada na margem,
 * destaque da linha atual e dica (tooltip) com o valor das variáveis.
 */
import { EditorView, Decoration, DecorationSet, GutterMarker, gutter, hoverTooltip, Tooltip } from "@codemirror/view";
import { EditorState, StateEffect, StateField, RangeSet, Extension, TransactionSpec } from "@codemirror/state";
import { Snapshot, VarInfo } from "../lang/shared/debug";

// ---------------- pontos de parada ----------------
const breakpointEffect = StateEffect.define<{ pos: number; on: boolean }>({
  map: (v, m) => ({ pos: m.mapPos(v.pos), on: v.on }),
});

class BreakpointMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-breakpoint";
    el.title = "Ponto de parada (clique para remover)";
    return el;
  }
}
const bpMarker = new BreakpointMarker();

const breakpointField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(breakpointEffect)) {
        const line = tr.state.doc.lineAt(e.value.pos).from;
        set = set.update({ filter: (from) => from !== line });
        if (e.value.on) set = set.update({ add: [bpMarker.range(line)] });
      }
    }
    // garante que cada marcador continue no início da sua linha após edições
    const fixed: { from: number }[] = [];
    let dirty = false;
    set.between(0, tr.state.doc.length, (from) => {
      const l = tr.state.doc.lineAt(from).from;
      if (l !== from) dirty = true;
      fixed.push({ from: l });
    });
    if (dirty) {
      const uniq = [...new Set(fixed.map((f) => f.from))].sort((a, b) => a - b);
      set = RangeSet.of(uniq.map((f) => bpMarker.range(f)));
    }
    return set;
  },
});

export function breakpointLines(state: EditorState): number[] {
  const out: number[] = [];
  state.field(breakpointField, false)?.between(0, state.doc.length, (from) => { out.push(state.doc.lineAt(from).number); });
  return out;
}

export function toggleBreakpoint(view: EditorView, pos: number) {
  const line = view.state.doc.lineAt(pos).from;
  let has = false;
  view.state.field(breakpointField).between(line, line, () => { has = true; });
  view.dispatch({ effects: breakpointEffect.of({ pos: line, on: !has }) });
}

export function clearBreakpoints(view: EditorView) {
  const effects = breakpointLines(view.state).map((n) => breakpointEffect.of({ pos: view.state.doc.line(n).from, on: false }));
  if (effects.length) view.dispatch({ effects });
}

const breakpointGutter = gutter({
  class: "cm-breakpoint-gutter",
  markers: (v) => v.state.field(breakpointField),
  initialSpacer: () => bpMarker,
  domEventHandlers: {
    mousedown(view, line) {
      toggleBreakpoint(view, line.from);
      return true;
    },
  },
});

// ---------------- linha atual do depurador ----------------
const setDebugLineEffect = StateEffect.define<number | null>();
const debugLineDeco = Decoration.line({ class: "cm-debug-line" });

const debugLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setDebugLineEffect)) {
        if (e.value === null || e.value < 1 || e.value > tr.state.doc.lines) deco = Decoration.none;
        else deco = Decoration.set([debugLineDeco.range(tr.state.doc.line(e.value).from)]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function setDebugLine(view: EditorView, line: number | null) {
  const effects: StateEffect<unknown>[] = [setDebugLineEffect.of(line)];
  if (line !== null && line >= 1 && line <= view.state.doc.lines) {
    effects.push(EditorView.scrollIntoView(view.state.doc.line(line).from, { y: "center" }));
  }
  view.dispatch({ effects });
}

// ---------------- dica com valor das variáveis ----------------
export interface VarLookup {
  info: VarInfo;
  /** "global" ou nome da função em que é local */
  scope: string;
}

/** Procura a variável do quadro mais interno para o mais externo e depois nas globais. */
export function lookupVar(snap: Snapshot, name: string): VarLookup | null {
  const eq = (a: string, b: string) => a === b;
  for (let i = snap.frames.length - 1; i >= 0; i--) {
    const f = snap.frames[i];
    const v = f.vars.find((x) => eq(x.name, name));
    if (v) return { info: v, scope: f.name };
  }
  const g = snap.globals.find((x) => eq(x.name, name));
  return g ? { info: g, scope: "global" } : null;
}

export interface HoverProviders {
  snapshot(): Snapshot | null;
  /** dica de referência para palavras reservadas (HTML pronto ou null) */
  reference(word: string): HTMLElement | null;
}

function wordAt(state: EditorState, pos: number): { from: number; to: number; text: string } | null {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  const i = pos - line.from;
  const isW = (ch: string) => /[\p{L}\p{N}_]/u.test(ch);
  if (i < text.length && !isW(text[i]) && !(i > 0 && isW(text[i - 1]))) return null;
  let a = i, b = i;
  while (a > 0 && isW(text[a - 1])) a--;
  while (b < text.length && isW(text[b])) b++;
  if (a === b) return null;
  return { from: line.from + a, to: line.from + b, text: text.slice(a, b) };
}

/** true se a posição está dentro de uma cadeia ou comentário (aproximação simples por linha). */
function inStringOrComment(lineText: string, col: number, lineComment: string, blockOpen: string | null): boolean {
  let inStr: string | null = null;
  for (let i = 0; i < col; i++) {
    const ch = lineText[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (lineText.startsWith(lineComment, i)) return true;
    if (blockOpen && lineText.startsWith(blockOpen, i)) return true;
  }
  return inStr !== null;
}

export function variableHover(p: HoverProviders): Extension {
  return hoverTooltip(
    (view, pos): Tooltip | null => {
      const w = wordAt(view.state, pos);
      if (!w) return null;
      const line = view.state.doc.lineAt(pos);
      if (inStringOrComment(line.text, pos - line.from, "//", "/*")) return null;
      const snap = p.snapshot();
      const found = snap ? lookupVar(snap, w.text) : null;
      if (found) {
        return {
          pos: w.from, end: w.to, above: true,
          create: () => ({ dom: varTipDom(found) }),
        };
      }
      const ref = p.reference(w.text);
      if (ref) return { pos: w.from, end: w.to, above: true, create: () => ({ dom: ref }) };
      return null;
    },
    { hoverTime: 250 },
  );
}

function varTipDom(v: VarLookup): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "var-tip";
  const head = document.createElement("div");
  head.className = "var-tip-head";
  const name = document.createElement("span"); name.className = "var-name"; name.textContent = v.info.name;
  const type = document.createElement("span"); type.className = "var-type"; type.textContent = v.info.type;
  const scope = document.createElement("span"); scope.className = "var-scope"; scope.textContent = v.scope === "global" ? "global" : `local de ${v.scope}`;
  head.append(name, type, scope);
  const val = document.createElement("div");
  val.className = "var-value" + (v.info.value === "(sem valor)" ? " empty" : "");
  val.textContent = v.info.value;
  dom.append(head, val);
  return dom;
}

/** Efeito para marcar/limpar a linha do depurador num estado que não está no editor (aba em segundo plano). */
export function debugLineSpec(line: number | null): TransactionSpec {
  return { effects: setDebugLineEffect.of(line) };
}

/**
 * Extensões de depuração. `initialBreakpoints` restaura pontos de parada (linhas 1-based)
 * num estado recém-criado; linhas fora do documento são ignoradas.
 */
export function debugExtensions(p: HoverProviders, initialBreakpoints: number[] = []): Extension {
  const field = initialBreakpoints.length
    ? breakpointField.init((s) => {
        const uniq = [...new Set(initialBreakpoints.filter((n) => n >= 1 && n <= s.doc.lines))].sort((a, b) => a - b);
        return RangeSet.of(uniq.map((n) => bpMarker.range(s.doc.line(n).from)));
      })
    : breakpointField;
  return [field, breakpointGutter, debugLineField, variableHover(p)];
}
