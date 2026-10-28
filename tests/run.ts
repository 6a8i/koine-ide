/* Testes do interpretador: node --import tsx tests/run.ts */
import { compile, compileProject } from "../src/lang/index";
import { BufferHost } from "../src/lang/shared/runtime";
import { KoineError } from "../src/lang/shared/types";

interface Case {
  name: string; src?: string; inputs?: string[]; expect?: string; error?: RegExp; errorLine?: number;
  /** projeto com vários arquivos: nome -> conteúdo; `entry` é o arquivo executado */
  files?: Record<string, string>; entry?: string; errorFile?: string;
}
const compileCase = (c: { src?: string; files?: Record<string, string>; entry?: string }) =>
  c.files ? compileProject(Object.entries(c.files).map(([path, source]) => ({ path, source })), c.entry ?? Object.keys(c.files)[0]) : compile(c.src ?? "");

const S = (s: string) => `programa {\n${s}\n}`;
const SM = (body: string, extra = "") => S(`funcao inicio() {\n${body}\n}\n${extra}`);

const cases: Case[] = [
  // ---------------- Koiné ----------------
  { name: "koine: aritmética inteira e real", src: SM(`escreva(7 / 2, " ", 7 / 2.0, " ", 7 % 3, " ", 2 * 3 + 1, " ", -5, " ", 1.5 + 1)`), expect: "3 3.5 1 7 -5 2.5" },
  { name: "koine: precedência e lógica", src: SM(`escreva(1 + 2 * 3 == 7, " ", nao falso e verdadeiro, " ", 3 > 2 ou 1 > 2, " ", (1 + 2) * 3)`), expect: "verdadeiro verdadeiro verdadeiro 9" },
  { name: "koine: curto-circuito", src: SM(`inteiro x = 0\nse (x != 0 e 10 / x > 1) { escreva("a") } senao { escreva("b") }`), expect: "b" },
  { name: "koine: cadeias", src: S(`inclua biblioteca Texto\nfuncao inicio() {\ncadeia s = "Portugol"\nescreva(Texto.numero_caracteres(s), " ", Texto.caixa_baixa(s), " ", Texto.obter_caractere(s, 0), " ", Texto.extrair_subtexto(s, 0, 4), " ", s + 1 + 2, " ", 'a' + "b")\n}`), expect: "8 portugol P Port Portugol12 ab" },
  { name: "koine: para/enquanto/faca", src: SM(`inteiro i = 0, s = 0\npara (i = 1; i <= 5; i++) { s += i }\nenquanto (i > 0) { i-- }\nfaca { i++ } enquanto (i < 3)\nescreva(s, " ", i)`), expect: "15 3" },
  { name: "koine: pare dentro de laço aninhado", src: SM(`para (inteiro i = 0; i < 3; i++) { para (inteiro j = 0; j < 3; j++) { se (j == 1) pare escreva(i, j, " ") } }`), expect: "00 10 20 " },
  { name: "koine: escolha com fallthrough e contrario", src: SM(`para (inteiro i = 1; i <= 4; i++) { escolha (i) { caso 1: escreva("um ") caso 2: escreva("dois ") pare caso 3: escreva("tres ") pare caso contrario: escreva("outro ") } }`), expect: "um dois dois tres outro " },
  { name: "koine: escolha com cadeia", src: SM(`cadeia op = "b"\nescolha (op) { caso "a": escreva("A") pare caso "b": escreva("B") pare }`), expect: "B" },
  { name: "koine: funções, recursão, referência", src: SM(`inteiro a = 2\nincrementa(a)\nescreva(fib(15), " ", a)`, `funcao inteiro fib(inteiro n) { se (n < 2) retorne n retorne fib(n-1) + fib(n-2) }\nfuncao incrementa(inteiro &x) { x++ }`), expect: "610 3" },
  { name: "koine: vetor por referência e Util", src: S(`inclua biblioteca Util\nfuncao inicio() { inteiro v[] = {3, 1, 2} zera(v) escreva(v[0], v[1], v[2], " ", Util.numero_elementos(v)) }\nfuncao zera(inteiro vet[]) { para (inteiro i = 0; i < Util.numero_elementos(vet); i++) vet[i] = 0 }`), expect: "000 3" },
  { name: "koine: matriz", src: SM(`inteiro m[2][3]\nm[1][2] = 9\ninteiro n[][] = {{1,2},{3,4}}\nescreva(m[1][2], m[0][0], n[1][0])`), expect: "903" },
  { name: "koine: globais e constantes", src: S(`inteiro contador = 10\nconst real PI2 = 6.28\nfuncao inicio() { contador++ escreva(contador, " ", PI2) }`), expect: "11 6.28" },
  { name: "koine: leia múltiplo e tipos", src: SM(`inteiro a\nreal b\ncadeia c\nlogico d\ncaracter c2\nleia(a, b, c, d, c2)\nescreva(a + 1, " ", b * 2, " ", c, " ", d, " ", c2)`), inputs: ["41", "1,5", "oi tudo", "verdadeiro", "xyz"], expect: "42 3.0 oi tudo verdadeiro x" },
  { name: "koine: leia dentro de função chamada em expressão", src: SM(`escreva(dobro() + 1)`, `funcao inteiro dobro() { inteiro x leia(x) retorne x * 2 }`), inputs: ["5"], expect: "11" },
  { name: "koine: leia em laço", src: SM(`inteiro s = 0, x\npara (inteiro i = 0; i < 3; i++) { leia(x) s += x }\nescreva(s)`), inputs: ["1", "2", "3"], expect: "6" },
  { name: "koine: Matematica", src: S(`inclua biblioteca Matematica --> m\nfuncao inicio() { escreva(m.potencia(2, 10), " ", m.raiz(27, 3), " ", m.arredondar(3.14159, 2), " ", m.maior_numero(3, 9), " ", m.valor_absoluto(-4)) }`), expect: "1024.0 3.0 3.14 9 4" },
  { name: "koine: Tipos", src: S(`inclua biblioteca Tipos\nfuncao inicio() { escreva(Tipos.cadeia_para_inteiro("42") + 1, " ", Tipos.real_para_inteiro(3.9), " ", Tipos.inteiro_para_cadeia(7) + "!") }`), expect: "43 3 7!" },
  { name: "koine: limpa", src: SM(`escreva("x") limpa() escreva("y")`), expect: "y" },
  { name: "koine: comentários e escapes", src: SM(`// linha\n/* bloco\n*/ escreva("a\\tb\\"c\\"\\n")`), expect: 'a\tb"c"\n' },
  { name: "koine: inteiro recebe divisão real (erro)", src: SM(`inteiro x = 5 / 2.0`), error: /real.*inteiro/, errorLine: 3 },
  { name: "koine: variável não inicializada (erro)", src: SM(`inteiro x\nescreva(x)`), error: /antes de receber um valor/ },
  { name: "koine: função sem inicio (erro)", src: S(`funcao x() {}`), error: /inicio/ },
  { name: "koine: recursão infinita (erro)", src: SM(`f(1)`, `funcao inteiro f(inteiro n) { retorne f(n + 1) }`), error: /pilha/ },
  { name: "koine: parâmetro errado (erro)", src: SM(`f("a")`, `funcao f(inteiro n) {}`), error: /inteiro.*cadeia/ },
  { name: "koine: chave não fechada (erro)", src: `programa { funcao inicio() { se (1 > 0) { escreva("a") }`, error: /fechar/ },
  { name: "koine: biblioteca não incluída (erro)", src: SM(`escreva(Matematica.PI)`), error: /inclua biblioteca Matematica/ },
  { name: "koine: pare fora de laço (erro)", src: SM(`pare`), error: /laço/ },

  // ---------------- Koiné: estruturas ----------------
  { name: "koine: estrutura construir/zerar/imprimir", src: S(`estrutura Ponto { real x  real y }\nfuncao inicio() { Ponto p = Ponto(1.0, 2.0)  Ponto z  escreva(p.x, " ", p, " ", z.y, " ", z) }`), expect: "1.0 Ponto{x: 1.0, y: 2.0} 0.0 Ponto{x: 0.0, y: 0.0}" },
  { name: "koine: estrutura copiada na atribuição e no parâmetro", src: S(`estrutura Ponto { inteiro x  inteiro y }\nfuncao inicio() { Ponto p = Ponto(1, 2)  Ponto q = p  q.x = 9  altera(p)  escreva(p.x, q.x) altera_ref(p) escreva(p.x) }\nfuncao altera(Ponto a) { a.x = 7 }\nfuncao altera_ref(Ponto &a) { a.x = 5 }`), expect: "195" },
  { name: "koine: vetor de estruturas e vetor dentro de estrutura", src: S(`estrutura Aluno { cadeia nome  inteiro notas[3] }\nfuncao inicio() { Aluno turma[2]  turma[1].nome = "Ana"  turma[1].notas[2] = 10  Aluno c = turma[1]  c.notas[2] = 0  escreva(turma[1].nome, turma[1].notas[2], c.notas[2]) }`), expect: "Ana100" },
  { name: "koine: estrutura == e retorno", src: S(`estrutura P { inteiro a  inteiro b }\nfuncao inicio() { P x = faz(1)  escreva(x == P(1, 2), " ", x != P(1, 2), " ", x == faz(1)) }\nfuncao P faz(inteiro a) { retorne P(a, 2) }`), expect: "verdadeiro falso verdadeiro" },
  { name: "koine: estrutura com < (erro)", src: S(`estrutura P { inteiro a }\nfuncao inicio() { P x  P y  se (x < y) {} }`), error: /operador "<"/ },
  { name: "koine: campo inexistente (erro)", src: S(`estrutura P { inteiro a }\nfuncao inicio() { P x  x.b = 1 }`), error: /não tem o campo "b".*Campos: a/ },
  { name: "koine: leia em campo", src: S(`estrutura P { inteiro a  cadeia n }\nfuncao inicio() { P x  leia(x.a, x.n)  escreva(x.a * 2, x.n) }`), inputs: ["21", "oi"], expect: "42oi" },
  { name: "koine: tipo declarado depois do uso", src: S(`funcao inicio() { Par p = Par(3, 4)  escreva(soma(p)) }\nfuncao inteiro soma(Par q) { retorne q.a + q.b }\nestrutura Par { inteiro a  inteiro b }`), expect: "7" },
  { name: "koine: escreva sem parênteses (dica)", src: SM(`inteiro x = 1\nescreva x`), error: /função, não um tipo.*parênteses/ },
  { name: "koine: tipo inexistente (erro)", src: SM(`Pont p`), error: /tipo "Pont" não existe/ },

  // ---------------- Koiné: referências ----------------
  { name: "koine: ref básica", src: SM(`inteiro n = 1\nref inteiro r = &n\n*r = 20\nescreva(n, " ", *r + 1, " ", r == nulo)`), expect: "20 21 falso" },
  { name: "koine: ref nula (erro)", src: SM(`ref inteiro r = nulo\nescreva(*r)`), error: /Referência nula/ },
  { name: "koine: ref a elemento e campo, parâmetro ref", src: S(`estrutura P { inteiro a }\nfuncao inicio() {\n inteiro v[3]\n P p\n ref inteiro r = &v[1]\n *r = 5\n ref inteiro s = &p.a\n *s = 6\n inc(&v[1])\n inc(s)\n escreva(v[1], p.a)\n}\nfuncao inc(ref inteiro x) { *x = *x + 1 }`), expect: "67" },
  { name: "koine: &x e *r na mesma linha com ;", src: SM(`inteiro n = 1; ref inteiro r = &n; *r = 7; escreva(n)`), expect: "7" },
  { name: "koine: ref + 1 (erro)", src: SM(`inteiro n = 1\nref inteiro r = &n\nescreva(r + 1)`), error: /operador "\+"/ },
  { name: "koine: escreva(ref) (erro com dica)", src: SM(`inteiro n = 1\nref inteiro r = &n\nescreva(r)`), error: /use \*r/ },
  { name: "koine: ref == ref (erro)", src: SM(`inteiro n = 1\nref inteiro a = &n\nref inteiro b = &n\nescreva(a == b)`), error: /\*a == \*b/ },
  { name: "koine: nulo em inteiro (erro)", src: SM(`inteiro n = nulo`), error: /nulo/ },
  { name: "koine: & de parâmetro continua funcionando junto com ref", src: SM(`inteiro a = 1\ndobra(a)\nref inteiro r = &a\n*r = *r + 1\nescreva(a)`, `funcao dobra(inteiro &x) { x = x * 2 }`), expect: "3" },

  // ---------------- Koiné: classes ----------------
  { name: "koine: classe, herança, virtual, super, privado em subclasse", src: S(`inclua biblioteca Texto
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
  { name: "koine: inicializador de campo e construtor sintetizado", src: S(`classe Contador { privado inteiro n = 10  publico inteiro prox() { n++  retorne n } }\nfuncao inicio() { Contador c = Contador()  c.prox()  escreva(c.prox()) }`), expect: "12" },
  { name: "koine: objetos compartilhados (aliasing) e nulo", src: S(`classe Caixa { publico inteiro v = 0 }\nfuncao inicio() { Caixa a = Caixa()  Caixa b = a  b.v = 5  Caixa c = nulo  escreva(a.v, " ", c == nulo, " ", a == b, " ", c) }`), expect: "5 verdadeiro verdadeiro nulo" },
  { name: "koine: método em objeto nulo (erro)", src: S(`classe C { publico inteiro f() { retorne 1 } }\nfuncao inicio() { C c = nulo  escreva(c.f()) }`), error: /nulo/ },
  { name: "koine: downcast (erro)", src: S(`classe A {}\nclasse B herda A {}\nfuncao inicio() { A a = B()  B b = a }`), error: /nem todo/ },
  { name: "koine: campo privado fora da classe (erro)", src: S(`classe A { privado inteiro x = 1 }\nfuncao inicio() { A a = A()  escreva(a.x) }`), error: /privado/ },
  { name: "koine: super obrigatório (erro)", src: S(`classe A { publico A(inteiro n) {} }\nclasse B herda A { publico B() {} }\nfuncao inicio() {}`), error: /super\(/ },
  { name: "koine: sobrescrita com assinatura diferente (erro)", src: S(`classe A { publico inteiro f() { retorne 1 } }\nclasse B herda A { publico real f() { retorne 1.0 } }\nfuncao inicio() {}`), error: /assinatura diferente/ },
  { name: "koine: herança circular (erro)", src: S(`classe A herda B {}\nclasse B herda A {}\nfuncao inicio() {}`), error: /herda de si mesma/ },
  { name: "koine: classe com estrutura e estrutura com objeto", src: S(`estrutura P { inteiro x }\nclasse Ent { publico P pos  publico cadeia nome = "e" }\nestrutura Par { Ent ent }\nfuncao inicio() { Ent a = Ent()  a.pos.x = 3  Par p  p.ent = a  P q = a.pos  q.x = 9  escreva(a.pos.x, p.ent.nome, " ", p.ent.pos.x) }`), expect: "3e 3" },
  { name: "koine: leia dentro de método (bloqueio via despacho virtual)", src: S(`classe A { publico inteiro le() { retorne 0 } }\nclasse B herda A { publico inteiro le() { inteiro x  leia(x)  retorne x } }\nfuncao inicio() { A a = B()  escreva(a.le() * 2) }`), inputs: ["21"], expect: "42" },

  // ---------------- Koiné: módulos ----------------
  { name: "koine: módulos: qualificado, não qualificado, tipo e classe importados, ordem de globais", files: {
    "geo.koi": `programa {\n  modulo Geo\n  publico const real PI2 = 6.0\n  publico inteiro BASE = 21\n  publico estrutura Ponto { real x  real y }\n  publico classe Circulo { publico real r = 1.0  publico real area() { retorne PI2 * r } }\n  publico real dobro(real v) { retorne quadrado(v) / v * 2 }\n  real quadrado(real v) { retorne v * v }\n}`,
    "principal.koi": `programa {\n  importe Geo\n  inteiro x = Geo.BASE * 2\n  funcao inicio() { Ponto p = Ponto(1.0, 2.0)  Geo.Ponto q = p  Circulo c = Circulo()  escreva(Geo.dobro(3.0), " ", dobro(1.0), " ", q.y, " ", c.area(), " ", x, " ", PI2) }\n}`,
  }, entry: "principal.koi", expect: "6.0 2.0 2.0 6.0 42 6.0" },
  { name: "koine: módulos: função privada (erro no arquivo certo)", files: {
    "geo.koi": `programa {\n  modulo Geo\n  real interna() { retorne 1.0 }\n}`,
    "principal.koi": `programa {\n  importe Geo\n  funcao inicio() { escreva(Geo.interna()) }\n}`,
  }, entry: "principal.koi", error: /privada no módulo Geo/, errorFile: "principal.koi" },
  { name: "koine: módulos: apelido e caminho", files: {
    "lib/geo.koi": `programa {\n  modulo Geo\n  publico inteiro um() { retorne 1 }\n}`,
    "principal.koi": `programa {\n  importe "lib/geo.koi" --> g\n  funcao inicio() { escreva(g.um()) }\n}`,
  }, entry: "principal.koi", expect: "1" },
  { name: "koine: módulos: ambiguidade (erro)", files: {
    "a.koi": `programa { modulo A  publico inteiro f() { retorne 1 } }`,
    "b.koi": `programa { modulo B  publico inteiro f() { retorne 2 } }`,
    "principal.koi": `programa {\n  importe A\n  importe B\n  funcao inicio() { escreva(f()) }\n}`,
  }, entry: "principal.koi", error: /Use A\.f ou B\.f/ },
  { name: "koine: módulos: importação circular (erro)", files: {
    "a.koi": `programa { modulo A\n importe B\n publico inteiro f() { retorne 1 } }`,
    "b.koi": `programa { modulo B\n importe A\n publico inteiro g() { retorne 2 } }`,
    "principal.koi": `programa {\n  importe A\n  funcao inicio() { escreva(f()) }\n}`,
  }, entry: "principal.koi", error: /circular/, errorFile: "b.koi" },
  { name: "koine: módulos: inexistente (erro)", files: {
    "principal.koi": `programa {\n  importe Nada\n  funcao inicio() {}\n}`,
  }, entry: "principal.koi", error: /não foi encontrado/ },
  { name: "koine: módulos: erro de execução com arquivo", files: {
    "geo.koi": `programa {\n  modulo Geo\n  publico inteiro div(inteiro a, inteiro b) { retorne a / b }\n}`,
    "principal.koi": `programa {\n  importe Geo\n  funcao inicio() { escreva(Geo.div(1, 0)) }\n}`,
  }, entry: "principal.koi", error: /Divisão por zero/, errorFile: "geo.koi" },
  { name: "koine: módulos: inicio do módulo importado não executa e sem inicio na entrada (erro)", files: {
    "lib.koi": `programa { modulo Lib  publico inteiro f() { retorne 3 } }`,
    "principal.koi": `programa { importe Lib  funcao inicio() { escreva(f()) } }`,
  }, entry: "lib.koi", error: /não tem a função "inicio"/ },

];

let pass = 0, fail = 0;
for (const c of cases) {
  const host = new BufferHost(c.inputs ?? []);
  let err: KoineError | null = null;
  try {
    const prog = compileCase(c);
    await prog.run(host);
  } catch (e) {
    if (e instanceof KoineError) err = e;
    else { console.log(`✗ ${c.name}: exceção inesperada`, e); fail++; continue; }
  }
  if (c.error) {
    if (!err) { console.log(`✗ ${c.name}: esperava erro ${c.error}, mas rodou. Saída: ${JSON.stringify(host.out)}`); fail++; continue; }
    if (!c.error.test(err.message)) { console.log(`✗ ${c.name}: erro diferente: [${err.line}:${err.col}] ${err.message}`); fail++; continue; }
    if (c.errorLine && err.line !== c.errorLine) { console.log(`✗ ${c.name}: linha ${err.line}, esperava ${c.errorLine}`); fail++; continue; }
    if (c.errorFile) {
      const names = c.files ? Object.keys(c.files) : ["principal.koi"];
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

const koineDbg = `programa
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

const find = (s: Snapshot, name: string) => {
  for (let i = s.frames.length - 1; i >= 0; i--) {
    const v = s.frames[i].vars.find((x) => x.name === name);
    if (v) return v;
  }
  return s.globals.find((x) => x.name === name);
};

const debugCases: DebugCase[] = [
  { name: "debug koine: passo a passo entra em laço e função com 'into'", src: koineDbg, commands: ["into"], stops: [5, 6, 8, 14, 15, 6, 8, 14, 15, 6, 8, 14, 15, 6, 10], expect: "12" },
  { name: "debug koine: 'over' não entra na função", src: koineDbg, commands: ["over"], stops: [5, 6, 8, 6, 8, 6, 8, 6, 10], expect: "12" },
  { name: "debug koine: breakpoint em laço para a cada iteração e mostra variáveis", src: koineDbg, breakpoints: [14], commands: ["continue"], stops: [14, 14, 14], expect: "12",
    check: (s) => {
      if (s.frames.length !== 2) return `pilha com ${s.frames.length} quadros`;
      if (s.frames[1].name !== "dobro") return `quadro ${s.frames[1].name}`;
      if (find(s, "n")?.value !== "3") return `n = ${find(s, "n")?.value}`;
      if (find(s, "soma")?.value !== "6") return `soma = ${find(s, "soma")?.value}`;
      if (find(s, "r")?.value !== "(sem valor)") return `r = ${find(s, "r")?.value}`;
      return null;
    } },
  { name: "debug koine: 'out' volta para quem chamou", src: koineDbg, breakpoints: [14], commands: ["out", "continue", "out", "continue", "out", "continue"], stops: [14, 6, 14, 6, 14, 6], expect: "12" },
  { name: "debug koine: breakpoint em módulo importado, estrutura/objeto/ref no snapshot, quadro de método", files: {
    "geo.koi": `programa {\n  modulo Geo\n  publico estrutura Ponto { inteiro x  inteiro y }\n  publico classe Circulo {\n    publico inteiro r = 2\n    publico inteiro area() {\n      inteiro k = r * 3\n      retorne k * r\n    }\n  }\n}`,
    "principal.koi": `programa {\n  importe Geo\n  funcao inicio() {\n    Ponto p = Ponto(1, 2)\n    Circulo c = Circulo()\n    inteiro n = 20\n    ref inteiro rr = &n\n    escreva(c.area())\n  }\n}`,
  }, entry: "principal.koi", breakpoints: [{ file: "geo.koi", line: 8 }], commands: ["continue"], stops: [8], stopFiles: ["geo.koi"], expect: "12",
    check: (s) => {
      const top = s.frames[s.frames.length - 1];
      if (top.name !== "Circulo.area") return `quadro ${top.name}`;
      if (top.file !== "geo.koi") return `arquivo ${top.file}`;
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
check("isInside", isInside("c:/aulas", "c:/aulas/sub/a.koi") && !isInside("c:/aulas", "c:/aulas2/a.koi"), true);
check("relPath", relPath("C:\\Aulas", "C:\\Aulas\\Lib\\Geo.koi"), "Lib/Geo.koi");
check("relPath fora da raiz", relPath("C:\\Aulas", "D:\\x\\y.koi"), "y.koi");
check("hasEntryPoint", hasEntryPoint("programa { funcao inicio() {} }") && !hasEntryPoint("programa { funcao f() {} }"), true);
const cands = [{ path: "lib/geo.koi", hasEntry: false }, { path: "principal.koi", hasEntry: true }, { path: "teste.koi", hasEntry: true }];
check("entry fixado", resolveEntry({ candidates: cands, pinned: "teste.koi", active: "principal.koi", last: null }), "teste.koi");
check("entry fixado sem entrada -> aba ativa", resolveEntry({ candidates: cands, pinned: "lib/geo.koi", active: "teste.koi", last: null }), "teste.koi");
check("entry aba ativa sem entrada -> principal", resolveEntry({ candidates: cands, pinned: null, active: "lib/geo.koi", last: "teste.koi" }), "principal.koi");
check("entry último usado", resolveEntry({ candidates: [cands[0], cands[2], { path: "outro.koi", hasEntry: true }], pinned: null, active: "lib/geo.koi", last: "outro.koi" }), "outro.koi");
check("entry único com entrada", resolveEntry({ candidates: [cands[0], cands[2]], pinned: null, active: null, last: null }), "teste.koi");
check("entry nenhum", resolveEntry({ candidates: [cands[0]], pinned: null, active: null, last: null }), null);

// ---------------- Testes em Koiné (blocos `teste`, afirmações, saida/entrada, cobertura) ----------------
import { CoverageCollector, TestHost, hasTests } from "../src/lang/shared/testing";

interface TCase {
  name: string; files: Record<string, string>; entry: string;
  /** nome do teste -> "passou" | "falhou" | "erro" (+ trecho da mensagem) */
  expect: Record<string, "passou" | ["falhou" | "erro", RegExp]>;
  /** função -> coberta? */
  coverage?: Record<string, boolean>;
  /** erro de compilação esperado */
  compileError?: RegExp;
  /** compila sem o modo de testes (como F5) */
  normal?: boolean;
}

const tcases: TCase[] = [
  {
    name: "koine: testes no próprio programa", entry: "calc.koi",
    files: { "calc.koi": `programa {
  funcao inteiro dobro(inteiro x) { retorne x * 2 }
  funcao inteiro nunca(inteiro x) { retorne 0 }
  funcao inicio() { inteiro n  leia(n)  escreva("dobro: ", dobro(n), "\\n") }
  teste "dobro" { afirme_igual(8, dobro(4)) }
  teste "falha" { afirme_igual(9, dobro(4), "dobro errado") }
  teste "programa inteiro" { entrada("21")  inicio()  afirme_igual("dobro: 42\\n", saida()) }
  teste "afirme com mensagem" { afirme(dobro(1) == 3, "um dobrado") }
  teste "erro de execução" { inteiro v[] = {1}  escreva(v[5]) }
  teste "leia sem entrada" { inicio() }
  teste "aproximado" { afirme_aproximado(1.0, 1.0004, 0.001)  afirme_diferente(1, 2) }
}` },
    expect: {
      dobro: "passou", falha: ["falhou", /dobro errado: esperava 9, mas obteve 8/], "programa inteiro": "passou",
      "afirme com mensagem": ["falhou", /um dobrado/], "erro de execução": ["erro", /fora dos limites/], "leia sem entrada": ["erro", /entrada\(/], aproximado: "passou",
    },
    coverage: { dobro: true, nunca: false, inicio: true },
  },
  {
    name: "koine: arquivo de testes importa o programa e vê funções privadas", entry: "principal.teste.koi",
    files: {
      "principal.koi": `programa {\n  real quadrado(real v) { retorne v * v }\n  funcao inicio() { escreva(quadrado(3.0)) }\n}`,
      "principal.teste.koi": `programa {\n  importe principal\n  teste "quadrado privado" { afirme_aproximado(9.0, quadrado(3.0), 0.001) }\n  teste "roda inicio" { inicio()  afirme_igual("9.0", saida()) }\n  teste "qualificado" { afirme_igual(4.0, principal.quadrado(2.0)) }\n}`,
    },
    expect: { "quadrado privado": "passou", "roda inicio": "passou", qualificado: "passou" },
    coverage: { "principal.quadrado": true, "principal.inicio": true },
  },
  {
    name: "koine: estruturas e vetores em afirme_igual", entry: "t.koi",
    files: { "t.koi": `programa {\n  estrutura P { inteiro x  inteiro y }\n  funcao inicio() {}\n  teste "struct" { P a = P(1, 2)  P b = P(1, 2)  afirme_igual(a, b)  b.y = 3  afirme_diferente(a, b) }\n  teste "vetor" { inteiro v[] = {1, 2}  inteiro w[] = {1, 2}  afirme_igual(v, w) }\n  teste "struct diferente" { afirme_igual(P(1, 2), P(1, 3)) }\n}` },
    expect: { struct: "passou", vetor: "passou", "struct diferente": ["falhou", /esperava P\{x: 1, y: 2\}, mas obteve P\{x: 1, y: 3\}/] },
  },
  {
    name: "koine: saida fora de teste é erro de compilação", entry: "a.koi",
    files: { "a.koi": `programa { funcao inicio() { escreva(saida()) } }` }, expect: {}, compileError: /só pode ser usada em testes/, normal: true,
  },
  {
    name: "koine: programa comum não pode importar outro programa", entry: "a.koi",
    files: { "a.koi": `programa { importe "b.koi"  funcao inicio() {} }`, "b.koi": `programa { funcao inicio() {} }` }, expect: {}, compileError: /programa principal e não pode ser importado/,
  },
];

for (const c of tcases) {
  const files = Object.entries(c.files).map(([path, source]) => ({ path, source }));
  let program;
  try {
    program = compileProject(files, c.entry, c.normal ? {} : { tests: true });
  } catch (e) {
    if (c.compileError && e instanceof KoineError && c.compileError.test(e.message)) { pass++; continue; }
    console.log(`✗ ${c.name}: erro de compilação inesperado: ${(e as Error).message}`); fail++; continue;
  }
  if (c.compileError) { console.log(`✗ ${c.name}: esperava erro de compilação ${c.compileError}`); fail++; continue; }
  const cov = new CoverageCollector();
  program.attachCoverage(cov);
  const got: Record<string, string> = {};
  let problem: string | null = null;
  for (const t of program.tests) {
    const host = new TestHost();
    try { await program.runTest(host, t.id); got[t.name] = "passou"; }
    catch (e) {
      const pe = e as KoineError;
      got[t.name] = pe.kind === "teste" ? "falhou" : "erro";
      const want = c.expect[t.name];
      if (Array.isArray(want) && !want[1].test(pe.message)) problem = `mensagem de "${t.name}": ${JSON.stringify(pe.message)} não casa com ${want[1]}`;
    }
  }
  for (const [name, want] of Object.entries(c.expect)) {
    const w = Array.isArray(want) ? want[0] : want;
    if (got[name] !== w) problem = problem ?? `"${name}": ${got[name] ?? "não executado"}, esperava ${w}`;
  }
  if (Object.keys(got).length !== Object.keys(c.expect).length) problem = problem ?? `encontrou ${Object.keys(got).length} testes, esperava ${Object.keys(c.expect).length}`;
  if (c.coverage) {
    const report = cov.report();
    for (const [fn, covered] of Object.entries(c.coverage)) {
      const f = report.functions.find((x) => x.name === fn);
      if (!f) problem = problem ?? `cobertura: função "${fn}" não está no relatório (${report.functions.map((x) => x.name).join(", ")})`;
      else if ((f.hit > 0) !== covered) problem = problem ?? `cobertura: "${fn}" ${f.hit}/${f.total}, esperava ${covered ? "coberta" : "sem cobertura"}`;
    }
  }
  if (problem) { console.log(`✗ ${c.name}: ${problem}`); fail++; } else pass++;
}

// ---------------- Idiomas (palavras reservadas traduzidas pelo lexer) ----------------
import { translateSource } from "../src/lang/i18n";
import { localizeExample } from "../src/examples/i18n";
{
  const runLocale = async (src: string, locale: "en" | "es" | "el") => {
    const p = compileProject([{ path: "a.koi", source: src }], "a.koi", { locale });
    const h = new BufferHost();
    await p.run(h);
    return h.out;
  };
  check("i18n: código em inglês", await runLocale(`program { function main() { integer n = 2  if (n == 2 and true) { write("ok ", n) } } }`, "en"), "ok 2");
  check("i18n: português continua valendo em inglês", await runLocale(`programa { include library Math  function inicio() { escreva(Math.root(9.0, 2.0)) } }`, "en"), "3.0");
  check("i18n: código em grego", await runLocale(`πρόγραμμα { συνάρτηση αρχή() { ακέραιος ν = 3  γράψε(ν * 2) } }`, "el"), "6");
  check("i18n: ida e volta", translateSource(translateSource("programa { funcao inicio() { escreva(\"funcao\") } }", "pt-BR", "es"), "es", "pt-BR"), "programa { funcao inicio() { escreva(\"funcao\") } }");
  check("i18n: comentários e textos não mudam", translateSource("// funcao\nprograma { funcao inicio() { escreva(\"se\") } }", "pt-BR", "en").split("\n")[0], "// funcao");
  check("i18n: hasEntryPoint localizado", [hasEntryPoint("function main() {", "en"), hasEntryPoint("function main() {", "pt-BR"), hasEntryPoint("συνάρτηση αρχή() {", "el")], [true, false, true]);
  check("i18n: erro de execução em inglês vem traduzido", await (async () => { try { await runLocale(`program { function main() { boolean b  read(b) } }`, "en"); return "sem erro"; } catch (e) { const t = (e as Error).message; return /Teste pediu entrada/.test(t) ? "ainda em português" : /input|line/i.test(t) ? "em inglês" : t; } })(), "em inglês");
  check("i18n: erro de compilação em inglês vem traduzido com o tipo no idioma", (() => { try { compileProject([{ path: "a.koi", source: `program { function main() { integer x = "a" } }` }], "a.koi", { locale: "en" }); return "sem erro"; } catch (e) { const t = (e as Error).message; return /string/.test(t) && /integer/.test(t) && !/cadeia|inteiro/.test(t) ? "ok" : t; } })(), "ok");
  check("i18n: depois de compilar em inglês, português volta ao normal", (() => { try { compile(`programa { funcao inicio() { inteiro x = "a" } }`); return "sem erro"; } catch (e) { return /cadeia/.test((e as Error).message) && /inteiro/.test((e as Error).message) ? "ok" : (e as Error).message; } })(), "ok");
  check("i18n: comentários e textos dos exemplos traduzidos", localizeExample('// roda o programa\nescreva("Soma: ")', "en") !== '// roda o programa\nescreva("Soma: ")' && localizeExample('// roda o programa', "pt-BR") === '// roda o programa', true);
}

// ---------------- Exemplos (todos compilam e executam sem erro) ----------------
import { EXAMPLES } from "../src/examples";
for (const ex of EXAMPLES) {
  const name = `exemplo: ${ex.title}`;
  try {
    const files = ex.files ? ex.files.map((f) => ({ path: f.name, source: f.code })) : [{ path: "principal.koi", source: ex.code ?? "" }];
    if (hasTests(files[0].source)) {
      // exemplo de testes: todos passam, exceto o que falha de propósito
      const program = compileProject(files, files[0].path, { tests: true });
      for (const t of program.tests) {
        try { await program.runTest(new TestHost(), t.id); if (/de propósito/.test(t.name)) throw new Error(`"${t.name}" deveria falhar`); }
        catch (e) { if (!/de propósito/.test(t.name)) throw new Error(`"${t.name}": ${(e as Error).message}`); }
      }
      pass++;
      continue;
    }
    const program = compileProject(files, files[0].path);
    const host = new BufferHost(["1", "2", "3", "4", "5", "6", "7", "8"]);
    try { await program.run(host); } catch (e) { if (!/não há mais linhas/.test(String(e))) throw e; }
    pass++;
  } catch (e) {
    console.log(`✗ ${name}: ${e instanceof Error ? e.message : e}`); fail++;
  }
}

console.log(`\n${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
