/** Painel lateral "Referência": palavras reservadas, comandos e funções com explicação e exemplo. */
import { CATEGORIES, CATEGORY_LABEL, REFERENCE, RefCategory, RefEntry, findReference, localizeEntry } from "../reference";
import { Locale } from "../lang/i18n";
import { t, getLocale } from "../i18n";

export class ReferencePanel {
  private list: HTMLElement;
  private search: HTMLInputElement;
  private chips: HTMLElement;
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
    mk("todas", t("Todas"));
    for (const c of CATEGORIES) mk(c, t(CATEGORY_LABEL[c]));
  }

  /** Idioma mudou: refaz os rótulos e a lista. */
  refresh() {
    this.buildChips();
    this.render();
  }

  private updateChips() {
    this.chips.querySelectorAll<HTMLButtonElement>(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === this.category)));
  }


  focusSearch() {
    this.search.focus();
    this.search.select();
  }

  /** Abre o painel já mostrando uma palavra (vindo de um atalho no editor). */
  show(word: string | null) {
    if (word) {
      const e = findReference(word, this.locale);
      this.search.value = e ? e.name : word;
      this.category = "todas";
      this.updateChips();
      if (e) this.open.add(e.name);
    }
    this.render();
  }

  private get locale(): Locale { return getLocale(); }

  render() {
    const q = this.search.value.trim().toLowerCase();
    const norm = (s: string) => s.toLowerCase();
    const locale = this.locale;
    const entries = REFERENCE.map((e) => localizeEntry(locale, e)).filter((e) => {
      if (this.category !== "todas" && e.category !== this.category) return false;
      if (!q) return true;
      return norm(e.name).includes(q) || norm(e.summary).includes(q) || (e.aliases ?? []).some((a) => norm(a).includes(q));
    });
    this.list.innerHTML = "";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "ref-empty";
      empty.textContent = t("Nada encontrado.");
      this.list.appendChild(empty);
      return;
    }
    let lastCat: RefCategory | null = null;
    for (const e of entries) {
      if (e.category !== lastCat) {
        lastCat = e.category;
        const h = document.createElement("div");
        h.className = "ex-group";
        h.textContent = t(CATEGORY_LABEL[e.category]);
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
      const lab = document.createElement("div"); lab.className = "ref-label"; lab.textContent = t("Como usar");
      const pre = document.createElement("pre"); pre.textContent = e.syntax;
      body.append(lab, pre);
    }
    if (e.example) {
      const lab = document.createElement("div"); lab.className = "ref-label"; lab.textContent = t("Exemplo");
      const pre = document.createElement("pre"); pre.textContent = e.example.replace(/\n$/, "");
      const actions = document.createElement("div"); actions.className = "ref-actions";
      const ins = document.createElement("button"); ins.className = "btn small"; ins.textContent = t("Inserir no editor");
      ins.title = t("Insere o exemplo na posição do cursor");
      ins.addEventListener("click", () => this.onInsert?.(e.example!));
      const cp = document.createElement("button"); cp.className = "btn small ghost"; cp.textContent = t("Copiar");
      cp.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(e.example!); cp.textContent = t("Copiado!"); setTimeout(() => (cp.textContent = t("Copiar")), 1200); } catch { /* ignora */ }
      });
      actions.append(ins, cp);
      body.append(lab, pre, actions);
    }
    el.appendChild(body);
    return el;
  }
}

/** Conteúdo da dica (tooltip) de uma palavra reservada no editor. */
export function referenceTip(word: string, locale: Locale = "pt-BR"): HTMLElement | null {
  const e = findReference(word, locale);
  if (!e) return null;
  const dom = document.createElement("div");
  dom.className = "ref-tip";
  const head = document.createElement("div");
  head.className = "ref-tip-head";
  const name = document.createElement("code"); name.textContent = e.name;
  const cat = document.createElement("span"); cat.className = "ref-tip-cat"; cat.textContent = t(CATEGORY_LABEL[e.category]);
  head.append(name, cat);
  const p = document.createElement("div"); p.className = "ref-tip-sum"; p.textContent = e.summary;
  dom.append(head, p);
  if (e.syntax) { const pre = document.createElement("pre"); pre.textContent = e.syntax; dom.appendChild(pre); }
  const hint = document.createElement("div"); hint.className = "ref-tip-hint"; hint.textContent = t("F1 abre a referência completa");
  dom.appendChild(hint);
  return dom;
}
