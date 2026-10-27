/** Barra de abas dos documentos abertos. */
import { Doc } from "../project";

export class TabsBar {
  onActivate: ((key: string) => void) | null = null;
  onClose: ((key: string) => void) | null = null;
  onContext: ((key: string, x: number, y: number) => void) | null = null;
  private els = new Map<string, HTMLElement>();

  constructor(private root: HTMLElement) {
    this.root.addEventListener("wheel", (e) => {
      if (e.deltaY && !e.deltaX) { this.root.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
  }

  render(docs: Doc[], active: string | null, rel: (d: Doc) => string) {
    this.root.innerHTML = "";
    this.els.clear();
    for (const d of docs) {
      const tab = document.createElement("div");
      tab.className = "tab";
      tab.dataset.key = d.key;
      tab.setAttribute("role", "tab");
      tab.innerHTML = `<span class="tab-dot"></span><span class="tab-name"></span><button class="tab-close" title="Fechar (Ctrl+W)" aria-label="Fechar">×</button>`;
      tab.addEventListener("mousedown", (e) => {
        if ((e.target as HTMLElement).closest(".tab-close")) return;
        if (e.button === 1) { e.preventDefault(); this.onClose?.(d.key); }
        else if (e.button === 0) this.onActivate?.(d.key);
      });
      tab.addEventListener("contextmenu", (e) => { e.preventDefault(); this.onContext?.(d.key, e.clientX, e.clientY); });
      tab.querySelector(".tab-close")!.addEventListener("click", (e) => { e.stopPropagation(); this.onClose?.(d.key); });
      this.root.appendChild(tab);
      this.els.set(d.key, tab);
      this.updateMeta(d, rel(d));
    }
    this.setActive(active);
  }

  updateMeta(d: Doc, title: string) {
    const tab = this.els.get(d.key);
    if (!tab) return;
    tab.querySelector(".tab-name")!.textContent = d.name;
    tab.title = d.missing ? `${title} (apagado no disco)` : title;
    tab.classList.toggle("dirty", d.dirty);
    tab.classList.toggle("missing", d.missing);
    tab.dataset.lang = d.lang;
  }

  setActive(key: string | null) {
    for (const [k, el] of this.els) {
      const on = k === key;
      el.classList.toggle("active", on);
      el.setAttribute("aria-selected", String(on));
      if (on) el.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }
}
