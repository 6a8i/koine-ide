import { Lang } from "../lang/shared/types";

export interface ExampleFile {
  name: string;
  code: string;
}

export interface Example {
  title: string;
  description: string;
  lang: Lang;
  /** exemplo de um arquivo só */
  code?: string;
  /** exemplo de vários arquivos: todos abrem em abas e são executados juntos; o primeiro é o principal */
  files?: ExampleFile[];
}

export const NEW_STUDIO = `programa
{
    funcao inicio()
    {
        escreva("Olá, mundo!\\n")
    }
}
`;

export const NEW_VISUALG = `algoritmo "novo"
var

inicio
    escreval("Olá, mundo!")
fimalgoritmo
`;

export const EXAMPLES: Example[] = [
  {
    lang: "studio",
    title: "Testes automatizados",
    description: "Um programa e um arquivo de testes: afirme, afirme_igual, entrada/saida e cobertura. Pressione F7.",
    files: [
      {
        name: "calculadora.teste.por",
        code: `// calculadora.teste.por — testes do programa ao lado. Pressione F7 (ou o botão Testar).
programa
{
    importe calculadora            // um arquivo de testes pode importar o programa e usar até as funções privadas

    teste "soma de dois números"
    {
        afirme_igual(5, soma(2, 3))
        afirme_igual(0, soma(-4, 4))
    }

    teste "média é real"
    {
        afirme_aproximado(2.5, media(2, 3), 0.001)
    }

    teste "par e ímpar"
    {
        afirme(eh_par(10), "10 é par")
        afirme(nao eh_par(7), "7 é ímpar")
    }

    teste "programa completo, com entrada e saída"
    {
        entrada("2\\n3")                 // o que o usuário digitaria, uma linha por vez
        inicio()                        // roda o programa
        afirme_igual("Primeiro número: Segundo número: Soma: 5\\n", saida())
    }

    teste "este falha de propósito"
    {
        afirme_igual(6, soma(2, 3), "a soma está errada")
    }
}
`,
      },
      {
        name: "calculadora.por",
        code: `// calculadora.por — o programa: lê dois números e mostra a soma
programa
{
    funcao inteiro soma(inteiro a, inteiro b) { retorne a + b }

    funcao real media(inteiro a, inteiro b)
    {
        retorne (a + b) / 2.0
    }

    funcao logico eh_par(inteiro n) { retorne n % 2 == 0 }

    // nenhum teste chama esta função: o painel Testes mostra "sem testes"
    funcao inteiro dobro(inteiro n) { retorne n * 2 }

    funcao inicio()
    {
        inteiro a, b
        escreva("Primeiro número: ")
        leia(a)
        escreva("Segundo número: ")
        leia(b)
        escreva("Soma: ", soma(a, b), "\\n")
    }
}
`,
      },
    ],
  },
  {
    lang: "visualg",
    title: "Testes automatizados",
    description: "Um algoritmo e um arquivo de testes: afirme, afirme_igual, entrada/saida e cobertura. Pressione F7.",
    files: [
      {
        name: "calculadora.teste.alg",
        code: `// calculadora.teste.alg — testes do algoritmo ao lado. Pressione F7 (ou o botão Testar).
modulo "testes_calculadora"
importe calculadora            // um arquivo de testes pode importar o algoritmo e usar até as funções privadas

teste "soma de dois números"
inicio
    afirme_igual(5, soma(2, 3))
    afirme_igual(0, soma(-4, 4))
fimteste

teste "média é real"
inicio
    afirme_aproximado(2.5, media(2, 3), 0.001)
fimteste

teste "par e ímpar"
inicio
    afirme(eh_par(10), "10 é par")
    afirme(nao eh_par(7), "7 é ímpar")
fimteste

teste "algoritmo completo, com entrada e saída"
inicio
    entrada("2")                   // o que o usuário digitaria, uma linha por vez
    entrada("3")
    executar_algoritmo()           // roda o inicio...fimalgoritmo
    afirme_igual("Primeiro número: Segundo número: Soma:  5" + carac(10), saida())
fimteste

teste "este falha de propósito"
inicio
    afirme_igual(6, soma(2, 3), "a soma está errada")
fimteste
fimmodulo
`,
      },
      {
        name: "calculadora.alg",
        code: `// calculadora.alg — o algoritmo: lê dois números e mostra a soma
algoritmo "calculadora"
var
    a, b: inteiro

funcao soma(x, y: inteiro): inteiro
inicio
    retorne x + y
fimfuncao

funcao media(x, y: inteiro): real
inicio
    retorne (x + y) / 2
fimfuncao

funcao eh_par(n: inteiro): logico
inicio
    retorne n mod 2 = 0
fimfuncao

// nenhum teste chama esta função: o painel Testes mostra "sem testes"
funcao dobro(n: inteiro): inteiro
inicio
    retorne n * 2
fimfuncao

inicio
    escreva("Primeiro número: ")
    leia(a)
    escreva("Segundo número: ")
    leia(b)
    escreval("Soma: ", soma(a, b))
fimalgoritmo
`,
      },
    ],
  },
  {
    lang: "studio",
    title: "Projeto com vários arquivos",
    description: "Três arquivos que se importam: módulo de números, módulo de geometria e programa principal.",
    files: [
      {
        name: "principal.por",
        code: `// principal.por — o programa: importa os dois módulos abaixo (abas ao lado)
programa
{
    importe Geometria
    importe Numeros

    funcao inicio()
    {
        Ponto a = Ponto(0.0, 0.0)          // estrutura pública do módulo Geometria
        Ponto b = Ponto(3.0, 4.0)
        escreva("distância: ", Geometria.distancia(a, b), "\\n")

        Forma f = Circulo(2.0)             // classes públicas do módulo Geometria
        escreva(f.descreve(), "\\n")

        escreva("PI do módulo Numeros: ", Numeros.PI, "\\n")
        // Numeros.quadrado(2.0) daria erro: a função é privada ao módulo
    }
}
`,
      },
      {
        name: "geometria.por",
        code: `// geometria.por — módulo que usa o módulo Numeros
programa
{
    modulo Geometria
    importe Numeros

    publico estrutura Ponto { real x  real y }

    publico classe Forma
    {
        privado cadeia nome
        publico Forma(cadeia nome) { este.nome = nome }
        publico real area() { retorne 0.0 }
        publico cadeia descreve() { retorne nome + " com área " + Numeros.arredonda(area()) }
    }

    publico classe Circulo herda Forma
    {
        privado real raio
        publico Circulo(real raio) { super("círculo")  este.raio = raio }
        publico real area() { retorne Numeros.PI * raio * raio }
    }

    publico real distancia(Ponto a, Ponto b)
    {
        retorne Numeros.hipotenusa(b.x - a.x, b.y - a.y)
    }
}
`,
      },
      {
        name: "numeros.por",
        code: `// numeros.por — módulo sem funcao inicio: uma biblioteca
programa
{
    modulo Numeros
    inclua biblioteca Matematica

    publico const real PI = 3.14159

    // publico: quem importar Numeros pode usar
    publico real arredonda(real v)
    {
        retorne Matematica.arredondar(v, 2)
    }

    publico real hipotenusa(real a, real b)
    {
        retorne Matematica.raiz(quadrado(a) + quadrado(b), 2.0)
    }

    // sem publico: privada, só este arquivo enxerga
    real quadrado(real v) { retorne v * v }
}
`,
      },
    ],
  },
  {
    lang: "visualg",
    title: "Projeto com vários arquivos",
    description: "Três arquivos que se importam: módulo de números, módulo de geometria e algoritmo principal.",
    files: [
      {
        name: "principal.alg",
        code: `// principal.alg — o algoritmo: importa os dois módulos abaixo (abas ao lado)
algoritmo "principal"
importe geometria
importe numeros
var
    a, b: Ponto                 // registro público do módulo geometria
    f: Forma
inicio
    a.x <- 0
    a.y <- 0
    b.x <- 3
    b.y <- 4
    escreval("distância: ", distancia(a, b))

    f <- novo Circulo(2.0)      // classes públicas do módulo geometria
    escreval(f.descreve())

    escreval("PI do módulo numeros: ", NUMERO_PI)
    // quadrado(2) daria erro: a função é privada ao módulo numeros
fimalgoritmo
`,
      },
      {
        name: "geometria.alg",
        code: `// geometria.alg — módulo que usa o módulo numeros
modulo "geometria"
importe numeros
tipo
    publico Ponto = registro
        x, y: real
    fimregistro

    publico Forma = classe
        privado nome: caractere
        publico procedimento iniciar(n: caractere)
        publico funcao area(): real
        publico funcao descreve(): caractere
    fimclasse

    publico Circulo = classe herda Forma
        privado raio: real
        publico procedimento iniciar(r: real)
        publico funcao area(): real
    fimclasse

procedimento Forma.iniciar(n: caractere)
inicio
    este.nome <- n
fimprocedimento

funcao Forma.area(): real
inicio
    retorne 0
fimfuncao

funcao Forma.descreve(): caractere
inicio
    retorne nome + " com área " + numpcarac(area())
fimfuncao

procedimento Circulo.iniciar(r: real)
inicio
    super.iniciar("círculo")
    raio <- r
fimprocedimento

funcao Circulo.area(): real
inicio
    retorne NUMERO_PI * raio * raio
fimfuncao

publico funcao distancia(a, b: Ponto): real
inicio
    retorne hipotenusa(b.x - a.x, b.y - a.y)
fimfuncao
fimmodulo
`,
      },
      {
        name: "numeros.alg",
        code: `// numeros.alg — módulo sem inicio: uma biblioteca
modulo "numeros"
const
    publico NUMERO_PI = 3.14159

// sem publico: privada, só este arquivo enxerga
funcao quadrado(v: real): real
inicio
    retorne v * v
fimfuncao

// publico: quem importar numeros pode usar
publico funcao hipotenusa(a, b: real): real
inicio
    retorne raizq(quadrado(a) + quadrado(b))
fimfuncao
fimmodulo
`,
      },
    ],
  },
  {
    lang: "studio",
    title: "Estruturas e referências",
    description: "Estrutura por valor (cópia), referência segura com ref/&/*.",
    code: `programa
{
    estrutura Ponto
    {
        real x
        real y
    }

    funcao inicio()
    {
        Ponto a = Ponto(1.0, 2.0)
        Ponto b = a            // cópia: mudar b não muda a
        b.x = 9.0
        escreva("a = ", a, "  b = ", b, "\\n")

        inteiro n = 10
        ref inteiro r = &n     // r aponta para n
        *r = 20                // escreve em n através de r
        dobra(&n)
        escreva("n = ", n, "\\n")
    }

    funcao dobra(ref inteiro x)
    {
        *x = *x * 2
    }
}
`,
  },
  {
    lang: "studio",
    title: "Classes e herança",
    description: "Classe com construtor, campos privados, herança e método sobrescrito.",
    code: `programa
{
    inclua biblioteca Matematica

    classe Forma
    {
        privado cadeia nome

        publico Forma(cadeia nome) { este.nome = nome }
        publico real area() { retorne 0.0 }
        publico cadeia descreve() { retorne nome + " com área " + area() }
    }

    classe Circulo herda Forma
    {
        privado real raio

        publico Circulo(real raio)
        {
            super("círculo")
            este.raio = raio
        }
        publico real area() { retorne Matematica.PI * raio * raio }
    }

    classe Quadrado herda Forma
    {
        privado real lado
        publico Quadrado(real lado) { super("quadrado")  este.lado = lado }
        publico real area() { retorne lado * lado }
    }

    funcao inicio()
    {
        Forma formas[] = {Circulo(1.0), Quadrado(2.0), Forma("genérica")}
        para (inteiro i = 0; i < 3; i++)
        {
            escreva(formas[i].descreve(), "\\n")   // chama o area() de cada objeto
        }
    }
}
`,
  },
  {
    lang: "visualg",
    title: "Registros e referências",
    description: "Registro (tipo ... registro), cópia por valor e referência com ref/&/*.",
    code: `algoritmo "registros"
tipo
    Ponto = registro
        x, y: real
    fimregistro
var
    a, b: Ponto
    n: inteiro
    r: ref inteiro

procedimento dobra(x: ref inteiro)
inicio
    *x <- *x * 2
fimprocedimento

inicio
    a.x <- 1
    a.y <- 2
    b <- a            // cópia: mudar b não muda a
    b.x <- 9
    escreval("a = ", a, "  b = ", b)

    n <- 10
    r <- &n           // r aponta para n
    *r <- 20
    dobra(&n)
    escreval("n = ", n)
fimalgoritmo
`,
  },
  {
    lang: "visualg",
    title: "Classes e herança",
    description: "Classe com construtor iniciar, campos privados, herança e método sobrescrito.",
    code: `algoritmo "classes"
tipo
    Forma = classe
        privado nome: caractere
        publico procedimento iniciar(n: caractere)
        publico funcao area(): real
        publico funcao descreve(): caractere
    fimclasse

    Circulo = classe herda Forma
        privado raio: real
        publico procedimento iniciar(r: real)
        publico funcao area(): real
    fimclasse
var
    f: Forma

procedimento Forma.iniciar(n: caractere)
inicio
    este.nome <- n
fimprocedimento

funcao Forma.area(): real
inicio
    retorne 0
fimfuncao

funcao Forma.descreve(): caractere
inicio
    retorne nome + " com área " + numpcarac(area())
fimfuncao

procedimento Circulo.iniciar(r: real)
inicio
    super.iniciar("círculo")
    raio <- r
fimprocedimento

funcao Circulo.area(): real
inicio
    retorne pi() * raio * raio
fimfuncao

inicio
    f <- novo Circulo(1.0)
    escreval(f.descreve())      // chama o area() do Circulo
    f <- novo Forma("genérica")
    escreval(f.descreve())
fimalgoritmo
`,
  },
  // ---------------- Portugol Studio ----------------
  {
    lang: "studio",
    title: "Olá, mundo",
    description: "O menor programa possível: escreve uma mensagem.",
    code: NEW_STUDIO,
  },
  {
    lang: "studio",
    title: "Lendo dados",
    description: "Lê o nome e a idade e responde de acordo.",
    code: `programa
{
    funcao inicio()
    {
        cadeia nome
        inteiro idade

        escreva("Qual é o seu nome? ")
        leia(nome)
        escreva("Quantos anos você tem? ")
        leia(idade)

        se (idade >= 18)
        {
            escreva("Olá, ", nome, "! Você é maior de idade.\\n")
        }
        senao
        {
            escreva("Olá, ", nome, "! Faltam ", 18 - idade, " ano(s) para a maioridade.\\n")
        }
    }
}
`,
  },
  {
    lang: "studio",
    title: "Tabuada",
    description: "Laço para com a tabuada de um número.",
    code: `programa
{
    funcao inicio()
    {
        inteiro numero

        escreva("Tabuada de qual número? ")
        leia(numero)
        escreva("\\n")

        para (inteiro i = 1; i <= 10; i++)
        {
            escreva(numero, " x ", i, " = ", numero * i, "\\n")
        }
    }
}
`,
  },
  {
    lang: "studio",
    title: "Média com vetor",
    description: "Guarda notas num vetor e calcula a média.",
    code: `programa
{
    funcao inicio()
    {
        const inteiro QUANTIDADE = 4
        real notas[QUANTIDADE]
        real soma = 0.0

        para (inteiro i = 0; i < QUANTIDADE; i++)
        {
            escreva("Nota ", i + 1, ": ")
            leia(notas[i])
            soma += notas[i]
        }

        real media = soma / QUANTIDADE
        escreva("\\nMédia: ", media, "\\n")

        se (media >= 7.0)
        {
            escreva("Aprovado!\\n")
        }
        senao se (media >= 5.0)
        {
            escreva("Recuperação.\\n")
        }
        senao
        {
            escreva("Reprovado.\\n")
        }
    }
}
`,
  },
  {
    lang: "studio",
    title: "Funções e recursão",
    description: "Função fatorial recursiva e função com parâmetro por referência.",
    code: `programa
{
    funcao inicio()
    {
        inteiro n = 5
        escreva("Fatorial de ", n, " = ", fatorial(n), "\\n")

        inteiro a = 1, b = 2
        trocar(a, b)
        escreva("Depois da troca: a = ", a, ", b = ", b, "\\n")
    }

    funcao inteiro fatorial(inteiro n)
    {
        se (n <= 1)
        {
            retorne 1
        }
        retorne n * fatorial(n - 1)
    }

    // O "&" faz o parâmetro ser passado por referência:
    // mudanças dentro da função afetam a variável original.
    funcao trocar(inteiro &x, inteiro &y)
    {
        inteiro temporario = x
        x = y
        y = temporario
    }
}
`,
  },
  {
    lang: "studio",
    title: "Jogo de adivinhação",
    description: "Usa a biblioteca Util para sortear um número e enquanto para repetir.",
    code: `programa
{
    inclua biblioteca Util

    funcao inicio()
    {
        inteiro segredo = Util.sorteia(1, 100)
        inteiro palpite = 0
        inteiro tentativas = 0

        escreva("Pensei em um número de 1 a 100. Adivinhe!\\n")

        enquanto (palpite != segredo)
        {
            escreva("Seu palpite: ")
            leia(palpite)
            tentativas++

            se (palpite < segredo)
            {
                escreva("É maior!\\n")
            }
            senao se (palpite > segredo)
            {
                escreva("É menor!\\n")
            }
        }

        escreva("Acertou em ", tentativas, " tentativa(s)!\\n")
    }
}
`,
  },
  {
    lang: "studio",
    title: "Escolha (menu)",
    description: "Comando escolha/caso com um menu de opções.",
    code: `programa
{
    inclua biblioteca Matematica --> mat

    funcao inicio()
    {
        inteiro opcao
        real x

        escreva("1 - Raiz quadrada\\n2 - Quadrado\\n3 - Valor absoluto\\nOpção: ")
        leia(opcao)
        escreva("Número: ")
        leia(x)

        escolha (opcao)
        {
            caso 1:
                escreva("Raiz: ", mat.raiz(x, 2.0), "\\n")
                pare
            caso 2:
                escreva("Quadrado: ", mat.potencia(x, 2.0), "\\n")
                pare
            caso 3:
                escreva("Absoluto: ", mat.valor_absoluto(x), "\\n")
                pare
            caso contrario:
                escreva("Opção inválida.\\n")
        }
    }
}
`,
  },
  {
    lang: "studio",
    title: "Matriz",
    description: "Preenche e exibe uma matriz 3x3.",
    code: `programa
{
    funcao inicio()
    {
        inteiro matriz[3][3]

        para (inteiro linha = 0; linha < 3; linha++)
        {
            para (inteiro coluna = 0; coluna < 3; coluna++)
            {
                matriz[linha][coluna] = (linha + 1) * (coluna + 1)
            }
        }

        para (inteiro linha = 0; linha < 3; linha++)
        {
            para (inteiro coluna = 0; coluna < 3; coluna++)
            {
                escreva(matriz[linha][coluna], "\\t")
            }
            escreva("\\n")
        }
    }
}
`,
  },

  // ---------------- VisuAlg ----------------
  {
    lang: "visualg",
    title: "Olá, mundo",
    description: "O menor algoritmo possível: escreve uma mensagem.",
    code: NEW_VISUALG,
  },
  {
    lang: "visualg",
    title: "Lendo dados",
    description: "Lê o nome e a idade e responde de acordo.",
    code: `algoritmo "maioridade"
var
    nome: caractere
    idade: inteiro
inicio
    escreva("Qual é o seu nome? ")
    leia(nome)
    escreva("Quantos anos você tem? ")
    leia(idade)

    se idade >= 18 entao
        escreval("Olá, ", nome, "! Você é maior de idade.")
    senao
        escreval("Olá, ", nome, "! Faltam ", 18 - idade, " ano(s) para a maioridade.")
    fimse
fimalgoritmo
`,
  },
  {
    lang: "visualg",
    title: "Tabuada",
    description: "Laço para com a tabuada de um número.",
    code: `algoritmo "tabuada"
var
    numero, i: inteiro
inicio
    escreva("Tabuada de qual número? ")
    leia(numero)
    escreval("")

    para i de 1 ate 10 faca
        escreval(numero, " x ", i, " = ", numero * i)
    fimpara
fimalgoritmo
`,
  },
  {
    lang: "visualg",
    title: "Média com vetor",
    description: "Guarda notas num vetor e calcula a média com formatação.",
    code: `algoritmo "media"
var
    notas: vetor[1..4] de real
    soma, media: real
    i: inteiro
inicio
    soma <- 0
    para i de 1 ate 4 faca
        escreva("Nota ", i, ": ")
        leia(notas[i])
        soma <- soma + notas[i]
    fimpara

    media <- soma / 4
    escreval("")
    escreval("Média: ", media:5:2)

    se media >= 7 entao
        escreval("Aprovado!")
    senao
        se media >= 5 entao
            escreval("Recuperação.")
        senao
            escreval("Reprovado.")
        fimse
    fimse
fimalgoritmo
`,
  },
  {
    lang: "visualg",
    title: "Funções e procedimentos",
    description: "Função fatorial recursiva e procedimento com parâmetro var.",
    code: `algoritmo "subprogramas"
var
    a, b: inteiro

funcao fatorial(n: inteiro): inteiro
inicio
    se n <= 1 entao
        retorne 1
    fimse
    retorne n * fatorial(n - 1)
fimfuncao

// "var" antes do parâmetro faz a passagem por referência:
// mudanças dentro do procedimento afetam a variável original.
procedimento trocar(var x, y: inteiro)
var
    temporario: inteiro
inicio
    temporario <- x
    x <- y
    y <- temporario
fimprocedimento

inicio
    escreval("Fatorial de 5 = ", fatorial(5))

    a <- 1
    b <- 2
    trocar(a, b)
    escreval("Depois da troca: a = ", a, ", b = ", b)
fimalgoritmo
`,
  },
  {
    lang: "visualg",
    title: "Jogo de adivinhação",
    description: "Sorteia um número com randi e repete com enquanto.",
    code: `algoritmo "adivinhacao"
var
    segredo, palpite, tentativas: inteiro
inicio
    segredo <- randi(100) + 1
    palpite <- 0
    tentativas <- 0

    escreval("Pensei em um número de 1 a 100. Adivinhe!")

    enquanto palpite <> segredo faca
        escreva("Seu palpite: ")
        leia(palpite)
        tentativas <- tentativas + 1

        se palpite < segredo entao
            escreval("É maior!")
        senao
            se palpite > segredo entao
                escreval("É menor!")
            fimse
        fimse
    fimenquanto

    escreval("Acertou em ", tentativas, " tentativa(s)!")
fimalgoritmo
`,
  },
  {
    lang: "visualg",
    title: "Escolha (menu)",
    description: "Comando escolha/caso com intervalos e repita.",
    code: `algoritmo "menu"
var
    opcao: inteiro
    x: real
inicio
    repita
        escreval("1 - Raiz quadrada")
        escreval("2 - Quadrado")
        escreval("3 - Valor absoluto")
        escreval("0 - Sair")
        escreva("Opção: ")
        leia(opcao)

        escolha opcao
            caso 1, 2, 3
                escreva("Número: ")
                leia(x)
                escolha opcao
                    caso 1
                        escreval("Raiz: ", raizq(x))
                    caso 2
                        escreval("Quadrado: ", quad(x))
                    caso 3
                        escreval("Absoluto: ", abs(x))
                fimescolha
            caso 0
                escreval("Até logo!")
            outrocaso
                escreval("Opção inválida.")
        fimescolha
        escreval("")
    ate opcao = 0
fimalgoritmo
`,
  },
  {
    lang: "visualg",
    title: "Matriz",
    description: "Preenche e exibe uma matriz 3x3.",
    code: `algoritmo "matriz"
var
    m: vetor[1..3, 1..3] de inteiro
    linha, coluna: inteiro
inicio
    para linha de 1 ate 3 faca
        para coluna de 1 ate 3 faca
            m[linha, coluna] <- linha * coluna
        fimpara
    fimpara

    para linha de 1 ate 3 faca
        para coluna de 1 ate 3 faca
            escreva(m[linha, coluna]:4)
        fimpara
        escreval("")
    fimpara
fimalgoritmo
`,
  },
];
