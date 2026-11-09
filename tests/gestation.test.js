/** Testes dos cálculos de gestação e ciclo (shared/gestation.js). Rodar: npm test */
import test from 'node:test';
import assert from 'node:assert/strict';
import { gestationFromLMP, dppFromLMP, resolveDating, cycleEstimate, isPlausibleLMP, addDays, parseISO, trimesterOfWeek, lmpFromGA } from '../shared/gestation.js';

test('DPP = DUM + 280 dias', () => assert.equal(dppFromLMP('2026-01-01'), '2026-10-08'));
test('semanas e dias a partir da DUM', () => {
  const g = gestationFromLMP('2026-01-01', '2026-03-27'); // 85 dias = 12s1d
  assert.equal(g.weeks, 12); assert.equal(g.days, 1); assert.equal(g.trimester, 1); assert.equal(g.status, 'ongoing');
});
test('trimestres: 13s6d é 1º, 14s é 2º, 28s é 3º', () => { assert.equal(trimesterOfWeek(13), 1); assert.equal(trimesterOfWeek(14), 2); assert.equal(trimesterOfWeek(28), 3); });
test('data futura e atrasada', () => {
  assert.equal(gestationFromLMP('2026-06-01', '2026-05-01').status, 'future');
  assert.equal(gestationFromLMP('2026-01-01', '2026-12-31').status, 'overdue');
});
test('datas impossíveis são rejeitadas', () => { assert.equal(parseISO('2026-02-31'), null); assert.equal(parseISO('abc'), null); });
test('sem problema com horário de verão (virada de mês/ano)', () => assert.equal(addDays('2026-12-31', 1), '2027-01-01'));
test('prioridade DPP > idade gestacional > DUM e conflito > 14 dias', () => {
  const t = '2026-06-01';
  const r = resolveDating({ lmp: '2026-01-01', dpp: '2026-12-01' }, t);
  assert.equal(r.source, 'dpp'); assert.ok(r.conflict && r.conflict.diff > 14);
  const ok = resolveDating({ lmp: '2026-01-01', gaWeeks: lmpWeeks('2026-01-01', t) }, t);
  assert.equal(ok.conflict, null);
  assert.deepEqual(resolveDating({}, t), { lmp: null, source: null, conflict: null });
});
const lmpWeeks = (l, t) => Math.floor((parseISO(t) - parseISO(l)) / 86400000 / 7);
test('lmpFromGA volta ao mesmo ponto', () => assert.equal(lmpFromGA(10, 2, '2026-03-12'), '2025-12-30'));
test('plausibilidade da DUM', () => { assert.ok(isPlausibleLMP('2026-05-01', '2026-06-01')); assert.ok(!isPlausibleLMP('2026-07-01', '2026-06-01')); assert.ok(!isPlausibleLMP('2025-01-01', '2026-06-01')); });
test('ciclo: ovulação ≈ 14 dias antes da próxima menstruação', () => {
  const c = cycleEstimate('2026-06-01', 28, '2026-06-10');
  assert.equal(c.cycleDay, 10); assert.equal(c.ovulation, '2026-06-15'); assert.equal(c.nextPeriod, '2026-06-29'); assert.equal(c.daysToNextPeriod, 19);
});
test('ciclo: avança quando a DUM é antiga e limita duração 21–45', () => {
  assert.equal(cycleEstimate('2026-01-01', 28, '2026-06-10').periodStart, '2026-05-21');
  assert.equal(cycleEstimate('2026-06-01', 5, '2026-06-02').nextPeriod, '2026-06-22');
});
