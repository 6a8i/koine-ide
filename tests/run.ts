/* Testes dos interpretadores: node --import tsx tests/run.ts */
import { compile } from "../src/lang/index";
import { BufferHost } from "../src/lang/shared/runtime";
import { Lang, PortugolError } from "../src/lang/shared/types";

interface Case { name: string; lang: Lang; src: string; inputs?: string[]; expect?: string; error?: RegExp; errorLine?: number }

const S = (s: string) => `programa {\n${s}\n}`;
const SM = (body: string, extra = "") => S(`funcao inicio() {\n${body}\n}\n${extra}`);
const V = (vars: string, body: string, subs = "") => `algoritmo "t"\nvar\n${vars}\n${subs}\ninicio\n${body}\nfimalgoritmo`;

const cases: Case[] = [
  // ---------------- Studio ----------------
  { name: "studio: aritmética inteira e real", lang: "studio", src: SM(`escreva(7 / 2, " ", 7 / 2.0, " ", 7 % 3, " ", 2 * 3 + 1, " ", -5, " ", 1.5 + 1)`), expect: "3 3.5 1 7 -5 2.5" },
  { name: "studio: precedência e lógica", lang: "studio", src: SM(`escreva(1 + 2 * 3 == 7, " ", nao falso e verdadeiro, " ", 3 > 2 ou 1 > 2, " ", (1 + 2) * 3)`), expect: "verdadeiro verdadeiro verdadeiro 9" },
  { name: "studio: curto-circuito", lang: "studio", src: SM(`inteiro x = 0\nse (x != 0 e 10 / x > 1) { escreva("a") } senao { escreva("b") }`), expect: "b" },
  { name: "studio: cadeias", lang: "studio", src: S(`inclua biblioteca Texto\nfuncao inicio() {\ncadeia s = "Portugol"\nescreva(Texto.numero_caracteres(s), " ", Texto.caixa_baixa(s), " ", Texto.obter_caractere(s, 0), " ", Texto.extrair_subtexto(s, 0, 4), " ", s + 1 + 2, " ", 'a' + "b")\n}`), expect: "8 portugol P Port Portugol12 ab" },
  { name: "studio: para/enquanto/faca", lang: "studio", src: SM(`inteiro i = 0, s = 0\npara (i = 1; i <= 5; i++) { s += i }\nenquanto (i > 0) { i-- }\nfaca { i++ } enquanto (i < 3)\nescreva(s, " ", i)`), expect: "15 3" },
  { name: "studio: pare dentro de laço aninhado", lang: "studio", src: SM(`para (inteiro i = 0; i < 3; i++) { para (inteiro j = 0; j < 3; j++) { se (j == 1) pare escreva(i, j, " ") } }`), expect: "00 10 20 " },
  { name: "studio: escolha com fallthrough e contrario", lang: "studio", src: SM(`para (inteiro i = 1; i <= 4; i++) { escolha (i) { caso 1: escreva("um ") caso 2: escreva("dois ") pare caso 3: escreva("tres ") pare caso contrario: escreva("outro ") } }`), expect: "um dois dois tres outro " },
  { name: "studio: escolha com cadeia", lang: "studio", src: SM(`cadeia op = "b"\nescolha (op) { caso "a": escreva("A") pare caso "b": escreva("B") pare }`), expect: "B" },
  { name: "studio: funções, recursão, referência", lang: "studio", src: SM(`inteiro a = 2\nincrementa(a)\nescreva(fib(15), " ", a)`, `funcao inteiro fib(inteiro n) { se (n < 2) retorne n retorne fib(n-1) + fib(n-2) }\nfuncao incrementa(inteiro &x) { x++ }`), expect: "610 3" },
  { name: "studio: vetor por referência e Util", lang: "studio", src: S(`inclua biblioteca Util\nfuncao inicio() { inteiro v[] = {3, 1, 2} zera(v) escreva(v[0], v[1], v[2], " ", Util.numero_elementos(v)) }\nfuncao zera(inteiro vet[]) { para (inteiro i = 0; i < Util.numero_elementos(vet); i++) vet[i] = 0 }`), expect: "000 3" },
  { name: "studio: matriz", lang: "studio", src: SM(`inteiro m[2][3]\nm[1][2] = 9\ninteiro n[][] = {{1,2},{3,4}}\nescreva(m[1][2], m[0][0], n[1][0])`), expect: "903" },
  { name: "studio: globais e constantes", lang: "studio", src: S(`inteiro contador = 10\nconst real PI2 = 6.28\nfuncao inicio() { contador++ escreva(contador, " ", PI2) }`), expect: "11 6.28" },
  { name: "studio: leia múltiplo e tipos", lang: "studio", src: SM(`inteiro a\nreal b\ncadeia c\nlogico d\ncaracter c2\nleia(a, b, c, d, c2)\nescreva(a + 1, " ", b * 2, " ", c, " ", d, " ", c2)`), inputs: ["41", "1,5", "oi tudo", "verdadeiro", "xyz"], expect: "42 3.0 oi tudo verdadeiro x" },
  { name: "studio: leia dentro de função chamada em expressão", lang: "studio", src: SM(`escreva(dobro() + 1)`, `funcao inteiro dobro() { inteiro x leia(x) retorne x * 2 }`), inputs: ["5"], expect: "11" },
  { name: "studio: leia em laço", lang: "studio", src: SM(`inteiro s = 0, x\npara (inteiro i = 0; i < 3; i++) { leia(x) s += x }\nescreva(s)`), inputs: ["1", "2", "3"], expect: "6" },
  { name: "studio: Matematica", lang: "studio", src: S(`inclua biblioteca Matematica --> m\nfuncao inicio() { escreva(m.potencia(2, 10), " ", m.raiz(27, 3), " ", m.arredondar(3.14159, 2), " ", m.maior_numero(3, 9), " ", m.valor_absoluto(-4)) }`), expect: "1024.0 3.0 3.14 9 4" },
  { name: "studio: Tipos", lang: "studio", src: S(`inclua biblioteca Tipos\nfuncao inicio() { escreva(Tipos.cadeia_para_inteiro("42") + 1, " ", Tipos.real_para_inteiro(3.9), " ", Tipos.inteiro_para_cadeia(7) + "!") }`), expect: "43 3 7!" },
  { name: "studio: limpa", lang: "studio", src: SM(`escreva("x") limpa() escreva("y")`), expect: "y" },
  { name: "studio: comentários e escapes", lang: "studio", src: SM(`// linha\n/* bloco\n*/ escreva("a\\tb\\"c\\"\\n")`), expect: 'a\tb"c"\n' },
  { name: "studio: inteiro recebe divisão real (erro)", lang: "studio", src: SM(`inteiro x = 5 / 2.0`), error: /real.*inteiro/, errorLine: 3 },
  { name: "studio: variável não inicializada (erro)", lang: "studio", src: SM(`inteiro x\nescreva(x)`), error: /antes de receber um valor/ },
  { name: "studio: função sem inicio (erro)", lang: "studio", src: S(`funcao x() {}`), error: /inicio/ },
  { name: "studio: recursão infinita (erro)", lang: "studio", src: SM(`f(1)`, `funcao inteiro f(inteiro n) { retorne f(n + 1) }`), error: /pilha/ },
  { name: "studio: parâmetro errado (erro)", lang: "studio", src: SM(`f("a")`, `funcao f(inteiro n) {}`), error: /inteiro.*cadeia/ },
  { name: "studio: chave não fechada (erro)", lang: "studio", src: `programa { funcao inicio() { se (1 > 0) { escreva("a") }`, error: /fechar/ },
  { name: "studio: biblioteca não incluída (erro)", lang: "studio", src: SM(`escreva(Matematica.PI)`), error: /inclua biblioteca Matematica/ },
  { name: "studio: pare fora de laço (erro)", lang: "studio", src: SM(`pare`), error: /laço/ },

  // ---------------- VisuAlg ----------------
  { name: "visualg: aritmética", lang: "visualg", src: V("a: inteiro\nx: real", `a <- 7 div 2\nx <- 7 / 2\nescreva(a, " ", x, " ", 7 mod 3, " ", 7 \\ 2, " ", 2 ^ 3, " ", -3, " ", 1.5 + 1)`), expect: " 3  3.5  1  3  8 -3  2.5" },
  { name: "visualg: lógica e comparação", lang: "visualg", src: V("", `escreva(1 + 2 * 3 = 7, nao falso e verdadeiro, 3 > 2 ou 1 > 2, verdadeiro xou verdadeiro, "a" <> "b")`), expect: " VERDADEIRO VERDADEIRO VERDADEIRO FALSO VERDADEIRO" },
  { name: "visualg: escreval e formatação", lang: "visualg", src: V("x: real", `x <- 3.14159\nescreval("[", x:8:2, "]")\nescreval("[", 42:5, "]", 2.5:0:1)\nescreva("fim")`), expect: "[    3.14]\n[   42]2.5\nfim" },
  { name: "visualg: strings", lang: "visualg", src: V("s: caractere", `s <- "Visu" + "Alg"\nescreva(compr(s), " ", maiusc(s), " ", copia(s, 2, 3), " ", pos("Alg", s), " ", carac(65), " ", asc("a"))`), expect: " 7 VISUALG isu  5 A  97" },
  { name: "visualg: para com passo negativo e interrompa", lang: "visualg", src: V("i: inteiro", `para i de 10 ate 1 passo -3 faca\nescreva(i, ";")\nfimpara\npara i de 1 ate 100 faca\nse i = 4 entao\ninterrompa\nfimse\nfimpara\nescreva(i)`), expect: " 10; 7; 4; 1; 4" },
  { name: "visualg: para vazio não executa", lang: "visualg", src: V("i: inteiro", `para i de 5 ate 1 faca\nescreva("x")\nfimpara\nescreva("ok")`), expect: "ok" },
  { name: "visualg: repita/enquanto", lang: "visualg", src: V("i: inteiro", `i <- 0\nrepita\ni <- i + 1\nate i >= 3\nenquanto i < 6 faca\ni <- i + 1\nfimenquanto\nescreva(i)`), expect: " 6" },
  { name: "visualg: escolha com intervalo e lista", lang: "visualg", src: V("i: inteiro", `para i de 1 ate 7 faca\nescolha i\ncaso 1, 2\nescreva("a")\ncaso 3 a 5\nescreva("b")\noutrocaso\nescreva("c")\nfimescolha\nfimpara`), expect: "aabbbcc" },
  { name: "visualg: escolha com caractere", lang: "visualg", src: V("op: caractere", `op <- "s"\nescolha op\ncaso "s", "S"\nescreva("sim")\ncaso "n"\nescreva("nao")\nfimescolha`), expect: "sim" },
  { name: "visualg: funcao com nome como retorno e recursão", lang: "visualg", src: V("", `escreva(soma(2, 3), fib(15))`, `funcao soma(a, b: inteiro): inteiro\ninicio\nsoma <- a + b\nfimfuncao\nfuncao fib(n: inteiro): inteiro\ninicio\nse n < 2 entao\nretorne n\nfimse\nretorne fib(n - 1) + fib(n - 2)\nfimfuncao`), expect: " 5 610" },
  { name: "visualg: procedimento com var e locais", lang: "visualg", src: V("a, b: inteiro", `a <- 1\nb <- 2\ntroca(a, b)\nescreva(a, b)`, `procedimento troca(var x, y: inteiro)\nvar t: inteiro\ninicio\nt <- x\nx <- y\ny <- t\nfimprocedimento`), expect: " 2 1" },
  { name: "visualg: vetor com limites e matriz", lang: "visualg", src: V("v: vetor[0..4] de inteiro\nm: vetor[1..2, 1..2] de caractere\ni: inteiro", `para i de 0 ate 4 faca\nv[i] <- i * i\nfimpara\nm[2, 2] <- "z"\nescreva(v[4], m[2, 2], "|", m[1, 1], "|")`), expect: " 16z||" },
  { name: "visualg: vetor passado a procedimento", lang: "visualg", src: V("v: vetor[1..3] de inteiro", `preenche(v)\nescreva(v[1], v[3])`, `procedimento preenche(var x: vetor[1..3] de inteiro)\nvar i: inteiro\ninicio\npara i de 1 ate 3 faca\nx[i] <- i * 10\nfimpara\nfimprocedimento`), expect: " 10 30" },
  { name: "visualg: leia múltiplo", lang: "visualg", src: V("a: inteiro\nx: real\ns: caractere\nl: logico", `leia(a, x, s, l)\nescreva(a + 1, x * 2, s, l)`), inputs: ["41", "1,5", "oi", "falso"], expect: " 42 3oi FALSO" },
  { name: "visualg: leia em função chamada numa expressão", lang: "visualg", src: V("", `escreva(dobro() + 1)`, `funcao dobro(): inteiro\nvar x: inteiro\ninicio\nleia(x)\nretorne x * 2\nfimfuncao`), inputs: ["5"], expect: " 11" },
  { name: "visualg: case-insensitive e comentários", lang: "visualg", src: `ALGORITMO "x"\nVAR\n  Total: INTEIRO // comentário\ninicio\n  { outro comentário }\n  TOTAL <- 5\n  Escreval(total)\nFimAlgoritmo`, expect: " 5\n" },
  { name: "visualg: funções matemáticas", lang: "visualg", src: V("", `escreva(raizq(16), int(3.9), abs(-2), quad(3), exp(2, 10), log(1000))`), expect: " 4 3 2 9 1024 3" },
  { name: "visualg: limpatela e pausa", lang: "visualg", src: V("", `escreva("x")\nlimpatela\npausa\nescreva("y")`), expect: "y" },
  { name: "visualg: variável não declarada (erro)", lang: "visualg", src: V("", `x <- 1`), error: /não foi declarada/, errorLine: 6 },
  { name: "visualg: real em inteiro (erro)", lang: "visualg", src: V("a: inteiro", `a <- 1 / 2`), error: /real.*inteiro/ },
  { name: "visualg: tipos incompatíveis em se (erro)", lang: "visualg", src: V("a: inteiro", `se a entao\nfimse`), error: /lógico/ },
  { name: "visualg: índice fora (erro)", lang: "visualg", src: V("v: vetor[1..3] de inteiro", `v[0] <- 1`), error: /fora dos limites/ },
  { name: "visualg: faltou fimpara (erro)", lang: "visualg", src: V("i: inteiro", `para i de 1 ate 3 faca\nescreva(i)`), error: /fimpara/ },
  { name: "visualg: divisão por zero (erro)", lang: "visualg", src: V("x: real", `x <- 1 / 0`), error: /Divisão por zero/ },
  { name: "visualg: recursão infinita (erro)", lang: "visualg", src: V("", `escreva(f(1))`, `funcao f(n: inteiro): inteiro\ninicio\nretorne f(n + 1)\nfimfuncao`), error: /pilha/ },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const host = new BufferHost(c.inputs ?? []);
  let err: PortugolError | null = null;
  try {
    await compile(c.lang, c.src).run(host);
  } catch (e) {
    if (e instanceof PortugolError) err = e;
    else { console.log(`✗ ${c.name}: exceção inesperada`, e); fail++; continue; }
  }
  if (c.error) {
    if (!err) { console.log(`✗ ${c.name}: esperava erro ${c.error}, mas rodou. Saída: ${JSON.stringify(host.out)}`); fail++; continue; }
    if (!c.error.test(err.message)) { console.log(`✗ ${c.name}: erro diferente: [${err.line}:${err.col}] ${err.message}`); fail++; continue; }
    if (c.errorLine && err.line !== c.errorLine) { console.log(`✗ ${c.name}: linha ${err.line}, esperava ${c.errorLine}`); fail++; continue; }
    pass++;
    continue;
  }
  if (err) { console.log(`✗ ${c.name}: erro inesperado [${err.line}:${err.col}] ${err.message}`); fail++; continue; }
  if (host.out !== c.expect) { console.log(`✗ ${c.name}:\n   esperado ${JSON.stringify(c.expect)}\n   obtido   ${JSON.stringify(host.out)}`); fail++; continue; }
  pass++;
}
// ---------------- Depurador ----------------
import { Debugger, Snapshot } from "../src/lang/shared/debug";

