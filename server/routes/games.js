/**
 * Jogos "Aprender Brincando": perguntas, pontuação e conquistas.
 * As perguntas vêm do banco (editáveis no painel admin). Dados de itens da mala,
 * pares do jogo da memória e marcos da linha do tempo ficam em content/games.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { get, post, HttpError } from '../lib/http.js';
import { q } from '../db.js';
import { ROOT } from '../config.js';
import { validate } from '../lib/validate.js';

const GAMES = ['mito', 'quiz', 'mala', 'apoio', 'memoria', 'jornada'];

get('/api/games/data', async () => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'games.json'), 'utf8'));
  return { bag: j.bag, memory: j.memory, milestones: j.milestones };
}, { auth: true });

get('/api/games/questions', async ({ query }) => {
  const game = query.game === 'mito' ? 'mito' : 'quiz';
  const stage = Number(query.stage);
  const rows = stage ? q.all('SELECT * FROM quiz_questions WHERE game = ? AND active = 1 AND stage = ? ORDER BY difficulty, id', game, stage)
                     : q.all('SELECT * FROM quiz_questions WHERE game = ? AND active = 1 ORDER BY difficulty, id', game);
  return { items: rows.map((r) => ({ ...r, options: JSON.parse(r.options) })) };
}, { auth: true });

// Conquistas (nome e descrição aparecem na tela) — 🔧 EDITAR textos aqui
export const ACHIEVEMENTS = {
  first_game: 'Primeira partida',
  mito_curious: 'Curiosa: completou "Mito ou verdade?"',
  quiz_star: 'Estrela do quiz (80% ou mais)',
  bag_ready: 'Mala pronta',
  plan_started: 'Rede de apoio com 3 pessoas',
  memory_done: 'Boa memória',
  timeline_done: 'Viajante das semanas',
  all_games: 'Jogou todos os jogos',
  first_checklist: 'Primeira tarefa concluída',
};

post('/api/games/score', async ({ user, body }) => {
  const d = validate(body, {
    game: { type: 'enum', values: GAMES, required: true },
    score: { type: 'int', min: 0, max: 100, required: true },   // percentual (0–100) de acerto/conclusão
  });
  q.run(`INSERT INTO game_scores (user_id, game, best, plays) VALUES (?,?,?,1)
         ON CONFLICT(user_id, game) DO UPDATE SET best = MAX(best, excluded.best), plays = plays + 1, updated_at = datetime('now')`,
    user.id, d.game, d.score);

  const earned = [];
  const grant = (key) => { if (q.run('INSERT OR IGNORE INTO achievements (user_id, key) VALUES (?,?)', user.id, key).changes) earned.push({ key, label: ACHIEVEMENTS[key] }); };
  grant('first_game');
  if (d.game === 'mito') grant('mito_curious');
  if (d.game === 'quiz' && d.score >= 80) grant('quiz_star');
  if (d.game === 'mala' && d.score >= 80) grant('bag_ready');
  if (d.game === 'memoria') grant('memory_done');
  if (d.game === 'jornada' && d.score >= 60) grant('timeline_done');
  if (d.game === 'apoio' && q.get('SELECT COUNT(*) n FROM support_plan WHERE user_id = ?', user.id).n >= 3) grant('plan_started');
  if (q.get('SELECT COUNT(*) n FROM game_scores WHERE user_id = ?', user.id).n >= GAMES.length) grant('all_games');
  return { earned };
}, { auth: true });

get('/api/games/progress', async ({ user }) => ({
  scores: q.all('SELECT game, best, plays FROM game_scores WHERE user_id = ?', user.id),
  achievements: q.all('SELECT key, at FROM achievements WHERE user_id = ?', user.id).map((a) => ({ ...a, label: ACHIEVEMENTS[a.key] || a.key })),
  catalog: ACHIEVEMENTS,
}), { auth: true });
