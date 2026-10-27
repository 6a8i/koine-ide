# Koiné IDE

IDE de desktop, leve e rápida, para aprender programação com **Koiné**, uma linguagem de pseudocódigo escrita **no seu
idioma**. O nome vem do grego *koiné*, a "língua comum": as palavras reservadas, as funções nativas, a interface e a
referência existem em dez idiomas (português, inglês, espanhol, grego, russo, ucraniano, polonês, japonês, coreano e
chinês). Os programas ficam em arquivos `.koi`:

```koine
programa
{
    funcao inicio()
    {
        escreva("Olá, mundo!\n")
    }
}
```

Feita com [Tauri 2](https://tauri.app) (janela nativa, instalador de poucos MB), [CodeMirror 6](https://codemirror.net) (editor) e um interpretador próprio escrito em TypeScript que roda numa *Web Worker* — a interface nunca trava, mesmo em laços infinitos.

## Funcionalidades

- **Projetos em pasta**: abra uma pasta (botão *Pasta*, Ctrl+Shift+O, ou arraste-a para a janela) e trabalhe com vários
  arquivos em abas, com árvore de arquivos à esquerda (criar, renomear, excluir para a lixeira, definir o arquivo principal).
  F5 executa o projeto inteiro; erros e pausas do depurador abrem o arquivo certo.
- **Módulos**: um arquivo importa outro com `importe` e usa só o que foi declarado `publico`
  (funções, variáveis, estruturas e classes). Veja a sintaxe abaixo. O exemplo **Projeto com vários arquivos**
  (menu *Exemplos*) abre três abas que se importam e executam juntas, mesmo sem salvar.
- **Estruturas, classes com herança e referências seguras**.
- **Idiomas**: o seletor na barra troca o idioma da interface, do destaque/autocompletar, da referência e dos exemplos.
  O código é escrito com as palavras do idioma (ex.: `συνάρτηση αρχή()` em grego, `function main()` em inglês); as
  palavras em português continuam valendo em qualquer idioma. Ao trocar, a IDE oferece converter os arquivos abertos
  (só palavras reservadas e funções nativas; textos, comentários e nomes do usuário ficam como estão). Veja abaixo.
- Editor com destaque de sintaxe, autocompletar, dobra de blocos, busca (Ctrl+F) e múltiplos cursores.
- Execução instantânea (F5) com console integrado: entrada de dados inline (`leia`), saída em tempo real, botão **Parar**.
- Mensagens de erro em português, com linha/coluna e destaque no editor — pensadas para quem está aprendendo
  (ex.: *"A condição do 'se' usa '=' (atribuição). Para comparar valores use '=='"*).
- Verificação de tipos antes de executar (variável não declarada, tipo incompatível, função com parâmetros errados...).
- **Depurador** (F6): pontos de parada (clique na margem esquerda), passo a passo (F10 Passo, F11 Entrar, Shift+F11 Sair,
  F8 Continuar, Pausar), destaque da linha atual e painel **Variáveis** com a pilha de chamadas e o valor de cada variável,
  atualizado ao vivo. Passe o mouse sobre uma variável no editor para ver seu valor e tipo; sobre uma palavra reservada,
  para ver uma explicação rápida. Depois de uma execução normal, os valores finais continuam disponíveis.
- **Testes automatizados** (F7): blocos `teste "nome"` escritos em Koiné, no próprio programa ou em um arquivo
  separado que o importa, com `afirme`, `afirme_igual`, `afirme_aproximado`, `entrada(...)`/`saida()` para testar o
  programa inteiro. O painel **Testes** executa todos, só um arquivo ou só um teste, mostra o que passou e falhou (com link
  para a linha) e a **cobertura**: percentual de linhas executadas por arquivo, funções sem nenhum teste e marcas
  verde/vermelho no editor. Veja a sintaxe abaixo.
- Tempo de execução de cada programa na barra de status e no console (sem contar o tempo esperando o usuário).
- Painel lateral **Referência** (F1): todas as palavras reservadas, comandos, operadores e funções da linguagem,
  com explicação, forma de uso e exemplo que pode ser inserido no editor.
- Tema claro/escuro, console redimensionável, exemplos prontos.
- Abre arquivos `.koi` por duplo clique, por arrastar-e-soltar ou pelo menu. Rascunho salvo automaticamente.

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
npm test             # roda a suíte de testes do interpretador e o validador de idiomas (node)
npm run dev          # só o frontend, no navegador (http://localhost:1420)
npm run build        # compila o frontend para dist/
```

> A primeira compilação do Rust demora alguns minutos; as seguintes são rápidas.

## Estrutura

```
src/
  lang/
    shared/      lexer, tipos, runtime comum, ligador de módulos, testes/cobertura, depurador (debug.ts)
    koine/       a linguagem: parser → resolver (tipos/escopos) → interpretador
    i18n/        vocabulário por idioma (palavras reservadas e funções nativas) e conversor de código
    worker.ts    executa o programa fora da thread da interface
  ui/            editor (CodeMirror), console, variáveis, testes, referência, arquivos (Tauri), destaque de sintaxe
  i18n/          textos da interface por idioma
  examples/      programas de exemplo
  reference/     conteúdo da referência (palavras reservadas e funções) e suas traduções
  main.ts        monta a aplicação
src-tauri/       aplicação nativa (Rust): janela, diálogos, leitura/escrita de arquivos
tests/           casos de teste do interpretador (run.ts) e validador das tabelas de idioma (check-i18n.ts)
```

## A linguagem

Koiné é uma linguagem de pseudocódigo com sintaxe de chaves, tipos declarados e uma função `inicio()` por onde o
programa começa. As palavras reservadas são
`programa funcao inclua biblioteca const inteiro real cadeia caracter logico vazio se senao enquanto faca para escolha
caso contrario pare retorne verdadeiro falso e ou nao modulo importe publico privado estrutura classe herda este super
nulo ref teste`, e as bibliotecas `Matematica`, `Texto`, `Util` e `Tipos` trazem as funções prontas (veja a referência, F1).

### Módulos, visibilidade, estruturas, classes e referências

```koine
// geometria.koi — biblioteca (sem funcao inicio)
programa
{
    modulo Geometria                       // opcional: o padrão é o nome do arquivo
    publico const real PI = 3.14159

    publico estrutura Ponto { real x  real y }        // valor: copiada ao atribuir/passar

    publico classe Forma
    {
        privado cadeia nome                           // privado = só na classe e nas subclasses
        publico Forma(cadeia nome) { este.nome = nome }
        publico real area() { retorne 0.0 }
    }
    publico classe Circulo herda Forma
    {
        privado real raio
        publico Circulo(real r) { super("círculo")  raio = r }
        publico real area() { retorne PI * raio * raio }   // sobrescreve
    }
    publico real distancia(Ponto a, Ponto b) { ... }      // pública
    real quadrado(real v) { retorne v * v }               // privada ao módulo (padrão)
}

// principal.koi
programa
{
    importe Geometria                      // ou importe "lib/geometria.koi" --> geo
    funcao inicio()
    {
        Ponto p = Ponto(1.0, 2.0)          // Ponto() zera os campos
        Forma f = Circulo(2.0)             // objetos são compartilhados por referência; aceitam nulo
        inteiro n = 10
        ref inteiro r = &n                 // referência segura: &x pega, *r acessa, sem aritmética
        *r = 20
        escreva(Geometria.distancia(p, p), " ", f.area(), " ", n, "\n")
    }
}
```

Regras: `privado` é o padrão; campos privados são visíveis na classe e nas subclasses; estruturas são copiadas,
objetos são compartilhados; `nulo` só cabe em variáveis de classe ou `ref`; `==` compara estruturas campo a campo e
objetos por identidade; duas referências não se comparam diretamente (compare `*a` com `*b`).

### Testes automatizados

Um teste é um bloco com nome, que roda isolado (as variáveis globais são reiniciadas a cada teste) e falha quando uma
afirmação não se cumpre. Os testes não rodam com F5, só com F7 ou pelo painel **Testes**. Podem ficar no próprio
programa ou num arquivo separado com `importe` (que enxerga até as funções privadas do programa):

```koine
programa
{
    importe calculadora

    teste "soma de dois números"
    {
        afirme_igual(5, soma(2, 3))                  // esperado, obtido
        afirme(eh_par(10), "10 é par")               // condição, mensagem opcional
        afirme_aproximado(2.5, media(2, 3), 0.001)   // reais: com tolerância
    }
    teste "programa completo"
    {
        entrada("2\n3")                 // o que o usuário digitaria
        inicio()                        // roda o programa
        afirme_igual("Soma: 5\n", saida())
    }
}
```

Afirmações: `afirme(cond[, msg])`, `afirme_igual(esperado, obtido[, msg])` (estruturas campo a campo, vetores
item a item), `afirme_diferente(a, b[, msg])`, `afirme_aproximado(esperado, obtido, tolerancia[, msg])`. A cobertura conta
as linhas de comando de funções, métodos e do programa principal que algum teste executou; os próprios testes não contam.
Arquivos que nenhum teste alcança aparecem com 0%.

### Idiomas

O vocabulário interno é o português: cada idioma tem uma tabela canônico → palavra localizada
(`src/lang/i18n/vocab/*.ts`). O lexer traduz as palavras do idioma ativo para o canônico antes da análise, então
parser e interpretador não mudam; `verdadeiro`/`falso` são escritos e lidos no idioma. O conversor
(`translateSource`) troca só os tokens de vocabulário, preservando textos e comentários, e é o que gera exemplos,
modelos de autocompletar e trechos da referência em cada idioma. Os textos da interface usam o português como chave
(`src/i18n/ui/*.ts`) e os resumos da referência ficam em `src/reference/i18n/*.ts`. `npm test` valida as tabelas:
vocabulário completo, sem colisões, exemplos convertidos que compilam e voltam iguais ao português.

Limitações desta etapa: as mensagens de erro do compilador/interpretador continuam em português, e os comentários dos
exemplos também.

### Como o interpretador funciona

O código é analisado para uma árvore (AST) com tipos já resolvidos e variáveis mapeadas para posições fixas (slots),
o que torna a execução rápida (milhões de operações por segundo). Comandos que precisam esperar o usuário (`leia`,
`Util.aguarde`) são marcados na análise; só esses trechos são executados de forma assíncrona — todo o resto roda de
forma síncrona.

Num projeto, cada arquivo é analisado separadamente; o ligador (`src/lang/shared/modules.ts`) resolve os `importe`,
detecta ciclos e ordena os módulos, e o resolvedor verifica tipos e visibilidade com os módulos importados.
Erros e pontos de parada carregam o arquivo de origem.

No modo de depuração a árvore inteira é marcada como assíncrona e, antes de cada comando, o interpretador chama o
depurador (`src/lang/shared/debug.ts`), que decide se pausa (ponto de parada, passo) e envia uma "foto" das variáveis
para a interface. Por isso a depuração é mais lenta que a execução normal, que continua sem nenhum custo extra.

## Licença

MIT
