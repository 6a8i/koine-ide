/** Molde comum das páginas geradas da documentação (mesmo cabeçalho/rodapé das páginas escritas à mão em docs/). */

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Bloco de código Koiné (o destaque é feito no navegador por site.js). */
export const code = (src: string) => `<pre><code class="koine">${esc(src)}</code></pre>`;

export const NAV: { id: string; href: string; label: string }[] = [
  { id: "inicio", href: "./", label: "Início" },
  { id: "guia", href: "guia.html", label: "Guia da IDE" },
  { id: "linguagem", href: "linguagem.html", label: "A linguagem" },
  { id: "referencia", href: "referencia.html", label: "Referência" },
  { id: "exemplos", href: "exemplos.html", label: "Exemplos" },
  { id: "idiomas", href: "idiomas.html", label: "Idiomas" },
];

export function layout(o: { title: string; description: string; active: string; body: string }): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)} · Koiné IDE</title>
<meta name="description" content="${esc(o.description)}">
<link rel="icon" href="img/icon.png">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="top">
  <a class="brand" href="./"><img src="img/icon.png" alt="" width="28" height="28"> Koiné<span>IDE</span></a>
  <nav>
    ${NAV.map((n) => `<a href="${n.href}"${n.id === o.active ? ' aria-current="page"' : ""}>${n.label}</a>`).join("\n    ")}
    <a class="gh" href="https://github.com/6a8i/koine-ide">GitHub</a>
    <a class="download" href="https://github.com/6a8i/koine-ide/releases/latest" data-latest-link>Baixar</a>
  </nav>
</header>
<main class="page">
${o.body}
</main>
<footer class="foot">
  <p>Koiné IDE é software livre (MIT). Feito por <a href="https://github.com/6a8i">6a8i</a> e <a href="https://github.com/6a8i/koine-ide/graphs/contributors">colaboradores</a>. <a href="https://github.com/6a8i/koine-ide/issues">Relate um problema</a> · <a href="https://github.com/6a8i/koine-ide/blob/main/CONTRIBUTING.md">Contribua</a>.</p>
</footer>
<script src="site.js"></script>
</body>
</html>
`;
}
