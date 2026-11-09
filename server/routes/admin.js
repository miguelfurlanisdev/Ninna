/**
 * ============================================================
 *  Painel administrativo (API)
 * ============================================================
 *  Toda rota aqui exige `auth: 'mod'` (moderadora ou admin) ou `auth: 'admin'`,
 *  verificado NO SERVIDOR em server/index.js — esconder o botão no front não basta.
 *  Alterações de conteúdo ficam registradas em `admin_logs`.
 *  Métricas são AGREGADAS: nenhum dado de saúde individual é exposto.
 */
import { get, post, put, del, HttpError } from '../lib/http.js';
import { q, adminLog } from '../db.js';
import { validate } from '../lib/validate.js';
import { diffDays, todayISO } from '../../shared/gestation.js';

const MOD = { auth: 'mod' };
const ADMIN = { auth: 'admin' };

// ---------- Métricas agregadas ----------
get('/api/admin/stats', async () => {
  const n = (sql) => q.get(sql).n;
  return {
    users: n('SELECT COUNT(*) n FROM users'),
    newUsers7d: n("SELECT COUNT(*) n FROM users WHERE created_at > datetime('now','-7 days')"),
    byStage: q.all('SELECT COALESCE(stage,\'(não definido)\') AS stage, COUNT(*) n FROM profiles GROUP BY stage'),
    posts: n('SELECT COUNT(*) n FROM posts'),
    comments: n('SELECT COUNT(*) n FROM comments'),
    openReports: n("SELECT COUNT(*) n FROM reports WHERE status = 'open'"),
    aiConversations: n('SELECT COUNT(*) n FROM ai_conversations'),
    articles: n('SELECT COUNT(*) n FROM articles'),
    articlesPending: n("SELECT COUNT(*) n FROM articles WHERE review_status = 'pending'"),
    weeksPending: n("SELECT COUNT(*) n FROM week_content WHERE review_status = 'pending'"),
  };
}, MOD);

// ---------- Artigos ----------
const ARTICLE = {
  slug: { type: 'string', required: true, min: 3, max: 80, label: 'Slug' },
  title: { type: 'string', required: true, min: 3, max: 160, label: 'Título' },
  category: { type: 'string', required: true, max: 60, label: 'Categoria' },
  summary: { type: 'string', required: true, min: 5, max: 400, label: 'Resumo' },
  body: { type: 'string', required: true, min: 10, max: 30000, label: 'Conteúdo' },
  refs: { type: 'json', max: 4000 },
  review_status: { type: 'enum', values: ['pending', 'reviewed'] },
  reviewed_by: { type: 'string', max: 120 },
  reviewed_at: { type: 'date' },
  stages: { type: 'json', max: 400 },
  weeks_from: { type: 'int', min: 0, max: 42 },
  weeks_to: { type: 'int', min: 0, max: 42 },
  published: { type: 'bool' },
};

get('/api/admin/articles', async () => ({ items: q.all('SELECT id, slug, title, category, review_status, reviewed_at, published, updated_at FROM articles ORDER BY updated_at DESC') }), MOD);
get('/api/admin/articles/:id', async ({ params }) => {
  const a = q.get('SELECT * FROM articles WHERE id = ?', params.id);
  if (!a) throw new HttpError(404, 'Artigo não encontrado.');
  return { item: a };
}, MOD);

function checkReviewHonesty(d) {
  // Só permite "revisado" se houver quem revisou e a data (evita inventar revisão profissional)
  if (d.review_status === 'reviewed' && (!d.reviewed_by || !d.reviewed_at))
    throw new HttpError(400, 'Para marcar como revisado, informe quem revisou (nome/registro real) e a data da revisão.');
  if (d.review_status === 'pending') { d.reviewed_by = null; d.reviewed_at = null; }
}

post('/api/admin/articles', async ({ user, body }) => {
  const d = validate(body, ARTICLE);
  checkReviewHonesty(d);
  if (q.get('SELECT 1 FROM articles WHERE slug = ?', d.slug)) throw new HttpError(409, 'Já existe um artigo com este slug.');
  const keys = Object.keys(d);
  const r = q.run(`INSERT INTO articles (${keys.join(',')}, updated_by) VALUES (${keys.map(() => '?').join(',')}, ?)`, ...keys.map((k) => d[k]), user.id);
  adminLog(user.id, 'article.create', d.slug, d.title);
  return { id: Number(r.lastInsertRowid) };
}, MOD);

put('/api/admin/articles/:id', async ({ user, params, body }) => {
  const d = validate(body, ARTICLE, { partial: true });
  checkReviewHonesty(d);
  const keys = Object.keys(d);
  if (!keys.length) return { ok: true };
  const r = q.run(`UPDATE articles SET ${keys.map((k) => `${k} = ?`).join(',')}, updated_at = datetime('now'), updated_by = ? WHERE id = ?`, ...keys.map((k) => d[k]), user.id, params.id);
  if (!r.changes) throw new HttpError(404, 'Artigo não encontrado.');
  adminLog(user.id, 'article.update', params.id, keys.join(','));
  return { ok: true };
}, MOD);

