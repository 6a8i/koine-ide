# Portugol IDE

IDE de desktop, leve e rápida, para aprender programação em **Portugol**. Suporta as duas sintaxes mais usadas no Brasil:

| Linguagem | Extensão | Exemplo |
| --- | --- | --- |
| Portugol Studio | `.por` | `programa { funcao inicio() { escreva("Olá") } }` |
| VisuAlg | `.alg` | `algoritmo "x" ... inicio ... fimalgoritmo` |

Feita com [Tauri 2](https://tauri.app) (janela nativa, instalador de poucos MB), [CodeMirror 6](https://codemirror.net) (editor) e interpretadores próprios escritos em TypeScript que rodam numa *Web Worker* — a interface nunca trava, mesmo em laços infinitos.

## Funcionalidades

- Editor com destaque de sintaxe, autocompletar, dobra de blocos, busca (Ctrl+F) e múltiplos cursores.
- Execução instantânea (F5) com console integrado: entrada de dados inline (`leia`), saída em tempo real, botão **Parar**.
- Mensagens de erro em português, com linha/coluna e destaque no editor — pensadas para quem está aprendendo
  (ex.: *"A condição do 'se' usa '=' (atribuição). Para comparar valores use '=='"*).
- Verificação de tipos antes de executar (variável não declarada, tipo incompatível, função com parâmetros errados...).
- **Depurador** (F6): pontos de parada (clique na margem esquerda), passo a passo (F10 Passo, F11 Entrar, Shift+F11 Sair,
  F8 Continuar, Pausar), destaque da linha atual e painel **Variáveis** com a pilha de chamadas e o valor de cada variável,
  atualizado ao vivo. Passe o mouse sobre uma variável no editor para ver seu valor e tipo; sobre uma palavra reservada,
  para ver uma explicação rápida. Depois de uma execução normal, os valores finais continuam disponíveis.
- Tempo de execução de cada programa na barra de status e no console (sem contar o tempo esperando o usuário).
- Painel lateral **Referência** (F1): todas as palavras reservadas, comandos, operadores e funções de cada linguagem,
  com explicação, forma de uso e exemplo que pode ser inserido no editor.
- Tema claro/escuro, console redimensionável, exemplos prontos nas duas linguagens.
- Abre arquivos por duplo clique (`.por`/`.alg`), por arrastar-e-soltar ou pelo menu. Rascunho salvo automaticamente.

## Desenvolvimento

Pré-requisitos (Windows):

1. **Node.js 18+** — <https://nodejs.org>
2. **Rust** — <https://rustup.rs> (instala o `cargo`)
3. **Microsoft C++ Build Tools** — <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
   (marque "Desenvolvimento para desktop com C++"). O WebView2 já vem no Windows 10/11.

```bash
npm install          # dependências do frontend
npm run tauri dev    # abre a janela em modo de desenvolvimento (recarrega ao salvar)
npm run tauri build  # gera o instalador em src-tauri/target/release/bundle/
```

Outros comandos:

```bash
npm test             # roda a suíte de testes dos interpretadores (node)
npm run dev          # só o frontend, no navegador (http://localhost:1420)
npm run build        # compila o frontend para dist/
```

> A primeira compilação do Rust demora alguns minutos; as seguintes são rápidas.

## Estrutura

```
src/
  lang/
    shared/      lexer genérico, tipos, runtime comum, depurador (debug.ts)
    studio/      Portugol Studio: parser → resolver (tipos/escopos) → interpretador
    visualg/     VisuAlg: parser+resolver → interpretador
    worker.ts    executa o programa fora da thread da interface
  ui/            editor (CodeMirror), console, variáveis, referência, arquivos (Tauri), destaque das linguagens
  examples/      programas de exemplo
  reference/     conteúdo da referência (palavras reservadas e funções)
  main.ts        monta a aplicação
src-tauri/       aplicação nativa (Rust): janela, diálogos, leitura/escrita de arquivos
tests/run.ts     casos de teste dos interpretadores
```

### Como os interpretadores funcionam

Cada linguagem é analisada para uma árvore (AST) com tipos já resolvidos e variáveis mapeadas para posições fixas (slots),
o que torna a execução rápida (milhões de operações por segundo). Comandos que precisam esperar o usuário (`leia`, `aguarde`,
`pausa`) são marcados na análise; só esses trechos são executados de forma assíncrona — todo o resto roda de forma síncrona.

No modo de depuração a árvore inteira é marcada como assíncrona e, antes de cada comando, o interpretador chama o
depurador (`src/lang/shared/debug.ts`), que decide se pausa (ponto de parada, passo) e envia uma "foto" das variáveis
para a interface. Por isso a depuração é mais lenta que a execução normal, que continua sem nenhum custo extra.

## Licença

MIT
