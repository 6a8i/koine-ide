import type { Vocabulary } from "../index";

/** Coreano. Palavras canônicas (português) → coreano (hangul). Cada valor deve ser único. */
export const VOCAB_KO: Vocabulary = {
  programa: "프로그램", funcao: "함수", inclua: "포함", biblioteca: "라이브러리", const: "상수",
  inteiro: "정수", real: "실수", cadeia: "문자열", caracter: "문자", logico: "논리", vazio: "없음",
  se: "만약", senao: "아니면", enquanto: "동안", faca: "실행", para: "반복", escolha: "선택", caso: "경우", contrario: "그외",
  pare: "중단", retorne: "반환", verdadeiro: "참", falso: "거짓", e: "그리고", ou: "또는", nao: "아님",
  modulo: "모듈", importe: "가져오기", publico: "공개", privado: "비공개", estrutura: "구조체", classe: "클래스", herda: "상속",
  este: "자신", super: "부모", nulo: "널", ref: "참조", teste: "테스트",
  inicio: "시작",
  escreva: "출력", leia: "입력", limpa: "지우기", afirme: "확인", afirme_igual: "확인_같음", afirme_diferente: "확인_다름",
  afirme_aproximado: "확인_근사", saida: "출력내용", entrada: "입력내용",
  Matematica: "수학", Texto: "텍스트", Util: "유틸", Tipos: "자료형",
  PI: "PI", E: "E", raiz: "거듭제곱근", potencia: "거듭제곱", arredondar: "반올림", valor_absoluto: "절댓값", seno: "사인", cosseno: "코사인",
  tangente: "탄젠트", logaritmo: "로그", maior_numero: "최댓값", menor_numero: "최솟값",
  numero_caracteres: "글자수", caixa_alta: "대문자", caixa_baixa: "소문자", obter_caractere: "문자얻기", posicao_texto: "위치찾기",
  substituir: "바꾸기", extrair_subtexto: "부분문자열", preencher_a_esquerda: "왼쪽채우기", preencher_a_direita: "오른쪽채우기", inverter: "뒤집기",
  remover_espacos: "공백제거", aguarde: "대기", sorteia: "난수", tempo_decorrido: "경과시간", numero_elementos: "원소수", numero_linhas: "행수",
  numero_colunas: "열수",
  inteiro_para_cadeia: "정수를_문자열로", inteiro_para_real: "정수를_실수로", inteiro_para_caracter: "정수를_문자로", inteiro_para_logico: "정수를_논리로",
  real_para_cadeia: "실수를_문자열로", real_para_inteiro: "실수를_정수로", cadeia_para_inteiro: "문자열을_정수로", cadeia_para_real: "문자열을_실수로",
  cadeia_para_caracter: "문자열을_문자로", cadeia_para_logico: "문자열을_논리로", caracter_para_cadeia: "문자를_문자열로", caracter_para_inteiro: "문자를_정수로",
  logico_para_cadeia: "논리를_문자열로", logico_para_inteiro: "논리를_정수로", e_inteiro: "정수인가", e_real: "실수인가",
};