interface DebugCase {
  name: string;
  lang: Lang;
  src: string;
  breakpoints?: number[];
  /** comando a enviar em cada pausa (o último se repete) */
  commands: ("continue" | "over" | "into" | "out")[];
  /** linhas em que o programa deve pausar, na ordem */
  stops: number[];
  /** verificação do snapshot na última pausa */
  check?: (s: Snapshot) => string | null;
  expect?: string;
  inputs?: string[];
}

const studioDbg = `programa
{
    funcao inicio()
    {
        inteiro soma = 0
        para (inteiro i = 1; i <= 3; i++)
        {
            soma = soma + dobro(i)
        }
        escreva(soma)
    }
    funcao inteiro dobro(inteiro n)
    {
        inteiro r = n * 2
        retorne r
    }
}`;

const visualgDbg = `algoritmo "d"
var
    v: vetor[1..3] de inteiro
    i, s: inteiro
inicio
    s <- 0
    para i de 1 ate 3 faca
        v[i] <- quad(i)
        s <- s + v[i]
    fimpara
    escreval(s)
fimalgoritmo`;

const find = (s: Snapshot, name: string) => {
  for (let i = s.frames.length - 1; i >= 0; i--) {
    const v = s.frames[i].vars.find((x) => x.name === name);
    if (v) return v;
  }
  return s.globals.find((x) => x.name === name);
};

