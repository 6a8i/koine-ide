/**
 * Referência das palavras reservadas, comandos e funções de cada linguagem.
 * Usada no painel lateral "Referência" e nas dicas ao passar o mouse no editor.
 */
import { Lang } from "../lang/shared/types";
import { Locale, toCanonicalMap, translateSource, word } from "../lang/i18n";
import { REF_I18N } from "./i18n";

export type RefCategory = "estrutura" | "tipo" | "controle" | "operador" | "entrada-saida" | "funcao" | "outro";

export const CATEGORY_LABEL: Record<RefCategory, string> = {
  estrutura: "Estrutura do programa",
  tipo: "Tipos e valores",
  controle: "Controle de fluxo",
  operador: "Operadores",
  "entrada-saida": "Entrada e saída",
  funcao: "Funções prontas",
  outro: "Outros",
};

export interface RefEntry {
  /** palavra como aparece no código (ex.: "enquanto", "Matematica.raiz") */
  name: string;
  category: RefCategory;
  /** o que faz, em uma ou duas frases */
  summary: string;
  /** forma de uso */
  syntax?: string;
  /** trecho de exemplo (inserível no editor) */
  example?: string;
  /** outras palavras que levam a esta entrada na busca/dica (ex.: "fimse" → "se") */
  aliases?: string[];
}

