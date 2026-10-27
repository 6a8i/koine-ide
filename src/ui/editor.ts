import { EditorState, Compartment, Extension } from "@codemirror/state";
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection,
  highlightSpecialChars, rectangularSelection, crosshairCursor, dropCursor,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle, foldGutter, foldKeymap } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches, search } from "@codemirror/search";
import { lintKeymap, setDiagnostics, Diagnostic } from "@codemirror/lint";
import { tags as t } from "@lezer/highlight";
import { Lang } from "../lang/shared/types";
import { Snapshot } from "../lang/shared/debug";
import { languageSupport, completionSource } from "./languages";
import { debugExtensions, breakpointLines, setDebugLine, clearBreakpoints } from "./debug";
import { referenceTip } from "./reference";

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--tok-kw)", fontWeight: "600" },
  { tag: t.typeName, color: "var(--tok-type)" },
  { tag: t.bool, color: "var(--tok-const)" },
  { tag: t.operatorKeyword, color: "var(--tok-kw)" },
  { tag: t.string, color: "var(--tok-str)" },
  { tag: t.character, color: "var(--tok-str)" },
  { tag: t.number, color: "var(--tok-num)" },
  { tag: t.comment, color: "var(--tok-comment)", fontStyle: "italic" },
  { tag: t.function(t.variableName), color: "var(--tok-fn)" },
  { tag: t.standard(t.variableName), color: "var(--tok-builtin)" },
  { tag: t.namespace, color: "var(--tok-type)" },
  { tag: t.operator, color: "var(--tok-op)" },
  { tag: t.punctuation, color: "var(--tok-punct)" },
  { tag: t.variableName, color: "var(--tok-var)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "var(--editor-font-size)", backgroundColor: "var(--bg-editor)", color: "var(--fg)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55", overflow: "auto" },
  ".cm-content": { padding: "12px 0", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 16px 0 8px" },
  ".cm-gutters": { backgroundColor: "var(--bg-editor)", color: "var(--fg-faint)", border: "none", paddingLeft: "8px" },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "2.6em", paddingRight: "10px" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--fg-muted)" },
  ".cm-activeLine": { backgroundColor: "var(--bg-active-line)" },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--bg-selection) !important" },
  ".cm-matchingBracket": { backgroundColor: "var(--bg-bracket)", outline: "1px solid var(--border-strong)" },
  ".cm-selectionMatch": { backgroundColor: "var(--bg-selection-match)" },
  ".cm-foldGutter .cm-gutterElement": { color: "var(--fg-faint)" },
  ".cm-tooltip": { backgroundColor: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "8px", boxShadow: "var(--shadow)", color: "var(--fg)" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", fontSize: "13px", maxHeight: "16em" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": { padding: "4px 10px" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent-soft)", color: "var(--fg)" },
  ".cm-completionLabel": { color: "var(--fg)" },
  ".cm-completionDetail": { color: "var(--fg-muted)", fontStyle: "normal", marginLeft: "8px" },
  ".cm-completionIcon": { opacity: "0.6" },
  ".cm-panels": { backgroundColor: "var(--bg-panel)", color: "var(--fg)", borderBottom: "1px solid var(--border)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)", borderBottom: "none" },
  ".cm-panel.cm-search": { padding: "6px 10px", fontFamily: "var(--font-ui)", fontSize: "12.5px" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button": { fontFamily: "var(--font-ui)", background: "var(--bg-input)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: "6px", padding: "3px 8px", margin: "0 3px" },
  ".cm-panel.cm-search label": { marginLeft: "6px" },
  ".cm-searchMatch": { backgroundColor: "var(--bg-search)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--bg-search-sel)" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--danger)", textUnderlineOffset: "3px" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--danger)" },
  ".cm-line.cm-error-line": { backgroundColor: "var(--bg-error-line)" },
  ".cm-lint-marker-error": { content: "none" },
  // depuração
  ".cm-breakpoint-gutter": { width: "16px", cursor: "pointer" },
  ".cm-breakpoint-gutter .cm-gutterElement": { display: "flex", alignItems: "center", justifyContent: "center", padding: "0" },
  ".cm-breakpoint-gutter .cm-gutterElement:hover::before": { content: '""', width: "10px", height: "10px", borderRadius: "50%", background: "var(--danger)", opacity: "0.35" },
  ".cm-breakpoint": { width: "11px", height: "11px", borderRadius: "50%", background: "var(--danger)", boxShadow: "0 0 0 2px var(--bg-editor)" },
  ".cm-line.cm-debug-line": { backgroundColor: "var(--bg-debug-line)", boxShadow: "inset 3px 0 0 var(--warn)" },
  ".cm-tooltip-hover": { padding: "0", maxWidth: "420px" },
});

