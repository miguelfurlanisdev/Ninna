/**
 * ============================================================
 *  Comunidade "Nossa Rede"
 * ============================================================
 *  Privacidade:
 *   - Publicações anônimas NUNCA retornam user_id nem nome real.
 *   - Nenhuma resposta da API expõe ids de usuárias: bloqueio/denúncia usam o id da
 *     publicação/comentário e o servidor descobre o autor internamente.
 *   - ⚠️ "Anônima" = oculta para as outras usuárias. A equipe de moderação pode
 *     acessar registros técnicos se necessário (o texto da interface avisa isso).
 *
 *  Moderação automática (heurística simples — NÃO substitui moderação humana):
 *   🔧 EDITAR: regras em `checkContent()`.
 */
import { get, post, put, del, HttpError } from '../lib/http.js';
import { q } from '../db.js';
import { validate } from '../lib/validate.js';
import { limit } from '../lib/ratelimit.js';

const AUTO_HIDE_AFTER_REPORTS = 3; // 🔧 EDITAR: nº de denúncias para ocultar até a revisão

/** Bloqueia dados pessoais, links (spam) e "receitas" de medicamentos. */
function checkContent(text) {
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text) || /(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/.test(text) || /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(text))
    throw new HttpError(400, 'Parece haver um dado pessoal (telefone, e-mail ou CPF). Remova para proteger sua privacidade.');
  if (/https?:\/\/|www\./i.test(text))
    throw new HttpError(400, 'Links não são permitidos nas publicações por enquanto (evita spam).');
  if (/\b(tome|tomar|use|usar|beba|injete)\b[^.\n]{0,40}\b\d+\s?(mg|mcg|ml|gotas|comprimidos?|cápsulas?)\b/i.test(text))
    throw new HttpError(400, 'Evite indicar doses ou medicamentos. Cada gestação é única — a orientação deve vir da equipe de saúde. Você pode contar a sua experiência sem indicar doses.');
}

const POST_SELECT = `
  SELECT p.id, p.category, p.body, p.anonymous, p.created_at, p.edited_at, p.is_demo, p.status,
         (p.user_id = :me) AS mine,
         CASE WHEN p.anonymous = 1 THEN COALESCE(NULLIF(p.pseudonym,''), 'Anônima') ELSE COALESCE(pr.public_name, 'Usuária') END AS author,
         (SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id) AS reactions,
         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'visible') AS comments,
         EXISTS(SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.user_id = :me) AS reacted,
         EXISTS(SELECT 1 FROM saved_posts s WHERE s.post_id = p.id AND s.user_id = :me) AS saved
    FROM posts p LEFT JOIN profiles pr ON pr.user_id = p.user_id`;

const shape = (p) => ({ ...p, mine: !!p.mine, anonymous: !!p.anonymous, reacted: !!p.reacted, saved: !!p.saved, is_demo: !!p.is_demo });

get('/api/community/posts', async ({ user, query }) => {
  const where = [`(p.status = 'visible' OR p.user_id = :me)`,
    `(p.user_id = :me OR p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = :me))`];
  const args = { me: user.id };
  if (query.category) { where.push('p.category = :cat'); args.cat = String(query.category); }
  if (query.group === 'mine') where.push('p.category IN (SELECT slug FROM group_members WHERE user_id = :me)');
  if (query.mine === '1') where.push('p.user_id = :me');
  if (query.saved === '1') where.push('EXISTS(SELECT 1 FROM saved_posts s WHERE s.post_id = p.id AND s.user_id = :me)');
  if (query.q) { where.push("p.body LIKE :q ESCAPE '\\'"); args.q = '%' + String(query.q).slice(0, 80).replace(/[\\%_]/g, (c) => '\\' + c) + '%'; }
  if (Number(query.before)) { where.push('p.id < :before'); args.before = Number(query.before); }
  const rows = q.all(`${POST_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT 20`, args);
  return { items: rows.map(shape), hasMore: rows.length === 20 };
}, { auth: true });

get('/api/community/posts/:id', async ({ user, params }) => {
  const p = q.get(`${POST_SELECT} WHERE p.id = :id AND (p.status = 'visible' OR p.user_id = :me)`, { me: user.id, id: Number(params.id) });
  if (!p) throw new HttpError(404, 'Publicação não encontrada.');
  const comments = q.all(
    `SELECT c.id, c.parent_id, c.body, c.anonymous, c.created_at, (c.user_id = :me) AS mine,
            CASE WHEN c.anonymous = 1 THEN 'Anônima' ELSE COALESCE(pr.public_name, 'Usuária') END AS author
       FROM comments c LEFT JOIN profiles pr ON pr.user_id = c.user_id
      WHERE c.post_id = :id AND c.status = 'visible'
        AND (c.user_id = :me OR c.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = :me))
      ORDER BY c.id`, { me: user.id, id: p.id }).map((c) => ({ ...c, mine: !!c.mine, anonymous: !!c.anonymous }));
  return { post: shape(p), comments };
}, { auth: true });

