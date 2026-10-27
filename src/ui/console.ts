const MAX_CHARS = 150_000;
const FLUSH_MS = 40;

/** Console de saída/entrada do programa. */
export class ConsolePanel {
  private out: HTMLElement;
  private inputRow: HTMLElement;
  private input: HTMLInputElement;
  private pending = "";
  private raf = 0;
  private lastText: Text | null = null;
  private total = 0;
  onSubmit: ((v: string) => void) | null = null;
  onGoTo: ((line: number, col: number) => void) | null = null;

  constructor(private root: HTMLElement) {
    this.out = root.querySelector(".console-out")!;
    this.inputRow = root.querySelector(".console-input")!;
    this.input = root.querySelector("input")!;
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = this.input.value;
        this.input.value = "";
        this.hideInput();
        this.appendRaw(v + "\n", "echo");
        this.onSubmit?.(v);
      }
    });
    // clique na área do console foca a entrada quando ativa
    this.out.addEventListener("mousedown", () => {
      if (!this.inputRow.hidden && !window.getSelection()?.toString()) setTimeout(() => this.input.focus(), 0);
    });
  }

  private lastFlush = 0;
  write(text: string) {
    this.pending += text;
    if (!this.raf) {
      const wait = Math.max(0, FLUSH_MS - (performance.now() - this.lastFlush));
      this.raf = window.setTimeout(() => requestAnimationFrame(() => this.flush()), wait);
    }
  }

  private flush() {
    this.raf = 0;
    this.lastFlush = performance.now();
    if (!this.pending) return;
    let text = this.pending;
    this.pending = "";
    if (text.length > MAX_CHARS) {
      // programa escrevendo mais rápido do que dá para mostrar: mantém só o final
      text = text.slice(-MAX_CHARS);
      this.out.textContent = "";
      this.lastText = null;
      this.total = 0;
      this.markTrimmed();
    }
    this.appendRaw(text, null);
  }

  private appendRaw(text: string, cls: string | null) {
    this.total += text.length;
    if (cls === null && this.lastText) {
      this.lastText.appendData(text);
    } else {
      const node = document.createTextNode(text);
      if (cls) {
        const span = document.createElement("span");
        span.className = "c-" + cls;
        span.appendChild(node);
        this.out.appendChild(span);
        this.lastText = null;
      } else {
        this.out.appendChild(node);
        this.lastText = node;
      }
    }
    if (this.total > MAX_CHARS) this.trim();
    this.scrollToEnd();
  }

  private trim() {
    // remove do início até caber (nós inteiros ou parte de um nó de texto)
    let excess = this.total - Math.floor(MAX_CHARS * 0.75);
    while (excess > 0 && this.out.firstChild) {
      const n = this.out.firstChild;
      if ((n as HTMLElement).classList?.contains("c-trim")) { this.out.removeChild(n); continue; }
      const len = n.textContent?.length ?? 0;
      if (len <= excess) {
        this.out.removeChild(n);
        if (n === this.lastText) this.lastText = null;
        this.total -= len;
        excess -= len;
      } else {
        if (n.nodeType === Node.TEXT_NODE) (n as Text).deleteData(0, excess);
        else n.textContent = n.textContent!.slice(excess);
        this.total -= excess;
        excess = 0;
      }
    }
    this.markTrimmed();
  }

  private markTrimmed() {
    if (this.out.querySelector(".c-trim")) return;
    const s = document.createElement("span");
    s.className = "c-trim c-sys";
    s.textContent = "… (saída anterior removida para economizar memória)\n";
    this.out.prepend(s);
  }

  private scrollToEnd() {
    this.root.scrollTop = this.root.scrollHeight;
  }

  system(text: string) {
    this.flush();
    this.appendRaw(text + "\n", "sys");
  }

  error(message: string, line: number, col: number) {
    this.flush();
    const wrap = document.createElement("div");
    wrap.className = "c-error";
    const icon = document.createElement("span");
    icon.className = "c-error-icon";
    icon.textContent = "✕";
    wrap.appendChild(icon);
    const body = document.createElement("span");
    if (line > 0) {
      const link = document.createElement("a");
      link.href = "#";
      link.className = "c-error-pos";
      link.textContent = `Linha ${line}` + (col > 0 ? `, coluna ${col}` : "");
      link.addEventListener("click", (e) => { e.preventDefault(); this.onGoTo?.(line, col); });
      body.appendChild(link);
      body.appendChild(document.createTextNode(": "));
    }
    body.appendChild(document.createTextNode(message));
    wrap.appendChild(body);
    this.out.appendChild(wrap);
    this.lastText = null;
    this.scrollToEnd();
  }

  clear() {
    this.flush();
    this.out.textContent = "";
    this.lastText = null;
    this.total = 0;
    this.pending = "";
  }

  showInput() {
    this.flush();
    this.inputRow.hidden = false;
    this.root.classList.add("waiting");
    this.input.focus();
    this.scrollToEnd();
  }

  hideInput() {
    this.inputRow.hidden = true;
    this.root.classList.remove("waiting");
  }

  get isWaiting() {
    return !this.inputRow.hidden;
  }

  focusInput() {
    if (!this.inputRow.hidden) this.input.focus();
  }
}
