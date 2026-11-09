/**
 * Perfil, consentimentos (LGPD), exportação e exclusão de dados.
 */
import { get, put, post, del, HttpError } from '../lib/http.js';
import { q, db } from '../db.js';
import { config } from '../config.js';
import { validate } from '../lib/validate.js';
import { verifyPassword, destroySession } from '../lib/auth.js';
import { resolveDating, isPlausibleLMP, todayISO, gestationFromLMP, diffDays } from '../../shared/gestation.js';

const PROFILE_SCHEMA = {
  stage: { type: 'enum', values: ['trying', 'pregnant', 'postpartum', 'support'] },
  lmp: { type: 'date', label: 'Data da última menstruação' },
  dpp_input: { type: 'date', label: 'Data provável do parto' },
  ga_weeks: { type: 'int', min: 0, max: 42, label: 'Semanas' },
  ga_days: { type: 'int', min: 0, max: 6, label: 'Dias' },
  cycle_length: { type: 'int', min: 21, max: 45, label: 'Duração do ciclo' },
  cycle_regular: { type: 'enum', values: ['regular', 'irregular', 'unknown'] },
  goal: { type: 'string', max: 200 },
  prenatal_type: { type: 'enum', values: ['sus', 'private', 'mixed', 'none'] },
  birth_date: { type: 'date', label: 'Data do nascimento' },
  baby_name: { type: 'string', max: 60 },
  remind_default: { type: 'int', min: 0, max: 10080 },
  browser_notifs: { type: 'bool' },
  bio: { type: 'string', max: 280 },
  public_name: { type: 'string', min: 2, max: 30, label: 'Nome de exibição' },
  onboarded: { type: 'bool' },
  display_name: { type: 'string', min: 1, max: 60, label: 'Nome' },
};

function loadMe(userId) {
  const user = q.get('SELECT id, email, display_name, role, is_demo, created_at FROM users WHERE id = ?', userId);
  const profile = q.get('SELECT * FROM profiles WHERE user_id = ?', userId);
  const consents = q.get('SELECT * FROM consents WHERE user_id = ?', userId);
  const today = todayISO();
  const out = { user, profile, consents, today, aiConfigured: !!config.ai.apiKey, gestation: null };
  if (profile?.lmp && profile.stage === 'pregnant') out.gestation = gestationFromLMP(profile.lmp, today);
  return out;
}

get('/api/me', async ({ user }) => loadMe(user.id), { auth: true });

put('/api/profile', async ({ user, body }) => {
  const d = validate(body, PROFILE_SCHEMA, { partial: true });
  const consent = q.get('SELECT health_data FROM consents WHERE user_id = ?', user.id);
  const today = todayISO();
  const result = { warnings: [] };

  // Nome da conta (não é dado de saúde)
  if (d.display_name) q.run('UPDATE users SET display_name = ? WHERE id = ?', d.display_name, user.id);
  delete d.display_name;

  // Datas de saúde só são salvas com consentimento
  const healthKeys = ['lmp', 'dpp_input', 'ga_weeks', 'ga_days', 'cycle_length', 'cycle_regular', 'birth_date', 'goal', 'prenatal_type'];
  const sendsHealth = healthKeys.some((k) => k in d && d[k] !== null);
  if (sendsHealth && !consent.health_data)
    throw new HttpError(403, 'Para salvar datas e informações de saúde, autorize o uso desses dados em Privacidade.');

  const current = q.get('SELECT * FROM profiles WHERE user_id = ?', user.id);
  const stage = d.stage ?? current.stage;

  // Datação da gestação: DPP profissional > idade gestacional > DUM
  if (stage === 'pregnant' && ('lmp' in d || 'dpp_input' in d || 'ga_weeks' in d)) {
    const r = resolveDating({ lmp: d.lmp, dpp: d.dpp_input, gaWeeks: d.ga_weeks, gaDays: d.ga_days }, today);
    if (r.lmp) {
      if (!isPlausibleLMP(r.lmp, today))
        throw new HttpError(400, 'Essa data não parece possível (no futuro ou há mais de 44 semanas). Confira e tente de novo.');
      d.lmp = r.lmp; d.dating_source = r.source;
      if (r.conflict) result.warnings.push(
        `As datas informadas divergem em cerca de ${r.conflict.diff} dias. Usamos a de maior confiança (${r.source === 'dpp' ? 'data provável do parto' : r.source === 'ga' ? 'idade gestacional' : 'última menstruação'}). Confirme a datação com sua equipe de saúde.`);
    } else { d.lmp = null; d.dating_source = null; }
  } else if (stage === 'trying' && d.lmp) {
    const diff = diffDays(d.lmp, today);
    if (diff < 0 || diff > 120) throw new HttpError(400, 'Informe o primeiro dia da sua última menstruação (até 4 meses atrás).');
    d.dating_source = 'lmp';
  }
  delete d.ga_weeks; delete d.ga_days;

  const cols = Object.keys(d).filter((k) => k in current || k === 'dating_source');
  if (cols.length) {
    q.run(`UPDATE profiles SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE user_id = ?`,
      ...cols.map((c) => d[c]), user.id);
  }
  return { ...loadMe(user.id), ...result };
}, { auth: true });

