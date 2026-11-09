/**
 * ============================================================
 *  shell.js — "moldura" do app: menu lateral (desktop), navegação inferior (celular),
 *  barra superior com sino de lembretes e atalho do perfil.
 *  🔧 EDITAR: a lista NAV define os itens do menu e em quais fases cada um aparece.
 * ============================================================
 */
import { h } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { logo } from './lib/art.js';
import { store, stage, isStaff, firstName } from './lib/store.js';
import { modal, initials } from './lib/ui.js';
import { openReminderCenter, onReminders, summary } from './lib/reminders.js';
import { logout } from './lib/session.js';

/**
 * Itens do menu. `stages` = fases em que o item aparece (omitido = todas).
 * Assim "não exibimos módulos incompatíveis com a etapa" (ex.: semanas só para gestantes).
 */
const NAV = [
  { key: 'painel',    label: 'Início',              icon: 'home',     href: '#/painel' },
  { key: 'semanas',   label: 'Semana a semana',     icon: 'baby',     href: '#/semanas', stages: ['pregnant'] },
  { key: 'calendario',label: 'Calendário',          icon: 'calendar', href: '#/calendario' },
  { key: 'biblioteca',label: 'Biblioteca',          icon: 'book',     href: '#/biblioteca' },
  { key: 'ai',        label: 'Ninna AI',            icon: 'sparkle',  href: '#/ninna-ai' },
  { key: 'rede',      label: 'Nossa Rede',          icon: 'users',    href: '#/rede' },
  { key: 'juntos',    label: 'Juntos (parceiro)',   icon: 'hands',    href: '#/juntos' },
  { key: 'jogos',     label: 'Aprender Brincando',  icon: 'gamepad',  href: '#/jogos' },
  { key: 'compras',   label: 'Enxoval e compras',   icon: 'bag',      href: '#/compras', stages: ['pregnant', 'postpartum', 'support'] },
  { key: 'bem-estar', label: 'Bem-estar',           icon: 'leaf',     href: '#/bem-estar' },
  { key: 'config',    label: 'Configurações',       icon: 'settings', href: '#/configuracoes' },
];
const visible = () => NAV.filter((n) => !n.stages || n.stages.includes(stage()));
// Itens que ficam na barra inferior do celular (os demais vão para "Mais")
const bottomKeys = () => ['painel', stage() === 'pregnant' ? 'semanas' : 'calendario', 'ai', 'rede'];

let shell = null;
let unsubRem = null;

export function mountShell(app) {
  if (shell && app.contains(shell.root)) { renderNav(); return shell.outlet; }
  app.replaceChildren();
  const outlet = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  const sidebarNav = h('nav', { 'aria-label': 'Menu principal' });
  const bottom = h('nav', { class: 'bottomnav', 'aria-label': 'Navegação rápida' });
  const bell = h('button', { class: 'iconbtn', 'aria-label': 'Central de lembretes', onclick: openReminderCenter, type: 'button' }, icon('bell'));
  const topbar = h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/painel', 'aria-label': 'NINNA — início' }, logo(34), 'NINNA'),
    h('div', { class: 'row', style: { gap: '4px' } }, bell,
      h('a', { class: 'iconbtn', href: '#/configuracoes', 'aria-label': 'Meu perfil e configurações' }, h('span', { class: 'avatar', style: { width: '34px', height: '34px', fontSize: '.8rem' } }, initials(store.me.user.display_name)))));
  const sidebar = h('aside', { class: 'sidebar' },
    h('a', { class: 'brand', href: '#/painel' }, logo(36), 'NINNA'),
    sidebarNav,
    h('div', { class: 'me' },
      h('div', { class: 'row row-nowrap', style: { padding: '0 8px 10px' } },
        h('span', { class: 'avatar' }, initials(store.me.user.display_name)),
        h('div', { class: 'grow' }, h('strong', { class: 'small' }, store.me.user.display_name), h('div', { class: 'xs muted' }, 'Cuidar de quem gera a vida.'))),
      h('button', { class: 'btn btn-ghost btn-sm btn-block', type: 'button', onclick: logout }, icon('logout'), 'Sair')));
  const root = h('div', { class: 'app' }, h('a', { class: 'skip-link', href: '#main', onclick: (e) => { e.preventDefault(); outlet.focus(); } }, 'Pular para o conteúdo'),
    sidebar, h('div', { style: { minWidth: 0 } }, topbar, outlet), bottom);
  // Sombra na barra superior ao rolar
  window.addEventListener('scroll', () => topbar.classList.toggle('scrolled', scrollY > 4), { passive: true });
  app.append(root);
  shell = { root, outlet, sidebarNav, bottom, bell };

  // Contador de lembretes no sino
  unsubRem?.();
  unsubRem = onReminders((s) => {
    bell.querySelector('.count')?.remove();
    if (s.count) bell.append(h('span', { class: 'count', 'aria-label': `${s.count} lembretes` }, String(s.count)));
  });
  renderNav();
  return outlet;
}

export function unmountShell() { shell = null; unsubRem?.(); unsubRem = null; }

let active = 'painel';
export function setActiveNav(key) { active = key; if (shell) renderNav(); }

function renderNav() {
  const items = visible();
  const link = (n) => h('a', { href: n.href, 'aria-current': n.key === active ? 'page' : null }, icon(n.icon), n.label);
  const main = items.filter((n) => n.key !== 'config');
  shell.sidebarNav.replaceChildren(
    ...main.map(link),
    ...(isStaff() ? [h('div', { class: 'nav-label' }, 'Administração'), h('a', { href: '#/admin', 'aria-current': active === 'admin' ? 'page' : null }, icon('shield'), 'Painel administrativo')] : []),
    h('div', { class: 'nav-label' }, 'Conta'), link(items.find((n) => n.key === 'config')));
  const bk = bottomKeys();
  const quick = bk.map((k) => items.find((n) => n.key === k)).filter(Boolean);
  shell.bottom.replaceChildren(
    ...quick.map((n) => h('a', { href: n.href, 'aria-current': n.key === active ? 'page' : null }, icon(n.icon), n.key === 'semanas' ? 'Semanas' : n.label.split(' ')[0] === 'Nossa' ? 'Rede' : n.label.split(' ')[0])),
    h('button', { type: 'button', 'aria-label': 'Mais opções', onclick: openMore, 'aria-current': !quick.some((n) => n.key === active) ? 'page' : null }, icon('grid'), 'Mais'));
  // Atualiza o contador do sino com o que já temos em memória
  const s = summary(); shell.bell.querySelector('.count')?.remove();
  if (s.count) shell.bell.append(h('span', { class: 'count' }, String(s.count)));
}

function openMore() {
  const bk = bottomKeys();
  const rest = visible().filter((n) => !bk.includes(n.key));
  const m = modal({
    title: 'Mais',
    content: h('div', { class: 'stack' },
      h('div', { class: 'more-grid' },
        ...rest.map((n) => h('a', { href: n.href, onclick: () => m.close() }, icon(n.icon), n.label)),
        isStaff() ? h('a', { href: '#/admin', onclick: () => m.close() }, icon('shield'), 'Administração') : null),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { m.close(); logout(); } }, icon('logout'), `Sair (${firstName()})`)),
  });
}