const debugCases: DebugCase[] = [
  { name: "debug studio: passo a passo entra em laço e função com 'into'", lang: "studio", src: studioDbg, commands: ["into"], stops: [5, 6, 8, 14, 15, 6, 8, 14, 15, 6, 8, 14, 15, 6, 10], expect: "12" },
  { name: "debug studio: 'over' não entra na função", lang: "studio", src: studioDbg, commands: ["over"], stops: [5, 6, 8, 6, 8, 6, 8, 6, 10], expect: "12" },
  { name: "debug visualg: 'over' para no 'para' a cada iteração", lang: "visualg", src: visualgDbg, commands: ["over"], stops: [6, 7, 8, 9, 7, 8, 9, 7, 8, 9, 11], expect: " 14\n" },
  { name: "debug studio: breakpoint em laço para a cada iteração e mostra variáveis", lang: "studio", src: studioDbg, breakpoints: [14], commands: ["continue"], stops: [14, 14, 14], expect: "12",
    check: (s) => {
      if (s.frames.length !== 2) return `pilha com ${s.frames.length} quadros`;
      if (s.frames[1].name !== "dobro") return `quadro ${s.frames[1].name}`;
      if (find(s, "n")?.value !== "3") return `n = ${find(s, "n")?.value}`;
      if (find(s, "soma")?.value !== "6") return `soma = ${find(s, "soma")?.value}`;
      if (find(s, "r")?.value !== "(sem valor)") return `r = ${find(s, "r")?.value}`;
      return null;
    } },
  { name: "debug studio: 'out' volta para quem chamou", lang: "studio", src: studioDbg, breakpoints: [14], commands: ["out", "continue", "out", "continue", "out", "continue"], stops: [14, 6, 14, 6, 14, 6], expect: "12" },
  { name: "debug visualg: breakpoint, vetor e globais", lang: "visualg", src: visualgDbg, breakpoints: [9], commands: ["continue"], stops: [9, 9, 9], expect: " 14\n",
    check: (s) => {
      const v = find(s, "v")?.value;
      if (v !== "[1..3] [1, 4, 9]") return `v = ${v}`;
      if (find(s, "s")?.value !== "5") return `s = ${find(s, "s")?.value}`;
      return null;
    } },
  { name: "debug visualg: passo com leia", lang: "visualg", src: V("x: inteiro", `leia(x)\nescreva(x * 2)`), inputs: ["21"], commands: ["over"], stops: [6, 7], expect: " 42" },
];

