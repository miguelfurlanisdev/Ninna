/**
 * ============================================================
 *  main.js — ponto de entrada do app (carregado por index.html)
 * ============================================================
 *  1. Carrega metadados e a usuária logada (se houver sessão)
 *  2. Liga avisos de conexão e de sessão expirada
 *  3. Inicia lembretes (se logada) e o roteador
 */
import { loadMeta, loadMe, store, setMe } from './lib/store.js';
import { startRouter, navigate } from './lib/router.js';
import { startReminders, stopReminders } from './lib/reminders.js';
import { h } from './lib/dom.js';
import { toast } from './lib/ui.js';

// Aviso de falta de conexão (some quando volta)
let bar = null;
const showOffline = () => { if (!bar) { bar = h('div', { class: 'offline-bar', role: 'alert' }, 'Você está sem conexão. Suas alterações podem não ser salvas.'); document.body.append(bar); } };
const hideOffline = () => { bar?.remove(); bar = null; };
window.addEventListener('offline', showOffline);
window.addEventListener('ninna:offline', showOffline);
window.addEventListener('online', () => { hideOffline(); toast('Conexão restabelecida.'); });

// Sessão expirada em qualquer chamada → volta ao login
window.addEventListener('ninna:unauth', () => {
  if (!store.me) return;
  setMe(null); stopReminders(); toast('Sua sessão expirou. Entre novamente.', 'error'); navigate('/entrar');
});

(async function boot() {
  try {
    await Promise.all([loadMeta(), loadMe()]);
  } catch (e) {
    document.getElementById('app').replaceChildren(h('div', { class: 'page page-narrow', style: { paddingTop: '20vh' } },
      h('div', { class: 'notice notice-danger', role: 'alert' }, 'Não conseguimos conectar ao servidor. Verifique sua conexão e recarregue a página.')));
    return;
  }
  if (store.me) startReminders();
  startRouter();
})();
