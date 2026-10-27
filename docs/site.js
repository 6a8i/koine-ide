// Destaque de sintaxe dos blocos <code class="koine"> e link para a versão mais recente.
(function () {
  const KW = /^(programa|funcao|inclua|biblioteca|const|se|senao|enquanto|faca|para|escolha|caso|contrario|pare|retorne|modulo|importe|publico|privado|estrutura|classe|herda|este|super|nulo|ref|teste|e|ou|nao|program|function|include|library|if|else|while|do|for|switch|case|default|break|return|module|import|public|private|struct|class|extends|this|null|test|and|or|not|πρόγραμμα|συνάρτηση|αν|αλλιώς|όσο|για|επίστρεψε|κλάση|κληρονομεί|ιδιωτικό|δημόσιο|αυτό|γονέας|συμπερίλαβε|βιβλιοθήκη|プログラム|関数|もし|さもなければ|間|繰り返し|戻る|クラス)$/u;
  const TYPES = /^(inteiro|real|cadeia|caracter|logico|vazio|integer|string|char|boolean|void|ακέραιος|πραγματικός|συμβολοσειρά|χαρακτήρας|λογικός|整数|実数|文字列|文字|論理|空)$/u;
  const CONST = /^(verdadeiro|falso|true|false|αληθής|ψευδής|真|偽)$/u;
  const BUILTIN = /^(escreva|leia|limpa|afirme|afirme_igual|afirme_diferente|afirme_aproximado|saida|entrada|write|read|clear|assert|assert_equal|assert_not_equal|assert_near|output|input|γράψε|διάβασε|書く|読む)$/u;
  const LIB = /^(Matematica|Texto|Util|Tipos|Math|Text|Types|Μαθηματικά|Κείμενο|Εργαλεία|Τύποι|数学|テキスト|ユーティリティ|型)$/u;
  const RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)')|(\b\d+(?:\.\d+)?\b)|([\p{L}_][\p{L}\p{N}_]*)/gu;
  // classe do token, ou null para texto comum
  const classOf = (c, s, n, w, rest) => {
    if (c) return "tk-comment";
    if (s) return "tk-str";
    if (n) return "tk-num";
    if (KW.test(w)) return "tk-kw";
    if (TYPES.test(w)) return "tk-type";
    if (CONST.test(w)) return "tk-const";
    if (BUILTIN.test(w)) return "tk-builtin";
    if (LIB.test(w)) return "tk-lib";
    if (/^\s*\(/.test(rest)) return "tk-fn";
    return null;
  };
  // Monta o destaque com nós do DOM (texto e <span>), sem interpretar nada como HTML.
  const highlight = (el) => {
    const src = el.textContent;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of src.matchAll(RE)) {
      const [tok, c, s, n, w] = m;
      if (m.index > last) frag.appendChild(document.createTextNode(src.slice(last, m.index)));
      const cls = classOf(c, s, n, w, src.slice(m.index + tok.length));
      if (cls) {
        const span = document.createElement("span");
        span.className = cls;
        span.textContent = tok;
        frag.appendChild(span);
      } else frag.appendChild(document.createTextNode(tok));
      last = m.index + tok.length;
    }
    if (last < src.length) frag.appendChild(document.createTextNode(src.slice(last)));
    el.replaceChildren(frag);
  };
  for (const el of document.querySelectorAll("code.koine")) highlight(el);

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
