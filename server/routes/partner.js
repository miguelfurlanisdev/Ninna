/**
 * ============================================================
 *  Modo parceiro "Juntos"
 * ============================================================
 *  A gestante (dona) cria um CONVITE e escolhe o que compartilhar (perms):
 *    weekly         → semana atual e dicas de apoio
 *    calendar       → só consultas/compromissos marcados como "compartilhados" (sem anotações)
 *    shopping       → lista de compras (ver)
 *    shopping_edit  → parceiro pode marcar como comprado / adicionar itens
 *    tasks          → tarefas marcadas como compartilhadas (parceiro pode concluir)
 *  NUNCA são compartilhados: diário, check-ins, dúvidas, conversas com a IA, anotações de consultas.
 *  O parceiro não edita nenhuma informação médica.
 *  Todas as permissões são verificadas AQUI no servidor.
 */
import crypto from 'node:crypto';
import { get, post, put, HttpError } from '../lib/http.js';
import { q } from '../db.js';
import { validate } from '../lib/validate.js';
import { limit } from '../lib/ratelimit.js';
import { gestationFromLMP, todayISO } from '../../shared/gestation.js';

const PERM_KEYS = ['weekly', 'calendar', 'shopping', 'shopping_edit', 'tasks'];
const cleanPerms = (p) => Object.fromEntries(PERM_KEYS.map((k) => [k, !!(p && p[k])]));
// Alfabeto sem caracteres confusos (0/O, 1/I)
const code = () => Array.from(crypto.randomBytes(8), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

post('/api/partner/invite', async ({ user, body }) => {
  limit(`inv:${user.id}`, 10, 3600_000);
  const d = validate(body, { label: { type: 'string', max: 60 }, perms: { type: 'json' } });
  const perms = cleanPerms(typeof d.perms === 'string' ? JSON.parse(d.perms) : body.perms);
  const c = code();
  const exp = new Date(Date.now() + 7 * 86400_000).toISOString(); // convite vale 7 dias
  q.run('INSERT INTO partner_links (owner_id, invite_code, label, perms, expires_at) VALUES (?,?,?,?,?)', user.id, c, d.label || null, JSON.stringify(perms), exp);
  return { code: c, expires_at: exp };
}, { auth: true });

get('/api/partner/links', async ({ user }) => {
  const mine = q.all(`SELECT l.id, l.label, l.status, l.invite_code, l.perms, l.expires_at, u.display_name AS partner_name
      FROM partner_links l LEFT JOIN users u ON u.id = l.partner_id
     WHERE l.owner_id = ? AND l.status != 'revoked' ORDER BY l.id DESC`, user.id)
    .map((l) => ({ ...l, perms: JSON.parse(l.perms), invite_code: l.status === 'pending' ? l.invite_code : undefined }));
  const asPartner = q.all(`SELECT l.id, l.perms, COALESCE(p.public_name, u.display_name) AS owner_name
      FROM partner_links l JOIN users u ON u.id = l.owner_id LEFT JOIN profiles p ON p.user_id = u.id
     WHERE l.partner_id = ? AND l.status = 'active'`, user.id).map((l) => ({ ...l, perms: JSON.parse(l.perms) }));
  return { mine, asPartner };
}, { auth: true });

put('/api/partner/links/:id', async ({ user, params, body }) => {
  const r = q.run('UPDATE partner_links SET perms = ? WHERE id = ? AND owner_id = ?', JSON.stringify(cleanPerms(body.perms)), params.id, user.id);
  if (!r.changes) throw new HttpError(404, 'Vínculo não encontrado.');
  return { ok: true };
}, { auth: true });

// Dona OU parceiro podem encerrar o vínculo
post('/api/partner/links/:id/revoke', async ({ user, params }) => {
  const r = q.run(`UPDATE partner_links SET status = 'revoked' WHERE id = ? AND (owner_id = ? OR partner_id = ?)`, params.id, user.id, user.id);
  if (!r.changes) throw new HttpError(404, 'Vínculo não encontrado.');
  return { ok: true };
}, { auth: true });

post('/api/partner/join', async ({ user, body, ip }) => {
  limit(`join:${user.id}`, 10, 3600_000);
  limit(`join-ip:${ip}`, 30, 3600_000);
  const d = validate(body, { code: { type: 'string', required: true, min: 4, max: 20 } });
  const link = q.get(`SELECT * FROM partner_links WHERE invite_code = ? AND status = 'pending'`, d.code.toUpperCase().replace(/\s|-/g, ''));
  if (!link || new Date(link.expires_at) < new Date()) throw new HttpError(404, 'Código inválido ou expirado. Peça um novo convite.');
  if (link.owner_id === user.id) throw new HttpError(400, 'Você não pode usar o seu próprio convite.');
  q.run(`UPDATE partner_links SET partner_id = ?, status = 'active' WHERE id = ?`, user.id, link.id);
  return { ok: true, link_id: link.id };
}, { auth: true });

/** Carrega o vínculo e garante que o usuário é o PARCEIRO ativo dele. */
function partnerLink(user, id) {
  const l = q.get(`SELECT * FROM partner_links WHERE id = ? AND partner_id = ? AND status = 'active'`, id, user.id);
  if (!l) throw new HttpError(404, 'Vínculo não encontrado ou encerrado.');
  return { ...l, perms: JSON.parse(l.perms) };
}

get('/api/partner/shared/:id', async ({ user, params }) => {
  const l = partnerLink(user, params.id);
  const owner = q.get('SELECT p.public_name, p.lmp, p.stage, p.baby_name FROM profiles p WHERE p.user_id = ?', l.owner_id);
  const out = { perms: l.perms, owner_name: owner?.public_name || 'a gestante', weekly: null, appointments: [], shopping: [], tasks: [] };
  const today = todayISO();
  if (l.perms.weekly && owner?.lmp && owner.stage === 'pregnant') {
    const g = gestationFromLMP(owner.lmp, today);
    const wk = q.get('SELECT data FROM week_content WHERE week = ?', g.week);
    const data = wk ? JSON.parse(wk.data) : {};
    out.weekly = { weeks: g.weeks, days: g.days, daysToDpp: g.daysToDpp, trimester: g.trimester, title: data.title, partner: data.partner || [], bodySummary: data.body?.summary };
  }
  if (l.perms.calendar) out.appointments = q.all(
    `SELECT id, title, kind, starts_at FROM appointments WHERE user_id = ? AND shared = 1 AND done = 0 AND starts_at >= ? ORDER BY starts_at LIMIT 30`, l.owner_id, today);
  if (l.perms.shopping) out.shopping = q.all('SELECT id, category, name, qty, priority, bought FROM shopping_items WHERE user_id = ? ORDER BY bought, id DESC LIMIT 300', l.owner_id);
  if (l.perms.tasks) out.tasks = q.all('SELECT id, title, due, done FROM tasks WHERE user_id = ? AND shared = 1 ORDER BY done, id DESC LIMIT 100', l.owner_id);
  return out;
}, { auth: true });

put('/api/partner/shared/:id/shopping/:itemId', async ({ user, params, body }) => {
  const l = partnerLink(user, params.id);
  if (!l.perms.shopping || !l.perms.shopping_edit) throw new HttpError(403, 'Você não tem permissão para editar esta lista.');
  const d = validate(body, { bought: { type: 'bool', required: true } });
  const r = q.run('UPDATE shopping_items SET bought = ? WHERE id = ? AND user_id = ?', d.bought, params.itemId, l.owner_id);
  if (!r.changes) throw new HttpError(404, 'Item não encontrado.');
  return { ok: true };
}, { auth: true });

post('/api/partner/shared/:id/shopping', async ({ user, params, body }) => {
  const l = partnerLink(user, params.id);
  if (!l.perms.shopping || !l.perms.shopping_edit) throw new HttpError(403, 'Você não tem permissão para editar esta lista.');
  limit(`w:${user.id}`, 60, 60_000);
  const d = validate(body, { name: { type: 'string', required: true, min: 1, max: 120 }, category: { type: 'string', max: 30 } });
  const cats = ['roupas', 'higiene', 'sono', 'alimentacao', 'amamentacao', 'transporte', 'banho', 'maternidade', 'casa', 'posparto'];
  q.run('INSERT INTO shopping_items (user_id, category, name, notes) VALUES (?,?,?,?)', l.owner_id, cats.includes(d.category) ? d.category : 'casa', d.name, 'Adicionado pelo parceiro');
  return { ok: true };
}, { auth: true });

put('/api/partner/shared/:id/tasks/:taskId', async ({ user, params, body }) => {
  const l = partnerLink(user, params.id);
  if (!l.perms.tasks) throw new HttpError(403, 'Você não tem permissão para editar tarefas.');
  const d = validate(body, { done: { type: 'bool', required: true } });
  const r = q.run('UPDATE tasks SET done = ? WHERE id = ? AND user_id = ? AND shared = 1', d.done, params.taskId, l.owner_id);
  if (!r.changes) throw new HttpError(404, 'Tarefa não encontrada.');
  return { ok: true };
}, { auth: true });
