/**
 * Torna uma conta existente ADMIN (ou moderadora).
 * Uso:  npm run make-admin -- email@exemplo.com [moderator|admin]
 */
import { q } from '../server/db.js';
const [email, role = 'admin'] = process.argv.slice(2);
if (!email || !['admin', 'moderator', 'user'].includes(role)) { console.log('Uso: npm run make-admin -- email@exemplo.com [admin|moderator|user]'); process.exit(1); }
const r = q.run('UPDATE users SET role = ? WHERE email = ?', role, email.toLowerCase());
console.log(r.changes ? `✔ ${email} agora é "${role}".` : '✖ Nenhuma conta encontrada com esse e-mail. Cadastre-se primeiro.');
