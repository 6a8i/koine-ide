import { Lang } from "../lang/shared/types";

export interface Example {
  title: string;
  description: string;
  lang: Lang;
  code: string;
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
