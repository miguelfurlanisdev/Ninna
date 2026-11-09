/**
 * ============================================================
 *  NINNA — Banco de dados (SQLite embutido do Node 22: node:sqlite)
 * ============================================================
 *  Todas as tabelas ficam aqui. Para mudar a estrutura:
 *   1. Adicione a coluna/tabela em SCHEMA (CREATE TABLE IF NOT EXISTS)
 *   2. Para bancos já criados, adicione um ALTER TABLE em MIGRATIONS (no fim da lista)
 *
 *  Privacidade: dados do usuário (diário, check-ins, consultas...) têm `user_id`
 *  e TODA consulta nas rotas filtra por `user_id` da sessão (ver server/routes).
 *  O equivalente ao "Row Level Security" do Supabase é feito no código das rotas.
 *
 *  Migrar depois para PostgreSQL/Supabase? O esquema abaixo é compatível
 *  (troque INTEGER PRIMARY KEY AUTOINCREMENT por bigserial e TEXT de data por timestamptz).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const SCHEMA = `
-- ---------- Contas e sessões ----------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','moderator','admin')),
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0
);

-- ---------- Perfil, jornada e consentimentos ----------
CREATE TABLE IF NOT EXISTS profiles (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stage          TEXT CHECK (stage IN ('trying','pregnant','postpartum','support')),
  lmp            TEXT,      -- DUM "canônica" usada nos cálculos (AAAA-MM-DD)
  dating_source  TEXT,      -- 'lmp' | 'dpp' | 'ga'  (de onde veio a data)
  dpp_input      TEXT,      -- DPP informada por profissional (opcional)
  cycle_length   INTEGER,   -- tentantes
  cycle_regular  TEXT,      -- 'regular' | 'irregular' | 'unknown'
  goal           TEXT,
  prenatal_type  TEXT,      -- 'sus' | 'private' | 'mixed' | 'none'
  birth_date     TEXT,      -- pós-parto: data do nascimento
  baby_name      TEXT,
  remind_default INTEGER NOT NULL DEFAULT 60,   -- antecedência padrão (min)
  browser_notifs INTEGER NOT NULL DEFAULT 0,
  bio            TEXT,
  public_name    TEXT,      -- nome na comunidade
  onboarded      INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS consents (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  health_data INTEGER NOT NULL DEFAULT 0,  -- tratamento de dados de saúde (datas, sintomas...)
  ai_context  INTEGER NOT NULL DEFAULT 0,  -- permite enviar a semana gestacional à IA
  accepted_at TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Organização pessoal (todas filtradas por user_id) ----------
CREATE TABLE IF NOT EXISTS checklist (       -- progresso das checklists semanais/pós-parto
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,                    -- ex.: "w12:docs"
  done     INTEGER NOT NULL DEFAULT 0,
  done_at  TEXT,
  PRIMARY KEY (user_id, item_key)
);
CREATE TABLE IF NOT EXISTS tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  due        TEXT,
  done       INTEGER NOT NULL DEFAULT 0,
  shared     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, done);
CREATE TABLE IF NOT EXISTS appointments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'consulta',
  starts_at      TEXT NOT NULL,              -- AAAA-MM-DDTHH:MM (horário local da usuária)
  notes          TEXT,
  done           INTEGER NOT NULL DEFAULT 0,
  remind_minutes INTEGER,                    -- NULL = sem lembrete
  shared         INTEGER NOT NULL DEFAULT 0, -- visível ao parceiro (se houver autorização)
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appt_user ON appointments(user_id, starts_at);
CREATE TABLE IF NOT EXISTS diary (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week       INTEGER,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_diary_user ON diary(user_id, created_at);
CREATE TABLE IF NOT EXISTS checkins (        -- check-in emocional opcional (NÃO é diagnóstico)
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mood       INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS questions (       -- dúvidas para a próxima consulta
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS shopping_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  name        TEXT NOT NULL,
  qty         INTEGER NOT NULL DEFAULT 1,
  priority    TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','baixa')),
  est_cents   INTEGER NOT NULL DEFAULT 0,    -- preço estimado por unidade (centavos de R$)
  paid_cents  INTEGER NOT NULL DEFAULT 0,    -- valor pago (total) em centavos
  bought      INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shop_user ON shopping_items(user_id, category);
CREATE TABLE IF NOT EXISTS support_plan (    -- jogo "Monte seu plano de apoio"
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person  TEXT NOT NULL,
  contact TEXT,
  task    TEXT NOT NULL
);

-- ---------- Jogos e conquistas ----------
CREATE TABLE IF NOT EXISTS game_scores (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game    TEXT NOT NULL,
  best    INTEGER NOT NULL DEFAULT 0,
  plays   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, game)
);
CREATE TABLE IF NOT EXISTS achievements (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS quiz_questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  game         TEXT NOT NULL CHECK (game IN ('quiz','mito')),
  stage        INTEGER,                      -- trimestre 1-3 (quiz) ou NULL
  difficulty   INTEGER NOT NULL DEFAULT 1,
  question     TEXT NOT NULL,
  options      TEXT NOT NULL,                -- JSON array de strings
  answer_index INTEGER NOT NULL,
  explanation  TEXT NOT NULL,
  source       TEXT,
  active       INTEGER NOT NULL DEFAULT 1
);

-- ---------- Conteúdo editorial (gerenciado no painel admin) ----------
CREATE TABLE IF NOT EXISTS articles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  category      TEXT NOT NULL,
  summary       TEXT NOT NULL,
  body          TEXT NOT NULL,               -- parágrafos separados por linha em branco; "## " = subtítulo
  refs          TEXT NOT NULL DEFAULT '[]',  -- JSON [{title, org, url?}]
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','reviewed')),
  reviewed_by   TEXT,                        -- nome/registro do(a) profissional (só se REAL)
  reviewed_at   TEXT,                        -- AAAA-MM-DD da última revisão
  stages        TEXT NOT NULL DEFAULT '[]',  -- JSON: fases para recomendação ['pregnant','postpartum'...]
  weeks_from    INTEGER, weeks_to INTEGER,   -- recomendado para este intervalo de semanas
  published     INTEGER NOT NULL DEFAULT 1,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    INTEGER
);
CREATE TABLE IF NOT EXISTS week_content (
  week          INTEGER PRIMARY KEY CHECK (week BETWEEN 1 AND 42),
  data          TEXT NOT NULL,               -- JSON (ver content/weeks.json)
  review_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at   TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS product_links (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  category  TEXT NOT NULL,
  title     TEXT NOT NULL,
  url       TEXT NOT NULL,
  note      TEXT,
  kind      TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'afiliado'
  active    INTEGER NOT NULL DEFAULT 1
);

-- ---------- Comunidade "Nossa Rede" ----------
CREATE TABLE IF NOT EXISTS groups (
  slug  TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  about TEXT NOT NULL,
  sort  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS group_members (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug    TEXT NOT NULL REFERENCES groups(slug) ON DELETE CASCADE,
  PRIMARY KEY (user_id, slug)
);
CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL REFERENCES groups(slug),
  body       TEXT NOT NULL,
  anonymous  INTEGER NOT NULL DEFAULT 0,
  pseudonym  TEXT,
  status     TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  is_demo    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  edited_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_cat ON posts(category, status, created_at);
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  anonymous  INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE TABLE IF NOT EXISTS reactions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  type    TEXT NOT NULL DEFAULT 'abraco',
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS saved_posts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','comment')),
  target_id   INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','hidden','dismissed')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_by INTEGER
);
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- ---------- Ninna AI ----------
CREATE TABLE IF NOT EXISTS ai_conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role    TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  urgent  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_aimsg_conv ON ai_messages(conv_id, id);

-- ---------- Modo parceiro "Juntos" ----------
CREATE TABLE IF NOT EXISTS partner_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  label       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')),
  -- permissões escolhidas pela gestante (JSON): weekly, calendar, shopping, shopping_edit, tasks
  perms       TEXT NOT NULL DEFAULT '{}',
  expires_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_partner_owner ON partner_links(owner_id);
CREATE INDEX IF NOT EXISTS idx_partner_partner ON partner_links(partner_id);

-- ---------- Auditoria administrativa ----------
CREATE TABLE IF NOT EXISTS admin_logs (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  action   TEXT NOT NULL,
  target   TEXT,
  detail   TEXT,
  at       TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/** 🔧 Migrações para bancos já existentes: adicione novas linhas NO FINAL. */
const MIGRATIONS = [
  // Exemplo: "ALTER TABLE profiles ADD COLUMN nova_coluna TEXT",
];

db.exec(SCHEMA);
for (const sql of MIGRATIONS) { try { db.exec(sql); } catch { /* já aplicada */ } }

// ---------- Helpers curtos para as rotas ----------
export const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
};

/** Executa várias operações de forma atômica. */
export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function adminLog(adminId, action, target, detail) {
  q.run('INSERT INTO admin_logs (admin_id, action, target, detail) VALUES (?,?,?,?)',
    adminId ?? null, action, target ?? null, detail ? String(detail).slice(0, 500) : null);
}
