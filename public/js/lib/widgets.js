/**
 * ============================================================
 *  widgets.js — blocos usados em várias telas (checklist, compromissos, cabeçalhos...)
 * ============================================================
 */
import { h } from './dom.js';
import { icon } from './icons.js';
import { put } from './api.js';
import { toast, fmtDateTime, fmtDate } from './ui.js';
import { celebrate, pulseOk } from './motion.js';

/** 🔧 EDITAR: tipos de compromisso (precisam ser os mesmos aceitos em server/routes/personal.js). */
export const APPT_KINDS = {
  consulta: { label: 'Consulta', color: 'var(--forest-700)', icon: 'stethoscope' },
  exame: { label: 'Exame', color: 'var(--lav-600)', icon: 'clipboard' },
  lembrete: { label: 'Lembrete', color: 'var(--rose-500)', icon: 'bell' },
  curso: { label: 'Curso/atividade', color: 'var(--sage-600)', icon: 'book' },
  compras: { label: 'Compras', color: 'var(--sun-700)', icon: 'cart' },
  evento: { label: 'Evento', color: '#8A6A3B', icon: 'star' },
  familia: { label: 'Data familiar', color: '#B05C86', icon: 'heart' },
};

/** Título de seção com link "Ver tudo". */
export function sectionHead(title, linkText, href) {
  return h('div', { class: 'spread mb' }, h('h3', {}, title), linkText ? h('a', { class: 'small', href }, linkText, ' →') : null);
}

/** Linha de compromisso (somente leitura). */
export function apptRow(a) {
  const k = APPT_KINDS[a.kind] || APPT_KINDS.consulta;
  return h('div', { class: 'list-item' },
    h('span', { class: 'dot', style: { background: k.color } }),
    h('div', { class: 'grow' }, h('strong', {}, a.title), h('div', { class: 'small muted' }, `${k.label} · ${fmtDateTime(a.starts_at)}`)));
}

/**
 * Checklist com salvamento automático. items = [{key,text}], progress = {key: bool}.
 * Cada marcação grava no servidor (PUT /api/checklist), mostra feedback e celebra ao concluir tudo.
 */
export function checklist(items, progress = {}, { onChange } = {}) {
  const state = { ...progress };
  const box = h('div', { class: 'stack stack-sm' });
  const counter = h('span', { class: 'small muted', 'aria-live': 'polite' });
  const update = () => { const d = items.filter((i) => state[i.key]).length; counter.textContent = `${d} de ${items.length} concluídas`; onChange?.(d, items.length); };
  items.forEach((it) => {
    const cb = h('input', { type: 'checkbox', checked: !!state[it.key], id: 'ck-' + it.key.replace(/[^\w-]/g, '_') });
    const row = h('label', { class: 'todo' + (state[it.key] ? ' done' : ''), for: cb.id }, cb, h('span', {}, it.text));
    cb.addEventListener('change', async () => {
      const done = cb.checked; row.classList.toggle('done', done); state[it.key] = done;
      try {
        await put('/checklist', { key: it.key, done }); update();
        if (done) { pulseOk(row); if (items.every((i) => state[i.key])) { celebrate(cb); toast('Checklist completa. Que organização!'); } }
      } catch (e) { cb.checked = !done; state[it.key] = !done; row.classList.toggle('done', !done); toast(e.message, 'error'); }
    });
    box.append(row);
  });
  update();
  return h('div', { class: 'stack' }, box, counter);
}

/** Cartão-aviso que pede consentimento de saúde quando ele ainda não foi dado. */
export function consentPrompt() {
  return h('div', { class: 'notice notice-warn' }, icon('lock'), h('div', { class: 'stack stack-sm' },
    h('span', {}, 'Para usar este recurso, autorize o uso de dados de saúde. É opcional e você controla tudo.'),
    h('a', { class: 'btn btn-sm btn-secondary', href: '#/configuracoes' }, 'Abrir Privacidade')));
}

/** Rótulo "Demonstração" para conteúdo de exemplo. */
export const demoTag = () => h('span', { class: 'demo-tag', title: 'Conteúdo de exemplo — não é de uma usuária real' }, 'Demonstração');

export { fmtDate };