// ======================= Portugol Studio =======================
const STUDIO: RefEntry[] = [
  // ---- estrutura ----
  { name: "programa", category: "estrutura", summary: "Bloco que envolve todo o código. Tudo (funções, variáveis globais, inclusões) fica entre suas chaves.", syntax: "programa\n{\n    ...\n}", example: "programa\n{\n    funcao inicio()\n    {\n        escreva(\"Olá!\\n\")\n    }\n}" },
  { name: "funcao", category: "estrutura", summary: "Declara uma função. Se tiver tipo de retorno, deve usar 'retorne'. Parâmetros com & são passados por referência (a função altera a variável original).", syntax: "funcao [tipo] nome([tipo param, tipo &param, tipo vetor[]])\n{\n    ...\n}", example: "funcao inteiro dobro(inteiro n)\n{\n    retorne n * 2\n}" },
  { name: "inicio", category: "estrutura", summary: "A função 'inicio' é por onde o programa começa a executar. Todo programa precisa ter uma.", syntax: "funcao inicio()\n{\n    ...\n}", example: "funcao inicio()\n{\n    escreva(\"Começou!\\n\")\n}" },
  { name: "inclua biblioteca", category: "estrutura", summary: "Importa uma biblioteca (Matematica, Texto, Util, Tipos) para usar suas funções. Pode dar um apelido com -->.", syntax: "inclua biblioteca Nome [--> apelido]", example: "inclua biblioteca Matematica --> mat\n", aliases: ["inclua", "biblioteca"] },
  { name: "const", category: "estrutura", summary: "Declara uma constante: um valor que não pode ser alterado depois.", syntax: "const tipo NOME = valor", example: "const real PI = 3.14159\n" },
  { name: "retorne", category: "estrutura", summary: "Encerra a função devolvendo um valor (ou nada, em funções sem tipo).", syntax: "retorne valor", example: "retorne n * 2\n" },
  { name: "// comentário", category: "outro", summary: "Texto ignorado pelo programa. '//' comenta até o fim da linha; '/* ... */' comenta várias linhas.", syntax: "// uma linha\n/* várias\n   linhas */", example: "// calcula a média\n", aliases: ["comentario", "comentário", "/*"] },

  // ---- módulos e visibilidade ----
  { name: "modulo", category: "estrutura", summary: "Dá nome ao módulo deste arquivo (sem 'modulo', o nome é o do arquivo). Um arquivo sem 'funcao inicio' é uma biblioteca que outros arquivos podem importar.", syntax: "programa\n{\n    modulo Nome\n    ...\n}", example: "modulo Geometria\n" },
  { name: "importe", category: "estrutura", summary: "Traz para este arquivo tudo o que outro módulo do projeto declarou como 'publico'. Use pelo nome do módulo ou pelo caminho do arquivo; '--> apelido' dá um nome curto.", syntax: "importe Nome\nimporte \"pasta/arquivo.por\" --> apelido", example: "importe Geometria\n" },
  { name: "teste", category: "estrutura", summary: "Bloco de teste automatizado: código que confere se o programa faz o que deveria. Escreva no próprio programa ou em um arquivo separado que o importe (um arquivo de testes enxerga até as funções privadas). Execute com F7 ou pelo painel Testes; os testes não rodam com F5.", syntax: "teste \"nome do teste\"\n{\n    ...afirmações...\n}", example: "teste \"soma de dois números\"\n{\n    afirme_igual(5, soma(2, 3))\n}\n" },
  { name: "afirme", category: "funcao", summary: "Dentro de um teste: falha o teste se a condição for falsa. A mensagem (opcional) explica o que era esperado.", syntax: "afirme(condicao)\nafirme(condicao, \"mensagem\")", example: "afirme(eh_par(10), \"10 é par\")\n" },
  { name: "afirme_igual", category: "funcao", summary: "Falha o teste se o valor obtido for diferente do esperado (números, textos, lógicos, estruturas campo a campo, vetores item a item). Para reais use afirme_aproximado.", syntax: "afirme_igual(esperado, obtido)\nafirme_igual(esperado, obtido, \"mensagem\")", example: "afirme_igual(5, soma(2, 3))\n", aliases: ["afirme_diferente"] },
  { name: "afirme_aproximado", category: "funcao", summary: "Falha o teste se |esperado − obtido| for maior que a tolerância. Use para números reais, que raramente dão exatamente iguais.", syntax: "afirme_aproximado(esperado, obtido, tolerancia)", example: "afirme_aproximado(2.5, media(2, 3), 0.001)\n" },
  { name: "saida", category: "funcao", summary: "Dentro de um teste: devolve tudo o que o código testado escreveu com escreva até agora. Serve para testar o programa inteiro: forneça as entradas com entrada(...), chame inicio() e confira a saída.", syntax: "saida()", example: "entrada(\"2\\n3\")\ninicio()\nafirme_igual(\"Soma: 5\\n\", saida())\n" },
  { name: "entrada", category: "funcao", summary: "Dentro de um teste: fornece as linhas que os próximos leia vão ler (uma por linha, separadas por \\n). Sem isso, um leia dentro de um teste dá erro.", syntax: "entrada(\"linha1\\nlinha2\")", example: "entrada(\"Ana\\n20\")\n" },
  { name: "publico", category: "estrutura", summary: "Torna uma função, variável global, constante, estrutura, classe, campo ou método visível fora de onde foi declarado (outros módulos, ou fora da classe). Sem 'publico', tudo é privado.", syntax: "publico funcao real area(real r) { ... }\npublico classe Forma { ... }", example: "publico funcao inteiro dobro(inteiro n) { retorne n * 2 }\n", aliases: ["privado"] },
  { name: "privado", category: "estrutura", summary: "Visível só dentro do próprio arquivo (funções e variáveis) ou só dentro da classe e de suas subclasses (campos e métodos). É o padrão quando não se escreve nada.", syntax: "privado cadeia nome", example: "privado real raio\n" },

  // ---- estruturas, classes e referências ----
  { name: "estrutura", category: "tipo", summary: "Agrupa campos em um novo tipo de valor (registro). É copiada ao atribuir e ao passar para funções. Crie com Nome(valores) na ordem dos campos, ou Nome() para zerar.", syntax: "estrutura Nome\n{\n    tipo campo1\n    tipo campo2\n}", example: "estrutura Ponto\n{\n    real x\n    real y\n}\n", aliases: ["registro"] },
  { name: "classe", category: "tipo", summary: "Define um tipo com campos e métodos. Objetos são criados com Nome(...) (chama o construtor, que tem o nome da classe) e compartilhados por referência: duas variáveis podem apontar para o mesmo objeto. Aceita 'nulo'.", syntax: "classe Nome [herda Mae]\n{\n    privado tipo campo = valor\n    publico Nome(parametros) { super(...)  ... }\n    publico tipo metodo(parametros) { ... }\n}", example: "classe Contador\n{\n    privado inteiro n = 0\n    publico inteiro proximo() { n++  retorne n }\n}\n", aliases: ["construtor", "metodo", "método"] },
  { name: "herda", category: "tipo", summary: "Faz uma classe receber os campos e métodos de outra. Um método com o mesmo nome e assinatura sobrescreve o da classe mãe; a chamada usa sempre o método do objeto real.", syntax: "classe Filha herda Mae { ... }", example: "classe Circulo herda Forma\n{\n    publico real area() { retorne 3.14 * raio * raio }\n}\n" },
  { name: "este", category: "tipo", summary: "Dentro de um método ou construtor, é o próprio objeto. Serve para distinguir um campo de um parâmetro com o mesmo nome.", syntax: "este.campo", example: "este.nome = nome\n" },
  { name: "super", category: "tipo", summary: "Dentro de uma classe filha: 'super(...)' chama o construtor da classe mãe (deve ser o primeiro comando do construtor) e 'super.metodo(...)' chama a versão da mãe de um método.", syntax: "super(argumentos)\nsuper.metodo(argumentos)", example: "publico Circulo(real r) { super(\"círculo\")  raio = r }\n" },
  { name: "nulo", category: "tipo", summary: "Valor de uma variável de classe ou ref que não aponta para nada. Usar um objeto nulo dá erro de execução; compare com '== nulo' antes.", syntax: "variavel == nulo", example: "se (forma == nulo) { escreva(\"sem forma\\n\") }\n" },
  { name: "ref", category: "tipo", summary: "Referência segura (um 'ponteiro' sem aritmética): guarda o endereço de uma variável, posição de vetor ou campo. Obtenha com & e leia/escreva o alvo com *. Pode ser 'nulo'.", syntax: "ref tipo nome = &variavel\n*nome = valor", example: "inteiro n = 1\nref inteiro r = &n\n*r = 20   // n vale 20\n", aliases: ["ponteiro", "referencia", "referência"] },
  { name: "& (endereço)", category: "operador", summary: "Antes de uma variável, posição de vetor ou campo, produz uma referência (ref) para ela. Em parâmetros (tipo &nome) continua significando passagem por referência.", syntax: "&variavel  &vetor[i]  &objeto.campo", example: "ref inteiro r = &total\n", aliases: ["&"] },
  { name: "* (acesso pela referência)", category: "operador", summary: "Antes de uma referência, acessa a variável apontada: '*r' lê e '*r = v' escreve. Em uma referência nula dá erro de execução.", syntax: "*referencia", example: "*r = *r + 1\n", aliases: ["*"] },
  { name: ". (campo e método)", category: "operador", summary: "Acessa um campo ou chama um método: 'p.x', 'c.area()'. Também qualifica nomes de módulo e biblioteca: 'Geometria.distancia(a, b)'.", syntax: "objeto.campo\nobjeto.metodo(argumentos)\nModulo.nome", example: "escreva(p.x, \" \", c.area(), \"\\n\")\n", aliases: ["."] },

  // ---- tipos ----
  { name: "inteiro", category: "tipo", summary: "Número inteiro (sem casas decimais): -3, 0, 42. A divisão entre inteiros descarta a parte decimal.", syntax: "inteiro nome [= valor]", example: "inteiro idade = 20\n" },
  { name: "real", category: "tipo", summary: "Número com casas decimais: 3.14, -0.5. Use ponto, não vírgula.", syntax: "real nome [= valor]", example: "real altura = 1.75\n" },
  { name: "cadeia", category: "tipo", summary: "Texto (sequência de caracteres) entre aspas duplas. Pode ser juntado com +.", syntax: "cadeia nome [= \"texto\"]", example: "cadeia nome = \"Maria\"\n" },
  { name: "caracter", category: "tipo", summary: "Um único caractere, entre aspas simples: 'a', '7', ' '.", syntax: "caracter nome [= 'x']", example: "caracter letra = 'A'\n" },
  { name: "logico", category: "tipo", summary: "Valor lógico: verdadeiro ou falso. Resultado de comparações e condições.", syntax: "logico nome [= verdadeiro|falso]", example: "logico aprovado = falso\n" },
  { name: "vazio", category: "tipo", summary: "Usado como tipo de retorno de função que não devolve nada (o mesmo que omitir o tipo).", syntax: "funcao vazio nome()", example: "funcao vazio mostrar()\n{\n    escreva(\"oi\\n\")\n}" },
  { name: "verdadeiro", category: "tipo", summary: "Valor lógico 'sim'. O oposto é falso.", example: "logico ok = verdadeiro\n" },
  { name: "falso", category: "tipo", summary: "Valor lógico 'não'. O oposto é verdadeiro.", example: "logico ok = falso\n" },
  { name: "vetor", category: "tipo", summary: "Lista de valores do mesmo tipo, com posições numeradas a partir de 0. Pode ter tamanho fixo ou ser inicializado com {…}.", syntax: "tipo nome[tamanho]\ntipo nome[] = {v1, v2, ...}", example: "inteiro notas[3]\nnotas[0] = 10\ninteiro primos[] = {2, 3, 5, 7}\n", aliases: ["[]", "array", "lista"] },
  { name: "matriz", category: "tipo", summary: "Vetor de duas dimensões (linhas e colunas). Índices começam em 0.", syntax: "tipo nome[linhas][colunas]\ntipo nome[][] = {{...}, {...}}", example: "inteiro m[2][3]\nm[1][2] = 9\n", aliases: ["[][]"] },

  // ---- controle ----
  { name: "se", category: "controle", summary: "Executa o bloco somente se a condição for verdadeira. Pode ter um 'senao' para o caso contrário.", syntax: "se (condicao)\n{\n    ...\n}\nsenao\n{\n    ...\n}", example: "se (idade >= 18)\n{\n    escreva(\"maior de idade\\n\")\n}\nsenao\n{\n    escreva(\"menor de idade\\n\")\n}\n" },
  { name: "senao", category: "controle", summary: "Parte do 'se' executada quando a condição é falsa. 'senao se' encadeia outra condição.", syntax: "senao { ... }\nsenao se (condicao) { ... }", example: "senao se (nota >= 5)\n{\n    escreva(\"recuperação\\n\")\n}\n" },
  { name: "enquanto", category: "controle", summary: "Repete o bloco enquanto a condição for verdadeira. A condição é testada antes de cada repetição.", syntax: "enquanto (condicao)\n{\n    ...\n}", example: "inteiro i = 0\nenquanto (i < 5)\n{\n    escreva(i, \"\\n\")\n    i++\n}\n" },
  { name: "faca … enquanto", category: "controle", summary: "Repete o bloco e só depois testa a condição: o bloco executa pelo menos uma vez.", syntax: "faca\n{\n    ...\n}\nenquanto (condicao)", example: "inteiro opcao\nfaca\n{\n    escreva(\"Digite 0 para sair: \")\n    leia(opcao)\n}\nenquanto (opcao != 0)\n", aliases: ["faca"] },
  { name: "para", category: "controle", summary: "Laço com contador: inicialização; condição; passo. Ideal para repetir um número conhecido de vezes.", syntax: "para (inicializacao; condicao; passo)\n{\n    ...\n}", example: "para (inteiro i = 1; i <= 10; i++)\n{\n    escreva(i, \"\\n\")\n}\n" },
  { name: "escolha", category: "controle", summary: "Compara um valor com vários 'caso'. Sem 'pare', a execução continua no próximo caso. 'caso contrario' trata os demais valores.", syntax: "escolha (valor)\n{\n    caso 1:\n        ...\n        pare\n    caso contrario:\n        ...\n}", example: "escolha (opcao)\n{\n    caso 1:\n        escreva(\"um\\n\")\n        pare\n    caso 2:\n        escreva(\"dois\\n\")\n        pare\n    caso contrario:\n        escreva(\"outro\\n\")\n}\n", aliases: ["caso", "contrario"] },
  { name: "pare", category: "controle", summary: "Sai imediatamente do laço (enquanto, para, faca) ou do 'escolha' em que está.", syntax: "pare", example: "se (x == 0) pare\n" },

  // ---- operadores ----
  { name: "= (atribuição)", category: "operador", summary: "Guarda um valor na variável. Atenção: para comparar use '==', não '='.", syntax: "variavel = valor", example: "total = total + 1\n", aliases: ["="] },
  { name: "+ - * / %", category: "operador", summary: "Aritmética: soma, subtração, multiplicação, divisão e resto da divisão (%). Com cadeias, '+' junta textos.", example: "resto = 7 % 3   // 1\nmedia = soma / 2.0\n", aliases: ["+", "-", "*", "/", "%"] },
  { name: "++ --", category: "operador", summary: "Incrementa ou decrementa a variável em 1. Equivale a 'x = x + 1' / 'x = x - 1'.", example: "contador++\n", aliases: ["++", "--"] },
  { name: "+= -= *= /=", category: "operador", summary: "Atribuição com operação: 'x += 2' é o mesmo que 'x = x + 2'.", example: "soma += nota\n", aliases: ["+=", "-=", "*=", "/="] },
  { name: "== != < > <= >=", category: "operador", summary: "Comparação: igual, diferente, menor, maior, menor ou igual, maior ou igual. O resultado é lógico.", example: "se (nota >= 7 e faltas < 10)\n", aliases: ["==", "!=", "<", ">", "<=", ">="] },
  { name: "e", category: "operador", summary: "E lógico: verdadeiro só se os dois lados forem verdadeiros.", example: "se (idade >= 18 e idade < 65)\n" },
  { name: "ou", category: "operador", summary: "OU lógico: verdadeiro se pelo menos um dos lados for verdadeiro.", example: "se (dia == 6 ou dia == 7)\n" },
  { name: "nao", category: "operador", summary: "NÃO lógico: inverte o valor (verdadeiro vira falso e vice-versa).", example: "se (nao achou)\n" },
  { name: "& | ^ ~ << >>", category: "operador", summary: "Operadores bit a bit em inteiros: e, ou, ou-exclusivo, inversão, deslocamentos. Em parâmetros, '&' indica passagem por referência.", example: "inteiro mascara = 5 & 3\n", aliases: ["&", "|", "^", "~", "<<", ">>"] },

  // ---- entrada e saída ----
  { name: "escreva", category: "entrada-saida", summary: "Mostra valores no console. Aceita vários itens separados por vírgula. Use \"\\n\" para quebrar linha.", syntax: "escreva(valor1, valor2, ...)", example: "escreva(\"Resultado: \", total, \"\\n\")\n" },
  { name: "leia", category: "entrada-saida", summary: "Lê um valor digitado pelo usuário e guarda na variável (convertido para o tipo dela). Aceita várias variáveis.", syntax: "leia(variavel1, variavel2, ...)", example: "inteiro idade\nescreva(\"Idade: \")\nleia(idade)\n" },
  { name: "limpa", category: "entrada-saida", summary: "Limpa o console.", syntax: "limpa()", example: "limpa()\n" },

  // ---- bibliotecas ----
  { name: "Matematica.PI", category: "funcao", summary: "Constante π (3,14159…). Requer 'inclua biblioteca Matematica'.", example: "real area = Matematica.PI * raio * raio\n" },
  { name: "Matematica.raiz", category: "funcao", summary: "Raiz de índice n de um número: raiz(x, 2) é a raiz quadrada.", syntax: "Matematica.raiz(real x, real indice) : real", example: "real r = Matematica.raiz(16, 2)   // 4.0\n" },
  { name: "Matematica.potencia", category: "funcao", summary: "Base elevada ao expoente.", syntax: "Matematica.potencia(real base, real expoente) : real", example: "real p = Matematica.potencia(2, 10)   // 1024.0\n" },
  { name: "Matematica.arredondar", category: "funcao", summary: "Arredonda para o número de casas decimais informado.", syntax: "Matematica.arredondar(real x, inteiro casas) : real", example: "real m = Matematica.arredondar(3.14159, 2)   // 3.14\n" },
  { name: "Matematica.valor_absoluto", category: "funcao", summary: "Valor sem sinal (módulo).", syntax: "Matematica.valor_absoluto(x)", example: "inteiro d = Matematica.valor_absoluto(-7)   // 7\n" },
  { name: "Matematica.maior_numero", category: "funcao", summary: "O maior entre dois números. 'menor_numero' faz o contrário.", syntax: "Matematica.maior_numero(a, b)\nMatematica.menor_numero(a, b)", example: "inteiro m = Matematica.maior_numero(3, 9)\n", aliases: ["Matematica.menor_numero"] },
  { name: "Matematica.seno", category: "funcao", summary: "Funções trigonométricas (ângulo em radianos): seno, cosseno, tangente.", syntax: "Matematica.seno(real x) : real", example: "real s = Matematica.seno(Matematica.PI / 2)\n", aliases: ["Matematica.cosseno", "Matematica.tangente"] },
  { name: "Matematica.logaritmo", category: "funcao", summary: "Logaritmo de x na base informada.", syntax: "Matematica.logaritmo(real x, real base) : real", example: "real l = Matematica.logaritmo(100, 10)   // 2.0\n" },
  { name: "Texto.numero_caracteres", category: "funcao", summary: "Quantidade de caracteres de um texto.", syntax: "Texto.numero_caracteres(cadeia texto) : inteiro", example: "inteiro n = Texto.numero_caracteres(\"Portugol\")   // 8\n" },
  { name: "Texto.caixa_alta", category: "funcao", summary: "Converte para MAIÚSCULAS. 'caixa_baixa' converte para minúsculas.", syntax: "Texto.caixa_alta(cadeia texto) : cadeia", example: "cadeia s = Texto.caixa_alta(\"olá\")   // \"OLÁ\"\n", aliases: ["Texto.caixa_baixa"] },
  { name: "Texto.obter_caractere", category: "funcao", summary: "Caractere na posição indicada (a primeira é 0).", syntax: "Texto.obter_caractere(cadeia texto, inteiro posicao) : caracter", example: "caracter c = Texto.obter_caractere(\"abc\", 1)   // 'b'\n" },
  { name: "Texto.extrair_subtexto", category: "funcao", summary: "Parte do texto entre as posições inicio (inclusive) e fim (exclusive).", syntax: "Texto.extrair_subtexto(cadeia texto, inteiro inicio, inteiro fim) : cadeia", example: "cadeia s = Texto.extrair_subtexto(\"Portugol\", 0, 4)   // \"Port\"\n" },
  { name: "Texto.posicao_texto", category: "funcao", summary: "Posição em que 'busca' aparece em 'texto' a partir de 'inicio' (-1 se não achar).", syntax: "Texto.posicao_texto(cadeia busca, cadeia texto, inteiro inicio) : inteiro", example: "inteiro p = Texto.posicao_texto(\"go\", \"Portugol\", 0)   // 5\n" },
  { name: "Texto.substituir", category: "funcao", summary: "Troca todas as ocorrências de um trecho por outro.", syntax: "Texto.substituir(cadeia texto, cadeia de, cadeia para) : cadeia", example: "cadeia s = Texto.substituir(\"a-b-c\", \"-\", \"+\")\n" },
  { name: "Texto.preencher_a_esquerda", category: "funcao", summary: "Completa o texto com um caractere até o tamanho desejado (à esquerda ou à direita).", syntax: "Texto.preencher_a_esquerda(caracter c, inteiro tamanho, cadeia texto) : cadeia", example: "cadeia s = Texto.preencher_a_esquerda('0', 5, \"42\")   // \"00042\"\n", aliases: ["Texto.preencher_a_direita"] },
  { name: "Texto.inverter", category: "funcao", summary: "Texto de trás para a frente. 'remover_espacos' tira espaços do início e do fim.", syntax: "Texto.inverter(cadeia texto) : cadeia", example: "cadeia s = Texto.inverter(\"abc\")   // \"cba\"\n", aliases: ["Texto.remover_espacos"] },
  { name: "Util.sorteia", category: "funcao", summary: "Número inteiro aleatório entre min e max (inclusive).", syntax: "Util.sorteia(inteiro min, inteiro max) : inteiro", example: "inteiro dado = Util.sorteia(1, 6)\n" },
  { name: "Util.aguarde", category: "funcao", summary: "Pausa o programa pelo tempo informado em milissegundos.", syntax: "Util.aguarde(inteiro milissegundos)", example: "Util.aguarde(1000)   // 1 segundo\n" },
  { name: "Util.numero_elementos", category: "funcao", summary: "Tamanho de um vetor. Para matrizes use 'numero_linhas' e 'numero_colunas'.", syntax: "Util.numero_elementos(vetor) : inteiro", example: "inteiro n = Util.numero_elementos(notas)\n", aliases: ["Util.numero_linhas", "Util.numero_colunas"] },
  { name: "Util.tempo_decorrido", category: "funcao", summary: "Milissegundos desde o início do programa. Útil para medir tempo.", syntax: "Util.tempo_decorrido() : inteiro", example: "inteiro t = Util.tempo_decorrido()\n" },
  { name: "Tipos.cadeia_para_inteiro", category: "funcao", summary: "Converte texto em número inteiro (erro se o texto não for um número). Há também cadeia_para_real e cadeia_para_logico.", syntax: "Tipos.cadeia_para_inteiro(cadeia texto) : inteiro", example: "inteiro n = Tipos.cadeia_para_inteiro(\"42\")\n", aliases: ["Tipos.cadeia_para_real", "Tipos.cadeia_para_logico", "Tipos.cadeia_para_caracter"] },
  { name: "Tipos.inteiro_para_cadeia", category: "funcao", summary: "Converte um número em texto. Há também real_para_cadeia, logico_para_cadeia e caracter_para_cadeia.", syntax: "Tipos.inteiro_para_cadeia(inteiro x) : cadeia", example: "cadeia s = Tipos.inteiro_para_cadeia(7) + \"!\"\n", aliases: ["Tipos.real_para_cadeia", "Tipos.logico_para_cadeia", "Tipos.caracter_para_cadeia"] },
  { name: "Tipos.real_para_inteiro", category: "funcao", summary: "Descarta a parte decimal de um real. 'inteiro_para_real' faz o caminho inverso.", syntax: "Tipos.real_para_inteiro(real x) : inteiro", example: "inteiro i = Tipos.real_para_inteiro(3.9)   // 3\n", aliases: ["Tipos.inteiro_para_real"] },
  { name: "Tipos.e_inteiro", category: "funcao", summary: "Verifica se um texto pode ser convertido em inteiro (ou real, com 'e_real'). Útil para validar entradas.", syntax: "Tipos.e_inteiro(cadeia texto) : logico", example: "se (Tipos.e_inteiro(entrada))\n", aliases: ["Tipos.e_real"] },
  { name: "Tipos.inteiro_para_caracter", category: "funcao", summary: "Conversões entre caractere e código numérico, e entre inteiro e lógico.", syntax: "Tipos.inteiro_para_caracter(inteiro codigo) : caracter\nTipos.caracter_para_inteiro(caracter c) : inteiro", example: "caracter c = Tipos.inteiro_para_caracter(65)   // 'A'\n", aliases: ["Tipos.caracter_para_inteiro", "Tipos.inteiro_para_logico", "Tipos.logico_para_inteiro"] },
];

