/**
 * ============================================================
 *  Dados pessoais da usuária (tarefas, consultas, diário, listas...)
 * ============================================================
 *  REGRA DE OURO: toda consulta aqui filtra por `user_id = user.id` (da sessão).
 *  Assim uma usuária jamais enxerga ou altera dados de outra.
 *
 *  `crud()` cria as 4 rotas padrão (listar, criar, editar, excluir) a partir de um esquema.
 *  🔧 EDITAR: para adicionar um campo, inclua-o no esquema E na tabela (server/db.js).
 */
import { get, post, put, del, HttpError } from '../lib/http.js';
import { q } from '../db.js';
import { validate } from '../lib/validate.js';
import { limit } from '../lib/ratelimit.js';

function requireHealthConsent(user) {
  const c = q.get('SELECT health_data FROM consents WHERE user_id = ?', user.id);
  if (!c?.health_data)
    throw new HttpError(403, 'Para usar este recurso, autorize o uso de dados de saúde em Configurações › Privacidade.');
}

/**
 * @param {string} name   caminho da API (/api/<name>)
 * @param {string} table  tabela SQL
 * @param {object} schema esquema de validação (ver lib/validate.js)
 * @param {{order?:string, health?:boolean, noUpdate?:boolean, max?:number}} opts
 */
