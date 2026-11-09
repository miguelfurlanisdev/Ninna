/** session.js — sair da conta (logout) e limpar o estado local. */
import { post } from './api.js';
import { setMe } from './store.js';
import { stopReminders } from './reminders.js';
import { navigate } from './router.js';
import { toast } from './ui.js';

export async function logout() {
  try { await post('/auth/logout'); } catch { /* mesmo sem conexão, limpamos o estado local */ }
  setMe(null); stopReminders();
  toast('Você saiu da sua conta. Até logo!');
  navigate('/');
}
