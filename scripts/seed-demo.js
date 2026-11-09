/**
 * ============================================================
 *  MODO DEMONSTRAÇÃO (opcional)
 * ============================================================
 *  Cria uma conta de demonstração e algumas publicações de exemplo, TODAS marcadas
 *  como demonstração (selo visível na interface). NÃO use em produção real.
 *  Uso:  npm run seed:demo
 */
import { q, tx } from '../server/db.js';
import { seedContent } from '../server/seed.js';
import { hashPassword } from '../server/lib/auth.js';
import { addDays, todayISO } from '../shared/gestation.js';

seedContent();
const EMAIL = 'demo@ninna.local';
const PASSWORD = 'demonstracao123';
tx(() => {
  q.run('DELETE FROM users WHERE email = ?', EMAIL);
  const uid = Number(q.run('INSERT INTO users (email, password_hash, display_name, is_demo) VALUES (?,?,?,1)', EMAIL, hashPassword(PASSWORD), 'Conta Demonstração').lastInsertRowid);
  q.run("INSERT INTO consents (user_id, health_data, ai_context, accepted_at) VALUES (?,1,1,datetime('now'))", uid);
  const lmp = addDays(todayISO(), -(18 * 7 + 3));
  q.run("INSERT INTO profiles (user_id, stage, lmp, dating_source, prenatal_type, public_name, onboarded) VALUES (?, 'pregnant', ?, 'lmp', 'sus', 'Demo', 1)", uid, lmp);

  const posts = [
    ['primeiro-tri', 'Descobri a gravidez há duas semanas e estou dividida entre felicidade e medo. Alguém também sentiu isso?'],
    ['segundo-tri', 'Senti os primeiros movimentinhos hoje! Foi uma sensação difícil de descrever. Como foi para vocês?'],
    ['maternidade-real', 'Ninguém fala que ficar sem dormir bem na gestação também cansa a cabeça. Hoje foi um desses dias — e tudo bem.'],
  ];
  for (const [cat, body] of posts) {
    q.run("INSERT INTO posts (user_id, category, body, anonymous, pseudonym, is_demo) VALUES (?,?,?,1,'Visitante demo',1)", uid, cat, body);
  }
});
console.log(`✔ Demonstração criada.\n  E-mail: ${EMAIL}\n  Senha:  ${PASSWORD}\n  (publicações e conta com o selo "Demonstração")`);
