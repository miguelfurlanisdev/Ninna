/**
 * ============================================================
 *  NINNA — Cálculos de gestação e ciclo menstrual
 * ============================================================
 *  Este arquivo é usado TANTO pelo servidor quanto pelo navegador
 *  (por isso fica na pasta /shared). Assim o cálculo é idêntico nos dois.
 *
 *  Todas as datas trafegam como texto "AAAA-MM-DD" e são calculadas em UTC
 *  (meio-dia) para evitar erros de fuso horário / horário de verão.
 *
 *  ⚠️ São ESTIMATIVAS. A datação oficial é feita pela equipe de saúde
 *  (ex.: ultrassom). Nunca apresente como diagnóstico.
 * ============================================================
 */

const DAY = 86400000;

/** 🔧 EDITAR: duração padrão da gestação (em dias) a partir da DUM. */
export const GESTATION_DAYS = 280; // 40 semanas

/** Converte "AAAA-MM-DD" em timestamp UTC (meio-dia). Retorna null se inválida. */
export function parseISO(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const [y, m, d] = str.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d, 12);
  const check = new Date(t);
  // Rejeita datas impossíveis como 2026-02-31
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return t;
}

/** Converte timestamp UTC em "AAAA-MM-DD". */
export function toISO(t) {
  return new Date(t).toISOString().slice(0, 10);
}

/** Soma dias a uma data ISO. */
export function addDays(iso, n) {
  return toISO(parseISO(iso) + n * DAY);
}

/** Diferença em dias (b - a). */
export function diffDays(isoA, isoB) {
  return Math.round((parseISO(isoB) - parseISO(isoA)) / DAY);
}

/** Data de hoje (AAAA-MM-DD) no fuso informado. 🔧 EDITAR: fuso padrão do Brasil. */
export function todayISO(tz = 'America/Sao_Paulo', now = new Date()) {
  // "en-CA" formata como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
}

/** Data provável do parto (DPP) = DUM + 280 dias (regra de Naegele em dias). */
export function dppFromLMP(lmp) {
  return addDays(lmp, GESTATION_DAYS);
}

/** DUM equivalente a partir de uma DPP informada por profissional. */
export function lmpFromDPP(dpp) {
  return addDays(dpp, -GESTATION_DAYS);
}

/** DUM equivalente a partir de uma idade gestacional conhecida (semanas + dias) em "hoje". */
export function lmpFromGA(weeks, days, today) {
  return addDays(today, -(weeks * 7 + days));
}

/**
 * Idade gestacional em uma data de referência.
 * @returns {{totalDays:number, weeks:number, days:number, dpp:string, daysToDpp:number,
 *            trimester:1|2|3, week:number, status:'future'|'ongoing'|'overdue'}}
 *  - `week` é a semana "em curso" (1–42), ex.: 12s3d → estamos na semana 13 do calendário,
 *    mas o rótulo clássico usado nos apps é "12 semanas e 3 dias". Usamos `weeks` (12) para
 *    escolher o conteúdo semanal (semana 12), que é o padrão dos acompanhamentos.
 */
export function gestationFromLMP(lmp, today) {
  const totalDays = diffDays(lmp, today);
  const dpp = dppFromLMP(lmp);
  const weeks = Math.floor(totalDays / 7);
  const days = ((totalDays % 7) + 7) % 7;
  let status = 'ongoing';
  if (totalDays < 0) status = 'future';
  else if (totalDays > GESTATION_DAYS + 14) status = 'overdue'; // além de 42 semanas
  return {
    totalDays,
    weeks,
    days,
    dpp,
    daysToDpp: diffDays(today, dpp),
    trimester: trimesterOfWeek(weeks),
    week: Math.min(Math.max(weeks, 1), 42),
    status,
    percent: Math.max(0, Math.min(100, (totalDays / GESTATION_DAYS) * 100)),
  };
}

/** 1º tri: até 13s6d · 2º tri: 14s–27s6d · 3º tri: a partir de 28s. */
export function trimesterOfWeek(weeks) {
  if (weeks < 14) return 1;
  if (weeks < 28) return 2;
  return 3;
}

/**
 * Resolve a DUM "canônica" a partir do que a usuária informou.
 * Prioridade: DPP de profissional > idade gestacional informada > DUM.
 * Se mais de uma fonte for informada e elas divergirem > 14 dias, devolve `conflict`.
 *
 * @param {{lmp?:string, dpp?:string, gaWeeks?:number, gaDays?:number}} input
 * @param {string} today
 * @returns {{lmp:string|null, source:'dpp'|'ga'|'lmp'|null, conflict:null|{a:string,b:string,diff:number}}}
 */