for (const c of debugCases) {
  const host = new BufferHost(c.inputs ?? []);
  const stops: number[] = [];
  let last: Snapshot | null = null;
  let step = 0;
  let dbg: Debugger;
  const program = compile(c.lang, c.src);
  dbg = new Debugger(
    {
      paused: (line, _col, snap) => {
        stops.push(line);
        last = snap;
        const cmd = c.commands[Math.min(step++, c.commands.length - 1)];
        if (stops.length > 200) throw new Error("pausas demais");
        setTimeout(() => dbg.command(cmd), 0);
      },
      snapshot: () => {},
    },
    c.breakpoints ?? [],
    !(c.breakpoints?.length),
  );
  program.attachDebugger(dbg);
  try {
    await program.run(host);
  } catch (e) {
    console.log(`✗ ${c.name}: erro`, e); fail++; continue;
  }
  if (stops.join(",") !== c.stops.join(",")) { console.log(`✗ ${c.name}: parou em [${stops}], esperava [${c.stops}]`); fail++; continue; }
  if (c.expect !== undefined && host.out !== c.expect) { console.log(`✗ ${c.name}: saída ${JSON.stringify(host.out)}, esperava ${JSON.stringify(c.expect)}`); fail++; continue; }
  const problem = c.check && last ? c.check(last) : null;
  if (problem) { console.log(`✗ ${c.name}: ${problem}\n   ${JSON.stringify(last)}`); fail++; continue; }
  pass++;
}

console.log(`\n${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
