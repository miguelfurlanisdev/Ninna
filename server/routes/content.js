/**
 * Conteúdo editorial (somente leitura para usuárias): semanas, artigos, glossário, metadados.
 * Para EDITAR o conteúdo, use o painel admin (#/admin) ou os arquivos em /content.
 */
import fs from 'node:fs';
import path from 'node:path';
import { get, HttpError } from '../lib/http.js';
import { q } from '../db.js';
import { ROOT } from '../config.js';
import { diffDays, todayISO } from '../../shared/gestation.js';

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));

// Metadados estáticos (categorias, lojas, telefones úteis...). 🔧 EDITAR: content/meta.json
get('/api/meta', async () => {
  const meta = readJson('meta.json');
  meta.groups = q.all('SELECT slug, name, about FROM groups ORDER BY sort');
  return meta;
});

get('/api/glossary', async () => ({ items: readJson('glossary.json') }), { auth: true });

get('/api/weeks', async () => {
  const rows = q.all('SELECT week, data FROM week_content ORDER BY week');
  return { items: rows.map((r) => ({ week: r.week, title: JSON.parse(r.data).title, size: JSON.parse(r.data).size })) };
}, { auth: true });

get('/api/weeks/:n', async ({ params, user }) => {
  const n = Number(params.n);
  const row = q.get('SELECT * FROM week_content WHERE week = ?', n);
  if (!row) throw new HttpError(404, 'Semana não encontrada.');
  const progress = {};
  for (const r of q.all("SELECT item_key, done FROM checklist WHERE user_id = ? AND item_key LIKE ?", user.id, `w${n}:%`)) progress[r.item_key] = !!r.done;
  return { week: n, data: JSON.parse(row.data), review_status: row.review_status, reviewed_at: row.reviewed_at, progress };
}, { auth: true });

// Progresso geral da jornada (semanas com tarefas concluídas) para a linha do tempo
get('/api/journey', async ({ user }) => {
  const rows = q.all("SELECT item_key FROM checklist WHERE user_id = ? AND done = 1 AND item_key LIKE 'w%:%'", user.id);
  const byWeek = {};
  for (const r of rows) { const w = Number(r.item_key.slice(1).split(':')[0]); byWeek[w] = (byWeek[w] || 0) + 1; }
  const diary = q.all('SELECT week, COUNT(*) n FROM diary WHERE user_id = ? AND week IS NOT NULL GROUP BY week', user.id);
  return { tasksByWeek: byWeek, diaryByWeek: Object.fromEntries(diary.map((d) => [d.week, d.n])) };
}, { auth: true });

// ---- Biblioteca ----
const like = (s) => '%' + s.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
const STALE_DAYS = 365; // 🔧 EDITAR: após quantos dias um artigo é marcado como "precisa de revisão"

function staleness(a) {
  if (a.review_status !== 'reviewed' || !a.reviewed_at) return 'pending';
  return diffDays(a.reviewed_at, todayISO()) > STALE_DAYS ? 'stale' : 'ok';
}

get('/api/articles', async ({ query }) => {
  const where = ['published = 1']; const args = [];
  if (query.category) { where.push('category = ?'); args.push(query.category); }
  if (query.q) {
    const l = like(String(query.q).slice(0, 80));
    where.push("(title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')");
    args.push(l, l, l);
  }
  const rows = q.all(`SELECT slug, title, category, summary, review_status, reviewed_at FROM articles WHERE ${where.join(' AND ')} ORDER BY title LIMIT 100`, ...args);
  return { items: rows.map((a) => ({ ...a, freshness: staleness(a) })) };
}, { auth: true });

get('/api/articles/:slug', async ({ params }) => {
  const a = q.get('SELECT * FROM articles WHERE slug = ? AND published = 1', params.slug);
  if (!a) throw new HttpError(404, 'Artigo não encontrado.');
  const related = q.all('SELECT slug, title, summary FROM articles WHERE category = ? AND slug != ? AND published = 1 LIMIT 3', a.category, a.slug);
  return { item: { ...a, refs: JSON.parse(a.refs), stages: JSON.parse(a.stages), freshness: staleness(a) }, related };
}, { auth: true });

get('/api/products', async () => ({ items: q.all('SELECT id, category, title, url, note, kind FROM product_links WHERE active = 1 ORDER BY category, title') }), { auth: true });
