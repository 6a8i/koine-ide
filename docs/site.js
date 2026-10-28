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

  // versão mais recente: escolhe o instalador do sistema do visitante e preenche links, nomes e número de versão
  const ua = navigator.userAgent || "";
  const os = /Windows/i.test(ua) ? "windows" : /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? "macos" : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? "linux" : "windows";
  const OS_NAME = { windows: "Windows", linux: "Linux", macos: "macOS" };
  for (const el of document.querySelectorAll("[data-os-name]")) el.textContent = OS_NAME[os];
  const links = document.querySelectorAll("[data-latest-link]");
  const vers = document.querySelectorAll("[data-latest-version]");
  const others = document.querySelector("[data-latest-others]");
  if (links.length || vers.length || others) {
    fetch("https://api.github.com/repos/6a8i/koine-ide/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((rel) => {
        if (!rel) return;
        const assets = rel.assets || [];
        const find = (re) => assets.find((x) => re.test(x.name));
        const kinds = [
          { key: "windows", label: "Windows (.exe)", asset: find(/-setup\.exe$/i) },
          { key: "windows-msi", label: "Windows (.msi)", asset: find(/\.msi$/i) },
          { key: "linux", label: "Linux (.AppImage)", asset: find(/\.AppImage$/i) },
          { key: "linux-deb", label: "Linux (.deb)", asset: find(/\.deb$/i) },
          { key: "macos", label: "macOS (.dmg)", asset: find(/\.dmg$/i) },
        ].filter((k) => k.asset);
        const primary = kinds.find((k) => k.key === os) || kinds[0];
        if (primary) for (const l of links) l.href = primary.asset.browser_download_url;
        for (const v of vers) v.textContent = rel.tag_name.replace(/^v/, "");
        if (others) {
          others.textContent = "";
          const rest = kinds.filter((k) => k !== primary);
          rest.forEach((k, i) => {
            const el = document.createElement("a");
            el.href = k.asset.browser_download_url;
            el.textContent = k.label;
            others.appendChild(el);
            if (i < rest.length - 1) others.appendChild(document.createTextNode(" · "));
          });
          others.hidden = rest.length === 0;
        }
      })
      .catch(() => {});
  }
})();
