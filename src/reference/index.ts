/**
 * Referência das palavras reservadas, comandos e funções do Koiné.
 * Usada no painel lateral "Referência" e nas dicas ao passar o mouse no editor.
 */
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

// ======================= entradas =======================
export const REFERENCE: RefEntry[] = [
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
  { name: "importe", category: "estrutura", summary: "Traz para este arquivo tudo o que outro módulo do projeto declarou como 'publico'. Use pelo nome do módulo ou pelo caminho do arquivo; '--> apelido' dá um nome curto.", syntax: "importe Nome\nimporte \"pasta/arquivo.koi\" --> apelido", example: "importe Geometria\n" },
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



export const CATEGORIES: RefCategory[] = ["estrutura", "tipo", "controle", "operador", "entrada-saida", "funcao", "outro"];

let indexCache: Map<string, RefEntry> | null = null;

/** Nome de entrada no idioma: traduz cada palavra canônica (ex.: "Matematica.raiz", "inclua biblioteca"). */
export function localizeName(locale: Locale, name: string): string {
  if (locale === "pt-BR") return name;
  return name.replace(/[\p{L}_][\p{L}\p{N}_]*/gu, (w) => word(locale, w));
}

/** Entrada pronta para exibir no idioma: nome e apelidos traduzidos, resumo do dicionário, código convertido. */
export function localizeEntry(locale: Locale, e: RefEntry): RefEntry {
  if (locale === "pt-BR") return e;
  const tr = REF_I18N[locale]?.[e.name];
  return {
    ...e,
    name: localizeName(locale, e.name),
    summary: tr?.summary ?? e.summary,
    syntax: tr?.syntax ?? (e.syntax ? translateSource(e.syntax, "pt-BR", locale) : undefined),
    example: e.example ? translateSource(e.example, "pt-BR", locale) : undefined,
    aliases: e.aliases?.map((a) => localizeName(locale, a)),
  };
}

/** Encontra a entrada para uma palavra do código (nome, apelido ou primeira palavra do nome), no idioma dado ou em português. */
export function findReference(word: string, locale: Locale = "pt-BR"): RefEntry | null {
  const canon = toCanonicalMap(locale)?.get(word) ?? word;
  const found = findCanonical(canon);
  return found ? localizeEntry(locale, found) : null;
}

function findCanonical(word: string): RefEntry | null {
  if (!indexCache) {
    const idx = (indexCache = new Map());
    const put = (k: string, e: RefEntry) => { if (!idx.has(k)) idx.set(k, e); };
    for (const e of REFERENCE) {
      put(e.name, e);
      const first = e.name.split(/[\s(]/)[0];
      if (first) put(first, e);
      for (const a of e.aliases ?? []) put(a, e);
    }
  }
  return indexCache.get(word) ?? null;
}
