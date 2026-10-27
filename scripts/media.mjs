// Grava o GIF de uso (docs/media/uso.gif) e o vídeo de primeiro uso (docs/media/primeiro-uso.mp4 e .webm)
// dirigindo a IDE no navegador headless, com legendas injetadas na página.
// Uso: npm run dev (em outro terminal) e depois: node scripts/media.mjs [http://localhost:1420] [gif|video|all]
import puppeteer from "puppeteer-core";
import ffmpegPath from "ffmpeg-static";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "http://localhost:1420";
const what = process.argv[3] ?? "all";
const out = resolve("docs/media");
mkdirSync(out, { recursive: true });

const candidates = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error("Nenhum Chrome/Edge encontrado. Defina BROWSER_PATH.");

const W = 1280, H = 720;
const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--no-first-run", "--disable-extensions", `--user-data-dir=${resolve("node_modules/.cache/koine-screenshots")}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());
await page.evaluateOnNewDocument(() => {
  localStorage.clear();
  localStorage.setItem("locale", "pt-BR");
  localStorage.setItem("theme", "dark");
  localStorage.setItem("showVars", "1");
  localStorage.setItem("showTests", "0");
  localStorage.setItem("showRef", "0");
  localStorage.setItem("consoleH", "230");
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reload = async () => {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector("#btn-run");
  await page.evaluate(() => document.fonts.ready);
  await sleep(400);
};
const click = async (sel, pause = 250) => {
  await page.evaluate(async (s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error("não achei " + s);
    el.classList.add("__flash");
    await new Promise((r) => setTimeout(r, 350));
    el.click();
    setTimeout(() => el.classList.remove("__flash"), 400);
  }, sel);
  await sleep(pause);
};
/** Legenda no rodapé da janela (null esconde). */
const caption = async (text) => {
  await page.evaluate((t) => {
    let c = document.getElementById("__cap");
    if (!c) {
      c = document.createElement("div");
      c.id = "__cap";
      document.body.appendChild(c);
      const st = document.createElement("style");
      st.textContent = `
        #__cap { position: fixed; left: 50%; bottom: 46px; transform: translateX(-50%); max-width: 78%; padding: 10px 18px; border-radius: 10px;
          background: rgba(10, 14, 26, 0.92); color: #fff; font: 600 20px/1.35 "Segoe UI", system-ui, sans-serif; text-align: center;
          box-shadow: 0 8px 30px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.15); z-index: 9999; transition: opacity .25s; pointer-events: none; }
        #__cap[hidden] { display: none; }
        .__flash { outline: 3px solid #ffd166 !important; outline-offset: 2px; border-radius: 8px; transition: outline .2s; }`;
      document.head.appendChild(st);
    }
    if (t) { c.textContent = t; c.hidden = false; } else c.hidden = true;
  }, text);
};
/** Acesso ao EditorView do CodeMirror pela árvore do DOM. */
const editorEval = (fn, ...args) => page.evaluate((src, ...a) => {
  const c = document.querySelector(".cm-content"); const view = (c.cmTile ?? c.cmView).view;
  return new Function("view", ...a.map((_, i) => "a" + i), `return (${src})(view, ${a.map((_, i) => "a" + i).join(",")})`)(view, ...a);
}, fn.toString(), ...args);
const setText = (text) => editorEval((view, t) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } }), text);
/** Digita um texto com efeito de máquina de escrever (sem passar pelo autocompletar). */
const type = async (text, msPerChar = 28) => {
  await editorEval((view) => view.focus());
  for (const ch of text) {
    await editorEval((view, c) => {
      const pos = view.state.selection.main.head;
      view.dispatch({ changes: { from: pos, insert: c }, selection: { anchor: pos + c.length }, scrollIntoView: true });
    }, ch);
    await sleep(ch === "\n" ? msPerChar * 3 : msPerChar + Math.random() * 18);
  }
};
/** Substitui um trecho exato do texto (para introduzir/corrigir um erro). */
const replaceText = (from, to) => editorEval((view, a, b) => {
  const src = view.state.doc.toString();
  const i = src.indexOf(a);
  if (i < 0) throw new Error("trecho não encontrado: " + a);
  view.dispatch({ changes: { from: i, to: i + a.length, insert: b }, selection: { anchor: i + b.length }, scrollIntoView: true });
}, from, to);
const goToLine = (n) => editorEval((view, l) => { const line = view.state.doc.line(l); view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true }); }, n);
const consoleType = async (value) => {
  await page.waitForSelector(".console-input:not([hidden]) input", { timeout: 8000 });
  await sleep(500);
  await page.type(".console-input:not([hidden]) input", value, { delay: 90 });
  await sleep(300);
  await page.keyboard.press("Enter");
  await sleep(500);
};
const breakpoint = async (line) => {
  await page.evaluate((l) => {
    const gut = document.querySelectorAll(".cm-breakpoint-gutter .cm-gutterElement");
    const lineEls = document.querySelectorAll(".cm-lineNumbers .cm-gutterElement");
    // acha o elemento do gutter de pontos de parada alinhado com o número da linha
    const target = [...lineEls].find((e) => e.textContent.trim() === String(l));
    const y = target.getBoundingClientRect().top + 2;
    const el = [...gut].find((g) => { const r = g.getBoundingClientRect(); return r.top <= y && y < r.bottom; });
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: el.getBoundingClientRect().left + 5, clientY: y }));
  }, line);
  await sleep(400);
};
const openExample = async (title) => {
  await click("#btn-examples", 600);
  await page.evaluate((title) => {
    const b = [...document.querySelectorAll("#examples-list .ex-item")].find((x) => x.querySelector(".ex-title").textContent === title);
    if (!b) throw new Error("exemplo não encontrado: " + title);
    b.classList.add("__flash");
    setTimeout(() => b.click(), 500);
  }, title);
  await sleep(1200);
};
const closeUntitled = () => page.evaluate(() => { for (const t of document.querySelectorAll("#tabs .tab")) if (/sem título|untitled/.test(t.textContent)) t.querySelector(".tab-close, button")?.click(); });

