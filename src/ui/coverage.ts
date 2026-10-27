/**
 * Marcas de cobertura no editor: linhas executadas pelos testes (verde) e linhas com comando
 * que nenhum teste alcançou (vermelho). Somem quando o documento é editado.
 */
import { EditorView, Decoration, DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, Extension, TransactionSpec } from "@codemirror/state";

export interface LineCoverage {
  hit: number[];
  miss: number[];
}

const setCoverageEffect = StateEffect.define<LineCoverage | null>();
const hitDeco = Decoration.line({ class: "cm-cov-hit" });
const missDeco = Decoration.line({ class: "cm-cov-miss" });

const coverageField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    if (tr.docChanged) deco = Decoration.none;
    for (const e of tr.effects) {
      if (!e.is(setCoverageEffect)) continue;
      const v = e.value;
      if (!v) { deco = Decoration.none; continue; }
      const ranges: { from: number; deco: Decoration }[] = [];
      const lines = tr.state.doc.lines;
      for (const l of v.hit) if (l >= 1 && l <= lines) ranges.push({ from: tr.state.doc.line(l).from, deco: hitDeco });
      for (const l of v.miss) if (l >= 1 && l <= lines) ranges.push({ from: tr.state.doc.line(l).from, deco: missDeco });
      ranges.sort((a, b) => a.from - b.from);
      deco = Decoration.set(ranges.map((r) => r.deco.range(r.from)));
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const coverageExtension: Extension = coverageField;

/** Aplica (ou limpa, com null) as marcas de cobertura. */
export function coverageSpec(cov: LineCoverage | null): TransactionSpec {
  return { effects: setCoverageEffect.of(cov) };
}
