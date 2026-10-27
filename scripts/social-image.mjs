// Gera docs/img/social.png (1280×640), a imagem de pré-visualização do repositório e do site (Open Graph).
// Uso: node scripts/social-image.mjs
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const candidates = [
  process.env.BROWSER_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) throw new Error("Nenhum Chrome/Edge encontrado. Defina BROWSER_PATH.");

const browser = await puppeteer.launch({
  executablePath, headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--allow-file-access-from-files", `--user-data-dir=${resolve("node_modules/.cache/koine-screenshots")}`],
  defaultViewport: { width: 1280, height: 640, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto(pathToFileURL(resolve("scripts/social/social.html")).href, { waitUntil: "networkidle0" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "docs/img/social.png" });
await browser.close();
console.log("✓ docs/img/social.png");