// ======================= VisuAlg =======================
const VISUALG: RefEntry[] = [
  // ---- estrutura ----
  { name: "algoritmo", category: "estrutura", summary: "Primeira linha do programa, com o nome entre aspas. O programa termina com 'fimalgoritmo'.", syntax: "algoritmo \"nome\"\nvar\n    ...\ninicio\n    ...\nfimalgoritmo", example: "algoritmo \"exemplo\"\nvar\n    x: inteiro\ninicio\n    x <- 1\n    escreval(x)\nfimalgoritmo", aliases: ["fimalgoritmo"] },
  { name: "var", category: "estrutura", summary: "Seção de declaração de variáveis (antes de 'inicio'). Em parâmetros, 'var' indica passagem por referência.", syntax: "var\n    nome1, nome2: tipo", example: "var\n    nome: caractere\n    idade: inteiro\n" },
  { name: "const", category: "estrutura", summary: "Seção de constantes: valores que não mudam durante o programa.", syntax: "const\n    NOME = valor", example: "const\n    MAXIMO = 100\n" },
  { name: "inicio", category: "estrutura", summary: "Marca o começo dos comandos do algoritmo (ou de uma função/procedimento).", example: "inicio\n    escreval(\"Olá\")\n" },
  { name: "funcao", category: "estrutura", summary: "Subprograma que devolve um valor. O resultado é dado por 'retorne' ou atribuindo ao próprio nome da função.", syntax: "funcao nome(param: tipo): tipoRetorno\nvar ...\ninicio\n    retorne valor\nfimfuncao", example: "funcao dobro(n: inteiro): inteiro\ninicio\n    retorne n * 2\nfimfuncao\n", aliases: ["fimfuncao"] },
  { name: "procedimento", category: "estrutura", summary: "Subprograma que não devolve valor. Use 'var' antes de um parâmetro para alterar a variável original.", syntax: "procedimento nome(var param: tipo)\ninicio\n    ...\nfimprocedimento", example: "procedimento troca(var a, b: inteiro)\nvar t: inteiro\ninicio\n    t <- a\n    a <- b\n    b <- t\nfimprocedimento\n", aliases: ["fimprocedimento"] },
  { name: "retorne", category: "estrutura", summary: "Encerra a função devolvendo o valor.", syntax: "retorne valor", example: "retorne n * 2\n" },
  { name: "// comentário", category: "outro", summary: "Texto ignorado pelo programa. '//' comenta até o fim da linha; '{ ... }' comenta um trecho.", syntax: "// uma linha\n{ várias linhas }", example: "// calcula a média\n", aliases: ["comentario", "comentário", "{"] },

  // ---- módulos e visibilidade ----
  { name: "modulo", category: "estrutura", summary: "Começa um arquivo de biblioteca (no lugar de 'algoritmo'): só constantes, variáveis, tipos, funções e procedimentos, sem 'inicio'. Termina com 'fimmodulo'. Outros arquivos usam o que for 'publico'.", syntax: "modulo \"nome\"\n...\nfimmodulo", example: "modulo \"geometria\"\npublico funcao area(r: real): real\ninicio\n    retorne 3.14 * r * r\nfimfuncao\nfimmodulo", aliases: ["fimmodulo"] },
  { name: "importe", category: "estrutura", summary: "Logo depois de 'algoritmo' ou 'modulo': traz o que outro módulo do projeto declarou como 'publico'. Pelo nome do módulo ou pelo caminho do arquivo; 'como apelido' dá um nome curto.", syntax: "importe nome\nimporte \"pasta/arquivo.alg\" como apelido", example: "importe geometria\n", aliases: ["como"] },
  { name: "teste", category: "estrutura", summary: "Bloco de teste automatizado: código que confere se o algoritmo faz o que deveria. Fica onde ficam as funções (antes do inicio), ou em um módulo separado que importe o algoritmo (um arquivo de testes enxerga até as funções privadas). Execute com F7 ou pelo painel Testes; os testes não rodam com F5.", syntax: "teste \"nome do teste\"\n[var ...]\ninicio\n    ...afirmações...\nfimteste", example: "teste \"soma de dois números\"\ninicio\n    afirme_igual(5, soma(2, 3))\nfimteste\n", aliases: ["fimteste"] },
  { name: "afirme", category: "funcao", summary: "Dentro de um teste: falha o teste se a condição for falsa. A mensagem (opcional) explica o que era esperado.", syntax: "afirme(condicao)\nafirme(condicao, \"mensagem\")", example: "afirme(eh_par(10), \"10 é par\")\n" },
  { name: "afirme_igual", category: "funcao", summary: "Falha o teste se o valor obtido for diferente do esperado (números, textos, lógicos, registros campo a campo, vetores item a item). Para reais use afirme_aproximado.", syntax: "afirme_igual(esperado, obtido)\nafirme_igual(esperado, obtido, \"mensagem\")", example: "afirme_igual(5, soma(2, 3))\n", aliases: ["afirme_diferente"] },
  { name: "afirme_aproximado", category: "funcao", summary: "Falha o teste se |esperado − obtido| for maior que a tolerância. Use para números reais.", syntax: "afirme_aproximado(esperado, obtido, tolerancia)", example: "afirme_aproximado(2.5, media(2, 3), 0.001)\n" },
  { name: "saida", category: "funcao", summary: "Dentro de um teste: devolve tudo o que o código testado escreveu até agora. Com entrada(...) e executar_algoritmo() dá para testar o algoritmo inteiro. Quebras de linha: carac(10).", syntax: "saida()", example: "entrada(\"2\")\nentrada(\"3\")\nexecutar_algoritmo()\nafirme_igual(\"Soma:  5\" + carac(10), saida())\n" },
  { name: "entrada", category: "funcao", summary: "Dentro de um teste: fornece uma linha (ou várias) que os próximos leia vão ler. Chame uma vez por linha. Sem isso, um leia dentro de um teste dá erro.", syntax: "entrada(\"texto\")", example: "entrada(\"Ana\")\nentrada(\"20\")\n" },
  { name: "executar_algoritmo", category: "funcao", summary: "Dentro de um teste: executa o bloco inicio...fimalgoritmo do algoritmo (o do próprio arquivo, ou o do algoritmo importado pelo arquivo de testes). Combine com entrada(...) e saida().", syntax: "executar_algoritmo()", example: "executar_algoritmo()\n" },
  { name: "publico", category: "estrutura", summary: "Antes de uma linha de 'var' ou 'const', de um tipo, de uma função/procedimento, ou de um campo/método de classe: fica visível fora do arquivo (ou fora da classe). Sem 'publico', tudo é privado.", syntax: "publico funcao nome(...): tipo\npublico x: inteiro", example: "publico funcao dobro(n: inteiro): inteiro\n", aliases: ["privado"] },
  { name: "privado", category: "estrutura", summary: "Visível só no próprio arquivo, ou só dentro da classe e das classes que herdam dela. É o padrão.", example: "privado raio: real\n" },

  // ---- registros, classes e referências ----
  { name: "registro", category: "tipo", summary: "Agrupa campos em um novo tipo (seção 'tipo'). É um valor: copiado ao atribuir e ao passar sem 'var'. Começa com os campos zerados.", syntax: "tipo\n    Nome = registro\n        campo1: tipo\n        campo2: tipo\n    fimregistro", example: "tipo\n    Ponto = registro\n        x, y: real\n    fimregistro\n", aliases: ["fimregistro", "estrutura"] },
  { name: "classe", category: "tipo", summary: "Tipo com campos e métodos (seção 'tipo'). Dentro da classe ficam só os cabeçalhos; os corpos são escritos fora como 'funcao Classe.metodo'. Objetos são criados com 'novo' e compartilhados por referência.", syntax: "tipo\n    Nome = classe [herda Mae]\n        privado campo: tipo\n        publico procedimento iniciar(parametros)\n        publico funcao metodo(parametros): tipo\n    fimclasse\n\nprocedimento Nome.iniciar(parametros)\ninicio ... fimprocedimento", example: "tipo\n    Contador = classe\n        privado n: inteiro\n        publico funcao proximo(): inteiro\n    fimclasse\n\nfuncao Contador.proximo(): inteiro\ninicio\n    n <- n + 1\n    retorne n\nfimfuncao\n", aliases: ["fimclasse", "iniciar", "metodo", "método"] },
  { name: "herda", category: "tipo", summary: "A classe recebe os campos e métodos de outra. Um método com o mesmo cabeçalho sobrescreve o da mãe; a chamada usa sempre o método do objeto real.", syntax: "Filha = classe herda Mae ... fimclasse", example: "Circulo = classe herda Forma\n    privado raio: real\n    publico funcao area(): real\nfimclasse\n" },
  { name: "novo", category: "tipo", summary: "Cria um objeto de uma classe e chama o construtor 'iniciar' com os argumentos.", syntax: "variavel <- novo Classe(argumentos)", example: "f <- novo Circulo(2.0)\n" },
  { name: "este", category: "tipo", summary: "Dentro de um método, é o próprio objeto. Útil para distinguir um campo de um parâmetro com o mesmo nome.", syntax: "este.campo", example: "este.nome <- nome\n" },
  { name: "super", category: "tipo", summary: "Dentro de uma classe filha: 'super.iniciar(...)' (ou 'super(...)') chama o construtor da mãe, e 'super.metodo(...)' chama a versão da mãe de um método.", syntax: "super.iniciar(argumentos)\nsuper.metodo(argumentos)", example: "procedimento Circulo.iniciar(r: real)\ninicio\n    super.iniciar(\"círculo\")\n    raio <- r\nfimprocedimento\n" },
  { name: "nulo", category: "tipo", summary: "Valor de uma variável de classe ou ref que não aponta para nada (todo objeto começa nulo até receber 'novo'). Usar um objeto nulo dá erro; compare com '= nulo' antes.", syntax: "variavel = nulo", example: "se f = nulo entao\n    escreval(\"sem forma\")\nfimse\n" },
  { name: "ref", category: "tipo", summary: "Referência segura (um 'ponteiro' sem aritmética): guarda o endereço de uma variável, posição de vetor ou campo. Obtenha com & e acesse o alvo com *.", syntax: "r: ref tipo\nr <- &variavel\n*r <- valor", example: "var\n    n: inteiro\n    r: ref inteiro\ninicio\n    r <- &n\n    *r <- 20\n", aliases: ["ponteiro", "referencia", "referência"] },
  { name: "& (endereço)", category: "operador", summary: "Antes de uma variável, posição de vetor ou campo, produz uma referência (ref) para ela.", syntax: "&variavel  &vetor[i]  &objeto.campo", example: "r <- &total\n", aliases: ["&"] },
  { name: "* (acesso pela referência)", category: "operador", summary: "Antes de uma referência, acessa a variável apontada: '*r' lê e '*r <- v' escreve. Em referência nula dá erro de execução.", syntax: "*referencia", example: "*r <- *r + 1\n", aliases: ["*"] },
  { name: ". (campo e método)", category: "operador", summary: "Acessa um campo ou chama um método: 'p.x', 'c.area()'. Também qualifica nomes de módulo: 'geometria.area(2)'.", syntax: "objeto.campo\nobjeto.metodo(argumentos)\nmodulo.nome", example: "escreval(p.x, c.area())\n", aliases: ["."] },

  // ---- tipos ----
  { name: "inteiro", category: "tipo", summary: "Número inteiro: -3, 0, 42. Use 'div' ou '\\' para divisão inteira.", syntax: "nome: inteiro", example: "idade: inteiro\n" },
  { name: "real", category: "tipo", summary: "Número com casas decimais: 3.14. Ao escrever, use ponto.", syntax: "nome: real", example: "altura: real\n" },
  { name: "caractere", category: "tipo", summary: "Texto entre aspas duplas (também aceito como 'caracter' ou 'literal'). Junte textos com +.", syntax: "nome: caractere", example: "nome: caractere\n", aliases: ["caracter", "literal"] },
  { name: "logico", category: "tipo", summary: "Valor lógico: verdadeiro ou falso.", syntax: "nome: logico", example: "achou: logico\n" },
  { name: "verdadeiro", category: "tipo", summary: "Valor lógico 'sim'. É mostrado como VERDADEIRO.", example: "achou <- verdadeiro\n" },
  { name: "falso", category: "tipo", summary: "Valor lógico 'não'. É mostrado como FALSO.", example: "achou <- falso\n" },
  { name: "vetor", category: "tipo", summary: "Lista de valores com índices em um intervalo que você escolhe (ex.: 1..10). Matriz: dois intervalos separados por vírgula.", syntax: "nome: vetor[ini..fim] de tipo\nnome: vetor[1..L, 1..C] de tipo", example: "notas: vetor[1..5] de real\nm: vetor[1..2, 1..3] de inteiro\n", aliases: ["de", "matriz", "..", "[]"] },

  // ---- controle ----
  { name: "se", category: "controle", summary: "Executa os comandos somente se a condição for verdadeira. 'senao' trata o caso contrário. Termina com 'fimse'.", syntax: "se condicao entao\n    ...\nsenao\n    ...\nfimse", example: "se idade >= 18 entao\n    escreval(\"maior de idade\")\nsenao\n    escreval(\"menor de idade\")\nfimse\n", aliases: ["entao", "senao", "fimse"] },
  { name: "enquanto", category: "controle", summary: "Repete enquanto a condição for verdadeira (testa antes de cada repetição). Termina com 'fimenquanto'.", syntax: "enquanto condicao faca\n    ...\nfimenquanto", example: "i <- 1\nenquanto i <= 5 faca\n    escreval(i)\n    i <- i + 1\nfimenquanto\n", aliases: ["faca", "fimenquanto"] },
  { name: "para", category: "controle", summary: "Laço com contador: vai de um valor até outro, com 'passo' opcional (pode ser negativo). Termina com 'fimpara'.", syntax: "para i de inicio ate fim [passo p] faca\n    ...\nfimpara", example: "para i de 1 ate 10 faca\n    escreval(i)\nfimpara\n", aliases: ["ate", "passo", "fimpara"] },
  { name: "repita", category: "controle", summary: "Repete o bloco até que a condição se torne verdadeira. O bloco executa pelo menos uma vez.", syntax: "repita\n    ...\nate condicao", example: "repita\n    escreva(\"Digite 0 para sair: \")\n    leia(opcao)\nate opcao = 0\n", aliases: ["fimrepita"] },
  { name: "escolha", category: "controle", summary: "Compara um valor com vários 'caso' (valores, listas ou intervalos 'a'). 'outrocaso' trata os demais. Termina com 'fimescolha'.", syntax: "escolha valor\n    caso 1, 2\n        ...\n    caso 3 a 5\n        ...\n    outrocaso\n        ...\nfimescolha", example: "escolha opcao\n    caso 1\n        escreval(\"um\")\n    caso 2, 3\n        escreval(\"dois ou três\")\n    outrocaso\n        escreval(\"outro\")\nfimescolha\n", aliases: ["caso", "outrocaso", "fimescolha"] },
  { name: "interrompa", category: "controle", summary: "Sai imediatamente do laço (enquanto, para, repita) em que está.", syntax: "interrompa", example: "se x = 0 entao\n    interrompa\nfimse\n" },

  // ---- operadores ----
  { name: "<- (atribuição)", category: "operador", summary: "Guarda um valor na variável. Para comparar igualdade use '='.", syntax: "variavel <- valor", example: "total <- total + 1\n", aliases: ["<-", ":="] },
  { name: "+ - * /", category: "operador", summary: "Aritmética básica. '/' sempre dá resultado real; para inteiros use 'div' e 'mod'. Com textos, '+' junta.", example: "media <- soma / 2\n", aliases: ["+", "-", "*", "/"] },
  { name: "div", category: "operador", summary: "Divisão inteira (descarta o resto). Também pode ser escrita como '\\'.", example: "metade <- 7 div 2   // 3\n", aliases: ["\\"] },
  { name: "mod", category: "operador", summary: "Resto da divisão inteira. Também pode ser escrito como '%'.", example: "resto <- 7 mod 3   // 1\n", aliases: ["%"] },
  { name: "^ (potência)", category: "operador", summary: "Potenciação: base ^ expoente.", example: "quadrado <- x ^ 2\n", aliases: ["^"] },
  { name: "= <> < > <= >=", category: "operador", summary: "Comparação: igual, diferente, menor, maior, menor ou igual, maior ou igual. O resultado é lógico.", example: "se nota >= 7 e faltas < 10 entao\n", aliases: ["=", "<>", "<", ">", "<=", ">="] },
  { name: "e", category: "operador", summary: "E lógico: verdadeiro só se os dois lados forem verdadeiros.", example: "se idade >= 18 e idade < 65 entao\n" },
  { name: "ou", category: "operador", summary: "OU lógico: verdadeiro se pelo menos um dos lados for verdadeiro.", example: "se dia = 6 ou dia = 7 entao\n" },
  { name: "nao", category: "operador", summary: "NÃO lógico: inverte o valor.", example: "se nao achou entao\n" },
  { name: "xou", category: "operador", summary: "OU exclusivo: verdadeiro quando apenas um dos lados é verdadeiro.", example: "se a xou b entao\n" },

  // ---- entrada e saída ----
  { name: "escreva", category: "entrada-saida", summary: "Mostra valores no console, sem quebrar a linha ao final. Formate com :largura ou :largura:decimais.", syntax: "escreva(valor1, valor2, ...)\nescreva(x:8:2)", example: "escreva(\"Total: \", total:8:2)\n" },
  { name: "escreval", category: "entrada-saida", summary: "Igual a 'escreva', mas quebra a linha ao final.", syntax: "escreval(valor1, valor2, ...)", example: "escreval(\"Olá, \", nome)\n" },
  { name: "leia", category: "entrada-saida", summary: "Lê um valor digitado pelo usuário e guarda na variável (convertido para o tipo dela).", syntax: "leia(variavel1, variavel2, ...)", example: "escreva(\"Idade: \")\nleia(idade)\n" },
  { name: "limpatela", category: "entrada-saida", summary: "Limpa o console.", example: "limpatela\n" },
  { name: "pausa", category: "entrada-saida", summary: "Pausa a execução por alguns milissegundos (sem argumento, não espera).", syntax: "pausa(milissegundos)", example: "pausa(500)\n" },
  { name: "aleatorio", category: "outro", summary: "Comandos de ambiente do VisuAlg original (aleatorio, timer, eco, cronometro, debug, arquivo). São aceitos e ignorados nesta IDE.", syntax: "aleatorio on | off\ntimer on | off", example: "", aliases: ["timer", "eco", "cronometro", "debug", "arquivo", "on", "off"] },

  // ---- funções ----
  { name: "abs", category: "funcao", summary: "Valor absoluto (sem sinal).", syntax: "abs(x)", example: "d <- abs(-7)   // 7\n" },
  { name: "int", category: "funcao", summary: "Parte inteira de um número real (descarta as casas decimais).", syntax: "int(x): inteiro", example: "i <- int(3.9)   // 3\n" },
  { name: "raizq", category: "funcao", summary: "Raiz quadrada.", syntax: "raizq(x): real", example: "r <- raizq(16)   // 4\n" },
  { name: "quad", category: "funcao", summary: "Quadrado do número (x * x).", syntax: "quad(x)", example: "q <- quad(5)   // 25\n" },
  { name: "exp", category: "funcao", summary: "Base elevada ao expoente.", syntax: "exp(base, expoente): real", example: "p <- exp(2, 10)   // 1024\n" },
  { name: "log", category: "funcao", summary: "Logaritmo na base 10. 'logn' é o logaritmo natural (base e).", syntax: "log(x): real\nlogn(x): real", example: "l <- log(1000)   // 3\n", aliases: ["logn"] },
  { name: "pi", category: "funcao", summary: "Valor de π (3,14159…).", syntax: "pi(): real", example: "area <- pi() * r ^ 2\n" },
  { name: "sen", category: "funcao", summary: "Trigonometria (ângulo em radianos): sen, cos, tan, cotan, arcsen, arccos, arctan.", syntax: "sen(x): real", example: "s <- sen(pi() / 2)   // 1\n", aliases: ["cos", "tan", "cotan", "arcsen", "arccos", "arctan"] },
  { name: "grauprad", category: "funcao", summary: "Converte graus em radianos. 'radpgrau' faz o inverso.", syntax: "grauprad(graus): real", example: "r <- grauprad(180)   // 3.14159...\n", aliases: ["radpgrau"] },
  { name: "rand", category: "funcao", summary: "Número real aleatório entre 0 e 1. 'randi(n)' dá um inteiro aleatório de 0 a n-1.", syntax: "rand(): real\nrandi(n): inteiro", example: "dado <- randi(6) + 1\n", aliases: ["randi"] },
  { name: "compr", category: "funcao", summary: "Quantidade de caracteres de um texto.", syntax: "compr(texto): inteiro", example: "n <- compr(\"VisuAlg\")   // 7\n" },
  { name: "copia", category: "funcao", summary: "Parte do texto a partir da posição (a primeira é 1) com o tamanho indicado.", syntax: "copia(texto, posicao, tamanho): caractere", example: "s <- copia(\"VisuAlg\", 1, 4)   // \"Visu\"\n" },
  { name: "pos", category: "funcao", summary: "Posição em que um trecho aparece no texto (0 se não aparecer).", syntax: "pos(trecho, texto): inteiro", example: "p <- pos(\"Alg\", \"VisuAlg\")   // 5\n" },
  { name: "maiusc", category: "funcao", summary: "Converte para MAIÚSCULAS. 'minusc' converte para minúsculas.", syntax: "maiusc(texto): caractere", example: "s <- maiusc(\"olá\")\n", aliases: ["minusc"] },
  { name: "asc", category: "funcao", summary: "Código numérico de um caractere. 'carac' faz o inverso (código → caractere).", syntax: "asc(c): inteiro\ncarac(codigo): caractere", example: "c <- carac(65)   // \"A\"\n", aliases: ["carac"] },
  { name: "numpcarac", category: "funcao", summary: "Converte número em texto. 'caracpnum' converte texto em número.", syntax: "numpcarac(x): caractere\ncaracpnum(texto): real", example: "s <- numpcarac(42) + \"!\"\n", aliases: ["caracpnum"] },
];

