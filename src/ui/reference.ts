/** Painel lateral "Referência": palavras reservadas, comandos e funções com explicação e exemplo. */
import { Lang } from "../lang/shared/types";
import { CATEGORIES, CATEGORY_LABEL, REFERENCE, RefCategory, RefEntry, findReference } from "../reference";

export class ReferencePanel {
  private list: HTMLElement;
  private search: HTMLInputElement;
  private chips: HTMLElement;
  private lang: Lang = "studio";
  private category: RefCategory | "todas" = "todas";
  private open = new Set<string>();
  onInsert: ((code: string) => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(private root: HTMLElement) {
    this.list = root.querySelector(".ref-list")!;
    this.search = root.querySelector("input")!;
    this.chips = root.querySelector(".ref-chips")!;
    this.search.addEventListener("input", () => this.render());
    this.search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { this.search.value = ""; this.render(); }
    });
    root.querySelector(".ref-close")!.addEventListener("click", () => this.onClose?.());
    this.buildChips();
  }

  private buildChips() {
    this.chips.innerHTML = "";
    const mk = (id: RefCategory | "todas", label: string) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = label;
      b.dataset.cat = id;
      b.setAttribute("aria-pressed", String(id === this.category));
      b.addEventListener("click", () => { this.category = id; this.updateChips(); this.render(); });
      this.chips.appendChild(b);
    };
    mk("todas", "Todas");
    for (const c of CATEGORIES) mk(c, CATEGORY_LABEL[c]);
  }

  private updateChips() {
    this.chips.querySelectorAll<HTMLButtonElement>(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === this.category)));
  }

  setLang(lang: Lang) {
    if (this.lang === lang) return;
    this.lang = lang;
    this.open.clear();
    this.render();
  }

  focusSearch() {
    this.search.focus();
    this.search.select();
  }

  /** Abre o painel já mostrando uma palavra (vindo de um atalho no editor). */
  show(word: string | null) {
    if (word) {
      const e = findReference(this.lang, word);
      this.search.value = e ? e.name : word;
      this.category = "todas";
      this.updateChips();
      if (e) this.open.add(e.name);
    }
    this.render();
  }

  render() {
    const q = this.search.value.trim().toLowerCase();
    const norm = (s: string) => s.toLowerCase();
    const entries = REFERENCE[this.lang].filter((e) => {
      if (this.category !== "todas" && e.category !== this.category) return false;
      if (!q) return true;
      return norm(e.name).includes(q) || norm(e.summary).includes(q) || (e.aliases ?? []).some((a) => norm(a).includes(q));
    });
    this.list.innerHTML = "";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "ref-empty";
      empty.textContent = "Nada encontrado.";
      this.list.appendChild(empty);
      return;
    }
    let lastCat: RefCategory | null = null;
    for (const e of entries) {
      if (e.category !== lastCat) {
        lastCat = e.category;
        const h = document.createElement("div");
        h.className = "ex-group";
        h.textContent = CATEGORY_LABEL[e.category];
        this.list.appendChild(h);
      }
      this.list.appendChild(this.item(e, !!q));
    }
  }

  private item(e: RefEntry, forceOpen: boolean): HTMLElement {
    const el = document.createElement("div");
    el.className = "ref-item";
    const isOpen = forceOpen || this.open.has(e.name);
    el.classList.toggle("open", isOpen);

    const head = document.createElement("button");
    head.className = "ref-toggle";
    head.setAttribute("aria-expanded", String(isOpen));
    const name = document.createElement("code");
    name.className = "ref-name";
    name.textContent = e.name;
    const sum = document.createElement("span");
    sum.className = "ref-sum";
    sum.textContent = e.summary;
    head.append(name, sum);
    head.addEventListener("click", () => {
      if (this.open.has(e.name)) this.open.delete(e.name); else this.open.add(e.name);
      const o = this.open.has(e.name);
      el.classList.toggle("open", o);
      head.setAttribute("aria-expanded", String(o));
    });
    el.appendChild(head);

    const body = document.createElement("div");
    body.className = "ref-body";
    if (e.syntax) {
      const lab = document.createElement("div"); lab.className = "ref-label"; lab.textContent = "Como usar";
      const pre = document.createElement("pre"); pre.textContent = e.syntax;
      body.append(lab, pre);
    }
    if (e.example) {
      const lab = document.createElement("div"); lab.className = "ref-label"; lab.textContent = "Exemplo";
      const pre = document.createElement("pre"); pre.textContent = e.example.replace(/\n$/, "");
      const actions = document.createElement("div"); actions.className = "ref-actions";
      const ins = document.createElement("button"); ins.className = "btn small"; ins.textContent = "Inserir no editor";
      ins.title = "Insere o exemplo na posição do cursor";
      ins.addEventListener("click", () => this.onInsert?.(e.example!));
      const cp = document.createElement("button"); cp.className = "btn small ghost"; cp.textContent = "Copiar";
      cp.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(e.example!); cp.textContent = "Copiado!"; setTimeout(() => (cp.textContent = "Copiar"), 1200); } catch { /* ignora */ }
      });
      actions.append(ins, cp);
      body.append(lab, pre, actions);
    }
    el.appendChild(body);
    return el;
  }
}

/** Conteúdo da dica (tooltip) de uma palavra reservada no editor. */
export function referenceTip(lang: Lang, word: string): HTMLElement | null {
  const e = findReference(lang, word);
  if (!e) return null;
  const dom = document.createElement("div");
  dom.className = "ref-tip";
  const head = document.createElement("div");
  head.className = "ref-tip-head";
  const name = document.createElement("code"); name.textContent = e.name;
  const cat = document.createElement("span"); cat.className = "ref-tip-cat"; cat.textContent = CATEGORY_LABEL[e.category];
  head.append(name, cat);
  const p = document.createElement("div"); p.className = "ref-tip-sum"; p.textContent = e.summary;
  dom.append(head, p);
  if (e.syntax) { const pre = document.createElement("pre"); pre.textContent = e.syntax; dom.appendChild(pre); }
  const hint = document.createElement("div"); hint.className = "ref-tip-hint"; hint.textContent = "F1 abre a referência completa";
  dom.appendChild(hint);
  return dom;
}