del('/api/admin/articles/:id', async ({ user, params }) => {
  q.run('DELETE FROM articles WHERE id = ?', params.id);
  adminLog(user.id, 'article.delete', params.id);
  return { ok: true };
}, ADMIN);

// Materiais que precisam de revisão (pendentes ou com revisão antiga)
get('/api/admin/stale', async () => {
  const today = todayISO();
  const arts = q.all('SELECT id, title, review_status, reviewed_at FROM articles WHERE published = 1')
    .filter((a) => a.review_status !== 'reviewed' || !a.reviewed_at || diffDays(a.reviewed_at, today) > 365);
  const weeks = q.all("SELECT week, review_status, reviewed_at FROM week_content WHERE review_status != 'reviewed' ORDER BY week");
  return { articles: arts, weeks };
}, MOD);

// ---------- Conteúdo semanal ----------
get('/api/admin/weeks/:n', async ({ params }) => {
  const w = q.get('SELECT * FROM week_content WHERE week = ?', params.n);
  if (!w) throw new HttpError(404, 'Semana não encontrada.');
  return { week: w.week, data: JSON.parse(w.data), review_status: w.review_status, reviewed_at: w.reviewed_at };
}, MOD);

put('/api/admin/weeks/:n', async ({ user, params, body }) => {
  const d = validate(body, {
    data: { type: 'json', required: true, max: 60000 },
    review_status: { type: 'enum', values: ['pending', 'reviewed'] },
    reviewed_at: { type: 'date' },
  });
  const parsed = JSON.parse(d.data);
  if (!parsed.title || !parsed.dev?.summary) throw new HttpError(400, 'O conteúdo precisa ter "title" e "dev.summary".');
  if (d.review_status === 'reviewed' && !d.reviewed_at) throw new HttpError(400, 'Informe a data da revisão.');
  const r = q.run(`UPDATE week_content SET data = ?, review_status = COALESCE(?, review_status), reviewed_at = ?, updated_at = datetime('now') WHERE week = ?`,
    d.data, d.review_status || null, d.review_status === 'pending' ? null : d.reviewed_at || null, params.n);
  if (!r.changes) throw new HttpError(404, 'Semana não encontrada.');
  adminLog(user.id, 'week.update', params.n);
  return { ok: true };
}, MOD);

// ---------- Moderação ----------
get('/api/admin/reports', async ({ query }) => {
  const status = ['open', 'hidden', 'dismissed'].includes(query.status) ? query.status : 'open';
  const rows = q.all(`SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at,
      (SELECT COUNT(*) FROM reports r2 WHERE r2.target_type = r.target_type AND r2.target_id = r.target_id) AS report_count
      FROM reports r WHERE r.status = ? ORDER BY r.id DESC LIMIT 100`, status);
  return {
    items: rows.map((r) => {
      const t = r.target_type === 'post'
        ? q.get('SELECT body, status, category FROM posts WHERE id = ?', r.target_id)
        : q.get('SELECT body, status FROM comments WHERE id = ?', r.target_id);
      return { ...r, content: t?.body || '(conteúdo removido)', content_status: t?.status || 'deleted', category: t?.category };
    }),
  };
}, MOD);

post('/api/admin/reports/:id/resolve', async ({ user, params, body }) => {
  const d = validate(body, { action: { type: 'enum', values: ['hide', 'dismiss', 'delete'], required: true } });
  const r = q.get('SELECT * FROM reports WHERE id = ?', params.id);
  if (!r) throw new HttpError(404, 'Denúncia não encontrada.');
  const table = r.target_type === 'post' ? 'posts' : 'comments';
  if (d.action === 'hide') q.run(`UPDATE ${table} SET status = 'hidden' WHERE id = ?`, r.target_id);
  if (d.action === 'delete') q.run(`DELETE FROM ${table} WHERE id = ?`, r.target_id);
  if (d.action === 'dismiss') q.run(`UPDATE ${table} SET status = 'visible' WHERE id = ?`, r.target_id);
  // Fecha todas as denúncias abertas do mesmo alvo
  q.run('UPDATE reports SET status = ?, resolved_by = ? WHERE target_type = ? AND target_id = ? AND status = ?',
    d.action === 'dismiss' ? 'dismissed' : 'hidden', user.id, r.target_type, r.target_id, 'open');
  adminLog(user.id, `report.${d.action}`, `${r.target_type}:${r.target_id}`);
  return { ok: true };
}, MOD);

// ---------- Usuárias e permissões (SEM dados de saúde) ----------
get('/api/admin/users', async ({ query }) => {
  const like = query.q ? '%' + String(query.q).slice(0, 60).replace(/[\\%_]/g, (c) => '\\' + c) + '%' : '%';
  return { items: q.all(`SELECT id, email, display_name, role, created_at, is_demo FROM users
      WHERE email LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 100`, like, like) };
}, ADMIN);

