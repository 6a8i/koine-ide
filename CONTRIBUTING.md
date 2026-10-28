# Contribuindo com o Koiné IDE

Obrigado pelo interesse! O Koiné IDE é um projeto aberto (licença MIT) e toda contribuição é bem-vinda: correções,
novas funções da linguagem, traduções, exemplos, documentação ou simplesmente um relato de bug bem descrito.

Ao participar, você concorda com o nosso [Código de Conduta](CODE_OF_CONDUCT.md).

## Antes de começar

- **Bugs**: abra uma [issue](https://github.com/6a8i/koine-ide/issues/new/choose) usando o modelo *Relatar um bug*.
  Inclua o programa que reproduz o problema (ou o menor trecho possível), o que esperava e o que aconteceu.
- **Ideias e funcionalidades**: abra uma issue com o modelo *Sugerir uma funcionalidade* antes de implementar algo
  grande, para alinharmos o desenho. Mudanças pequenas (um bug óbvio, um texto, uma tradução) podem ir direto em PR.
- Procure issues com a etiqueta `good first issue` se quiser um ponto de partida.

## Preparando o ambiente

Pré-requisitos: Node.js 18+ e, para a janela nativa, Rust (<https://rustup.rs>) com as ferramentas de C++ do
Windows (ou as dependências do Tauri no seu sistema: <https://tauri.app/start/prerequisites/>).

```bash
git clone https://github.com/6a8i/koine-ide.git
cd koine-ide
npm install
npm run dev          # só o frontend, no navegador (http://localhost:1420) — basta para quase tudo
npm run tauri dev    # janela nativa (precisa do Rust)
```

Quase todo o projeto é TypeScript; a parte Rust (`src-tauri/`) só cuida de janela, diálogos e arquivos. Para mexer na
linguagem, no editor ou nas traduções você não precisa do Rust.

## Verificando o seu trabalho

Antes de abrir o PR, rode:

```bash
npm test             # testes do interpretador + validador das tabelas de idioma
npm run build        # tsc --noEmit + build do frontend
```

Se tocou em `src-tauri/`:

```bash
cd src-tauri && cargo fmt && cargo clippy --no-default-features -- -D warnings
```

A integração contínua roda exatamente esses comandos em cada PR; um PR só é mesclado com tudo verde.

## Onde fica cada coisa

| Pasta | O que tem |
| --- | --- |
| `src/lang/koine/` | a linguagem: parser → resolver (tipos e escopos) → interpretador |
| `src/lang/shared/` | lexer, tipos, runtime, ligador de módulos, testes/cobertura, depurador |
| `src/lang/i18n/` | vocabulário de cada idioma e o conversor de código |
| `src/i18n/ui/` | textos da interface por idioma (chave = texto em português) |
| `src/reference/` | referência (F1) e suas traduções |
| `src/examples/` | programas de exemplo |
| `src/ui/`, `src/main.ts` | interface (CodeMirror, painéis, projeto) |
| `tests/` | `run.ts` (casos do interpretador) e `check-i18n.ts` (validador de idiomas) |

O [README](README.md) explica a arquitetura em mais detalhe.

## Regras para mudanças na linguagem

- **Compatibilidade**: programas existentes devem continuar compilando. Toda sintaxe nova é opcional e nenhuma palavra
  reservada nova pode quebrar identificadores comuns sem uma boa razão.
- **Mensagens de erro didáticas**: o público é quem está aprendendo. Diga o que está errado, onde, e como corrigir
  (ex.: *"A condição do 'se' usa '=' (atribuição). Para comparar valores use '=='"*).
- **Testes**: toda funcionalidade ou correção vem com casos em `tests/run.ts` (saída esperada ou erro esperado com
  expressão regular).
- **Palavra ou função nova**: acrescente em `CANON` (`src/lang/i18n/index.ts`), na tabela de **todos** os idiomas em
  `src/lang/i18n/vocab/*.ts`, na referência (`src/reference/index.ts` + `src/reference/i18n/*.ts`) e, se fizer sentido,
  no autocompletar (`src/ui/languages.ts`). O `npm test` acusa o que faltar.
- **Mensagens de erro**: nunca escreva texto solto; use `m("Texto em português com {parametro}", { parametro })`
  (`src/lang/i18n/messages.ts`) e acrescente a tradução nos nove dicionários de `src/lang/i18n/messages/`. Monte frases
  inteiras por caso em vez de colar fragmentos em português dentro de um parâmetro, porque o fragmento não é traduzido.
  Textos de exemplos novos (comentários e literais) entram em `src/examples/i18n/`. O `npm test` acusa o que faltar.
- **Velocidade**: o caminho normal de execução é síncrono e sem custo extra; só `leia`/`aguarde` e o depurador são
  assíncronos. Não introduza `await` no caminho quente.

## Regras para a interface

- Todo texto visível passa por `t("texto em português")` (ou `data-i18n` no HTML) e ganha tradução nos nove
  dicionários de `src/i18n/ui/`. O validador lista as chaves que faltam.
- Atalhos de teclado e rótulos novos entram no README.

## Traduções

Para melhorar um idioma existente, edite as tabelas dele: `src/lang/i18n/vocab/<id>.ts` (palavras reservadas),
`src/i18n/ui/<id>.ts` (interface), `src/reference/i18n/<id>.ts` (referência), `src/lang/i18n/messages/<id>.ts`
(mensagens de erro) e `src/examples/i18n/<id>.ts` (textos dos exemplos). Cada palavra reservada precisa ser um
identificador válido (letras, dígitos e `_`), única dentro da tabela e diferente de qualquer palavra canônica em
português. Para um idioma novo, acrescente também a entrada em `LOCALES` e nos mapas `VOCAB`, `DICTS` e `REF_I18N`.
Revisão de falante nativo é muito bem-vinda: diga na issue/PR qual é o seu idioma.

## Abrindo o pull request

1. Crie um fork e uma branch a partir de `main` (`correcao/escolha-sem-pare`, `recurso/dicionarios`, `i18n/italiano`...).
2. Commits pequenos, com mensagens em português no imperativo descrevendo o *porquê* (ex.: *"Impede que `pare` fora de
   laço seja aceito"*).
3. Preencha o modelo do PR: o que muda, como testar, issue relacionada. Capturas de tela ajudam quando a interface muda.
4. Um mantenedor revisa; é normal haver pedidos de ajuste. Depois de aprovado e com a CI verde, o PR é mesclado com
   *squash*.

## Lançamentos

Os mantenedores publicam versões criando uma tag `vX.Y.Z` (a versão de `package.json` e `src-tauri/tauri.conf.json`
deve ser a mesma). A pipeline de release gera o instalador do Windows e o anexa à página de *Releases*.

## Dúvidas

Abra uma [discussão](https://github.com/6a8i/koine-ide/discussions) ou uma issue. Não existe pergunta boba.
