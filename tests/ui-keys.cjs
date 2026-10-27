/**
 * Extrai as chaves de tradução da interface: t("..."), tn(n, "...", "..."), atributos data-i18n* do HTML,
 * títulos/descrições dos exemplos e rótulos de categoria da referência.
 * Uso: node tests/ui-keys.cjs saida.json   (ou require(...).extract())
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..") + "/";
const unq = (s) => JSON.parse('"' + s.replace(/"/g, '\\"').replace(/\\'/g, "'") + '"');

function extract() {
  const keys = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/[\\/]i18n$/.test(p)) walk(p); continue; }
      if (!/\.ts$/.test(e.name)) continue;
      const src = fs.readFileSync(p, "utf8");
      for (const m of src.matchAll(/\btn?\(\s*(?:[^,()]+,\s*)?"((?:[^"\\]|\\.)*)"/g)) keys.add(unq(m[1]));
      for (const m of src.matchAll(/\btn?\(\s*(?:[^,()]+,\s*)?'((?:[^'\\]|\\.)*)'/g)) keys.add(unq(m[1]));
      for (const m of src.matchAll(/\btn\(\s*[^,()]+,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"/g)) { keys.add(unq(m[1])); keys.add(unq(m[2])); }
    }
  };
  walk(root + "src");
  const html = fs.readFileSync(root + "index.html", "utf8");
  for (const m of html.matchAll(/<([a-z0-9]+)([^>]*)>/gi)) {
    const attrs = m[2];
    const get = (name) => { const a = attrs.match(new RegExp(`\\b${name}="([^"]*)"`)); return a ? a[1] : null; };
    if (/\bdata-i18n=""/.test(attrs)) {
      const after = html.slice(m.index + m[0].length);
      const text = after.slice(0, after.indexOf("<")).trim();
      if (text) keys.add(text);
    } else { const k = get("data-i18n"); if (k) keys.add(k); }
    for (const [attr, src] of [["data-i18n-title", "title"], ["data-i18n-placeholder", "placeholder"], ["data-i18n-aria", "aria-label"]]) {
      const v = get(attr);
      if (v === null) continue;
      const k = v || get(src);
      if (k) keys.add(k);
    }
  }
  const ex = fs.readFileSync(root + "src/examples/index.ts", "utf8");
  for (const m of ex.matchAll(/\b(?:title|description):\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(unq(m[1]));
  const ref = fs.readFileSync(root + "src/reference/index.ts", "utf8");
  const cat = ref.match(/CATEGORY_LABEL[^=]*=\s*\{([\s\S]*?)\};/);
  if (cat) for (const m of cat[1].matchAll(/:\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(unq(m[1]));
  return [...keys].filter((k) => k.trim()).sort((a, b) => a.localeCompare(b, "pt"));
}

module.exports = { extract };
if (require.main === module) {
  const list = extract();
  const out = process.argv[2];
  if (out) fs.writeFileSync(out, JSON.stringify(list, null, 1));
  console.log(list.length + " chaves" + (out ? " → " + out : ""));
}
