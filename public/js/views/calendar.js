/**
 * ============================================================
 *  calendar.js — calendário interativo: consultas, exames, lembretes, cursos, compras, eventos
 * ============================================================
 *  - Adicionar / editar / concluir / excluir (tudo salvo no servidor).
 *  - Antecedência do lembrete configurável. Avisos funcionam com o app aberto (ver lib/reminders.js).
 *  - Para quem está tentando engravidar, o mês mostra as ESTIMATIVAS do ciclo (previsões, não confirmações).
 *  - Para gestantes, marca a data provável do parto (estimativa).
 *  🔧 EDITAR: opções de antecedência em REMIND; tipos em lib/widgets.js (APPT_KINDS).
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, put, del } from '../lib/api.js';
import { store, hasHealthConsent, today, stage } from '../lib/store.js';
import { loadInto, skeleton, modal, field, input, textarea, select, toast, fmtDate, fmtDateTime, monthName, confirmDialog, empty, withBusy, formError, showFormError, hideFormError } from '../lib/ui.js';
import { APPT_KINDS, consentPrompt } from '../lib/widgets.js';
import { addDays, upcomingCycles, parseISO, toISO } from '/shared/gestation.js';
import { openReminderCenter, refreshReminders } from '../lib/reminders.js';

export const title = 'Calendário';

// 🔧 EDITAR: opções de antecedência do lembrete (minutos). null = sem lembrete.
const REMIND = [['', 'Sem lembrete'], [0, 'Na hora'], [15, '15 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes'], [120, '2 horas antes'], [1440, '1 dia antes'], [2880, '2 dias antes'], [10080, '1 semana antes']];

export default async function view() {
  const root = h('div', { class: 'page' });
  root.append(h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Organização'), h('h1', {}, 'Calendário'), h('p', {}, 'Consultas, exames já indicados pela sua equipe, lembretes, cursos e datas importantes.')),
    h('button', { class: 'btn btn-soft', type: 'button', onclick: openReminderCenter }, icon('bell'), 'Central de lembretes')));
  if (!hasHealthConsent()) { root.append(consentPrompt()); if (stage() !== 'trying') return root; }
  const body = h('div');
  root.append(body);
  loadInto(body, () => (hasHealthConsent() ? get('/appointments') : Promise.resolve({ items: [] })), (r) => calendarUI(r.items), skeleton(8, 28));
  return root;
}

function calendarUI(initial) {
  let items = initial, mode = 'mes', selected = today();
  const now = today(); let ym = { y: +now.slice(0, 4), m: +now.slice(5, 7) - 1 };
  const p = store.me.profile, st = stage();

  // Estimativas do ciclo (tentantes) e DPP (gestantes) — só visual
  const cycleDays = {};
  if (st === 'trying' && p.lmp) {
    for (const c of upcomingCycles(p.lmp, p.cycle_length || 28, now, 5)) {
      for (let i = 0; i < 5; i++) cycleDays[addDays(c.periodStart, i)] = 'period';
      for (let d = c.fertileStart; d <= c.fertileEnd; d = addDays(d, 1)) cycleDays[d] ||= 'fertile';
      cycleDays[c.ovulation] = 'ovulation';
    }
  }
  const dppDate = st === 'pregnant' && store.me.gestation ? store.me.gestation.dpp : null;

  const root = h('div', { class: 'stack' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' }, [['mes', 'Mês'], ['lista', 'Lista']].map(([k, l]) => h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(k === mode), onclick: () => { mode = k; draw(); } }, l)));
  const view = h('div');
  root.append(tabs, view);

  const byDay = () => { const m = {}; items.forEach((a) => (m[a.starts_at.slice(0, 10)] ||= []).push(a)); return m; };

  function draw() {
    [...tabs.children].forEach((b, i) => b.setAttribute('aria-selected', String((i === 0) === (mode === 'mes'))));
    view.replaceChildren(mode === 'mes' ? monthView() : listView());
  }

  /* ---------- Visão de mês ---------- */
  function monthView() {
    const map = byDay(), first = Date.UTC(ym.y, ym.m, 1, 12), startDow = new Date(first).getUTCDay(), dim = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
    const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': monthName(ym.y, ym.m) });
    ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].forEach((d) => grid.append(h('div', { class: 'cal-dow', role: 'columnheader' }, d)));
    for (let i = 0; i < startDow; i++) grid.append(h('div', { class: 'cal-cell empty', 'aria-hidden': 'true' }));
    for (let d = 1; d <= dim; d++) {
      const iso = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const evs = map[iso] || [], cyc = cycleDays[iso];
      const label = `${d} de ${monthName(ym.y, ym.m)}${evs.length ? `, ${evs.length} compromisso(s)` : ''}${cyc === 'period' ? ', menstruação estimada' : cyc === 'fertile' ? ', janela fértil estimada' : cyc === 'ovulation' ? ', ovulação estimada' : ''}${iso === dppDate ? ', data provável do parto' : ''}`;
      grid.append(h('button', { class: `cal-cell ${iso === now ? 'today' : ''} ${iso === selected ? 'sel' : ''} ${cyc ? 'cyc-' + cyc : ''}`, type: 'button', role: 'gridcell', 'aria-label': label, 'aria-pressed': String(iso === selected), onclick: () => { selected = iso; draw(); } },
        h('span', { class: 'cal-n' }, String(d)),
        h('span', { class: 'cal-dots' }, evs.slice(0, 3).map((a) => h('i', { class: 'dot', style: { background: (APPT_KINDS[a.kind] || APPT_KINDS.consulta).color, opacity: a.done ? .35 : 1 } }))),
        iso === dppDate ? h('span', { class: 'cal-flag' }, 'DPP') : null));
    }
    const nav = h('div', { class: 'spread' },
      h('h2', { style: { textTransform: 'capitalize' }, 'aria-live': 'polite' }, monthName(ym.y, ym.m)),
      h('div', { class: 'row', style: { gap: '4px' } },
        h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Mês anterior', onclick: () => { ym.m--; if (ym.m < 0) { ym.m = 11; ym.y--; } draw(); } }, icon('chev-l')),
        h('button', { class: 'btn btn-soft btn-sm', type: 'button', onclick: () => { ym = { y: +now.slice(0, 4), m: +now.slice(5, 7) - 1 }; selected = now; draw(); } }, 'Hoje'),
        h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Próximo mês', onclick: () => { ym.m++; if (ym.m > 11) { ym.m = 0; ym.y++; } draw(); } }, icon('chev-r'))));
    const legend = Object.keys(cycleDays).length ? h('div', { class: 'cal-legend' }, h('span', {}, h('i', { class: 'sw period' }), 'Menstruação (estimada)'), h('span', {}, h('i', { class: 'sw fertile' }), 'Janela fértil (estimada)'), h('span', {}, h('i', { class: 'sw ovulation' }), 'Ovulação (estimada)'),
      h('span', { class: 'xs muted' }, 'Previsões por média; não confirmam ovulação nem fertilidade.')) : null;

    // Painel do dia selecionado
    const dayItems = (map[selected] || []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const panel = h('section', { class: 'card stack', 'aria-live': 'polite' },
      h('div', { class: 'spread' }, h('h3', {}, fmtDate(selected) + (selected === now ? ' · hoje' : '')),
        hasHealthConsent() ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openForm({ starts_at: selected + 'T09:00' }) }, icon('plus'), 'Adicionar') : null),
      dayItems.length ? h('div', { class: 'list' }, dayItems.map(row)) : h('p', { class: 'muted small' }, 'Nada neste dia.'),
      selected === dppDate ? h('div', { class: 'notice' }, icon('baby'), 'Data provável do parto (estimativa): poucos bebês nascem exatamente nesse dia.') : null);
    return h('div', { class: 'cal-layout' }, h('div', { class: 'stack' }, nav, grid, legend), panel);
  }

  /* ---------- Visão de lista ---------- */
  function listView() {
    const nowS = new Date().toISOString().slice(0, 10);
    const upcoming = items.filter((a) => !a.done && a.starts_at.slice(0, 10) >= today()).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const past = items.filter((a) => a.done || a.starts_at.slice(0, 10) < today()).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
    return h('div', { class: 'stack stack-lg' },
      h('section', { class: 'card' }, h('div', { class: 'spread mb' }, h('h3', {}, 'Próximos'), hasHealthConsent() ? h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openForm() }, icon('plus'), 'Adicionar') : null),
        upcoming.length ? h('div', { class: 'list' }, upcoming.map(row)) : empty('Nada agendado', 'Adicione consultas, lembretes ou datas importantes.')),
      past.length ? h('section', { class: 'card' }, h('h3', { class: 'mb' }, 'Anteriores e concluídos'), h('div', { class: 'list' }, past.slice(0, 30).map(row))) : null);
  }

  /* ---------- Linha de compromisso com ações ---------- */
  function row(a) {
    const k = APPT_KINDS[a.kind] || APPT_KINDS.consulta;
    const cb = h('input', { type: 'checkbox', checked: !!a.done, 'aria-label': `Marcar "${a.title}" como concluído`, style: { width: '22px', height: '22px', accentColor: 'var(--forest-700)' } });
    cb.addEventListener('change', async () => { try { const r = await put('/appointments/' + a.id, { done: cb.checked }); items = items.map((x) => (x.id === a.id ? r.item : x)); toast(cb.checked ? 'Marcado como concluído.' : 'Reaberto.'); refreshReminders(); draw(); } catch (e) { cb.checked = !cb.checked; toast(e.message, 'error'); } });
    return h('div', { class: 'list-item' + (a.done ? ' is-done' : '') }, cb,
      h('div', { class: 'grow' }, h('strong', { style: a.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : {} }, a.title),
        h('div', { class: 'small muted' }, h('span', { class: 'dot', style: { background: k.color, marginRight: '6px' } }), `${k.label} · ${fmtDateTime(a.starts_at)}`, a.remind_minutes != null ? ` · lembrete ${REMIND.find((r) => r[0] === a.remind_minutes)?.[1]?.toLowerCase() || ''}` : '', a.shared ? ' · compartilhado' : ''),
        a.notes ? h('div', { class: 'small', style: { marginTop: '4px' } }, a.notes) : null),
      h('button', { class: 'iconbtn', style: { width: '36px', height: '36px' }, 'aria-label': 'Editar ' + a.title, type: 'button', onclick: () => openForm(a) }, icon('edit', { size: 18 })),
      h('button', { class: 'iconbtn', style: { width: '36px', height: '36px' }, 'aria-label': 'Excluir ' + a.title, type: 'button', onclick: async () => {
        if (!await confirmDialog({ title: 'Excluir compromisso?', text: `"${a.title}" será removido.`, confirmLabel: 'Excluir', danger: true })) return;
        try { await del('/appointments/' + a.id); items = items.filter((x) => x.id !== a.id); toast('Compromisso excluído.'); refreshReminders(); draw(); } catch (e) { toast(e.message, 'error'); } } }, icon('trash', { size: 18 })));
  }

  /* ---------- Formulário (criar/editar) ---------- */
  function openForm(a = {}) {
    const editing = !!a.id, err = formError();
    const t = input({ value: a.title || '', maxlength: 160, required: true, placeholder: 'Ex.: Consulta de pré-natal' });
    const kind = select(Object.entries(APPT_KINDS).map(([k, v]) => [k, v.label]), a.kind || 'consulta');
    const date = input({ type: 'date', value: (a.starts_at || selected + 'T09:00').slice(0, 10), required: true });
    const time = input({ type: 'time', value: (a.starts_at || 'T09:00').slice(11, 16) || '09:00', required: true });
    const rem = select(REMIND, a.remind_minutes ?? store.me.profile.remind_default ?? '');
    const notes = textarea({ value: a.notes || '', maxlength: 1000, placeholder: 'Anotações (opcional): perguntas, preparo indicado pela equipe…' });
    const shared = h('input', { type: 'checkbox', id: 'ap-shared', checked: !!a.shared });
    const save = h('button', { class: 'btn', type: 'button' }, editing ? 'Salvar alterações' : 'Adicionar');
    const m = modal({ title: editing ? 'Editar compromisso' : 'Novo compromisso',
      content: h('form', { class: 'stack', novalidate: true, onsubmit: (e) => { e.preventDefault(); save.click(); } }, err, field('Título', t),
        h('div', { class: 'form-grid' }, field('Tipo', kind), field('Lembrete', rem), field('Data', date), field('Hora', time)), field('Anotações', notes),
        h('label', { class: 'check', for: 'ap-shared' }, shared, h('span', { class: 'small' }, 'Permitir que a pessoa de apoio veja este compromisso (apenas título, tipo e horário — se você autorizou em "Juntos").')),
        h('p', { class: 'xs muted' }, 'Os lembretes aparecem enquanto o NINNA está aberto neste navegador.')),
      actions: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Cancelar'), save] });
    save.onclick = () => {
      hideFormError(err);
      if (!t.value.trim()) return showFormError(err, 'Dê um título ao compromisso.');
      if (!date.value || !time.value) return showFormError(err, 'Informe data e hora.');
      const body = { title: t.value, kind: kind.value, starts_at: `${date.value}T${time.value}`, notes: notes.value.trim() || null, shared: shared.checked, remind_minutes: rem.value === '' ? null : Number(rem.value) };
      withBusy(save, async () => {
        try {
          const r = editing ? await put('/appointments/' + a.id, body) : await post('/appointments', body);
          items = editing ? items.map((x) => (x.id === a.id ? r.item : x)) : [...items, r.item];
          selected = date.value; ym = { y: +date.value.slice(0, 4), m: +date.value.slice(5, 7) - 1 };
          m.close(); toast(editing ? 'Compromisso atualizado.' : 'Compromisso salvo no calendário.'); refreshReminders(); draw();
        } catch (e) { showFormError(err, e.message); }
      });
    };
  }

  draw();
  return root;
}