const PROGRAM = `programa
{
    funcao inicio()
    {
        cadeia nome
        inteiro idade
        escreva("Qual é o seu nome? ")
        leia(nome)
        escreva("E a sua idade? ")
        leia(idade)
        se (idade >= 16)
        {
            escreva("Olá, ", nome, "! Você já pode votar.\\n")
        }
        senao
        {
            escreva("Olá, ", nome, "! Faltam ", 16 - idade, " anos para votar.\\n")
        }
    }
}`;

async function record(name, fn) {
  const webm = `${out}/${name}.webm`;
  if (existsSync(webm)) unlinkSync(webm);
  const rec = await page.screencast({ path: webm, ffmpegPath });
  try { await fn(); } finally { await rec.stop(); }
  console.log("✓ gravado", webm, Math.round(statSync(webm).size / 1024) + " KB");
  return webm;
}
const ff = (args) => execFileSync(ffmpegPath, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });

// ---------------------------------------------------------------- vídeo: primeiro uso
async function video() {
  await reload();
  const webm = await record("primeiro-uso", async () => {
    await caption("Koiné IDE · primeiro uso");
    await sleep(2200);

    await caption("Escreva o programa: o editor destaca a sintaxe e completa as palavras");
    await setText("");
    await type(PROGRAM, 22);
    await sleep(900);

    await caption("F5 executa. O console pede os dados ali mesmo.");
    await click("#btn-run", 600);
    await consoleType("Ana");
    await consoleType("14");
    await sleep(2200);

    await caption('Errou? A mensagem explica o que é e como corrigir.');
    await replaceText("se (idade >= 16)", "se (idade = 16)");
    await sleep(700);
    await click("#btn-run", 1800);
    await sleep(1800);
    await caption("Corrigido: volta a rodar.");
    await replaceText("se (idade = 16)", "se (idade >= 16)");
    await sleep(900);

    await caption("F6 depura: ponto de parada, passo a passo e variáveis ao vivo");
    await goToLine(11);
    await breakpoint(11);
    await sleep(500);
    await click("#btn-debug", 500);
    await consoleType("Ana");
    await consoleType("14");
    await sleep(1400);
    await click("#btn-step-over", 1100);
    await click("#btn-step-over", 1100);
    await click("#btn-step-over", 1100);
    await sleep(600);
    await click("#btn-continue", 1200);
    await sleep(800);

    await caption("Testes escritos na própria linguagem, com cobertura (F7)");
    await openExample("Testes automatizados");
    await closeUntitled();
    await sleep(600);
    await click("#btn-run-tests", 600);
    await sleep(3200);

    await caption("Dez idiomas: trocou, a IDE converte o código");
    await page.select("#locale-select", "en");
    await sleep(2600);
    await page.select("#locale-select", "el");
    await sleep(2600);

    await caption("Gratuito e livre · 6a8i.github.io/koine-ide");
    await sleep(3000);
  });
  const mp4 = `${out}/primeiro-uso.mp4`;
  ff(["-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", mp4]);
  console.log("✓", mp4, Math.round(statSync(mp4).size / 1024) + " KB");
}

// ---------------------------------------------------------------- GIF: uso em 15 segundos
async function gif() {
  await reload();
  const webm = await record("uso", async () => {
    await setText("");
    await type(`programa
{
    funcao inicio()
    {
        para (inteiro i = 1; i <= 3; i++)
        {
            escreva("Olá, mundo ", i, "\\n")
        }
    }
}`, 14);
    await sleep(500);
    await click("#btn-run", 300);
    await sleep(1800);
    await page.select("#locale-select", "el");
    await sleep(1800);
    await click("#btn-run", 300);
    await sleep(1800);
    await page.select("#locale-select", "en");
    await sleep(2200);
  });
  const g = `${out}/uso.gif`;
  const palette = `${out}/palette.png`;
  ff(["-i", webm, "-vf", "fps=12,scale=960:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff", palette]);
  ff(["-i", webm, "-i", palette, "-lavfi", "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", "-loop", "0", g]);
  unlinkSync(palette);
  unlinkSync(webm);
  console.log("✓", g, Math.round(statSync(g).size / 1024) + " KB");
}

try {
  if (what === "gif" || what === "all") await gif();
  if (what === "video" || what === "all") await video();
} finally {
  await browser.close();
}
