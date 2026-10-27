// Gera as capturas de tela da documentação (docs/img) a partir da IDE rodando no navegador.
// Uso: npm run dev (em outro terminal) e depois: node scripts/screenshots.mjs [http://localhost:1420]
// Usa o Edge/Chrome instalado na máquina via puppeteer-core (não baixa navegador).
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const base = process.argv[2] ?? "http://localhost:1420";
const out = resolve("docs/img");
mkdirSync(out, { recursive: true });

const candidates = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error("Nenhum Chrome/Edge encontrado. Defina BROWSER_PATH.");

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--no-first-run", "--disable-extensions", `--user-data-dir=${resolve("node_modules/.cache/koine-screenshots")}`],
  defaultViewport: { width: 1600, height: 920, deviceScaleFactor: 2 },
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
  localStorage.setItem("consoleH", "250");
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await sleep(300);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("✓", name);
};
const openExample = async (title) => {
  await page.evaluate((title) => {
    document.querySelector("#btn-examples").click();
    const b = [...document.querySelectorAll("#examples-list .ex-item")].find((x) => x.querySelector(".ex-title").textContent === title);
    if (!b) throw new Error("exemplo não encontrado: " + title);
    b.click();
  }, title);
  await sleep(300);
};
const click = async (sel) => { await page.evaluate((s) => document.querySelector(s).click(), sel); };
const closeTabsMatching = async (re) => {
  await page.evaluate((src) => {
    const re = new RegExp(src);
    for (const t of [...document.querySelectorAll("#tabs .tab")]) if (re.test(t.textContent)) t.querySelector(".tab-close, button")?.click();
  }, re);
};
const reload = async () => {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector("#btn-run");
  await sleep(500);
};

// 1. Editor, console e variáveis com o projeto de vários arquivos
await reload();
await openExample("Projeto com vários arquivos");
await closeTabsMatching("sem título");
await click("#btn-run");
await sleep(1500);
await shot("editor");

// 2. Depurador pausado numa linha, com a pilha e as variáveis ao vivo
await page.evaluate(() => localStorage.removeItem("drafts"));
await reload();
await openExample("Funções e recursão");
await closeTabsMatching("sem título");
await click("#btn-debug");
await sleep(800);
for (let i = 0; i < 6; i++) { await click("#btn-step-into"); await sleep(250); }
await shot("depurador");
await click("#btn-stop");

// 3. Painel de testes com cobertura
await page.evaluate(() => localStorage.removeItem("drafts"));
await reload();
await openExample("Testes automatizados");
await closeTabsMatching("sem título");
await click("#btn-run-tests");
await sleep(2500);
await shot("testes");

// 4. Referência (F1) filtrada
await page.evaluate(() => localStorage.removeItem("drafts"));
await reload();
await openExample("Escolha (menu)");
await closeTabsMatching("sem título");
await click("#btn-reference");
await sleep(300);
await page.evaluate(() => {
  const input = document.querySelector("#ref-panel input");
  input.value = "escolha";
  input.dispatchEvent(new Event("input"));
});
await sleep(300);
await shot("referencia");

// 5. Interface e código em grego (conversão automática ao trocar o idioma)
await page.evaluate(() => localStorage.removeItem("drafts"));
await reload();
await openExample("Classes e herança");
await closeTabsMatching("sem título");
await page.select("#locale-select", "el");
await sleep(800);
await click("#btn-run");
await sleep(1500);
await shot("grego");

// 6. Tema claro, em inglês
await page.evaluate(() => localStorage.removeItem("drafts"));
await reload();
await click("#btn-theme");
await page.select("#locale-select", "en");
await sleep(500);
await openExample("Guessing game");
await closeTabsMatching("untitled|sem título");
await shot("tema-claro");

await browser.close();
