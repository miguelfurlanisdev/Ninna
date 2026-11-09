/**
 * ============================================================
 *  reminders.js — central de lembretes e notificações DENTRO do app
 * ============================================================
 *  ⚠️ Honestidade técnica: os avisos só funcionam enquanto o NINNA está aberto
 *  no navegador. NÃO há envio de push/e-mail/SMS com o app fechado (isso exigiria
 *  um serviço de push real). A tela de lembretes explica isso para a usuária.
 *
 *  - Verifica os compromissos a cada minuto.
 *  - Mostra aviso na tela (toast) e, se a usuária permitir, notificação do navegador.
 *  - Guarda no navegador quais avisos já foram mostrados (localStorage, com try/catch).
 */
import { get } from './api.js';
import { h } from './dom.js';
import { icon } from './icons.js';
import { modal, toast, fmtDateTime, fmtDate } from './ui.js';
import { store, hasHealthConsent } from './store.js';

const KEY = 'ninna:fired';
let timer = null, cache = { items: [], tasks: [] };
const listeners = new Set();
export const onReminders = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const readFired = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const writeFired = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a.slice(-200))); } catch { /* sem armazenamento */ } };

/** Data/hora local do navegador no formato do servidor: AAAA-MM-DDTHH:MM */
export function nowLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const toDate = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16));
export const reminderTime = (a) => new Date(toDate(a.starts_at).getTime() - (a.remind_minutes || 0) * 60000);

export const notifSupported = () => 'Notification' in window;
export const notifPermission = () => (notifSupported() ? Notification.permission : 'unsupported');

export async function askBrowserPermission() {
  if (!notifSupported()) return 'unsupported';
  return Notification.requestPermission();
}

async function refresh() {
  if (!store.me || !hasHealthConsent()) { cache = { items: [], tasks: [] }; return; }
  try {
    const [a, t] = await Promise.all([get('/appointments'), get('/tasks')]);
    cache = { items: a.items, tasks: t.items };
  } catch { return; /* sem conexão: tenta de novo no próximo ciclo */ }
  check(); listeners.forEach((fn) => fn(summary()));
}

/** Resumo para o sino: lembretes vencidos (ainda não concluídos) + próximos. */
export function summary() {
  const now = new Date();
  const open = cache.items.filter((a) => !a.done);
  const due = open.filter((a) => a.remind_minutes != null && reminderTime(a) <= now && toDate(a.starts_at) >= new Date(now.getTime() - 3600_000));
  const upcoming = open.filter((a) => toDate(a.starts_at) >= now).slice(0, 8);
  const todayStr = nowLocal().slice(0, 10);
  const tasksDue = cache.tasks.filter((t) => !t.done && t.due && t.due <= todayStr);
  return { due, upcoming, tasksDue, count: due.length + tasksDue.length };
}

function check() {
  const fired = readFired(); const fresh = [];
  for (const a of summary().due) {
    const id = `${a.id}@${a.starts_at}`;
    if (fired.includes(id)) continue;
    fresh.push(id);
    toast(`Lembrete: ${a.title} — ${fmtDateTime(a.starts_at)}`);
    if (notifPermission() === 'granted' && store.me?.profile?.browser_notifs) {
      try { new Notification('NINNA — lembrete', { body: `${a.title} · ${fmtDateTime(a.starts_at)}`, tag: id }); } catch { /* ignorado */ }
    }
  }
  if (fresh.length) writeFired([...fired, ...fresh]);
}

export function startReminders() {
  stopReminders();
  refresh();
  timer = setInterval(() => { if (!document.hidden) refresh(); }, 60_000);
  document.addEventListener('visibilitychange', onVis);
}
function onVis() { if (!document.hidden) refresh(); }
export function stopReminders() { clearInterval(timer); timer = null; document.removeEventListener('visibilitychange', onVis); cache = { items: [], tasks: [] }; }
export const refreshReminders = refresh;

/** Painel "Central de lembretes" aberto pelo sino. */
export function openReminderCenter() {
  const s = summary();
  const perm = notifPermission();
  const body = h('div', { class: 'stack' },
    !hasHealthConsent() ? h('div', { class: 'notice notice-warn' }, icon('lock'), h('span', {}, 'Para usar lembretes, autorize o uso de dados de saúde em Configurações › Privacidade.')) : null,
    s.due.length ? h('div', {}, h('h4', { class: 'mb' }, 'Para agora'), h('div', { class: 'list' }, s.due.map((a) =>
      h('div', { class: 'list-item' }, icon('bell'), h('div', { class: 'grow' }, h('strong', {}, a.title), h('div', { class: 'small muted' }, fmtDateTime(a.starts_at))))))) : null,
    s.tasksDue.length ? h('div', {}, h('h4', { class: 'mb' }, 'Tarefas para hoje ou atrasadas'), h('div', { class: 'list' }, s.tasksDue.map((t) =>
      h('div', { class: 'list-item' }, icon('check'), h('div', { class: 'grow' }, t.title, h('div', { class: 'small muted' }, 'Prazo: ' + fmtDate(t.due))))))) : null,
    h('div', {}, h('h4', { class: 'mb' }, 'Próximos compromissos'),
      s.upcoming.length ? h('div', { class: 'list' }, s.upcoming.map((a) =>
        h('div', { class: 'list-item' }, icon('calendar'), h('div', { class: 'grow' }, h('strong', {}, a.title), h('div', { class: 'small muted' }, fmtDateTime(a.starts_at)))))) :
        h('p', { class: 'muted small' }, 'Nada agendado. Adicione consultas e lembretes no calendário.')),
    h('div', { class: 'notice notice-sage' }, icon('info'), h('span', {}, 'Os avisos aparecem enquanto o NINNA está aberto neste navegador. Ainda não enviamos notificações com o app fechado.')),
    notifSupported() ? h('div', { class: 'row' },
      perm === 'granted' ? h('span', { class: 'badge badge-ok' }, 'Notificações do navegador permitidas') :
      perm === 'denied' ? h('span', { class: 'small muted' }, 'Notificações bloqueadas no navegador. Libere nas configurações do site.') :
      h('button', { class: 'btn btn-soft btn-sm', type: 'button', onclick: async (e) => {
        const r = await askBrowserPermission();
        e.target.closest('button').replaceWith(h('span', { class: 'badge ' + (r === 'granted' ? 'badge-ok' : '') }, r === 'granted' ? 'Permitidas! Ative também em Configurações.' : 'Permissão não concedida'));
      } }, icon('bell'), 'Permitir notificações do navegador')) :
      h('p', { class: 'small muted' }, 'Este navegador não suporta notificações. Você continua vendo os avisos aqui dentro do app.'),
  );
  modal({ title: 'Central de lembretes', content: body });
}
