/**
 * Gera as páginas da documentação que derivam do código-fonte (docs/):
 *   referencia.html  — todas as entradas da referência (F1), por categoria
 *   exemplos.html    — os programas de exemplo da IDE
 *   idiomas.html     — tabela do vocabulário em cada idioma
 * Uso: node --import tsx scripts/build-docs.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import "../src/lang"; // registra o lexer (necessário para translateSource)
import { REFERENCE, CATEGORIES, CATEGORY_LABEL, type RefEntry } from "../src/reference";
import { EXAMPLES } from "../src/examples";
import { CANON, LOCALES, VOCAB, translateSource } from "../src/lang/i18n";
import { layout, esc, code } from "./docs-layout";

const out = resolve("docs");
mkdirSync(out, { recursive: true });
const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ---------------- referência ----------------
function entryHtml(e: RefEntry): string {
  const id = slug(e.name);
  return `
<article class="ref-entry" id="${id}">
  <h3><a href="#${id}"><code>${esc(e.name)}</code></a>${e.aliases?.length ? ` <span class="aliases">também: ${e.aliases.map((a) => `<code>${esc(a)}</code>`).join(", ")}</span>` : ""}</h3>
  <p>${esc(e.summary)}</p>
  ${e.syntax ? `<div class="label">Como usar</div>${code(e.syntax)}` : ""}
  ${e.example ? `<div class="label">Exemplo</div>${code(e.example.replace(/\n$/, ""))}` : ""}
</article>`;
}
const refToc = CATEGORIES.map((c) => `<li><a href="#cat-${c}">${esc(CATEGORY_LABEL[c])}</a> <span class="count">${REFERENCE.filter((e) => e.category === c).length}</span></li>`).join("");
const refBody = CATEGORIES.map((c) => `
<section id="cat-${c}">
  <h2>${esc(CATEGORY_LABEL[c])}</h2>
  ${REFERENCE.filter((e) => e.category === c).map(entryHtml).join("")}
</section>`).join("");
writeFileSync(`${out}/referencia.html`, layout({
  title: "Referência da linguagem",
  description: "Todas as palavras reservadas, comandos, operadores e funções prontas do Koiné, com explicação, forma de uso e exemplo.",
  active: "referencia",
  body: `
<header class="page-head">
  <h1>Referência da linguagem</h1>
  <p>As mesmas ${REFERENCE.length} entradas do painel <strong>Referência</strong> da IDE (F1). Na IDE, passe o mouse sobre uma palavra reservada para ver o resumo, ou pressione F1 com o cursor sobre ela.</p>
  <p><input id="ref-filter" type="search" placeholder="Filtrar (ex.: enquanto, Texto, vetor)…" aria-label="Filtrar a referência"></p>
</header>
<nav class="toc"><ul>${refToc}</ul></nav>
${refBody}
<script>
  const q = document.getElementById("ref-filter");
  q.addEventListener("input", () => {
    const v = q.value.trim().toLowerCase();
    for (const a of document.querySelectorAll(".ref-entry")) a.hidden = !!v && !a.textContent.toLowerCase().includes(v);
    for (const s of document.querySelectorAll("section[id^=cat-]")) s.hidden = ![...s.querySelectorAll(".ref-entry")].some((a) => !a.hidden);
  });
</script>`,
}));

// ---------------- exemplos ----------------
const exBody = EXAMPLES.map((ex) => {
  const files = ex.files ?? [{ name: `${slug(ex.title)}.koi`, code: ex.code ?? "" }];
  return `
<article class="example" id="${slug(ex.title)}">
  <h2>${esc(ex.title)}</h2>
  <p>${esc(ex.description)}</p>
  ${files.map((f) => `<div class="label"><code>${esc(f.name)}</code></div>${code(f.code.replace(/\n$/, ""))}`).join("")}
</article>`;
}).join("");
writeFileSync(`${out}/exemplos.html`, layout({
  title: "Exemplos",
  description: "Os programas de exemplo que vêm com o Koiné IDE: do olá-mundo a módulos, classes e testes automatizados.",
  active: "exemplos",
  body: `
<header class="page-head">
  <h1>Exemplos</h1>
  <p>Os mesmos programas do menu <strong>Exemplos</strong> da IDE. Lá eles abrem já traduzidos para o idioma selecionado; aqui estão em português.</p>
</header>
<nav class="toc"><ul>${EXAMPLES.map((ex) => `<li><a href="#${slug(ex.title)}">${esc(ex.title)}</a></li>`).join("")}</ul></nav>
${exBody}`,
}));

// ---------------- idiomas ----------------
const groups: [string, readonly string[]][] = [
  ["Palavras reservadas", CANON.keywords],
  ["Função principal", CANON.special],
  ["Comandos e afirmações", CANON.builtins],
  ["Bibliotecas", CANON.libs],
  ["Funções das bibliotecas", CANON.members],
];
const head = `<tr><th>Português</th>${LOCALES.filter((l) => l.id !== "pt-BR").map((l) => `<th lang="${l.id}">${esc(l.native)}</th>`).join("")}</tr>`;
const rows = groups.map(([g, words]) => `<tr class="group"><th colspan="${LOCALES.length}">${esc(g)}</th></tr>` + words.map((w) =>
  `<tr><td><code>${esc(w)}</code></td>${LOCALES.filter((l) => l.id !== "pt-BR").map((l) => `<td lang="${l.id}"><code>${esc(VOCAB[l.id]?.[w] ?? w)}</code></td>`).join("")}</tr>`).join("")).join("");
const sample = `programa
{
    funcao inicio()
    {
        inteiro n = 5
        se (n > 3 e verdadeiro)
        {
            escreva("olá", "\\n")
        }
    }
}`;
const samples = LOCALES.map((l) => `<figure><figcaption lang="${l.id}">${esc(l.native)}</figcaption>${code(translateSource(sample, "pt-BR", l.id))}</figure>`).join("");
writeFileSync(`${out}/idiomas.html`, layout({
  title: "Idiomas",
  description: "O vocabulário do Koiné em dez idiomas: português, inglês, espanhol, grego, russo, ucraniano, polonês, japonês, coreano e chinês.",
  active: "idiomas",
  body: `
<header class="page-head">
  <h1>Idiomas</h1>
  <p>O mesmo programa, escrito com as palavras de cada idioma. O seletor na barra da IDE troca interface, destaque, referência e exemplos, e oferece converter o código aberto. As palavras em português continuam valendo em qualquer idioma, e a conversão nunca toca em textos, comentários ou nomes de variáveis.</p>
</header>
<section class="samples">${samples}</section>
<section>
  <h2>Tabela completa do vocabulário</h2>
  <p>Cada idioma tem uma tabela canônico (português) → palavra localizada em <code>src/lang/i18n/vocab/</code>. Achou uma tradução ruim? <a href="https://github.com/6a8i/koine-ide/blob/main/CONTRIBUTING.md#traduções">Contribua</a>.</p>
  <div class="table-wrap"><table class="vocab"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
</section>`,
}));

console.log(`docs geradas: referencia.html (${REFERENCE.length} entradas), exemplos.html (${EXAMPLES.length}), idiomas.html (${LOCALES.length} idiomas)`);
