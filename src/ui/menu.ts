/** Menu de contexto leve (usado pela árvore de arquivos, abas e seletor de arquivo principal). */

export interface MenuItem {
  label?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  separator?: boolean;
}

let current: HTMLElement | null = null;

export function closeMenu() {
  current?.remove();
  current = null;
}

export function showMenu(items: MenuItem[], x: number, y: number) {
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.setAttribute("role", "menu");
  for (const it of items) {
    if (it.separator) {
      const s = document.createElement("div");
      s.className = "menu-sep";
      menu.appendChild(s);
      continue;
    }
    const b = document.createElement("button");
    b.className = "menu-item" + (it.danger ? " danger" : "") + (it.checked ? " checked" : "");
    b.setAttribute("role", "menuitem");
    b.textContent = it.label ?? "";
    b.disabled = !!it.disabled;
    b.addEventListener("click", () => { closeMenu(); it.action?.(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  current = menu;
  // mantém dentro da janela
  const r = menu.getBoundingClientRect();
  const left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4));
  menu.style.left = left + "px";
  menu.style.top = top + "px";
  (menu.querySelector("button:not(:disabled)") as HTMLElement | null)?.focus();
}

document.addEventListener("mousedown", (e) => {
  if (current && !current.contains(e.target as Node)) closeMenu();
});
document.addEventListener("keydown", (e) => {
  if (!current) return;
  if (e.key === "Escape") { closeMenu(); return; }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const items = [...current.querySelectorAll<HTMLButtonElement>(".menu-item:not(:disabled)")];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  }
});
