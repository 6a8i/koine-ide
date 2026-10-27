// Destaque de sintaxe dos blocos <code class="koine"> e link para a versão mais recente.
(function () {
  const KW = /^(programa|funcao|inclua|biblioteca|const|se|senao|enquanto|faca|para|escolha|caso|contrario|pare|retorne|modulo|importe|publico|privado|estrutura|classe|herda|este|super|nulo|ref|teste|e|ou|nao|program|function|include|library|if|else|while|do|for|switch|case|default|break|return|module|import|public|private|struct|class|extends|this|null|test|and|or|not|πρόγραμμα|συνάρτηση|αν|αλλιώς|όσο|για|επίστρεψε|κλάση|κληρονομεί|ιδιωτικό|δημόσιο|αυτό|γονέας|συμπερίλαβε|βιβλιοθήκη|プログラム|関数|もし|さもなければ|間|繰り返し|戻る|クラス)$/u;
  const TYPES = /^(inteiro|real|cadeia|caracter|logico|vazio|integer|string|char|boolean|void|ακέραιος|πραγματικός|συμβολοσειρά|χαρακτήρας|λογικός|整数|実数|文字列|文字|論理|空)$/u;
  const CONST = /^(verdadeiro|falso|true|false|αληθής|ψευδής|真|偽)$/u;
  const BUILTIN = /^(escreva|leia|limpa|afirme|afirme_igual|afirme_diferente|afirme_aproximado|saida|entrada|write|read|clear|assert|assert_equal|assert_not_equal|assert_near|output|input|γράψε|διάβασε|書く|読む)$/u;
  const LIB = /^(Matematica|Texto|Util|Tipos|Math|Text|Types|Μαθηματικά|Κείμενο|Εργαλεία|Τύποι|数学|テキスト|ユーティリティ|型)$/u;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)')|(\b\d+(?:\.\d+)?\b)|([\p{L}_][\p{L}\p{N}_]*)/gu;
  const hl = (src) => src.replace(RE, (m, c, s, n, w, off, all) => {
    if (c) return `<span class="tk-comment">${esc(c)}</span>`;
    if (s) return `<span class="tk-str">${esc(s)}</span>`;
    if (n) return `<span class="tk-num">${n}</span>`;
    if (KW.test(w)) return `<span class="tk-kw">${esc(w)}</span>`;
    if (TYPES.test(w)) return `<span class="tk-type">${esc(w)}</span>`;
    if (CONST.test(w)) return `<span class="tk-const">${esc(w)}</span>`;
    if (BUILTIN.test(w)) return `<span class="tk-builtin">${esc(w)}</span>`;
    if (LIB.test(w)) return `<span class="tk-lib">${esc(w)}</span>`;
    if (/^\s*\(/.test(all.slice(off + w.length))) return `<span class="tk-fn">${esc(w)}</span>`;
    return esc(w);
  });
  for (const el of document.querySelectorAll("code.koine")) el.innerHTML = hl(el.textContent);

  // versão mais recente: preenche links e número de versão
  const links = document.querySelectorAll("[data-latest-link]");
  const msi = document.querySelectorAll("[data-latest-msi]");
  const vers = document.querySelectorAll("[data-latest-version]");
  if (links.length || vers.length) {
    fetch("https://api.github.com/repos/6a8i/koine-ide/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((rel) => {
        if (!rel) return;
        const exe = (rel.assets || []).find((a) => /-setup\.exe$/i.test(a.name));
        const m = (rel.assets || []).find((a) => /\.msi$/i.test(a.name));
        if (exe) for (const a of links) a.href = exe.browser_download_url;
        if (m) { for (const a of msi) { a.href = m.browser_download_url; a.hidden = false; } for (const s of document.querySelectorAll("[data-latest-msi-sep]")) s.hidden = false; }
        for (const v of vers) v.textContent = rel.tag_name.replace(/^v/, "");
      })
      .catch(() => {});
  }
})();