put('/api/consents', async ({ user, body }) => {
  const d = validate(body, { health_data: { type: 'bool' }, ai_context: { type: 'bool' } }, { partial: true });
  const cur = q.get('SELECT * FROM consents WHERE user_id = ?', user.id);
  const health = 'health_data' in d ? d.health_data : cur.health_data;
  const ai = health ? ('ai_context' in d ? d.ai_context : cur.ai_context) : 0; // sem saúde, sem IA
  q.run(`UPDATE consents SET health_data = ?, ai_context = ?, accepted_at = COALESCE(accepted_at, datetime('now')),
         updated_at = datetime('now') WHERE user_id = ?`, health, ai, user.id);
  // Retirar o consentimento de saúde apaga as datas já guardadas (direito do titular)
  if (!health) q.run(`UPDATE profiles SET lmp=NULL, dating_source=NULL, dpp_input=NULL, cycle_length=NULL,
        cycle_regular=NULL, birth_date=NULL, goal=NULL, prenatal_type=NULL WHERE user_id = ?`, user.id);
  return loadMe(user.id);
}, { auth: true });

// ---- Exportar todos os dados da usuária (LGPD: portabilidade/acesso) ----
get('/api/me/export', async ({ user }) => {
  const id = user.id;
  const all = (sql) => q.all(sql, id);
  return {
    exported_at: new Date().toISOString(),
    user: q.get('SELECT id, email, display_name, role, created_at FROM users WHERE id = ?', id),
    profile: q.get('SELECT * FROM profiles WHERE user_id = ?', id),
    consents: q.get('SELECT * FROM consents WHERE user_id = ?', id),
    checklist: all('SELECT * FROM checklist WHERE user_id = ?'),
    tasks: all('SELECT * FROM tasks WHERE user_id = ?'),
    appointments: all('SELECT * FROM appointments WHERE user_id = ?'),
    diary: all('SELECT * FROM diary WHERE user_id = ?'),
    checkins: all('SELECT * FROM checkins WHERE user_id = ?'),
    questions: all('SELECT * FROM questions WHERE user_id = ?'),
    shopping_items: all('SELECT * FROM shopping_items WHERE user_id = ?'),
    support_plan: all('SELECT * FROM support_plan WHERE user_id = ?'),
    game_scores: all('SELECT * FROM game_scores WHERE user_id = ?'),
    achievements: all('SELECT * FROM achievements WHERE user_id = ?'),
    posts: all('SELECT * FROM posts WHERE user_id = ?'),
    comments: all('SELECT * FROM comments WHERE user_id = ?'),
    saved_posts: all('SELECT * FROM saved_posts WHERE user_id = ?'),
    ai_conversations: q.all(`SELECT c.id, c.title, c.created_at,
        (SELECT json_group_array(json_object('role', m.role, 'content', m.content, 'at', m.created_at))
           FROM ai_messages m WHERE m.conv_id = c.id) AS messages
        FROM ai_conversations c WHERE c.user_id = ?`, id),
  };
}, { auth: true });

// ---- Excluir conta e TODOS os dados (cascata no banco) ----
post('/api/me/delete', async ({ user, body, req, res }) => {
  const d = validate(body, { password: { type: 'string', required: true, max: 200 } });
  const row = q.get('SELECT password_hash FROM users WHERE id = ?', user.id);
  if (!verifyPassword(d.password, row.password_hash)) throw new HttpError(400, 'Senha incorreta.');
  destroySession(req, res);
  q.run('DELETE FROM users WHERE id = ?', user.id);
  return { ok: true };
}, { auth: true });

// ---- Apagar apenas dados emocionais (check-ins e diário) ----
del('/api/me/emotional', async ({ user }) => {
  q.run('DELETE FROM checkins WHERE user_id = ?', user.id);
  return { ok: true };
}, { auth: true });
