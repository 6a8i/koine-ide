/**
 * Extrai as chaves das mensagens do compilador/interpretador: m("...") e msg("...") em src/lang.
 * Uso: node tests/message-keys.cjs saida.json   (ou require(...).extract())
 */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..") + "/";

function extract() {
  const keys = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/[\\/]i18n$/.test(p)) walk(p); continue; }
      if (!/\.ts$/.test(e.name)) continue;
      const src = fs.readFileSync(p, "utf8");
      for (const mt of src.matchAll(/\bm(?:sg)?\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse('"' + mt[1] + '"'));
    }
  };
  walk(root + "src/lang");
  return [...keys].sort((a, b) => a.localeCompare(b, "pt"));
}

module.exports = { extract };
if (require.main === module) {
  const list = extract();
  const out = process.argv[2];
  if (out) fs.writeFileSync(out, JSON.stringify(list, null, 1));
  console.log(list.length + " chaves" + (out ? " → " + out : ""));
}
