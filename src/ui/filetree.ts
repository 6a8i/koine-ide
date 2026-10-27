/** Painel "Projeto": árvore de arquivos da pasta aberta. */
import { TreeNode } from "../project";

export interface FileTreeEvents {
  open(node: TreeNode): void;
  toggle(node: TreeNode): void;
  context(node: TreeNode, x: number, y: number): void;
  openFolder(): void;
  openRecent(root: string): void;
  forgetRecent(root: string): void;
}

export class FileTree {
  private body: HTMLElement;
  private focusedKey: string | null = null;
  private rows: TreeNode[] = [];

  constructor(private root: HTMLElement, private ev: FileTreeEvents) {
    this.body = root.querySelector(".tree-body")!;
    this.body.addEventListener("keydown", (e) => this.onKey(e));
    this.body.addEventListener("contextmenu", (e) => {
      // clique direito no espaço vazio: menu da raiz
      if (e.target === this.body && this.rows[0]) { e.preventDefault(); this.ev.context(this.rows[0], e.clientX, e.clientY); }
    });
  }

  render(tree: TreeNode | null, expanded: Set<string>, activeKey: string | null, entryKey: string | null, recents: string[]) {
    this.body.innerHTML = "";
    this.rows = [];
    if (!tree) {
      const empty = document.createElement("div");
      empty.className = "tree-empty";
      const p = document.createElement("p");
      p.textContent = "Nenhuma pasta aberta.";
      const b = document.createElement("button");
      b.className = "btn small";
      b.textContent = "Abrir pasta…";
      b.addEventListener("click", () => this.ev.openFolder());
      empty.append(p, b);
      if (recents.length) {
        const h = document.createElement("div");
        h.className = "ex-group";
        h.textContent = "Recentes";
        empty.appendChild(h);
        for (const r of recents) {
          const row = document.createElement("div");
          row.className = "recent";
          const a = document.createElement("button");
          a.className = "recent-name";
          a.textContent = r.split(/[\\/]/).pop() ?? r;
          a.title = r;
          a.addEventListener("click", () => this.ev.openRecent(r));
          const x = document.createElement("button");
          x.className = "recent-forget";
          x.textContent = "×";
          x.title = "Remover da lista";
          x.addEventListener("click", () => this.ev.forgetRecent(r));
          row.append(a, x);
          empty.appendChild(row);
        }
      }
      this.body.appendChild(empty);
      return;
    }
    const walk = (n: TreeNode, depth: number) => {
      this.rows.push(n);
      const row = document.createElement("div");
      row.className = "tree-row " + n.kind;
      row.dataset.key = n.key;
      row.setAttribute("role", "treeitem");
      row.tabIndex = n.key === (this.focusedKey ?? tree.key) ? 0 : -1;
      row.style.paddingLeft = 8 + depth * 14 + "px";
      const isOpen = expanded.has(n.key);
      if (n.kind === "dir") row.setAttribute("aria-expanded", String(isOpen));
      if (n.key === activeKey) row.classList.add("active");
      if (n.key === entryKey) row.classList.add("entry");
      if (n.lang) row.dataset.lang = n.lang;
      row.innerHTML = `<span class="tree-chevron">${n.kind === "dir" ? (isOpen ? "▾" : "▸") : ""}</span><span class="tree-icon"></span><span class="tree-name"></span>${n.key === entryKey ? '<span class="tree-badge" title="Arquivo principal">▶</span>' : ""}`;
      row.querySelector(".tree-name")!.textContent = n.name;
      row.title = n.path;
      row.addEventListener("click", () => { this.focusedKey = n.key; n.kind === "dir" ? this.ev.toggle(n) : this.ev.open(n); });
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); this.focusedKey = n.key; this.ev.context(n, e.clientX, e.clientY); });
      row.addEventListener("focus", () => { this.focusedKey = n.key; });
      this.body.appendChild(row);
      if (n.kind === "dir" && isOpen) for (const c of n.children ?? []) walk(c, depth + 1);
    };
    walk(tree, 0);
  }

  private onKey(e: KeyboardEvent) {
    const i = this.rows.findIndex((r) => r.key === this.focusedKey);
    if (i < 0) return;
    const n = this.rows[i];
    const focusRow = (j: number) => {
      const r = this.rows[Math.max(0, Math.min(this.rows.length - 1, j))];
      this.focusedKey = r.key;
      (this.body.querySelector(`[data-key="${CSS.escape(r.key)}"]`) as HTMLElement | null)?.focus();
    };
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); focusRow(i + 1); break;
      case "ArrowUp": e.preventDefault(); focusRow(i - 1); break;
      case "ArrowRight": case "ArrowLeft": case "Enter": case " ":
        e.preventDefault();
        if (n.kind === "dir") this.ev.toggle(n); else if (e.key === "Enter" || e.key === " ") this.ev.open(n);
        break;
      case "F2": case "Delete": case "ContextMenu": {
        e.preventDefault();
        const el = this.body.querySelector(`[data-key="${CSS.escape(n.key)}"]`) as HTMLElement | null;
        const r = el?.getBoundingClientRect();
        this.ev.context(n, r ? r.left + 40 : 100, r ? r.bottom : 100);
        break;
      }
    }
  }
}
