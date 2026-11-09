/**
 * ============================================================
 *  Autenticação: senhas (scrypt) e sessões por cookie HttpOnly
 * ============================================================
 *  - Senhas nunca são guardadas em texto: usamos scrypt com "sal" aleatório.
 *  - O cookie guarda um token aleatório; no banco guardamos só o HASH do token.
 *  - 🔧 EDITAR: política de senha em `checkPassword`.
 */
import crypto from 'node:crypto';
import { q } from '../db.js';
import { config } from '../config.js';
import { HttpError, parseCookies, setCookie } from './http.js';

export const COOKIE = 'ninna_sid';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Hash "falso" usado para gastar o mesmo tempo quando o e-mail não existe
export const DUMMY_HASH = hashPassword('dummy-password-for-timing');

export function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'A senha precisa ter pelo menos 8 caracteres.');
  if (pw.length > 128) throw new HttpError(400, 'A senha é muito longa (máx. 128).');
}

export function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  q.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)', sha256(token), userId, expires.toISOString());
  setCookie(res, COOKIE, token, { maxAgeSec: config.sessionDays * 86400 });
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) q.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
  setCookie(res, COOKIE, '', { clear: true });
}

export function destroyAllSessions(userId) {
  q.run('DELETE FROM sessions WHERE user_id = ?', userId);
}

/** Retorna a usuária logada (ou null). */
export function getSessionUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const row = q.get(
    `SELECT u.id, u.email, u.display_name, u.role, u.is_demo, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, sha256(token));
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) { q.run('DELETE FROM sessions WHERE token_hash = ?', sha256(token)); return null; }
  return row;
}

export const hashToken = sha256;
export const newToken = () => crypto.randomBytes(32).toString('base64url');
