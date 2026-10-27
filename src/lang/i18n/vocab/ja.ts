import type { Vocabulary } from "../index";

/**
 * Japonês. Palavras canônicas (português) → japonês. Cada valor deve ser único dentro da linguagem.
 * Escolhas inspiradas no DNCL e em なでしこ: もし / ならば / でなければ, 間 (enquanto), 繰返 (para), 表示 / 読込,
 * 整数 / 実数 / 文字列 / 論理, 真 / 偽. Blocos do VisuAlg fecham com o sufixo 終 (もし終, 間終, 繰返終...).
 * Abreviações matemáticas internacionais (abs, cos, exp, log, pi, int, div, mod) ficam como estão.
 */
export const VOCAB_JA: Vocabulary = {
  studio: {
    programa: "プログラム", funcao: "関数", inclua: "使用", biblioteca: "ライブラリ", const: "定数",
    inteiro: "整数", real: "実数", cadeia: "文字列", caracter: "文字", logico: "論理", vazio: "空",
    se: "もし", senao: "でなければ", enquanto: "間", faca: "実行", para: "繰返", escolha: "選択", caso: "場合", contrario: "他",
    pare: "中断", retorne: "戻す", verdadeiro: "真", falso: "偽", e: "かつ", ou: "または", nao: "非",
    modulo: "モジュール", importe: "取込", publico: "公開", privado: "非公開", estrutura: "構造体", classe: "クラス", herda: "継承",
    este: "自身", super: "親", nulo: "無", ref: "参照", teste: "テスト",
    inicio: "開始",
    escreva: "表示", leia: "読込", limpa: "消去", afirme: "確認", afirme_igual: "確認_等しい", afirme_diferente: "確認_異なる",
    afirme_aproximado: "確認_近似", saida: "出力", entrada: "入力",
    Matematica: "数学", Texto: "テキスト", Util: "ユーティリティ", Tipos: "型",
    PI: "PI", E: "E", raiz: "根", potencia: "累乗", arredondar: "丸め", valor_absoluto: "絶対値", seno: "正弦", cosseno: "余弦",
    tangente: "正接", logaritmo: "対数", maior_numero: "最大", menor_numero: "最小",
    numero_caracteres: "文字数", caixa_alta: "大文字", caixa_baixa: "小文字", obter_caractere: "文字取得", posicao_texto: "位置",
    substituir: "置換", extrair_subtexto: "部分文字列", preencher_a_esquerda: "左埋め", preencher_a_direita: "右埋め", inverter: "反転",
    remover_espacos: "空白除去", aguarde: "待機", sorteia: "乱数", tempo_decorrido: "経過時間", numero_elementos: "要素数", numero_linhas: "行数",
    numero_colunas: "列数",
    inteiro_para_cadeia: "整数から文字列", inteiro_para_real: "整数から実数", inteiro_para_caracter: "整数から文字", inteiro_para_logico: "整数から論理",
    real_para_cadeia: "実数から文字列", real_para_inteiro: "実数から整数", cadeia_para_inteiro: "文字列から整数", cadeia_para_real: "文字列から実数",
    cadeia_para_caracter: "文字列から文字", cadeia_para_logico: "文字列から論理", caracter_para_cadeia: "文字から文字列", caracter_para_inteiro: "文字から整数",
    logico_para_cadeia: "論理から文字列", logico_para_inteiro: "論理から整数", e_inteiro: "整数か", e_real: "実数か",
  },
  visualg: {
    algoritmo: "アルゴリズム", var: "変数", inicio: "開始", fimalgoritmo: "アルゴリズム終", const: "定数",
    inteiro: "整数", real: "実数", caractere: "文字列", caracter: "文字", literal: "リテラル", logico: "論理", vetor: "配列", de: "から",
    se: "もし", entao: "ならば", senao: "でなければ", fimse: "もし終", enquanto: "間", faca: "実行", fimenquanto: "間終",
    para: "繰返", ate: "まで", passo: "刻み", fimpara: "繰返終", repita: "反復", fimrepita: "反復終",
    escolha: "選択", caso: "場合", outrocaso: "他", fimescolha: "選択終",
    funcao: "関数", fimfuncao: "関数終", procedimento: "手続き", fimprocedimento: "手続き終", retorne: "戻す", interrompa: "中断",
    e: "かつ", ou: "または", nao: "非", xou: "排他または", div: "div", mod: "mod", verdadeiro: "真", falso: "偽",
    escreva: "表示", escreval: "表示改行", leia: "読込", limpatela: "画面消去", pausa: "一時停止", aleatorio: "乱数", timer: "タイマー", eco: "エコー",
    cronometro: "計時", debug: "デバッグ", arquivo: "ファイル", on: "オン", off: "オフ",
    tipo: "型", registro: "レコード", fimregistro: "レコード終", dos: "より",
    modulo: "モジュール", fimmodulo: "モジュール終", importe: "取込", como: "として", publico: "公開", privado: "非公開",
    classe: "クラス", fimclasse: "クラス終", herda: "継承", novo: "新規", este: "自身", super: "親", nulo: "無", ref: "参照",
    teste: "テスト", fimteste: "テスト終",
    iniciar: "初期化",
    abs: "abs", arccos: "arccos", arcsen: "arcsin", arctan: "arctan", cos: "cos", cotan: "cot", exp: "exp", grauprad: "度からラジアン", int: "int",
    log: "log", logn: "ln", pi: "pi", quad: "二乗", radpgrau: "ラジアンから度", raizq: "平方根", rand: "rand", randi: "randi", sen: "sin", tan: "tan",
    asc: "文字からコード", carac: "コードから文字", caracpnum: "文字列から数値", compr: "長さ", copia: "部分文字列", maiusc: "大文字", minusc: "小文字",
    numpcarac: "数値から文字列", pos: "位置",
    afirme: "確認", afirme_igual: "確認_等しい", afirme_diferente: "確認_異なる", afirme_aproximado: "確認_近似", saida: "出力", entrada: "入力",
    executar_algoritmo: "アルゴリズム実行",
  },
};