post('/api/community/posts', async ({ user, body }) => {
  limit(`post:${user.id}`, 8, 600_000);
  const d = validate(body, {
    category: { type: 'string', required: true, max: 40 },
    body: { type: 'string', required: true, min: 5, max: 1500, label: 'Texto' },
    anonymous: { type: 'bool' },
    pseudonym: { type: 'string', max: 30 },
  });
  if (!q.get('SELECT 1 FROM groups WHERE slug = ?', d.category)) throw new HttpError(400, 'Categoria inválida.');
  checkContent(d.body);
  if (q.get(`SELECT 1 FROM posts WHERE user_id = ? AND body = ? AND created_at > datetime('now','-1 hour')`, user.id, d.body))
    throw new HttpError(400, 'Você já publicou este mesmo texto há pouco.');
  const r = q.run('INSERT INTO posts (user_id, category, body, anonymous, pseudonym) VALUES (?,?,?,?,?)',
    user.id, d.category, d.body, d.anonymous ? 1 : 0, d.anonymous ? d.pseudonym || null : null);
  return { post: shape(q.get(`${POST_SELECT} WHERE p.id = :id`, { me: user.id, id: Number(r.lastInsertRowid) })) };
}, { auth: true });

put('/api/community/posts/:id', async ({ user, params, body }) => {
  const d = validate(body, { body: { type: 'string', required: true, min: 5, max: 1500, label: 'Texto' } });
  checkContent(d.body);
  const r = q.run(`UPDATE posts SET body = ?, edited_at = datetime('now') WHERE id = ? AND user_id = ?`, d.body, params.id, user.id);
  if (!r.changes) throw new HttpError(404, 'Publicação não encontrada.');
  return { ok: true };
}, { auth: true });

del('/api/community/posts/:id', async ({ user, params }) => {
  const r = q.run('DELETE FROM posts WHERE id = ? AND user_id = ?', params.id, user.id);
  if (!r.changes) throw new HttpError(404, 'Publicação não encontrada.');
  return { ok: true };
}, { auth: true });

post('/api/community/posts/:id/comments', async ({ user, params, body }) => {
  limit(`cmt:${user.id}`, 20, 600_000);
  const d = validate(body, {
    body: { type: 'string', required: true, min: 2, max: 800, label: 'Comentário' },
    parent_id: { type: 'int', min: 1 }, anonymous: { type: 'bool' },
  });
  checkContent(d.body);
  const p = q.get(`SELECT id FROM posts WHERE id = ? AND status = 'visible'`, params.id);
  if (!p) throw new HttpError(404, 'Publicação não encontrada.');
  if (d.parent_id && !q.get('SELECT 1 FROM comments WHERE id = ? AND post_id = ?', d.parent_id, p.id)) throw new HttpError(400, 'Comentário de origem inválido.');
  q.run('INSERT INTO comments (post_id, user_id, parent_id, body, anonymous) VALUES (?,?,?,?,?)', p.id, user.id, d.parent_id || null, d.body, d.anonymous ? 1 : 0);
  return { ok: true };
}, { auth: true });

del('/api/community/comments/:id', async ({ user, params }) => {
  const r = q.run('DELETE FROM comments WHERE id = ? AND user_id = ?', params.id, user.id);
  if (!r.changes) throw new HttpError(404, 'Comentário não encontrado.');
  return { ok: true };
}, { auth: true });

// Alterna reação (🤍 "Abraço") e salvos — ambos persistem no banco
post('/api/community/posts/:id/react', async ({ user, params }) => {
  limit(`w:${user.id}`, 120, 60_000);
  if (!q.get(`SELECT 1 FROM posts WHERE id = ? AND status = 'visible'`, params.id)) throw new HttpError(404, 'Publicação não encontrada.');
  const had = q.get('SELECT 1 FROM reactions WHERE user_id = ? AND post_id = ?', user.id, params.id);
  if (had) q.run('DELETE FROM reactions WHERE user_id = ? AND post_id = ?', user.id, params.id);
  else q.run('INSERT INTO reactions (user_id, post_id) VALUES (?,?)', user.id, params.id);
  return { reacted: !had, reactions: q.get('SELECT COUNT(*) n FROM reactions WHERE post_id = ?', params.id).n };
}, { auth: true });