function crud(name, table, schema, { order = 'id DESC', health = false, noUpdate = false, max = 500 } = {}) {
  const cols = Object.keys(schema);

  get(`/api/${name}`, async ({ user }) => ({ items: q.all(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY ${order} LIMIT ${max}`, user.id) }), { auth: true });

  post(`/api/${name}`, async ({ user, body }) => {
    if (health) requireHealthConsent(user);
    limit(`w:${user.id}`, 120, 60_000);
    const count = q.get(`SELECT COUNT(*) n FROM ${table} WHERE user_id = ?`, user.id).n;
    if (count >= max) throw new HttpError(400, 'Limite de registros atingido. Exclua alguns para adicionar novos.');
    const d = validate(body, schema);
    const keys = Object.keys(d);
    const r = q.run(`INSERT INTO ${table} (user_id, ${keys.join(',')}) VALUES (?, ${keys.map(() => '?').join(',')})`, user.id, ...keys.map((k) => d[k]));
    return { item: q.get(`SELECT * FROM ${table} WHERE id = ?`, Number(r.lastInsertRowid)) };
  }, { auth: true });

  if (!noUpdate) put(`/api/${name}/:id`, async ({ user, params, body }) => {
    const row = q.get(`SELECT id FROM ${table} WHERE id = ? AND user_id = ?`, params.id, user.id);
    if (!row) throw new HttpError(404, 'Registro não encontrado.');
    const d = validate(body, schema, { partial: true });
    const keys = Object.keys(d).filter((k) => cols.includes(k));
    if (keys.length) q.run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(',')} WHERE id = ? AND user_id = ?`, ...keys.map((k) => d[k]), params.id, user.id);
    return { item: q.get(`SELECT * FROM ${table} WHERE id = ?`, params.id) };
  }, { auth: true });

  del(`/api/${name}/:id`, async ({ user, params }) => {
    const r = q.run(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`, params.id, user.id);
    if (!r.changes) throw new HttpError(404, 'Registro não encontrado.');
    return { ok: true };
  }, { auth: true });
}

// ------------------------------------------------------------------
//  Coleções. 🔧 EDITAR limites (max) e campos conforme necessário.
// ------------------------------------------------------------------
crud('tasks', 'tasks', {
  title: { type: 'string', required: true, min: 1, max: 160, label: 'Título' },
  due: { type: 'date' }, done: { type: 'bool' }, shared: { type: 'bool' },
}, { order: "done ASC, COALESCE(due, '9999') ASC, id DESC" });

crud('appointments', 'appointments', {
  title: { type: 'string', required: true, min: 1, max: 160, label: 'Título' },
  // 🔧 EDITAR: tipos de compromisso (também no front: public/js/views/calendar.js)
  kind: { type: 'enum', values: ['consulta', 'exame', 'lembrete', 'curso', 'compras', 'evento', 'familia'], default: 'consulta' },
  starts_at: { type: 'datetime', required: true, label: 'Data e hora' },
  notes: { type: 'string', max: 1000 },
  done: { type: 'bool' },
  remind_minutes: { type: 'int', min: 0, max: 43200, label: 'Antecedência' },
  shared: { type: 'bool' },
}, { order: 'starts_at ASC', health: true });

crud('diary', 'diary', {
  week: { type: 'int', min: 0, max: 60 },
  body: { type: 'string', required: true, min: 1, max: 5000, label: 'Texto' },
}, { order: 'id DESC', health: true });

crud('checkins', 'checkins', {
  mood: { type: 'int', required: true, min: 1, max: 5, label: 'Humor' },
  note: { type: 'string', max: 500 },
}, { order: 'id DESC', health: true, noUpdate: true });

crud('questions', 'questions', {
  text: { type: 'string', required: true, min: 2, max: 400, label: 'Dúvida' },
  done: { type: 'bool' },
}, { order: 'done ASC, id DESC', health: true });

crud('shopping', 'shopping_items', {
  // 🔧 EDITAR: categorias da lista (também em content/meta.json)
  category: { type: 'enum', required: true, values: ['roupas', 'higiene', 'sono', 'alimentacao', 'amamentacao', 'transporte', 'banho', 'maternidade', 'casa', 'posparto'] },
  name: { type: 'string', required: true, min: 1, max: 120, label: 'Item' },
  qty: { type: 'int', min: 1, max: 999 },
  priority: { type: 'enum', values: ['alta', 'media', 'baixa'], default: 'media' },
  est_cents: { type: 'int', min: 0, max: 100_000_000 },
  paid_cents: { type: 'int', min: 0, max: 100_000_000 },
  bought: { type: 'bool' },
  notes: { type: 'string', max: 300 },
}, { order: 'bought ASC, id DESC', max: 800 });

crud('support', 'support_plan', {
  person: { type: 'string', required: true, min: 1, max: 80, label: 'Pessoa' },
  contact: { type: 'string', max: 80 },
  task: { type: 'string', required: true, min: 1, max: 160, label: 'Como pode ajudar' },
}, { order: 'id ASC', max: 60 });

// ------------------------------------------------------------------
//  Checklists (semanais e pós-parto): guarda só marcações
// ------------------------------------------------------------------
get('/api/checklist', async ({ user }) => {
  const map = {};
  for (const r of q.all('SELECT item_key, done FROM checklist WHERE user_id = ?', user.id)) map[r.item_key] = !!r.done;
  return { items: map };
}, { auth: true });

put('/api/checklist', async ({ user, body }) => {
  const d = validate(body, { key: { type: 'string', required: true, max: 60 }, done: { type: 'bool' } });
  if (!/^[a-z0-9:_-]{1,60}$/i.test(d.key)) throw new HttpError(400, 'Item inválido.');
  limit(`w:${user.id}`, 120, 60_000);
  q.run(`INSERT INTO checklist (user_id, item_key, done, done_at) VALUES (?,?,?,CASE WHEN ? THEN datetime('now') END)
         ON CONFLICT(user_id, item_key) DO UPDATE SET done = excluded.done, done_at = excluded.done_at`,
    user.id, d.key, d.done ? 1 : 0, d.done ? 1 : 0);
  return { ok: true };
}, { auth: true });

// ------------------------------------------------------------------
//  Painel inicial: junta tudo que a tela precisa em UMA chamada
// ------------------------------------------------------------------
get('/api/dashboard', async ({ user, query }) => {
  const now = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(query.now || '') ? query.now : new Date().toISOString().slice(0, 16);
  const profile = q.get('SELECT stage, lmp FROM profiles WHERE user_id = ?', user.id);
  const week = Number(query.week) || null;

  const appointments = q.all(
    `SELECT id, title, kind, starts_at, remind_minutes FROM appointments
      WHERE user_id = ? AND done = 0 AND starts_at >= ? ORDER BY starts_at LIMIT 4`, user.id, now);
  const tasks = q.all("SELECT id, title, due FROM tasks WHERE user_id = ? AND done = 0 ORDER BY COALESCE(due,'9999'), id LIMIT 4", user.id);
  const questions = q.all('SELECT id, text FROM questions WHERE user_id = ? AND done = 0 ORDER BY id DESC LIMIT 3', user.id);

  // Artigo recomendado: prioriza o que combina com a fase e a semana
  let article = null;
  if (profile?.stage) {
    article = q.get(
      `SELECT slug, title, summary, category FROM articles WHERE published = 1
        AND stages LIKE ? AND (weeks_from IS NULL OR ? IS NULL OR (weeks_from <= ? AND weeks_to >= ?))
        ORDER BY (weeks_from IS NOT NULL) DESC, updated_at DESC LIMIT 1`,
      `%"${profile.stage}"%`, week, week, week);
  }

  const community = q.all(
    `SELECT p.id, p.category, substr(p.body,1,160) AS body, p.anonymous, p.pseudonym, p.created_at, p.is_demo,
            CASE WHEN p.anonymous = 1 THEN NULL ELSE pr.public_name END AS author
       FROM posts p LEFT JOIN profiles pr ON pr.user_id = p.user_id
      WHERE p.status = 'visible' AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
      ORDER BY p.id DESC LIMIT 3`, user.id)
    .map((p) => ({ ...p, author: p.anonymous ? p.pseudonym || 'Anônima' : p.author }));

  const checklistDone = q.get('SELECT COUNT(*) n FROM checklist WHERE user_id = ? AND done = 1', user.id).n;
  const achievements = q.all('SELECT key, at FROM achievements WHERE user_id = ?', user.id);
  return { appointments, tasks, questions, article, community, checklistDone, achievements };
}, { auth: true });
