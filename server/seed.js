/**
 * ============================================================
 *  Seed: carrega o conteúdo de /content no banco na PRIMEIRA execução
 * ============================================================
 *  - Só insere quando a tabela está vazia → não sobrescreve edições feitas no painel admin.
 *  - Para recarregar as semanas a partir dos arquivos: npm run reseed:weeks
 *  - Todo conteúdo inicial entra como "pendente de revisão profissional".
 */
import fs from 'node:fs';
import path from 'node:path';
import { q, tx } from './db.js';
import { ROOT } from './config.js';

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));

/** Monta o conteúdo completo de uma semana juntando weeks.json + trimesters.json. */
export function buildWeek(n, weeks = readJson('weeks.json'), tris = readJson('trimesters.json')) {
  const w = weeks[String(n)];
  const triNum = n < 14 ? 1 : n < 28 ? 2 : 3;
  const t = tris[String(triNum)];
  return {
    title: w.t,
    trimester: triNum,
    size: w.sz ? { label: w.sz, note: 'Comparação ilustrativa e aproximada — não é a medida exata do bebê.' } : null,
    dev: { summary: w.d, highlights: w.h || [] },
    body: { summary: t.body.summary, common: t.body.common, alerts: tris.alerts },
    checklist: [...t.checklist, ...(w.k || [])].map((c) => ({ key: `w${n}:${c.k}`, text: c.t })),
    curiosity: w.c || null,
    myth: t.myths[n % t.myths.length],
    emotional: { prompt: t.emotional[n % t.emotional.length] },
    partner: t.partner,
    faq: t.faq,
  };
}

export function seedWeeks({ force = false } = {}) {
  const have = q.get('SELECT COUNT(*) n FROM week_content').n;
  if (have && !force) return;
  const weeks = readJson('weeks.json'); const tris = readJson('trimesters.json');
  tx(() => {
    for (let n = 1; n <= 40; n++) {
      q.run(`INSERT INTO week_content (week, data, review_status) VALUES (?,?, 'pending')
             ON CONFLICT(week) DO UPDATE SET data = excluded.data, review_status = 'pending', reviewed_at = NULL, updated_at = datetime('now')`,
        n, JSON.stringify(buildWeek(n, weeks, tris)));
    }
  });
}

export function seedContent() {
  const meta = readJson('meta.json');
  tx(() => {
    // Grupos/categorias da comunidade (sempre sincroniza nomes)
    meta.groups.forEach((g, i) => q.run(
      `INSERT INTO groups (slug, name, about, sort) VALUES (?,?,?,?)
       ON CONFLICT(slug) DO UPDATE SET name = excluded.name, about = excluded.about, sort = excluded.sort`, g.slug, g.name, g.about, i));

    if (!q.get('SELECT 1 FROM articles LIMIT 1')) {
      for (const a of readJson('articles.json')) {
        q.run(`INSERT INTO articles (slug, title, category, summary, body, refs, stages, weeks_from, weeks_to, review_status)
               VALUES (?,?,?,?,?,?,?,?,?, 'pending')`,
          a.slug, a.title, a.category, a.summary, a.body, JSON.stringify(a.refs || []), JSON.stringify(a.stages || []), a.weeks_from ?? null, a.weeks_to ?? null);
      }
    }
    if (!q.get('SELECT 1 FROM quiz_questions LIMIT 1')) {
      for (const x of readJson('games.json').questions) {
        q.run('INSERT INTO quiz_questions (game, stage, difficulty, question, options, answer_index, explanation, source) VALUES (?,?,?,?,?,?,?,?)',
          x.game, x.stage ?? null, x.difficulty, x.question, JSON.stringify(x.options), x.answer, x.explanation, x.source || null);
      }
    }
  });
  seedWeeks();
}