post('/api/community/posts/:id/save', async ({ user, params }) => {
  const had = q.get('SELECT 1 FROM saved_posts WHERE user_id = ? AND post_id = ?', user.id, params.id);
  if (had) q.run('DELETE FROM saved_posts WHERE user_id = ? AND post_id = ?', user.id, params.id);
  else if (q.get('SELECT 1 FROM posts WHERE id = ?', params.id)) q.run('INSERT INTO saved_posts (user_id, post_id) VALUES (?,?)', user.id, params.id);
  return { saved: !had };
}, { auth: true });

// ---- Denúncia ----
post('/api/community/report', async ({ user, body }) => {
  limit(`rep:${user.id}`, 15, 3600_000);
  const d = validate(body, {
    type: { type: 'enum', values: ['post', 'comment'], required: true },
    id: { type: 'int', required: true, min: 1 },
    reason: { type: 'string', required: true, min: 3, max: 300, label: 'Motivo' },
  });
  const table = d.type === 'post' ? 'posts' : 'comments';
  const target = q.get(`SELECT id, user_id FROM ${table} WHERE id = ?`, d.id);
  if (!target) throw new HttpError(404, 'Conteúdo não encontrado.');
  if (target.user_id === user.id) throw new HttpError(400, 'Você não pode denunciar o seu próprio conteúdo.');
  if (q.get('SELECT 1 FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?', user.id, d.type, d.id))
    return { ok: true, message: 'Você já denunciou este conteúdo. Nossa equipe vai analisar.' };
  q.run('INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?,?,?,?)', user.id, d.type, d.id, d.reason);
  const n = q.get(`SELECT COUNT(*) n FROM reports WHERE target_type = ? AND target_id = ? AND status = 'open'`, d.type, d.id).n;
  if (n >= AUTO_HIDE_AFTER_REPORTS) q.run(`UPDATE ${table} SET status = 'hidden' WHERE id = ?`, d.id);
  return { ok: true, message: 'Denúncia enviada. Obrigada por cuidar da comunidade.' };
}, { auth: true });

// ---- Bloqueio (sem expor ids de usuárias) ----
post('/api/community/block', async ({ user, body }) => {
  const d = validate(body, {
    type: { type: 'enum', values: ['post', 'comment'], required: true },
    id: { type: 'int', required: true, min: 1 },
  });
  const target = q.get(`SELECT user_id FROM ${d.type === 'post' ? 'posts' : 'comments'} WHERE id = ?`, d.id);
  if (!target) throw new HttpError(404, 'Conteúdo não encontrado.');
  if (target.user_id === user.id) throw new HttpError(400, 'Você não pode bloquear a si mesma.');
  q.run('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?,?)', user.id, target.user_id);
  return { ok: true };
}, { auth: true });

get('/api/community/blocks', async ({ user }) => ({
  // "handle" é o rowid da linha — não identifica a pessoa bloqueada
  items: q.all('SELECT rowid AS handle FROM blocks WHERE blocker_id = ? ORDER BY rowid', user.id).map((b, i) => ({ handle: b.handle, label: `Usuária bloqueada ${i + 1}` })),
}), { auth: true });

del('/api/community/blocks/:handle', async ({ user, params }) => {
  q.run('DELETE FROM blocks WHERE blocker_id = ? AND rowid = ?', user.id, params.handle);
  return { ok: true };
}, { auth: true });

// ---- Grupos temáticos ----
get('/api/community/my-groups', async ({ user }) => ({ items: q.all('SELECT slug FROM group_members WHERE user_id = ?', user.id).map((r) => r.slug) }), { auth: true });
post('/api/community/groups/:slug/join', async ({ user, params }) => {
  if (!q.get('SELECT 1 FROM groups WHERE slug = ?', params.slug)) throw new HttpError(404, 'Grupo não encontrado.');
  q.run('INSERT OR IGNORE INTO group_members (user_id, slug) VALUES (?,?)', user.id, params.slug);
  return { ok: true };
}, { auth: true });
post('/api/community/groups/:slug/leave', async ({ user, params }) => {
  q.run('DELETE FROM group_members WHERE user_id = ? AND slug = ?', user.id, params.slug);
  return { ok: true };
}, { auth: true });
