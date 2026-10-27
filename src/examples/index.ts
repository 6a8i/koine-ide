
export interface ExampleFile {
  name: string;
  code: string;
}

export interface Example {
  title: string;
  description: string;
  /** exemplo de um arquivo só */
  code?: string;
  /** exemplo de vários arquivos: todos abrem em abas e são executados juntos; o primeiro é o principal */
  files?: ExampleFile[];
}

export const NEW_PROGRAM = `programa
{
    funcao inicio()
    {
        escreva("Olá, mundo!\\n")
    }
}
`;

export const EXAMPLES: Example[] = [
  {
    title: "Testes automatizados",
    description: "Um programa e um arquivo de testes: afirme, afirme_igual, entrada/saida e cobertura. Pressione F7.",
    files: [
      {
        name: "calculadora.teste.koi",
        code: `// calculadora.teste.koi — testes do programa ao lado. Pressione F7 (ou o botão Testar).
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
        name: "calculadora.koi",
        code: `// calculadora.koi — o programa: lê dois números e mostra a soma
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
    title: "Projeto com vários arquivos",
    description: "Três arquivos que se importam: módulo de números, módulo de geometria e programa principal.",
    files: [
      {
        name: "principal.koi",
        code: `// principal.koi — o programa: importa os dois módulos abaixo (abas ao lado)
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
        name: "geometria.koi",
        code: `// geometria.koi — módulo que usa o módulo Numeros
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
        name: "numeros.koi",
        code: `// numeros.koi — módulo sem funcao inicio: uma biblioteca
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
    title: "Olá, mundo",
    description: "O menor programa possível: escreve uma mensagem.",
    code: NEW_PROGRAM,
  },
  {
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
];
