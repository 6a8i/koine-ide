/* Testes dos interpretadores: node --import tsx tests/run.ts */
import { compile, compileProject } from "../src/lang/index";
import { BufferHost } from "../src/lang/shared/runtime";
import { Lang, PortugolError } from "../src/lang/shared/types";

interface Case {
  name: string; lang: Lang; src?: string; inputs?: string[]; expect?: string; error?: RegExp; errorLine?: number;
  /** projeto com vários arquivos: nome -> conteúdo; `entry` é o arquivo executado */
  files?: Record<string, string>; entry?: string; errorFile?: string;
}
const compileCase = (c: { lang: Lang; src?: string; files?: Record<string, string>; entry?: string }) =>
  c.files ? compileProject(c.lang, Object.entries(c.files).map(([path, source]) => ({ path, source })), c.entry ?? Object.keys(c.files)[0]) : compile(c.lang, c.src ?? "");

const S = (s: string) => `programa {\n${s}\n}`;
const SM = (body: string, extra = "") => S(`funcao inicio() {\n${body}\n}\n${extra}`);
const V2 = (tipo: string, vars: string, subs: string, body: string) => `algoritmo "t"\n${tipo ? "tipo\n" + tipo + "\n" : ""}${vars ? "var\n" + vars + "\n" : ""}${subs ? subs + "\n" : ""}inicio\n${body}\nfimalgoritmo`;
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

  // ---------------- Studio: estruturas ----------------
  { name: "studio: estrutura construir/zerar/imprimir", lang: "studio", src: S(`estrutura Ponto { real x  real y }\nfuncao inicio() { Ponto p = Ponto(1.0, 2.0)  Ponto z  escreva(p.x, " ", p, " ", z.y, " ", z) }`), expect: "1.0 Ponto{x: 1.0, y: 2.0} 0.0 Ponto{x: 0.0, y: 0.0}" },
  { name: "studio: estrutura copiada na atribuição e no parâmetro", lang: "studio", src: S(`estrutura Ponto { inteiro x  inteiro y }\nfuncao inicio() { Ponto p = Ponto(1, 2)  Ponto q = p  q.x = 9  altera(p)  escreva(p.x, q.x) altera_ref(p) escreva(p.x) }\nfuncao altera(Ponto a) { a.x = 7 }\nfuncao altera_ref(Ponto &a) { a.x = 5 }`), expect: "195" },
  { name: "studio: vetor de estruturas e vetor dentro de estrutura", lang: "studio", src: S(`estrutura Aluno { cadeia nome  inteiro notas[3] }\nfuncao inicio() { Aluno turma[2]  turma[1].nome = "Ana"  turma[1].notas[2] = 10  Aluno c = turma[1]  c.notas[2] = 0  escreva(turma[1].nome, turma[1].notas[2], c.notas[2]) }`), expect: "Ana100" },
  { name: "studio: estrutura == e retorno", lang: "studio", src: S(`estrutura P { inteiro a  inteiro b }\nfuncao inicio() { P x = faz(1)  escreva(x == P(1, 2), " ", x != P(1, 2), " ", x == faz(1)) }\nfuncao P faz(inteiro a) { retorne P(a, 2) }`), expect: "verdadeiro falso verdadeiro" },
  { name: "studio: estrutura com < (erro)", lang: "studio", src: S(`estrutura P { inteiro a }\nfuncao inicio() { P x  P y  se (x < y) {} }`), error: /operador "<"/ },
  { name: "studio: campo inexistente (erro)", lang: "studio", src: S(`estrutura P { inteiro a }\nfuncao inicio() { P x  x.b = 1 }`), error: /não tem o campo "b".*Campos: a/ },
  { name: "studio: leia em campo", lang: "studio", src: S(`estrutura P { inteiro a  cadeia n }\nfuncao inicio() { P x  leia(x.a, x.n)  escreva(x.a * 2, x.n) }`), inputs: ["21", "oi"], expect: "42oi" },
  { name: "studio: tipo declarado depois do uso", lang: "studio", src: S(`funcao inicio() { Par p = Par(3, 4)  escreva(soma(p)) }\nfuncao inteiro soma(Par q) { retorne q.a + q.b }\nestrutura Par { inteiro a  inteiro b }`), expect: "7" },
  { name: "studio: escreva sem parênteses (dica)", lang: "studio", src: SM(`inteiro x = 1\nescreva x`), error: /função, não um tipo.*parênteses/ },
  { name: "studio: tipo inexistente (erro)", lang: "studio", src: SM(`Pont p`), error: /tipo "Pont" não existe/ },

  // ---------------- Studio: referências ----------------
  { name: "studio: ref básica", lang: "studio", src: SM(`inteiro n = 1\nref inteiro r = &n\n*r = 20\nescreva(n, " ", *r + 1, " ", r == nulo)`), expect: "20 21 falso" },
  { name: "studio: ref nula (erro)", lang: "studio", src: SM(`ref inteiro r = nulo\nescreva(*r)`), error: /Referência nula/ },
  { name: "studio: ref a elemento e campo, parâmetro ref", lang: "studio", src: S(`estrutura P { inteiro a }\nfuncao inicio() {\n inteiro v[3]\n P p\n ref inteiro r = &v[1]\n *r = 5\n ref inteiro s = &p.a\n *s = 6\n inc(&v[1])\n inc(s)\n escreva(v[1], p.a)\n}\nfuncao inc(ref inteiro x) { *x = *x + 1 }`), expect: "67" },
  { name: "studio: &x e *r na mesma linha com ;", lang: "studio", src: SM(`inteiro n = 1; ref inteiro r = &n; *r = 7; escreva(n)`), expect: "7" },
  { name: "studio: ref + 1 (erro)", lang: "studio", src: SM(`inteiro n = 1\nref inteiro r = &n\nescreva(r + 1)`), error: /operador "\+"/ },
  { name: "studio: escreva(ref) (erro com dica)", lang: "studio", src: SM(`inteiro n = 1\nref inteiro r = &n\nescreva(r)`), error: /use \*r/ },
  { name: "studio: ref == ref (erro)", lang: "studio", src: SM(`inteiro n = 1\nref inteiro a = &n\nref inteiro b = &n\nescreva(a == b)`), error: /\*a == \*b/ },
  { name: "studio: nulo em inteiro (erro)", lang: "studio", src: SM(`inteiro n = nulo`), error: /nulo/ },
  { name: "studio: & de parâmetro continua funcionando junto com ref", lang: "studio", src: SM(`inteiro a = 1\ndobra(a)\nref inteiro r = &a\n*r = *r + 1\nescreva(a)`, `funcao dobra(inteiro &x) { x = x * 2 }`), expect: "3" },

  // ---------------- Studio: classes ----------------
  { name: "studio: classe, herança, virtual, super, privado em subclasse", lang: "studio", src: S(`inclua biblioteca Texto
classe Forma {
  privado cadeia nome
  publico Forma(cadeia n) { este.nome = n }
  publico real area() { retorne 0.0 }
  publico cadeia descreve() { retorne nome + ": " + area() }
}
classe Circulo herda Forma {
  privado real raio
  publico Circulo(real r) { super("circulo")  raio = r }
  publico real area() { retorne 3.0 * raio * raio }
  publico cadeia descreve() { retorne Texto.caixa_alta(super.descreve()) }
}
funcao inicio() { Forma f = Circulo(2.0)  Forma g = Forma("x")  escreva(f.descreve(), " | ", g.descreve(), " | ", f) }`), expect: "CIRCULO: 12.0 | x: 0.0 | Circulo{nome: \"circulo\", raio: 2.0}" },
  { name: "studio: inicializador de campo e construtor sintetizado", lang: "studio", src: S(`classe Contador { privado inteiro n = 10  publico inteiro prox() { n++  retorne n } }\nfuncao inicio() { Contador c = Contador()  c.prox()  escreva(c.prox()) }`), expect: "12" },
  { name: "studio: objetos compartilhados (aliasing) e nulo", lang: "studio", src: S(`classe Caixa { publico inteiro v = 0 }\nfuncao inicio() { Caixa a = Caixa()  Caixa b = a  b.v = 5  Caixa c = nulo  escreva(a.v, " ", c == nulo, " ", a == b, " ", c) }`), expect: "5 verdadeiro verdadeiro nulo" },
  { name: "studio: método em objeto nulo (erro)", lang: "studio", src: S(`classe C { publico inteiro f() { retorne 1 } }\nfuncao inicio() { C c = nulo  escreva(c.f()) }`), error: /nulo/ },
  { name: "studio: downcast (erro)", lang: "studio", src: S(`classe A {}\nclasse B herda A {}\nfuncao inicio() { A a = B()  B b = a }`), error: /nem todo/ },
  { name: "studio: campo privado fora da classe (erro)", lang: "studio", src: S(`classe A { privado inteiro x = 1 }\nfuncao inicio() { A a = A()  escreva(a.x) }`), error: /privado/ },
  { name: "studio: super obrigatório (erro)", lang: "studio", src: S(`classe A { publico A(inteiro n) {} }\nclasse B herda A { publico B() {} }\nfuncao inicio() {}`), error: /super\(/ },
  { name: "studio: sobrescrita com assinatura diferente (erro)", lang: "studio", src: S(`classe A { publico inteiro f() { retorne 1 } }\nclasse B herda A { publico real f() { retorne 1.0 } }\nfuncao inicio() {}`), error: /assinatura diferente/ },
  { name: "studio: herança circular (erro)", lang: "studio", src: S(`classe A herda B {}\nclasse B herda A {}\nfuncao inicio() {}`), error: /herda de si mesma/ },
  { name: "studio: classe com estrutura e estrutura com objeto", lang: "studio", src: S(`estrutura P { inteiro x }\nclasse Ent { publico P pos  publico cadeia nome = "e" }\nestrutura Par { Ent ent }\nfuncao inicio() { Ent a = Ent()  a.pos.x = 3  Par p  p.ent = a  P q = a.pos  q.x = 9  escreva(a.pos.x, p.ent.nome, " ", p.ent.pos.x) }`), expect: "3e 3" },
  { name: "studio: leia dentro de método (bloqueio via despacho virtual)", lang: "studio", src: S(`classe A { publico inteiro le() { retorne 0 } }\nclasse B herda A { publico inteiro le() { inteiro x  leia(x)  retorne x } }\nfuncao inicio() { A a = B()  escreva(a.le() * 2) }`), inputs: ["21"], expect: "42" },

  // ---------------- Studio: módulos ----------------
  { name: "studio: módulos: qualificado, não qualificado, tipo e classe importados, ordem de globais", lang: "studio", files: {
    "geo.por": `programa {\n  modulo Geo\n  publico const real PI2 = 6.0\n  publico inteiro BASE = 21\n  publico estrutura Ponto { real x  real y }\n  publico classe Circulo { publico real r = 1.0  publico real area() { retorne PI2 * r } }\n  publico real dobro(real v) { retorne quadrado(v) / v * 2 }\n  real quadrado(real v) { retorne v * v }\n}`,
    "principal.por": `programa {\n  importe Geo\n  inteiro x = Geo.BASE * 2\n  funcao inicio() { Ponto p = Ponto(1.0, 2.0)  Geo.Ponto q = p  Circulo c = Circulo()  escreva(Geo.dobro(3.0), " ", dobro(1.0), " ", q.y, " ", c.area(), " ", x, " ", PI2) }\n}`,
  }, entry: "principal.por", expect: "6.0 2.0 2.0 6.0 42 6.0" },
  { name: "studio: módulos: função privada (erro no arquivo certo)", lang: "studio", files: {
    "geo.por": `programa {\n  modulo Geo\n  real interna() { retorne 1.0 }\n}`,
    "principal.por": `programa {\n  importe Geo\n  funcao inicio() { escreva(Geo.interna()) }\n}`,
  }, entry: "principal.por", error: /privada no módulo Geo/, errorFile: "principal.por" },
  { name: "studio: módulos: apelido e caminho", lang: "studio", files: {
    "lib/geo.por": `programa {\n  modulo Geo\n  publico inteiro um() { retorne 1 }\n}`,
    "principal.por": `programa {\n  importe "lib/geo.por" --> g\n  funcao inicio() { escreva(g.um()) }\n}`,
  }, entry: "principal.por", expect: "1" },
  { name: "studio: módulos: ambiguidade (erro)", lang: "studio", files: {
    "a.por": `programa { modulo A  publico inteiro f() { retorne 1 } }`,
    "b.por": `programa { modulo B  publico inteiro f() { retorne 2 } }`,
    "principal.por": `programa {\n  importe A\n  importe B\n  funcao inicio() { escreva(f()) }\n}`,
  }, entry: "principal.por", error: /Use A\.f ou B\.f/ },
  { name: "studio: módulos: importação circular (erro)", lang: "studio", files: {
    "a.por": `programa { modulo A\n importe B\n publico inteiro f() { retorne 1 } }`,
    "b.por": `programa { modulo B\n importe A\n publico inteiro g() { retorne 2 } }`,
    "principal.por": `programa {\n  importe A\n  funcao inicio() { escreva(f()) }\n}`,
  }, entry: "principal.por", error: /circular/, errorFile: "b.por" },
  { name: "studio: módulos: inexistente (erro)", lang: "studio", files: {
    "principal.por": `programa {\n  importe Nada\n  funcao inicio() {}\n}`,
  }, entry: "principal.por", error: /não foi encontrado/ },
  { name: "studio: módulos: erro de execução com arquivo", lang: "studio", files: {
    "geo.por": `programa {\n  modulo Geo\n  publico inteiro div(inteiro a, inteiro b) { retorne a / b }\n}`,
    "principal.por": `programa {\n  importe Geo\n  funcao inicio() { escreva(Geo.div(1, 0)) }\n}`,
  }, entry: "principal.por", error: /Divisão por zero/, errorFile: "geo.por" },
  { name: "studio: módulos: inicio do módulo importado não executa e sem inicio na entrada (erro)", lang: "studio", files: {
    "lib.por": `programa { modulo Lib  publico inteiro f() { retorne 3 } }`,
    "principal.por": `programa { importe Lib  funcao inicio() { escreva(f()) } }`,
  }, entry: "lib.por", error: /não tem a função "inicio"/ },

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

  // ---------------- VisuAlg: registros ----------------
  { name: "visualg: registro, cópia, vetor de registro, vetor no registro, leia em campo", lang: "visualg",
    src: V2("  Ponto = registro\n    x, y: real\n  fimregistro\n  Aluno = registro\n    nome: caractere\n    notas: vetor[1..3] de inteiro\n  fimregistro", "  p, q: Ponto\n  turma: vetor[1..2] de Aluno\n  c: Aluno", "", "  p.x <- 1\n  q <- p\n  q.x <- 9\n  turma[2].nome <- \"Ana\"\n  turma[2].notas[3] <- 10\n  c <- turma[2]\n  c.notas[3] <- 0\n  leia(c.nome)\n  escreva(p.x, \" \", p, \" \", turma[2].notas[3], c.notas[3], \" \", c.nome, \" \", p = q, \" \", p <> q)"),
    inputs: ["Bia"], expect: " 1 Ponto{x: 1, y: 0}  10 0 Bia  FALSO  VERDADEIRO" },
  { name: "visualg: registro por valor vs var", lang: "visualg",
    src: V2("  Par = registro\n    a: inteiro\n  fimregistro", "  p: Par", "procedimento copiar(x: Par)\ninicio\n  x.a <- 7\nfimprocedimento\nprocedimento porref(var x: Par)\ninicio\n  x.a <- 5\nfimprocedimento", "  p.a <- 1\n  copiar(p)\n  escreva(p.a)\n  porref(p)\n  escreva(p.a)"), expect: " 1 5" },
  { name: "visualg: referência futura entre subprogramas e leia (ponto fixo)", lang: "visualg",
    src: V2("", "  x: inteiro", "funcao dobro(): inteiro\ninicio\n  retorne le() * 2\nfimfuncao\nfuncao le(): inteiro\nvar v: inteiro\ninicio\n  leia(v)\n  retorne v\nfimfuncao", "  x <- dobro()\n  escreva(x)"), inputs: ["21"], expect: " 42" },
  { name: "visualg: const inicializada e protegida", lang: "visualg", src: `algoritmo "c"\nconst\n  N = 5\nvar\n  i: inteiro\ninicio\n  i <- N * 2\n  escreva(i, N)\nfimalgoritmo`, expect: " 10 5" },
  { name: "visualg: atribuir a const (erro)", lang: "visualg", src: `algoritmo "c"\nconst\n  N = 5\ninicio\n  N <- 1\nfimalgoritmo`, error: /constante/ },

  // ---------------- VisuAlg: referências ----------------
  { name: "visualg: ref básica, nulo, campo e parâmetro ref", lang: "visualg",
    src: V2("  Par = registro\n    a: inteiro\n  fimregistro", "  n: inteiro\n  r: ref inteiro\n  p: Par\n  s: ref inteiro", "procedimento inc(x: ref inteiro)\ninicio\n  *x <- *x + 1\nfimprocedimento", "  n <- 1\n  r <- &n\n  *r <- 20\n  s <- &p.a\n  *s <- 6\n  inc(&n)\n  inc(s)\n  escreva(n, *r, p.a, r = nulo)"), expect: " 21 21 7 FALSO" },
  { name: "visualg: ref nula (erro)", lang: "visualg", src: V("r: ref inteiro", `escreva(*r)`), error: /Referência nula/ },
  { name: "visualg: escreva(ref) (erro)", lang: "visualg", src: V("n: inteiro\nr: ref inteiro", `r <- &n\nescreva(r)`), error: /\*r/ },

  // ---------------- VisuAlg: classes ----------------
  { name: "visualg: classe, herança, virtual, super, nulo, privado em subclasse", lang: "visualg",
    src: V2("  Forma = classe\n    privado nome: caractere\n    publico procedimento iniciar(n: caractere)\n    publico funcao area(): real\n    publico funcao descreve(): caractere\n  fimclasse\n  Circulo = classe herda Forma\n    privado raio: real\n    publico procedimento iniciar(r: real)\n    publico funcao area(): real\n  fimclasse", "  f, g: Forma\n  c: Circulo", "procedimento Forma.iniciar(n: caractere)\ninicio\n  este.nome <- n\nfimprocedimento\nfuncao Forma.area(): real\ninicio\n  retorne 0\nfimfuncao\nfuncao Forma.descreve(): caractere\ninicio\n  retorne nome + \":\" + numpcarac(area())\nfimfuncao\nprocedimento Circulo.iniciar(r: real)\ninicio\n  super.iniciar(\"circulo\")\n  raio <- r\nfimprocedimento\nfuncao Circulo.area(): real\ninicio\n  retorne 3 * raio * raio\nfimfuncao", "  f <- novo Circulo(2.0)\n  g <- novo Forma(\"x\")\n  escreval(f.descreve(), \" | \", g.descreve(), \" | \", f.area():6:2, \" | \", c = nulo, \" | \", f)\n  c <- nulo"),
    expect: "circulo:12 | x:0 |  12.00 |  VERDADEIRO | Circulo{nome: \"circulo\", raio: 2}\n" },
  { name: "visualg: método em objeto nulo (erro)", lang: "visualg", src: V2("  Caixa = classe\n    publico funcao f(): inteiro\n  fimclasse", "  c: Caixa", "funcao Caixa.f(): inteiro\ninicio\n  retorne 1\nfimfuncao", "  escreva(c.f())"), error: /nulo/ },
  { name: "visualg: cabeçalho/corpo divergente (erro)", lang: "visualg", src: V2("  Caixa = classe\n    publico funcao f(a: inteiro): inteiro\n  fimclasse", "", "funcao Caixa.f(a: real): inteiro\ninicio\n  retorne 1\nfimfuncao", ""), error: /não confere/ },
  { name: "visualg: método sem corpo (erro)", lang: "visualg", src: V2("  Caixa = classe\n    publico funcao f(): inteiro\n  fimclasse", "", "", ""), error: /não tem corpo/ },
  { name: "visualg: campo privado fora da classe (erro)", lang: "visualg", src: V2("  Caixa = classe\n    privado x: inteiro\n  fimclasse", "  c: Caixa", "", "  c <- novo Caixa()\n  escreva(c.x)"), error: /privado/ },
  { name: "visualg: downcast (erro)", lang: "visualg", src: V2("  Base = classe\n  fimclasse\n  Filha = classe herda Base\n  fimclasse", "  a: Base\n  b: Filha", "", "  a <- novo Filha()\n  b <- a"), error: /nem todo/ },
  { name: "visualg: leia em método via despacho virtual (bloqueio)", lang: "visualg",
    src: V2("  Base = classe\n    publico funcao le(): inteiro\n  fimclasse\n  Filha = classe herda Base\n    publico funcao le(): inteiro\n  fimclasse", "  a: Base", "funcao Base.le(): inteiro\ninicio\n  retorne 0\nfimfuncao\nfuncao Filha.le(): inteiro\nvar x: inteiro\ninicio\n  leia(x)\n  retorne x\nfimfuncao", "  a <- novo Filha()\n  escreva(a.le() * 2)"), inputs: ["21"], expect: " 42" },
  { name: "visualg: módulos: importe por nome e caminho, público/privado, tipo importado, qualificado", lang: "visualg", files: {
    "geo.alg": `modulo "geo"\nconst\n  publico PI2 = 6\n  INTERNA = 1\ntipo\n  publico Ponto = registro\n    x, y: inteiro\n  fimregistro\n  publico Circulo = classe\n    publico r: inteiro\n    publico funcao area(): inteiro\n  fimclasse\nvar\n  publico CONT: inteiro\nfuncao Circulo.area(): inteiro\ninicio\n  retorne PI2 * r\nfimfuncao\npublico funcao dobro(v: inteiro): inteiro\ninicio\n  retorne quadrado(v) div v * 2\nfimfuncao\nfuncao quadrado(v: inteiro): inteiro\ninicio\n  retorne v * v\nfimfuncao\nfimmodulo`,
    "principal.alg": `algoritmo "p"\nimporte geo\nvar\n  p: Ponto\n  q: geo.Ponto\n  c: Circulo\ninicio\n  p.x <- 2\n  q <- p\n  c <- novo geo.Circulo()\n  c.r <- 2\n  geo.CONT <- 7\n  escreva(geo.dobro(3), dobro(1), q.x, c.area(), CONT, PI2)\nfimalgoritmo`,
  }, entry: "principal.alg", expect: " 6 2 2 12 7 6" },
  { name: "visualg: módulos: função privada (erro no arquivo certo)", lang: "visualg", files: {
    "geo.alg": `modulo "geo"\nfuncao interna(): inteiro\ninicio\n  retorne 1\nfimfuncao\nfimmodulo`,
    "principal.alg": `algoritmo "p"\nimporte "geo.alg"\ninicio\n  escreva(geo.interna())\nfimalgoritmo`,
  }, entry: "principal.alg", error: /privada no módulo geo/, errorFile: "principal.alg" },
  { name: "visualg: módulos: circular (erro)", lang: "visualg", files: {
    "a.alg": `modulo "a"\nimporte b\nfimmodulo`,
    "b.alg": `modulo "b"\nimporte a\nfimmodulo`,
    "principal.alg": `algoritmo "p"\nimporte a\ninicio\nfimalgoritmo`,
  }, entry: "principal.alg", error: /circular/ },
  { name: "visualg: módulos: algoritmo importado (erro)", lang: "visualg", files: {
    "outro.alg": `algoritmo "o"\ninicio\nfimalgoritmo`,
    "principal.alg": `algoritmo "p"\nimporte "outro.alg"\ninicio\nfimalgoritmo`,
  }, entry: "principal.alg", error: /não pode ser importado/ },
  { name: "visualg: módulos: erro de execução no módulo", lang: "visualg", files: {
    "m.alg": `modulo "m"\npublico funcao div0(a: inteiro): inteiro\ninicio\n  retorne a div 0\nfimfuncao\nfimmodulo`,
    "principal.alg": `algoritmo "p"\nimporte m\ninicio\n  escreva(div0(1))\nfimalgoritmo`,
  }, entry: "principal.alg", error: /Divisão por zero/, errorFile: "m.alg" },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const host = new BufferHost(c.inputs ?? []);
  let err: PortugolError | null = null;
  try {
    const prog = compileCase(c);
    await prog.run(host);
  } catch (e) {
    if (e instanceof PortugolError) err = e;
    else { console.log(`✗ ${c.name}: exceção inesperada`, e); fail++; continue; }
  }
  if (c.error) {
    if (!err) { console.log(`✗ ${c.name}: esperava erro ${c.error}, mas rodou. Saída: ${JSON.stringify(host.out)}`); fail++; continue; }
    if (!c.error.test(err.message)) { console.log(`✗ ${c.name}: erro diferente: [${err.line}:${err.col}] ${err.message}`); fail++; continue; }
    if (c.errorLine && err.line !== c.errorLine) { console.log(`✗ ${c.name}: linha ${err.line}, esperava ${c.errorLine}`); fail++; continue; }
    if (c.errorFile) {
      const names = c.files ? Object.keys(c.files) : ["principal." + (c.lang === "visualg" ? "alg" : "por")];
      const got = err.file ?? names[err.fileIndex];
      if (got !== c.errorFile) { console.log(`✗ ${c.name}: erro no arquivo ${got}, esperava ${c.errorFile}`); fail++; continue; }
    }
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
  src?: string;
  files?: Record<string, string>;
  entry?: string;
  /** linhas (no arquivo de entrada) ou {file, line} */
  breakpoints?: (number | { file: string; line: number })[];
  /** arquivos em que deve pausar (paralelo a `stops`), quando importa */
  stopFiles?: string[];
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
  { name: "debug studio: breakpoint em módulo importado, estrutura/objeto/ref no snapshot, quadro de método", lang: "studio", files: {
    "geo.por": `programa {\n  modulo Geo\n  publico estrutura Ponto { inteiro x  inteiro y }\n  publico classe Circulo {\n    publico inteiro r = 2\n    publico inteiro area() {\n      inteiro k = r * 3\n      retorne k * r\n    }\n  }\n}`,
    "principal.por": `programa {\n  importe Geo\n  funcao inicio() {\n    Ponto p = Ponto(1, 2)\n    Circulo c = Circulo()\n    inteiro n = 20\n    ref inteiro rr = &n\n    escreva(c.area())\n  }\n}`,
  }, entry: "principal.por", breakpoints: [{ file: "geo.por", line: 8 }], commands: ["continue"], stops: [8], stopFiles: ["geo.por"], expect: "12",
    check: (s) => {
      const top = s.frames[s.frames.length - 1];
      if (top.name !== "Circulo.area") return `quadro ${top.name}`;
      if (top.file !== "geo.por") return `arquivo ${top.file}`;
      if (find(s, "este")?.value !== "Circulo{r: 2}") return `este = ${find(s, "este")?.value}`;
      const main = s.frames[0];
      const g = (n: string) => main.vars.find((v) => v.name === n)?.value;
      if (g("p") !== "Ponto{x: 1, y: 2}") return `p = ${g("p")}`;
      if (g("rr") !== "ref -> 20") return `rr = ${g("rr")}`;
      return null;
    } },
];

for (const c of debugCases) {
  const host = new BufferHost(c.inputs ?? []);
  const stops: number[] = [];
  let last: Snapshot | null = null;
  let step = 0;
  let dbg: Debugger;
  const program = compileCase(c);
  const entryName = c.entry ?? (c.files ? Object.keys(c.files)[0] : program.files[0]);
  const bps = (c.breakpoints ?? []).map((b) => (typeof b === "number" ? { file: entryName, line: b } : b));
  const stopFiles: string[] = [];
  dbg = new Debugger(
    {
      paused: (line, _col, snap, file) => {
        stops.push(line);
        stopFiles.push(file);
        last = snap;
        const cmd = c.commands[Math.min(step++, c.commands.length - 1)];
        if (stops.length > 200) throw new Error("pausas demais");
        setTimeout(() => dbg.command(cmd), 0);
      },
      snapshot: () => {},
    },
    bps,
    !bps.length,
    program.files,
  );
  program.attachDebugger(dbg);
  try {
    await program.run(host);
  } catch (e) {
    console.log(`✗ ${c.name}: erro`, e); fail++; continue;
  }
  if (stops.join(",") !== c.stops.join(",")) { console.log(`✗ ${c.name}: parou em [${stops}], esperava [${c.stops}]`); fail++; continue; }
  if (c.stopFiles && stopFiles.join(",") !== c.stopFiles.join(",")) { console.log(`✗ ${c.name}: arquivos [${stopFiles}], esperava [${c.stopFiles}]`); fail++; continue; }
  if (c.expect !== undefined && host.out !== c.expect) { console.log(`✗ ${c.name}: saída ${JSON.stringify(host.out)}, esperava ${JSON.stringify(c.expect)}`); fail++; continue; }
  const problem = c.check && last ? c.check(last) : null;
  if (problem) { console.log(`✗ ${c.name}: ${problem}\n   ${JSON.stringify(last)}`); fail++; continue; }
  pass++;
}

// ---------------- Projeto (funções puras) ----------------
import { normKey, relPath, resolveEntry, isInside } from "../src/project";
import { hasEntryPoint } from "../src/lang";

const check = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { console.log(`✗ ${name}: obtido ${JSON.stringify(got)}, esperava ${JSON.stringify(want)}`); fail++; }
};
check("normKey windows", normKey("C:\\Aulas\\Prog\\"), "c:/aulas/prog");
check("normKey unix", normKey("/home/ana/aulas/"), "/home/ana/aulas");
check("isInside", isInside("c:/aulas", "c:/aulas/sub/a.por") && !isInside("c:/aulas", "c:/aulas2/a.por"), true);
check("relPath", relPath("C:\\Aulas", "C:\\Aulas\\Lib\\Geo.por"), "Lib/Geo.por");
check("relPath fora da raiz", relPath("C:\\Aulas", "D:\\x\\y.por"), "y.por");
check("hasEntryPoint studio", hasEntryPoint("studio", "programa { funcao inicio() {} }") && !hasEntryPoint("studio", "programa { funcao f() {} }"), true);
check("hasEntryPoint visualg", hasEntryPoint("visualg", "  Algoritmo \"x\"\ninicio\nfimalgoritmo") && !hasEntryPoint("visualg", "modulo \"m\"\nfimmodulo"), true);
const cands = [{ path: "lib/geo.por", hasEntry: false }, { path: "principal.por", hasEntry: true }, { path: "teste.por", hasEntry: true }];
check("entry fixado", resolveEntry({ candidates: cands, pinned: "teste.por", active: "principal.por", last: null }), "teste.por");
check("entry fixado sem entrada -> aba ativa", resolveEntry({ candidates: cands, pinned: "lib/geo.por", active: "teste.por", last: null }), "teste.por");
check("entry aba ativa sem entrada -> principal", resolveEntry({ candidates: cands, pinned: null, active: "lib/geo.por", last: "teste.por" }), "principal.por");
check("entry último usado", resolveEntry({ candidates: [cands[0], cands[2], { path: "outro.por", hasEntry: true }], pinned: null, active: "lib/geo.por", last: "outro.por" }), "outro.por");
check("entry único com entrada", resolveEntry({ candidates: [cands[0], cands[2]], pinned: null, active: null, last: null }), "teste.por");
check("entry nenhum", resolveEntry({ candidates: [cands[0]], pinned: null, active: null, last: null }), null);

console.log(`\n${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