put('/api/admin/users/:id/role', async ({ user, params, body }) => {
  const d = validate(body, { role: { type: 'enum', values: ['user', 'moderator', 'admin'], required: true } });
  if (Number(params.id) === user.id) throw new HttpError(400, 'Você não pode alterar o seu próprio papel.');
  q.run('UPDATE users SET role = ? WHERE id = ?', d.role, params.id);
  adminLog(user.id, 'user.role', params.id, d.role);
  return { ok: true };
}, ADMIN);

// ---------- Links de produtos ----------
const PRODUCT = {
  category: { type: 'string', required: true, max: 40 },
  title: { type: 'string', required: true, min: 2, max: 120 },
  url: { type: 'string', required: true, max: 500 },
  note: { type: 'string', max: 300 },
  kind: { type: 'enum', values: ['manual', 'afiliado'], default: 'manual' },
  active: { type: 'bool' },
};
const checkUrl = (u) => { if (!/^https:\/\/[^\s]+$/i.test(u)) throw new HttpError(400, 'O link precisa começar com https://'); };
get('/api/admin/products', async () => ({ items: q.all('SELECT * FROM product_links ORDER BY category, title') }), MOD);
post('/api/admin/products', async ({ user, body }) => {
  const d = validate(body, PRODUCT); checkUrl(d.url);
  const keys = Object.keys(d);
  q.run(`INSERT INTO product_links (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => d[k]));
  adminLog(user.id, 'product.create', d.title);
  return { ok: true };
}, MOD);
put('/api/admin/products/:id', async ({ user, params, body }) => {
  const d = validate(body, PRODUCT, { partial: true }); if (d.url) checkUrl(d.url);
  const keys = Object.keys(d);
  if (keys.length) q.run(`UPDATE product_links SET ${keys.map((k) => `${k} = ?`).join(',')} WHERE id = ?`, ...keys.map((k) => d[k]), params.id);
  adminLog(user.id, 'product.update', params.id);
  return { ok: true };
}, MOD);
del('/api/admin/products/:id', async ({ user, params }) => { q.run('DELETE FROM product_links WHERE id = ?', params.id); adminLog(user.id, 'product.delete', params.id); return { ok: true }; }, MOD);

// ---------- Perguntas dos jogos ----------
const QUESTION = {
  game: { type: 'enum', values: ['quiz', 'mito'], required: true },
  stage: { type: 'int', min: 1, max: 3 },
  difficulty: { type: 'int', min: 1, max: 3 },
  question: { type: 'string', required: true, min: 5, max: 300 },
  options: { type: 'json', required: true, max: 1000 },
  answer_index: { type: 'int', required: true, min: 0, max: 5 },
  explanation: { type: 'string', required: true, min: 5, max: 600 },
  source: { type: 'string', max: 200 },
  active: { type: 'bool' },
};
const checkOptions = (d) => {
  if (!d.options) return;
  const o = JSON.parse(d.options);
  if (!Array.isArray(o) || o.length < 2 || o.length > 6 || o.some((x) => typeof x !== 'string' || !x.trim())) throw new HttpError(400, 'Informe de 2 a 6 alternativas (texto).');
  if (d.answer_index !== undefined && d.answer_index >= o.length) throw new HttpError(400, 'A resposta correta deve ser uma das alternativas.');
};
get('/api/admin/questions', async () => ({ items: q.all('SELECT * FROM quiz_questions ORDER BY game, stage, id') }), MOD);
post('/api/admin/questions', async ({ user, body }) => {
  const d = validate(body, QUESTION); checkOptions(d);
  const keys = Object.keys(d);
  q.run(`INSERT INTO quiz_questions (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => d[k]));
  adminLog(user.id, 'question.create', d.question.slice(0, 40));
  return { ok: true };
}, MOD);
put('/api/admin/questions/:id', async ({ user, params, body }) => {
  const d = validate(body, QUESTION, { partial: true }); checkOptions(d);
  const keys = Object.keys(d);
  if (keys.length) q.run(`UPDATE quiz_questions SET ${keys.map((k) => `${k} = ?`).join(',')} WHERE id = ?`, ...keys.map((k) => d[k]), params.id);
  adminLog(user.id, 'question.update', params.id);
  return { ok: true };
}, MOD);
del('/api/admin/questions/:id', async ({ user, params }) => { q.run('DELETE FROM quiz_questions WHERE id = ?', params.id); adminLog(user.id, 'question.delete', params.id); return { ok: true }; }, MOD);

// ---------- Log de alterações ----------
get('/api/admin/logs', async () => ({ items: q.all('SELECT l.id, l.action, l.target, l.detail, l.at, u.display_name AS admin FROM admin_logs l LEFT JOIN users u ON u.id = l.admin_id ORDER BY l.id DESC LIMIT 100') }), ADMIN);
