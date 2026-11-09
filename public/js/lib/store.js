/**
 * ============================================================
 *  store.js — estado global simples (usuária logada, metadados, fase)
 * ============================================================
 */
import { get } from './api.js';
import { todayISO } from '/shared/gestation.js';

export const store = { me: null, meta: null, ready: false };
const bus = new EventTarget();
export const onStore = (fn) => { bus.addEventListener('change', fn); return () => bus.removeEventListener('change', fn); };
const emit = () => bus.dispatchEvent(new Event('change'));

/** Carrega as categorias/textos gerais (público). */
export async function loadMeta() {
  if (!store.meta) store.meta = await get('/meta');
  return store.meta;
}

/** Carrega a usuária logada (ou null se não houver sessão). */
export async function loadMe() {
  try { store.me = await get('/me'); }
  catch (e) { if (e.status === 401) store.me = null; else throw e; }
  store.ready = true; emit();
  return store.me;
}

export function setMe(me) { store.me = me; emit(); }
export const isLogged = () => !!store.me;
export const stage = () => store.me?.profile?.stage || null;
export const role = () => store.me?.user?.role || 'user';
export const isStaff = () => ['moderator', 'admin'].includes(role());
export const hasHealthConsent = () => !!store.me?.consents?.health_data;
/** "Hoje" no fuso de Brasília (AAAA-MM-DD). */
export const today = () => todayISO();
/** Primeiro nome para saudação. */
export const firstName = () => (store.me?.user?.display_name || '').split(' ')[0];
