/**
 * ============================================================
 *  router.js — navegação por "#/rotas" com carregamento sob demanda das telas
 * ============================================================
 *  🔧 EDITAR: para criar uma nova página, adicione uma linha em ROUTES e crie
 *  o arquivo em public/js/views/. Cada tela exporta `default async function (ctx)`
 *  que devolve um elemento DOM (e opcionalmente `export const title = '...'`).
 *
 *  access: 'public'  → qualquer pessoa
 *          'guest'   → só quem NÃO está logada (login/cadastro)
 *          'user'    → exige login + onboarding concluído
 *          'login'   → exige login (usado no onboarding)
 *          'staff'   → moderadora/admin (o servidor valida de novo!)
 *  layout: 'shell' (menu lateral/inferior) ou 'bare' (tela cheia)
 */
import { store } from './store.js';
import { h } from './dom.js';
import { skeleton } from './ui.js';
import { revealAll } from './motion.js';
import { mountShell, unmountShell, setActiveNav } from '../shell.js';

const ROUTES = [
  { path: '/',                 view: () => import('../views/landing.js'),    access: 'public', layout: 'bare' },
  { path: '/entrar',           view: () => import('../views/auth.js'),       access: 'guest',  layout: 'bare', mode: 'login' },
  { path: '/criar-conta',      view: () => import('../views/auth.js'),       access: 'guest',  layout: 'bare', mode: 'register' },
  { path: '/esqueci-senha',    view: () => import('../views/auth.js'),       access: 'guest',  layout: 'bare', mode: 'forgot' },
  { path: '/redefinir',        view: () => import('../views/auth.js'),       access: 'guest',  layout: 'bare', mode: 'reset' },
  { path: '/termos',           view: () => import('../views/legal.js'),      access: 'public', layout: 'bare', mode: 'terms' },
  { path: '/privacidade',      view: () => import('../views/legal.js'),      access: 'public', layout: 'bare', mode: 'privacy' },
  { path: '/boas-vindas',      view: () => import('../views/onboarding.js'), access: 'login',  layout: 'bare' },
  { path: '/painel',           view: () => import('../views/dashboard.js'),  access: 'user',   layout: 'shell', nav: 'painel' },
  { path: '/semanas',          view: () => import('../views/weeks.js'),      access: 'user',   layout: 'shell', nav: 'semanas' },
  { path: '/semanas/:n',       view: () => import('../views/weeks.js'),      access: 'user',   layout: 'shell', nav: 'semanas' },
  { path: '/calendario',       view: () => import('../views/calendar.js'),   access: 'user',   layout: 'shell', nav: 'calendario' },
  { path: '/biblioteca',       view: () => import('../views/library.js'),    access: 'user',   layout: 'shell', nav: 'biblioteca' },
  { path: '/biblioteca/:slug', view: () => import('../views/library.js'),    access: 'user',   layout: 'shell', nav: 'biblioteca' },
  { path: '/ninna-ai',         view: () => import('../views/ai.js'),         access: 'user',   layout: 'shell', nav: 'ai' },
  { path: '/rede',             view: () => import('../views/community.js'),  access: 'user',   layout: 'shell', nav: 'rede' },
  { path: '/rede/:id',         view: () => import('../views/community.js'),  access: 'user',   layout: 'shell', nav: 'rede' },
  { path: '/juntos',           view: () => import('../views/partner.js'),    access: 'user',   layout: 'shell', nav: 'juntos' },
  { path: '/jogos',            view: () => import('../views/games/hub.js'),  access: 'user',   layout: 'shell', nav: 'jogos' },
  { path: '/jogos/:game',      view: () => import('../views/games/hub.js'),  access: 'user',   layout: 'shell', nav: 'jogos' },
  { path: '/compras',          view: () => import('../views/shopping.js'),   access: 'user',   layout: 'shell', nav: 'compras' },
  { path: '/bem-estar',        view: () => import('../views/wellbeing.js'),  access: 'user',   layout: 'shell', nav: 'bem-estar' },
  { path: '/configuracoes',    view: () => import('../views/settings.js'),   access: 'user',   layout: 'shell', nav: 'config' },
  { path: '/admin',            view: () => import('../views/admin.js'),      access: 'staff',  layout: 'shell', nav: 'admin' },
].map((r) => {
  const keys = [];
  const rx = new RegExp('^' + r.path.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  return { ...r, rx, keys };
});

let current = null;       // { node, cleanup }
let token = 0;            // evita corrida entre navegações rápidas

export const navigate = (path, { replace = false } = {}) => {
  const target = '#' + path;
  if (replace) history.replaceState(null, '', target); else if (location.hash !== target) location.hash = target;
  if (replace || location.hash === target) render();
};

function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

async function render() {
  const my = ++token;
  const { path, query } = parseHash();
  let route = null, params = {};
  for (const r of ROUTES) {
    const m = path.match(r.rx);
    if (m) { route = r; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]))); break; }
  }
  if (!route) { route = { view: () => import('../views/notfound.js'), access: 'public', layout: 'bare' }; }

  // ---- Guardas de acesso ----
  const me = store.me;
  if (route.access === 'guest' && me && route.mode !== 'reset') return navigate(me.profile?.onboarded ? '/painel' : '/boas-vindas', { replace: true });
  if (path === '/' && me) return navigate(me.profile?.onboarded ? '/painel' : '/boas-vindas', { replace: true });
  if (['user', 'login', 'staff'].includes(route.access) && !me) return navigate('/entrar?volta=' + encodeURIComponent(path), { replace: true });
  if (route.access === 'user' && !me.profile?.onboarded) return navigate('/boas-vindas', { replace: true });
  if (route.access === 'staff' && !['moderator', 'admin'].includes(me.user.role)) return navigate('/painel', { replace: true });

  // ---- Prepara o container (com ou sem menu) ----
  const app = document.getElementById('app');
  let outlet;
  if (route.layout === 'shell') { outlet = mountShell(app); setActiveNav(route.nav); }
  else { unmountShell(); outlet = app; }

  // Mostra skeleton se a tela demorar, para não ficar em branco
  const skelTimer = setTimeout(() => { if (my === token && current === null) outlet.replaceChildren(h('div', { class: 'page' }, skeleton(5, 22))); }, 150);

  try {
    const mod = await route.view();
    const node = await mod.default({ params, query, path, mode: route.mode, navigate });
    clearTimeout(skelTimer);
    if (my !== token) { node?.cleanup?.(); return; }       // navegou de novo enquanto carregava
    current?.cleanup?.();
    node.classList.add('page-enter');
    outlet.replaceChildren(node);
    current = { cleanup: node.cleanup };
    document.title = (mod.title ? mod.title + ' · ' : '') + 'NINNA';
    window.scrollTo({ top: 0 });
    revealAll(node);
    // Acessibilidade: leva o foco ao título da nova página e avisa o leitor de tela
    const h1 = node.querySelector('h1'); if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  } catch (e) {
    clearTimeout(skelTimer);
    console.error(e);
    outlet.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'notice notice-danger', role: 'alert' }, 'Não foi possível abrir esta página. ', h('a', { href: '#/painel' }, 'Voltar ao início'))));
  }
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}
export const rerender = render;
