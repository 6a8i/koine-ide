import type { Vocabulary } from "../index";

/**
 * Grego moderno. Palavras canônicas (português) → grego. Cada valor deve ser único dentro da linguagem
 * (no VisuAlg, sem distinguir maiúsculas). Inspirado no vocabulário da ΓΛΩΣΣΑ escolar grega
 * (πρόγραμμα, αν, τότε, αλλιώς, όσο, για, γράψε, διάβασε, αληθής, ψευδής…), em minúsculas com acentos.
 */
export const VOCAB_EL: Vocabulary = {
  studio: {
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
  },
  visualg: {
    algoritmo: "αλγόριθμος", var: "μεταβλητές", inicio: "αρχή", fimalgoritmo: "τέλος_αλγορίθμου", const: "σταθερές",
    inteiro: "ακέραιος", real: "πραγματικός", caractere: "συμβολοσειρά", caracter: "κείμενο", literal: "αλφαριθμητικό", logico: "λογικός", vetor: "πίνακας", de: "από",
    se: "αν", entao: "τότε", senao: "αλλιώς", fimse: "τέλος_αν", enquanto: "όσο", faca: "επανάλαβε", fimenquanto: "τέλος_όσο",
    para: "για", ate: "μέχρι", passo: "βήμα", fimpara: "τέλος_για", repita: "αρχή_επανάληψης", fimrepita: "τέλος_επανάληψης",
    escolha: "επίλεξε", caso: "περίπτωση", outrocaso: "διαφορετικά", fimescolha: "τέλος_επιλογής",
    funcao: "συνάρτηση", fimfuncao: "τέλος_συνάρτησης", procedimento: "διαδικασία", fimprocedimento: "τέλος_διαδικασίας", retorne: "επίστρεψε", interrompa: "διέκοψε",
    e: "και", ou: "ή", nao: "όχι", xou: "είτε", div: "div", mod: "mod", verdadeiro: "αληθής", falso: "ψευδής",
    escreva: "γράψε", escreval: "γράψε_γραμμή", leia: "διάβασε", limpatela: "καθάρισε_οθόνη", pausa: "παύση", aleatorio: "τυχαίο", timer: "χρονοδιακόπτης", eco: "ηχώ",
    cronometro: "χρονόμετρο", debug: "αποσφαλμάτωση", arquivo: "αρχείο", on: "ενεργό", off: "ανενεργό",
    tipo: "τύπος", registro: "εγγραφή", fimregistro: "τέλος_εγγραφής", dos: "των",
    modulo: "ενότητα", fimmodulo: "τέλος_ενότητας", importe: "εισήγαγε", como: "ως", publico: "δημόσιο", privado: "ιδιωτικό",
    classe: "κλάση", fimclasse: "τέλος_κλάσης", herda: "κληρονομεί", novo: "νέο", este: "αυτό", super: "γονέας", nulo: "τίποτα", ref: "αναφορά",
    teste: "δοκιμή", fimteste: "τέλος_δοκιμής",
    iniciar: "αρχικοποίηση",
    abs: "abs", arccos: "arccos", arcsen: "arcsin", arctan: "arctan", cos: "cos", cotan: "cot", exp: "exp", grauprad: "μοίρες_σε_ακτίνια", int: "int",
    log: "log", logn: "ln", pi: "pi", quad: "τετράγωνο", radpgrau: "ακτίνια_σε_μοίρες", raizq: "ρίζα", rand: "rand", randi: "randi", sen: "sin", tan: "tan",
    asc: "κωδικός", carac: "χαρακτήρας", caracpnum: "κείμενο_σε_αριθμό", compr: "μήκος", copia: "αντιγραφή", maiusc: "κεφαλαία", minusc: "πεζά", numpcarac: "αριθμός_σε_κείμενο", pos: "θέση",
    afirme: "βεβαίωσε", afirme_igual: "βεβαίωσε_ίσο", afirme_diferente: "βεβαίωσε_διάφορο", afirme_aproximado: "βεβαίωσε_περίπου", saida: "έξοδος", entrada: "είσοδος",
    executar_algoritmo: "εκτέλεσε_αλγόριθμο",
  },
};
