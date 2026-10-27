import type { Vocabulary } from "../index";

/** Inglês. Palavras canônicas (português) → inglês. Cada valor deve ser único. */
export const VOCAB_EN: Vocabulary = {
  programa: "program", funcao: "function", inclua: "include", biblioteca: "library", const: "const",
  inteiro: "integer", real: "real", cadeia: "string", caracter: "char", logico: "boolean", vazio: "void",
  se: "if", senao: "else", enquanto: "while", faca: "do", para: "for", escolha: "switch", caso: "case", contrario: "default",
  pare: "break", retorne: "return", verdadeiro: "true", falso: "false", e: "and", ou: "or", nao: "not",
  modulo: "module", importe: "import", publico: "public", privado: "private", estrutura: "struct", classe: "class", herda: "extends",
  este: "this", super: "super", nulo: "null", ref: "ref", teste: "test",
  inicio: "main",
  escreva: "write", leia: "read", limpa: "clear", afirme: "assert", afirme_igual: "assert_equal", afirme_diferente: "assert_not_equal",
  afirme_aproximado: "assert_near", saida: "output", entrada: "input",
  Matematica: "Math", Texto: "Text", Util: "Util", Tipos: "Types",
  PI: "PI", E: "E", raiz: "root", potencia: "power", arredondar: "round", valor_absoluto: "absolute_value", seno: "sine", cosseno: "cosine",
  tangente: "tangent", logaritmo: "logarithm", maior_numero: "maximum", menor_numero: "minimum",
  numero_caracteres: "length", caixa_alta: "upper_case", caixa_baixa: "lower_case", obter_caractere: "char_at", posicao_texto: "index_of",
  substituir: "replace", extrair_subtexto: "substring", preencher_a_esquerda: "pad_left", preencher_a_direita: "pad_right", inverter: "reverse",
  remover_espacos: "trim", aguarde: "wait", sorteia: "random", tempo_decorrido: "elapsed_time", numero_elementos: "count", numero_linhas: "rows",
  numero_colunas: "columns",
  inteiro_para_cadeia: "integer_to_string", inteiro_para_real: "integer_to_real", inteiro_para_caracter: "integer_to_char", inteiro_para_logico: "integer_to_boolean",
  real_para_cadeia: "real_to_string", real_para_inteiro: "real_to_integer", cadeia_para_inteiro: "string_to_integer", cadeia_para_real: "string_to_real",
  cadeia_para_caracter: "string_to_char", cadeia_para_logico: "string_to_boolean", caracter_para_cadeia: "char_to_string", caracter_para_inteiro: "char_to_integer",
  logico_para_cadeia: "boolean_to_string", logico_para_inteiro: "boolean_to_integer", e_inteiro: "is_integer", e_real: "is_real",
};
