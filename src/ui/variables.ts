/** Painel "Variáveis": mostra a pilha de chamadas e o valor de cada variável durante a depuração. */
import { Snapshot } from "../lang/shared/debug";
import { t } from "../i18n";

export class VariablesPanel {
  private body: HTMLElement;
  private prev = new Map<string, string>();
  onGoTo: ((line: number, file?: string) => void) | null = null;

  constructor(private root: HTMLElement) {
    this.body = root.querySelector(".vars-body")!;
  }

  clear() {
    this.prev.clear();
    this.body.innerHTML = "";
    this.setEmpty(t("Execute ou depure o programa para ver as variáveis aqui."));
  }

  private setEmpty(msg: string) {
    const e = document.createElement("div");
    e.className = "vars-empty";
    e.textContent = msg;
    this.body.appendChild(e);
  }

  render(snap: Snapshot, live: boolean) {
    this.body.innerHTML = "";
    const next = new Map<string, string>();
    let any = false;

    const section = (title: string, line: number | null, vars: Snapshot["globals"], key: string, current: boolean, file?: string) => {
      if (!vars.length && key !== "globals") return;
      const sec = document.createElement("div");
      sec.className = "vars-section" + (current ? " current" : "");
      const h = document.createElement("div");
      h.className = "vars-title";
      const ts = document.createElement("span"); ts.textContent = title;
      h.appendChild(ts);
      if (line) {
        const l = document.createElement("a"); l.href = "#"; l.className = "vars-line"; l.textContent = t("linha {line}", { line });
        l.addEventListener("click", (e) => { e.preventDefault(); this.onGoTo?.(line, file); });
        h.appendChild(l);
      }
      sec.appendChild(h);
      if (!vars.length) {
        const e = document.createElement("div"); e.className = "vars-none"; e.textContent = t("sem variáveis"); sec.appendChild(e);
      }
      const table = document.createElement("table");
      table.className = "vars-table";
      for (const v of vars) {
        any = true;
        const id = key + "\u0000" + v.name;
        next.set(id, v.value);
        const changed = live && this.prev.has(id) && this.prev.get(id) !== v.value;
        const tr = document.createElement("tr");
        if (changed) tr.className = "changed";
        const n = document.createElement("td"); n.className = "v-name"; n.textContent = v.name; n.title = v.type;
        const ty = document.createElement("td"); ty.className = "v-type"; ty.textContent = v.type;
        const val = document.createElement("td"); val.className = "v-value" + (v.value === "(sem valor)" ? " empty" : ""); val.textContent = v.value; val.title = v.value;
        tr.append(n, ty, val);
        table.appendChild(tr);
      }
      sec.appendChild(table);
      this.body.appendChild(sec);
    };

    // quadros do mais interno (atual) para o mais externo
    for (let i = snap.frames.length - 1; i >= 0; i--) {
      const f = snap.frames[i];
      const title = `${f.name}()`;
      section(title, f.line || null, f.vars, `f${i}:${f.name}`, i === snap.frames.length - 1, f.file);
    }
    section(t("Globais"), null, snap.globals, "globals", false);
    if (!any) { this.body.innerHTML = ""; this.setEmpty(t("Este programa não tem variáveis.")); }
    this.prev = next;
  }
}
