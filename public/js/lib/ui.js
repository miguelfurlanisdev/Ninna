/**
 * ============================================================
 *  ui.js — peças de interface compartilhadas
 *  toast, modal, confirmação, campos de formulário, skeleton, vazio, erro, formatadores
 * ============================================================
 */
import { h, append } from './dom.js';
import { icon } from './icons.js';
import { formatBR, parseISO } from '/shared/gestation.js';

/* ---------------- Toast (mensagem rápida) ---------------- */
export function toast(message, type = 'ok') {
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + (type === 'error' ? 'error' : '') }, icon(type === 'error' ? 'alert' : 'check'), message);
  box.append(t);
  setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 260); }, type === 'error' ? 5200 : 3000);
}

/* ---------------- Modal acessível (foco preso, Esc fecha) ---------------- */
export function modal({ title, content, actions = [], onClose, labelledby = 'modal-title' }) {
  const prev = document.activeElement;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); onClose?.(); };
  const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelledby },
    h('div', { class: 'modal-head' },
      h('h3', { id: labelledby }, title),
      h('button', { class: 'iconbtn', 'aria-label': 'Fechar', onclick: close, type: 'button' }, icon('x'))),
    content,
    actions.length ? h('div', { class: 'modal-actions' }, actions) : null);
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) close(); } }, dialog);
  function onKey(e) {
    if (e.key === 'Escape') return close();
    if (e.key !== 'Tab') return;
    const f = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  (dialog.querySelector('[autofocus], input, textarea, select') || dialog.querySelector('.modal-head button')).focus();
  return { close, dialog };
}

/** Pergunta "Tem certeza?" → Promise<boolean>. */
export function confirmDialog({ title, text, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { answered = true; m.close(); resolve(v); };
    const m = modal({
      title, content: h('p', { class: 'muted' }, text),
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => done(false) }, 'Cancelar'),
        h('button', { class: 'btn ' + (danger ? 'btn-danger' : ''), type: 'button', onclick: () => done(true) }, confirmLabel),
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

/* ---------------- Botão com estado de carregamento ---------------- */
/** Executa `fn` enquanto o botão mostra "carregando" e evita clique duplo. */
export async function withBusy(btn, fn) {
  if (btn.getAttribute('aria-busy') === 'true') return;
  btn.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { btn.removeAttribute('aria-busy'); }
}

/* ---------------- Campos de formulário ---------------- */
let uid = 0;
/** field('Rótulo', input, 'dica opcional') — liga label ↔ input automaticamente. */
export function field(label, input, hint) {
  const id = input.id || `f${++uid}`; input.id = id;
  if (hint) input.setAttribute('aria-describedby', id + '-h');
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('span', { class: 'hint', id: id + '-h' }, hint) : null);
}
export const input = (props = {}) => h('input', { class: 'input', ...props });
export const textarea = (props = {}) => h('textarea', { class: 'textarea', ...props });
export const select = (options, value, props = {}) =>
  h('select', { class: 'select', ...props }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));

/** Mensagem de erro de formulário (aria-live). */
export function formError() { return h('div', { class: 'notice notice-danger hide', role: 'alert' }, icon('alert'), h('span')); }
export function showFormError(box, msg) {
  box.querySelector('span').textContent = msg; box.classList.remove('hide'); box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
export const hideFormError = (box) => box.classList.add('hide');

/* ---------------- Estados: carregando, vazio, erro ---------------- */
export function skeleton(lines = 3, height = 18) {
  return h('div', { class: 'stack', 'aria-busy': 'true', 'aria-label': 'Carregando' },
    Array.from({ length: lines }, (_, i) => h('div', { class: 'skeleton', style: { height: height + 'px', width: i === lines - 1 ? '60%' : '100%' } })));
}
export const skeletonCards = (n = 3) => h('div', { class: 'grid grid-3', 'aria-busy': 'true', 'aria-label': 'Carregando' },
  Array.from({ length: n }, () => h('div', { class: 'card' }, skeleton(4))));

export function empty(title, text, action) {
  return h('div', { class: 'empty' }, icon('leaf', { cls: 'big' }), h('h4', {}, title), text ? h('p', { class: 'small' }, text) : null, action || null);
}

export function errorBox(err, retry) {
  return h('div', { class: 'notice notice-danger', role: 'alert' }, icon('alert'),
    h('div', { class: 'stack stack-sm' }, h('span', {}, err?.message || 'Não foi possível carregar.'),
      retry ? h('button', { class: 'btn btn-sm btn-secondary', type: 'button', onclick: retry }, icon('refresh'), 'Tentar de novo') : null));
}

/** Mostra skeleton, executa `loader` e troca pelo conteúdo (ou pelo erro com "tentar de novo"). */
export function loadInto(container, loader, render, skel = skeleton()) {
  const run = async () => {
    container.replaceChildren(skel.cloneNode(true));
    try { const data = await loader(); container.replaceChildren(); append(container, [render(data)]); }
    catch (e) { container.replaceChildren(errorBox(e, run)); }
  };
  return run();
}

/** Aviso padrão: conteúdo informativo, não substitui avaliação profissional. */
export function disclaimer(text = 'Informação geral e educativa. Não substitui a avaliação da sua equipe de saúde.') {
  return h('div', { class: 'notice' }, icon('info'), h('span', {}, text));
}

/* ---------------- Formatadores (pt-BR) ---------------- */
export const brl = (cents) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
export const toCents = (txt) => {
  // aceita "12,50", "1.234,56", "12.5"
  const s = String(txt ?? '').trim().replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const fmtDate = (iso) => formatBR(iso);
/** "2026-11-08T14:30" → "08/11/2026 às 14:30" */
export const fmtDateTime = (dt) => (dt ? `${formatBR(dt.slice(0, 10))} às ${dt.slice(11, 16)}` : '');
/** Datas do banco (UTC "AAAA-MM-DD HH:MM:SS") → "há 3 h" */
export function timeAgo(sqlUtc) {
  const d = new Date(String(sqlUtc).replace(' ', 'T') + 'Z'); const s = (Date.now() - d) / 1000;
  if (s < 60) return 'agora'; if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`; if (s < 604800) return `há ${Math.floor(s / 86400)} d`;
  return d.toLocaleDateString('pt-BR');
}
export const weekdayShort = (iso) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(parseISO(iso));
export const dayNum = (iso) => Number(iso.slice(8, 10));
export const monthName = (y, m) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, m, 1, 12));
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

/** Baixa um arquivo gerado no navegador. */
export function downloadFile(name, text, type = 'application/json') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}

/** Transforma o texto de um artigo ("## Título" e parágrafos) em elementos seguros. */
export function renderRichText(text) {
  const out = h('div', { class: 'prose' });
  for (const block of String(text).split(/\n\s*\n/)) {
    const b = block.trim(); if (!b) continue;
    if (b.startsWith('## ')) out.append(h('h3', {}, b.slice(3)));
    else if (b.split('\n').every((l) => l.startsWith('- '))) out.append(h('ul', {}, b.split('\n').map((l) => h('li', {}, l.slice(2)))));
    else out.append(h('p', {}, b));
  }
  return out;
}