export class Editor {
  view: EditorView;
  private langConf = new Compartment();
  private wrapConf = new Compartment();
  lang: Lang;
  onChange: (() => void) | null = null;
  onCursor: ((line: number, col: number) => void) | null = null;
  onBreakpoints: ((lines: number[]) => void) | null = null;
  /** estado das variáveis mostrado na dica ao passar o mouse (null = nenhum) */
  snapshot: Snapshot | null = null;
  private lastBps = "";

  constructor(parent: HTMLElement, lang: Lang, doc: string, keymaps: Extension) {
    this.lang = lang;
    const state = EditorState.create({
      doc,
      extensions: [
        keymaps,
        debugExtensions({
          snapshot: () => this.snapshot,
          caseInsensitive: () => this.lang === "visualg",
          reference: (w) => referenceTip(this.lang, w),
        }),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter({ openText: "▾", closedText: "▸" }),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        syntaxHighlighting(highlight),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ icons: true, activateOnTyping: true }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
        this.langConf.of(this.langExt(lang)),
        this.wrapConf.of([]),
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) this.onChange?.();
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            this.onCursor?.(line.number, head - line.from + 1);
          }
          if (u.docChanged || u.transactions.some((t) => t.effects.length)) {
            const bps = breakpointLines(u.state);
            const key = bps.join(",");
            if (key !== this.lastBps) { this.lastBps = key; this.onBreakpoints?.(bps); }
          }
        }),
      ],
    });
    this.view = new EditorView({ state, parent });
  }

  private langExt(lang: Lang) {
    const support = languageSupport(lang);
    return [support, support.language.data.of({ autocomplete: completionSource(lang) })];
  }

  setLang(lang: Lang) {
    this.lang = lang;
    this.view.dispatch({ effects: this.langConf.reconfigure(this.langExt(lang)) });
  }

  get text() {
    return this.view.state.doc.toString();
  }

  setText(text: string) {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } });
    this.clearError();
  }

  setWrap(on: boolean) {
    this.view.dispatch({ effects: this.wrapConf.reconfigure(on ? EditorView.lineWrapping : []) });
  }

  focus() {
    this.view.focus();
  }

  showError(line: number, col: number, message: string) {
    const doc = this.view.state.doc;
    if (line < 1 || line > doc.lines) { this.clearError(); return; }
    const l = doc.line(line);
    let from = l.from + Math.max(0, Math.min(col - 1, l.length));
    let to = from;
    // destaca a palavra sob a posição; se não houver, a linha inteira
    const text = l.text;
    const i = col - 1;
    const re = /[\p{L}\p{N}_]+|\S/u;
    const m = re.exec(text.slice(Math.max(0, i)));
    if (m && m.index === 0) to = from + m[0].length;
    if (to === from) { from = l.from; to = l.to; }
    const d: Diagnostic = { from, to, severity: "error", message };
    this.view.dispatch(setDiagnostics(this.view.state, [d]));
  }

  clearError() {
    this.view.dispatch(setDiagnostics(this.view.state, []));
  }

  // ----- depuração -----
  get breakpoints(): number[] {
    return breakpointLines(this.view.state);
  }

  clearBreakpoints() {
    clearBreakpoints(this.view);
  }

  /** Destaca a linha em que o depurador parou (null remove o destaque). */
  setDebugLine(line: number | null) {
    setDebugLine(this.view, line);
  }

  /** Palavra sob o cursor (para abrir a referência). */
  wordAtCursor(): string | null {
    const s = this.view.state;
    const r = s.wordAt(s.selection.main.head);
    return r ? s.doc.sliceString(r.from, r.to) : null;
  }

  /** Insere um trecho na posição do cursor, respeitando a indentação da linha atual. */
  insertSnippet(code: string) {
    const s = this.view.state;
    const head = s.selection.main.head;
    const line = s.doc.lineAt(head);
    const indent = /^\s*/.exec(line.text)?.[0] ?? "";
    const atLineStart = line.text.slice(0, head - line.from).trim() === "";
    let text = code.replace(/\n(?=.)/g, "\n" + indent);
    if (!atLineStart) text = "\n" + indent + text;
    this.view.dispatch({ changes: { from: head, insert: text }, selection: { anchor: head + text.length }, scrollIntoView: true });
    this.view.focus();
  }

  goTo(line: number, col = 1) {
    const doc = this.view.state.doc;
    if (line < 1 || line > doc.lines) return;
    const l = doc.line(line);
    const pos = l.from + Math.max(0, Math.min(col - 1, l.length));
    this.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    this.view.focus();
  }
}
