/**
 * Utilitário de Data/Hora no fuso horário de Brasília (America/Sao_Paulo, UTC-3).
 * Use SEMPRE estas funções para qualquer lógica que dependa da data/hora "de hoje"
 * no back-end, para evitar que o servidor (UTC) retorne um dia errado.
 */

const TZ_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3 (Brasília)

/**
 * Retorna um objeto Date ajustado para o horário de Brasília.
 * Útil quando você precisa chamar .getDay(), .getHours(), .getMonth() etc.
 */
export function nowInBrasilia(): Date {
  return new Date(Date.now() + TZ_OFFSET_MS);
}

/**
 * Retorna a data de hoje no formato "YYYY-MM-DD" no fuso de Brasília.
 * Substitui: new Date().toISOString().split('T')[0]
 */
export function todayInBrasilia(): string {
  return nowInBrasilia().toISOString().split('T')[0];
}

/**
 * Retorna o dia da semana (0=Dom, 1=Seg ... 6=Sáb) no fuso de Brasília.
 * Substitui: new Date().getDay()
 */
export function dayOfWeekInBrasilia(): number {
  return nowInBrasilia().getUTCDay();
}

/**
 * Retorna o mês atual no formato "YYYY-MM" no fuso de Brasília.
 * Substitui: new Date().toISOString().slice(0, 7)
 */
export function currentMonthInBrasilia(): string {
  return nowInBrasilia().toISOString().slice(0, 7);
}

/**
 * Dado um Date qualquer (ex: data de pagamento), retorna o dia da semana
 * correto para Brasília. Importante para cálculos baseados em datas relativas.
 */
export function getDayOfWeekBrasilia(date: Date): number {
  const brasilia = new Date(date.getTime() + TZ_OFFSET_MS);
  return brasilia.getUTCDay();
}