export function resolveDating(input, today) {
  const candidates = [];
  if (input.dpp && parseISO(input.dpp)) candidates.push({ source: 'dpp', lmp: lmpFromDPP(input.dpp) });
  if (Number.isInteger(input.gaWeeks) && input.gaWeeks >= 0 && input.gaWeeks <= 42) {
    const d = Number.isInteger(input.gaDays) ? Math.min(Math.max(input.gaDays, 0), 6) : 0;
    candidates.push({ source: 'ga', lmp: lmpFromGA(input.gaWeeks, d, today) });
  }
  if (input.lmp && parseISO(input.lmp)) candidates.push({ source: 'lmp', lmp: input.lmp });
  if (!candidates.length) return { lmp: null, source: null, conflict: null };

  const main = candidates[0];
  let conflict = null;
  for (const other of candidates.slice(1)) {
    const diff = Math.abs(diffDays(main.lmp, other.lmp));
    if (diff > 14) { conflict = { a: main.source, b: other.source, diff }; break; }
  }
  return { lmp: main.lmp, source: main.source, conflict };
}

/** Valida se uma DUM é plausível (não no futuro e não há mais de 44 semanas). */
export function isPlausibleLMP(lmp, today) {
  if (!parseISO(lmp)) return false;
  const d = diffDays(lmp, today);
  return d >= 0 && d <= 44 * 7;
}

/**
 * Estimativa de fases do ciclo (para quem está tentando engravidar).
 * ⚠️ PREVISÃO baseada em média: não confirma ovulação nem fertilidade.
 *
 * @param {string} lmp  primeiro dia da última menstruação
 * @param {number} cycleLength  duração média do ciclo (21–45 dias)
 * @param {string} today
 * @returns {{cycleDay:number, phase:string, periodStart:string, periodEnd:string,
 *            ovulation:string, fertileStart:string, fertileEnd:string,
 *            nextPeriod:string, daysToNextPeriod:number}}
 */
export function cycleEstimate(lmp, cycleLength, today) {
  const len = Math.min(Math.max(Math.round(cycleLength) || 28, 21), 45);
  const sinceLmp = diffDays(lmp, today);
  // Projeta o ciclo atual (caso a DUM seja antiga, avança em múltiplos do ciclo)
  const cyclesPassed = sinceLmp >= 0 ? Math.floor(sinceLmp / len) : 0;
  const start = addDays(lmp, cyclesPassed * len);
  return cycleFromStart(start, len, today);
}

function cycleFromStart(start, len, today) {
  const cycleDay = diffDays(start, today) + 1;
  // Ovulação estimada ≈ 14 dias antes da próxima menstruação
  const ovulation = addDays(start, len - 14);
  const fertileStart = addDays(ovulation, -5);
  const fertileEnd = addDays(ovulation, 1);
  const periodEnd = addDays(start, 4); // menstruação ~5 dias (média)
  const nextPeriod = addDays(start, len);
  let phase = 'folicular';
  if (cycleDay <= 5) phase = 'menstrual';
  else if (today >= fertileStart && today <= fertileEnd) phase = 'fértil (estimado)';
  else if (today > fertileEnd) phase = 'lútea';
  return {
    cycleDay, phase, periodStart: start, periodEnd, ovulation,
    fertileStart, fertileEnd, nextPeriod, daysToNextPeriod: diffDays(today, nextPeriod),
  };
}

/** Lista as estimativas dos próximos N ciclos (para pintar o calendário). */
export function upcomingCycles(lmp, cycleLength, today, count = 4) {
  const len = Math.min(Math.max(Math.round(cycleLength) || 28, 21), 45);
  const cur = cycleEstimate(lmp, len, today);
  const out = [];
  let start = cur.periodStart;
  for (let i = 0; i < count; i++) {
    out.push(cycleFromStart(start, len, start));
    start = addDays(start, len);
  }
  return out;
}

/** Dias desde o nascimento (pós-parto). */
export function postpartumDays(birthDate, today) {
  if (!parseISO(birthDate)) return null;
  const d = diffDays(birthDate, today);
  return { days: d, weeks: Math.floor(d / 7), remDays: d % 7 };
}

/** Formata "AAAA-MM-DD" como "08/11/2026" (padrão brasileiro). */
export function formatBR(iso) {
  if (!parseISO(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Formata data longa: "domingo, 8 de novembro". */
export function formatLongBR(iso) {
  const t = parseISO(iso);
  if (!t) return '';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(t);
}
