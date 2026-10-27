import type { Vocabulary } from "../index";

/**
 * Grego moderno. Palavras canônicas (português) → grego. Cada valor deve ser único
 * Inspirado no vocabulário da ΓΛΩΣΣΑ escolar grega
 * (πρόγραμμα, αν, τότε, αλλιώς, όσο, για, γράψε, διάβασε, αληθής, ψευδής…), em minúsculas com acentos.
 */
export const VOCAB_EL: Vocabulary = {
  programa: "πρόγραμμα", funcao: "συνάρτηση", inclua: "συμπερίλαβε", biblioteca: "βιβλιοθήκη", const: "σταθερά",
  inteiro: "ακέραιος", real: "πραγματικός", cadeia: "συμβολοσειρά", caracter: "χαρακτήρας", logico: "λογικός", vazio: "κενό",
  se: "αν", senao: "αλλιώς", enquanto: "όσο", faca: "κάνε", para: "για", escolha: "επίλεξε", caso: "περίπτωση", contrario: "διαφορετικά",
  pare: "σταμάτα", retorne: "επίστρεψε", verdadeiro: "αληθής", falso: "ψευδής", e: "και", ou: "ή", nao: "όχι",
  modulo: "ενότητα", importe: "εισήγαγε", publico: "δημόσιο", privado: "ιδιωτικό", estrutura: "δομή", classe: "κλάση", herda: "κληρονομεί",
  este: "αυτό", super: "γονέας", nulo: "τίποτα", ref: "αναφορά", teste: "δοκιμή",
  inicio: "αρχή",
  escreva: "γράψε", leia: "διάβασε", limpa: "καθάρισε", afirme: "βεβαίωσε", afirme_igual: "βεβαίωσε_ίσο", afirme_diferente: "βεβαίωσε_διάφορο",
  afirme_aproximado: "βεβαίωσε_περίπου", saida: "έξοδος", entrada: "είσοδος",
  Matematica: "Μαθηματικά", Texto: "Κείμενο", Util: "Εργαλεία", Tipos: "Τύποι",
  PI: "PI", E: "E", raiz: "ρίζα", potencia: "δύναμη", arredondar: "στρογγυλοποίησε", valor_absoluto: "απόλυτη_τιμή", seno: "ημίτονο", cosseno: "συνημίτονο",
  tangente: "εφαπτομένη", logaritmo: "λογάριθμος", maior_numero: "μέγιστο", menor_numero: "ελάχιστο",
  numero_caracteres: "μήκος", caixa_alta: "κεφαλαία", caixa_baixa: "πεζά", obter_caractere: "χαρακτήρας_θέσης", posicao_texto: "θέση_κειμένου",
  substituir: "αντικατάστησε", extrair_subtexto: "τμήμα_κειμένου", preencher_a_esquerda: "γέμισε_αριστερά", preencher_a_direita: "γέμισε_δεξιά", inverter: "αντίστρεψε",
  remover_espacos: "αφαίρεσε_κενά", aguarde: "περίμενε", sorteia: "τυχαίος", tempo_decorrido: "χρόνος_που_πέρασε", numero_elementos: "πλήθος_στοιχείων", numero_linhas: "πλήθος_γραμμών",
  numero_colunas: "πλήθος_στηλών",
  inteiro_para_cadeia: "ακέραιος_σε_συμβολοσειρά", inteiro_para_real: "ακέραιος_σε_πραγματικό", inteiro_para_caracter: "ακέραιος_σε_χαρακτήρα", inteiro_para_logico: "ακέραιος_σε_λογικό",
  real_para_cadeia: "πραγματικός_σε_συμβολοσειρά", real_para_inteiro: "πραγματικός_σε_ακέραιο", cadeia_para_inteiro: "συμβολοσειρά_σε_ακέραιο", cadeia_para_real: "συμβολοσειρά_σε_πραγματικό",
  cadeia_para_caracter: "συμβολοσειρά_σε_χαρακτήρα", cadeia_para_logico: "συμβολοσειρά_σε_λογικό", caracter_para_cadeia: "χαρακτήρας_σε_συμβολοσειρά", caracter_para_inteiro: "χαρακτήρας_σε_ακέραιο",
  logico_para_cadeia: "λογικός_σε_συμβολοσειρά", logico_para_inteiro: "λογικός_σε_ακέραιο", e_inteiro: "είναι_ακέραιος", e_real: "είναι_πραγματικός",
};
