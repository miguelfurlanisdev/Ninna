/**
 * ============================================================
 *  NINNA — Configuração central do servidor
 * ============================================================
 *  Lê o arquivo ".env" (se existir) e as variáveis de ambiente.
 *  🔧 EDITAR: valores padrão abaixo. Em produção, use o .env (veja .env.example).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Mini-leitor de .env (evita depender do pacote "dotenv")
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const val = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadDotEnv();

const env = process.env;

export const config = {
  port: Number(env.PORT) || 3000,
  isProd: env.NODE_ENV === 'production',
  dbPath: path.resolve(ROOT, env.DB_PATH || './data/ninna.db'),
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),

  trustProxy: env.TRUST_PROXY === 'true',

  // 🔧 EDITAR: tempo de duração do login (dias)
  sessionDays: 30,

  // Ninna AI — a chave fica SOMENTE aqui no servidor
  ai: {
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.AI_MODEL || 'claude-sonnet-5-5',
    url: env.AI_API_URL || 'https://api.anthropic.com/v1/messages',
    rateLimit: Number(env.AI_RATE_LIMIT) || 20, // mensagens por 10 min por usuária
    maxTokens: 900,
  },
};
