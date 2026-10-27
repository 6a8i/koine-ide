/** Diálogos dentro da janela (o plugin de diálogos do Tauri não tem "prompt"). */

export interface PromptOptions {
  title: string;
  label?: string;
  value?: string;
  okLabel?: string;
  /** retorna mensagem de erro ou null */
  validate?: (v: string) => string | null;
  /** seleciona só o nome (sem a extensão) ao abrir */
  selectStem?: boolean;
}

export function promptDialog(o: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `
      <form class="modal" role="dialog" aria-modal="true">
        <div class="modal-title"></div>
        <label class="modal-label"><span></span><input type="text" spellcheck="false" autocomplete="off" /></label>
        <div class="modal-error" hidden></div>
        <div class="modal-actions">
          <button type="button" class="btn" data-cancel>Cancelar</button>
          <button type="submit" class="btn primary"></button>
        </div>
      </form>`;
    const form = back.querySelector("form")!;
    const input = back.querySelector("input")!;
    const err = back.querySelector<HTMLElement>(".modal-error")!;
    back.querySelector(".modal-title")!.textContent = o.title;
    back.querySelector(".modal-label span")!.textContent = o.label ?? "";
    back.querySelector<HTMLButtonElement>("button[type=submit]")!.textContent = o.okLabel ?? "OK";
    input.value = o.value ?? "";
    const done = (v: string | null) => { back.remove(); document.removeEventListener("keydown", onKey, true); resolve(v); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); done(null); } };
    document.addEventListener("keydown", onKey, true);
    back.querySelector("[data-cancel]")!.addEventListener("click", () => done(null));
    back.addEventListener("mousedown", (e) => { if (e.target === back) done(null); });
    input.addEventListener("input", () => { err.hidden = true; });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = input.value.trim();
      const problem = o.validate?.(v) ?? (v ? null : "Digite um nome.");
      if (problem) { err.textContent = problem; err.hidden = false; input.focus(); return; }
      done(v);
    });
    document.body.appendChild(back);
    input.focus();
    if (o.selectStem) {
      const dot = input.value.lastIndexOf(".");
      input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
    } else input.select();
  });
}

const BAD_NAME = /[\\/:*?"<>|]/;
export function validateFileName(v: string): string | null {
  if (!v) return "Digite um nome.";
  if (BAD_NAME.test(v)) return 'O nome não pode conter \\ / : * ? " < > |';
  if (v === "." || v === "..") return "Nome inválido.";
  return null;
}
