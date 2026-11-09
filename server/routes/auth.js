/**
 * Rotas de conta: cadastro, login, logout, recuperação e troca de senha.
 * 🔧 EDITAR: limites de tentativas (função `limit`) e mensagens.
 */
import { get, post, HttpError } from '../lib/http.js';
import { q, tx } from '../db.js';
import { config } from '../config.js';
import { validate } from '../lib/validate.js';
import { limit } from '../lib/ratelimit.js';
import { sendMail } from '../lib/mailer.js';
import {
  hashPassword, verifyPassword, DUMMY_HASH, checkPassword, createSession, destroySession,
  destroyAllSessions, hashToken, newToken,
} from '../lib/auth.js';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

post('/api/auth/register', async ({ body, res, ip }) => {
  limit(`reg:${ip}`, 10, 3600_000);
  const d = validate(body, {
    email: { type: 'string', required: true, max: 160, label: 'E-mail' },
    password: { type: 'string', required: true, min: 1, max: 200, label: 'Senha' },
    display_name: { type: 'string', required: true, min: 1, max: 60, label: 'Nome' },
    accept_terms: { type: 'bool' },
  });
  const email = d.email.toLowerCase();
  if (!EMAIL_RX.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
  checkPassword(d.password);
  if (!d.accept_terms) throw new HttpError(400, 'Para criar a conta, aceite os Termos e a Política de Privacidade.');
  if (q.get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'Este e-mail já está cadastrado. Tente entrar.');

  const role = config.adminEmail && email === config.adminEmail ? 'admin' : 'user';
  const id = tx(() => {
    const r = q.run('INSERT INTO users (email, password_hash, display_name, role) VALUES (?,?,?,?)',
      email, hashPassword(d.password), d.display_name, role);
    const uid = Number(r.lastInsertRowid);
    q.run('INSERT INTO profiles (user_id, public_name) VALUES (?,?)', uid, d.display_name.split(' ')[0]);
    q.run('INSERT INTO consents (user_id) VALUES (?)', uid);
    return uid;
  });
  createSession(res, id);
  return { ok: true };
});

post('/api/auth/login', async ({ body, res, ip }) => {
  const d = validate(body, {
    email: { type: 'string', required: true, max: 160 },
    password: { type: 'string', required: true, max: 200 },
  });
  const email = d.email.toLowerCase();
  limit(`login:${ip}:${email}`, 8, 600_000);
  const user = q.get('SELECT id, password_hash FROM users WHERE email = ?', email);
  // Verifica sempre (mesmo sem usuária) para não vazar por tempo de resposta se o e-mail existe
  const ok = verifyPassword(d.password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'E-mail ou senha incorretos.');
  createSession(res, user.id);
  return { ok: true };
});

post('/api/auth/logout', async ({ req, res }) => { destroySession(req, res); return { ok: true }; });

// Recuperação de senha: resposta SEMPRE igual (não revela se o e-mail existe)
post('/api/auth/forgot', async ({ body, ip, req }) => {
  limit(`forgot:${ip}`, 5, 3600_000);
  const d = validate(body, { email: { type: 'string', required: true, max: 160 } });
  const user = q.get('SELECT id, email FROM users WHERE email = ?', d.email.toLowerCase());
  const out = { ok: true, message: 'Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir a senha.' };
  if (user) {
    const token = newToken();
    q.run('INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?,?,?)',
      hashToken(token), user.id, new Date(Date.now() + 3600_000).toISOString());
    const link = `${req.headers.origin || `http://${req.headers.host}`}/#/redefinir?token=${token}`;
    await sendMail({ to: user.email, subject: 'NINNA — redefinir senha', text: `Use este link (vale por 1 hora): ${link}` });
    // Só em desenvolvimento, como não há e-mail real conectado, mostramos o link na tela.
    if (!config.isProd) out.devLink = link;
  }
  return out;
});

post('/api/auth/reset', async ({ body, ip }) => {
  limit(`reset:${ip}`, 10, 3600_000);
  const d = validate(body, {
    token: { type: 'string', required: true, max: 200 },
    password: { type: 'string', required: true, max: 200 },
  });
  checkPassword(d.password);
  const row = q.get('SELECT * FROM reset_tokens WHERE token_hash = ? AND used = 0', hashToken(d.token));
  if (!row || new Date(row.expires_at) < new Date()) throw new HttpError(400, 'Link inválido ou expirado. Solicite um novo.');
  tx(() => {
    q.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(d.password), row.user_id);
    q.run('UPDATE reset_tokens SET used = 1 WHERE token_hash = ?', row.token_hash);
    destroyAllSessions(row.user_id);
  });
  return { ok: true };
});

post('/api/auth/change-password', async ({ body, user, res }) => {
  const d = validate(body, {
    current: { type: 'string', required: true, max: 200 },
    password: { type: 'string', required: true, max: 200 },
  });
  const row = q.get('SELECT password_hash FROM users WHERE id = ?', user.id);
  if (!verifyPassword(d.current, row.password_hash)) throw new HttpError(400, 'A senha atual está incorreta.');
  checkPassword(d.password);
  q.run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(d.password), user.id);
  destroyAllSessions(user.id);
  createSession(res, user.id); // mantém esta sessão ativa
  return { ok: true };
}, { auth: true });