export const REFERENCE: Record<Lang, RefEntry[]> = { studio: STUDIO, visualg: VISUALG };

export const CATEGORIES: RefCategory[] = ["estrutura", "tipo", "controle", "operador", "entrada-saida", "funcao", "outro"];

const indexCache = new Map<Lang, Map<string, RefEntry>>();

/** Nome de entrada no idioma: traduz cada palavra canônica (ex.: "Matematica.raiz", "inclua biblioteca"). */
export function localizeName(lang: Lang, locale: Locale, name: string): string {
  if (locale === "pt-BR") return name;
  return name.replace(/[\p{L}_][\p{L}\p{N}_]*/gu, (w) => word(lang, locale, w));
}

/** Entrada pronta para exibir no idioma: nome e apelidos traduzidos, resumo do dicionário, código convertido. */
export function localizeEntry(lang: Lang, locale: Locale, e: RefEntry): RefEntry {
  if (locale === "pt-BR") return e;
  const tr = REF_I18N[locale]?.[`${lang}:${e.name}`];
  return {
    ...e,
    name: localizeName(lang, locale, e.name),
    summary: tr?.summary ?? e.summary,
    syntax: tr?.syntax ?? (e.syntax ? translateSource(lang, e.syntax, "pt-BR", locale) : undefined),
    example: e.example ? translateSource(lang, e.example, "pt-BR", locale) : undefined,
    aliases: e.aliases?.map((a) => localizeName(lang, locale, a)),
  };
}

/** Encontra a entrada para uma palavra do código (nome, apelido ou primeira palavra do nome), no idioma dado ou em português. */
export function findReference(lang: Lang, word: string, locale: Locale = "pt-BR"): RefEntry | null {
  const key0 = lang === "visualg" ? word.toLowerCase() : word;
  const canon = toCanonicalMap(lang, locale)?.get(key0) ?? word;
  const found = findCanonical(lang, canon);
  return found ? localizeEntry(lang, locale, found) : null;
}

function findCanonical(lang: Lang, word: string): RefEntry | null {
  let idx = indexCache.get(lang);
  if (!idx) {
    idx = new Map();
    const put = (k: string, e: RefEntry) => { const key = lang === "visualg" ? k.toLowerCase() : k; if (!idx!.has(key)) idx!.set(key, e); };
    for (const e of REFERENCE[lang]) {
      put(e.name, e);
      const first = e.name.split(/[\s(]/)[0];
      if (first) put(first, e);
      for (const a of e.aliases ?? []) put(a, e);
    }
    indexCache.set(lang, idx);
  }
  return idx.get(lang === "visualg" ? word.toLowerCase() : word) ?? null;
}
