/**
 * Testes de ponta a ponta da API: cadastro/login, isolamento de dados entre usuárias,
 * consentimento de saúde, permissões do parceiro, painel admin, exportação e exclusão (LGPD).
 * Usa um banco temporário (não mexe em data/ninna.db).
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { todayISO, addDays } from '../shared/gestation.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ninna-'));
process.env.DB_PATH = path.join(dir, 't.db'); process.env.NINNA_NO_LISTEN = '1'; process.env.NINNA_TEST = '1'; process.env.ADMIN_EMAIL = 'admin@t.com';
const { createServer } = await import('../server/index.js');
let server, base;
before(async () => { server = createServer(); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`; });
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

/** Cliente com "cookie jar" simples (uma usuária por instância). */
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}
const reg = async (email, name = 'Teste') => { const c = client(); const r = await c('POST', '/api/auth/register', { email, password: 'senha12345', display_name: name, accept_terms: true }); assert.equal(r.status, 200, JSON.stringify(r.data)); return c; };

test('cadastro exige aceite dos termos e senha de 8+ caracteres', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/register', { email: 'a@a.com', password: 'senha12345', display_name: 'A' })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', { email: 'a@a.com', password: '123', display_name: 'A', accept_terms: true })).status, 400);
});
test('login errado → 401 genérico; certo → 200; /api/me exige sessão', async () => {
  const c = await reg('login@t.com');
  const anon = client();
  assert.equal((await anon('GET', '/api/me')).status, 401);
  assert.equal((await anon('POST', '/api/auth/login', { email: 'login@t.com', password: 'errada123' })).status, 401);
  assert.equal((await anon('POST', '/api/auth/login', { email: 'login@t.com', password: 'senha12345' })).status, 200);
  assert.equal((await anon('GET', '/api/me')).status, 200);
  assert.equal((await c('POST', '/api/auth/logout')).status, 200);
  assert.equal((await c('GET', '/api/me')).status, 401);
});
test('dados de saúde exigem consentimento; DUM calcula semanas', async () => {
  const c = await reg('saude@t.com');
  assert.equal((await c('POST', '/api/diary', { body: 'oi' })).status, 403);
  assert.equal((await c('PUT', '/api/profile', { stage: 'pregnant', lmp: '2026-05-01' })).status, 403);
  await c('PUT', '/api/consents', { health_data: true });
  const today = todayISO(), lmp = addDays(today, -70);
  const r = await c('PUT', '/api/profile', { stage: 'pregnant', lmp, onboarded: true });
  assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.gestation.weeks, 10); assert.equal(r.data.gestation.days, 0);
  assert.equal((await c('PUT', '/api/profile', { stage: 'pregnant', lmp: '2999-01-01' })).status, 400, today);
  assert.equal((await c('POST', '/api/diary', { body: 'oi' })).status, 200);
});
test('retirar o consentimento apaga as datas de saúde', async () => {
  const c = await reg('retira@t.com'); await c('PUT', '/api/consents', { health_data: true });
  await c('PUT', '/api/profile', { stage: 'trying', lmp: addDays(todayISO(), -5) });
  const r = await c('PUT', '/api/consents', { health_data: false });
  assert.equal(r.data.profile.lmp, null); assert.equal(r.data.consents.ai_context, 0);
});
test('isolamento: uma usuária não lê nem altera registros de outra', async () => {
  const a = await reg('a1@t.com'), b = await reg('b1@t.com');
  const t = (await a('POST', '/api/tasks', { title: 'segredo da A' })).data.item;
  assert.equal((await b('GET', '/api/tasks')).data.items.length, 0);
  assert.equal((await b('PUT', '/api/tasks/' + t.id, { title: 'hack' })).status, 404);
  assert.equal((await b('DELETE', '/api/tasks/' + t.id)).status, 404);
  assert.equal((await a('GET', '/api/tasks')).data.items[0].title, 'segredo da A');
});
test('validação no servidor: tipos, tamanhos e enums', async () => {
  const c = await reg('val@t.com');
  assert.equal((await c('POST', '/api/tasks', { title: '' })).status, 400);
  assert.equal((await c('POST', '/api/tasks', { title: 'x'.repeat(500) })).status, 400);
  assert.equal((await c('POST', '/api/shopping', { name: 'a', category: 'inexistente' })).status, 400);
  assert.equal((await c('POST', '/api/tasks', { title: 'ok', due: '2026-02-31' })).status, 400);
});
test('rotas admin: usuária comum recebe 403; sem login 401; ADMIN_EMAIL vira admin', async () => {
  const u = await reg('comum@t.com'), anon = client(), adm = await reg('admin@t.com');
  assert.equal((await u('GET', '/api/admin/stats')).status, 403);
  assert.equal((await u('PUT', '/api/admin/users/1/role', { role: 'admin' })).status, 403);
  assert.equal((await anon('GET', '/api/admin/stats')).status, 401);
  assert.equal((await adm('GET', '/api/admin/stats')).status, 200);
  const stats = (await adm('GET', '/api/admin/stats')).data; assert.ok(stats.users >= 1); assert.equal(stats.articles > 0, true);
});
test('admin não pode marcar artigo como "revisado" sem revisor e data (sem revisão inventada)', async () => {
  const adm = await reg('admin@t.com').catch(() => null); // já existe → faz login
  const c = adm || client(); if (!adm) await c('POST', '/api/auth/login', { email: 'admin@t.com', password: 'senha12345' });
  const r = await c('POST', '/api/admin/articles', { slug: 'teste-x', title: 'Teste', category: 'parto', summary: 'resumo ok', body: 'corpo do artigo ok', review_status: 'reviewed' });
  assert.equal(r.status, 400);
});
test('parceiro: só vê o que foi autorizado e nunca o diário', async () => {
  const owner = await reg('dona@t.com'), partner = await reg('par@t.com');
  await owner('PUT', '/api/consents', { health_data: true });
  await owner('POST', '/api/diary', { body: 'segredo do diário' });
  await owner('POST', '/api/appointments', { title: 'Privada', starts_at: '2099-01-01T10:00' });
  await owner('POST', '/api/appointments', { title: 'Compartilhada', starts_at: '2099-01-02T10:00', shared: true });
  const inv = (await owner('POST', '/api/partner/invite', { label: 'Par', perms: { calendar: true } })).data;
  assert.ok(inv.code);
  assert.equal((await partner('POST', '/api/partner/join', { code: 'ZZZZZZZZ' })).status, 404);
  const j = await partner('POST', '/api/partner/join', { code: inv.code }); assert.equal(j.status, 200);
  const s = (await partner('GET', '/api/partner/shared/' + j.data.link_id)).data;
  assert.deepEqual(s.appointments.map((a) => a.title), ['Compartilhada']);
  assert.equal(JSON.stringify(s).includes('segredo'), false); assert.deepEqual(s.shopping, []);
  assert.equal((await partner('PUT', `/api/partner/shared/${j.data.link_id}/tasks/1`, { done: true })).status, 403);
  assert.equal((await partner('POST', `/api/partner/shared/${j.data.link_id}/shopping`, { name: 'x' })).status, 403);
  await owner('POST', `/api/partner/links/${j.data.link_id}/revoke`);
  assert.equal((await partner('GET', '/api/partner/shared/' + j.data.link_id)).status, 404);
});
test('comunidade: anônima não vaza identidade; filtros de conteúdo; denúncias ocultam', async () => {
  const a = await reg('ca@t.com', 'Maria Secreta'), b = await reg('cb@t.com');
  assert.equal((await a('POST', '/api/community/posts', { category: 'duvidas-gerais', body: 'me liga 11 98765-4321' })).status, 400);
  assert.equal((await a('POST', '/api/community/posts', { category: 'duvidas-gerais', body: 'veja https://spam.com agora' })).status, 400);
  assert.equal((await a('POST', '/api/community/posts', { category: 'duvidas-gerais', body: 'tome 500 mg de remédio xyz' })).status, 400);
  const p = (await a('POST', '/api/community/posts', { category: 'duvidas-gerais', body: 'Texto anônimo de teste', anonymous: true })).data.post;
  const feed = JSON.stringify((await b('GET', '/api/community/posts')).data);
  assert.ok(feed.includes('Texto anônimo')); assert.equal(feed.includes('Maria') || feed.includes('user_id'), false);
  for (let i = 0; i < 3; i++) { const r = await (await reg(`rep${i}@t.com`))('POST', '/api/community/report', { type: 'post', id: p.id, reason: 'spam' }); assert.equal(r.status, 200); }
  assert.equal((await b('GET', '/api/community/posts')).data.items.some((x) => x.id === p.id), false);
});
test('Ninna AI sem chave: estado "não configurada" (nada simulado) e aviso de urgência fixo', async () => {
  const c = await reg('ia@t.com');
  assert.equal((await c('GET', '/api/ai/status')).data.configured, false);
  const r = (await c('POST', '/api/ai/chat', { message: 'estou com muito sangramento forte' })).data;
  assert.equal(r.configured, false); assert.equal(r.reply, null); assert.equal(r.notice.kind, 'urgent'); assert.ok(r.notice.text.includes('192'));
  assert.equal((await c('POST', '/api/ai/chat', { message: 'quero me matar' })).data.notice.kind, 'crisis');
});
test('exportação e exclusão da conta (LGPD)', async () => {
  const c = await reg('lgpd@t.com'); await c('PUT', '/api/consents', { health_data: true }); await c('POST', '/api/diary', { body: 'meu diário' });
  const exp = (await c('GET', '/api/me/export')).data; assert.equal(exp.diary.length, 1); assert.equal(exp.user.email, 'lgpd@t.com');
  assert.equal((await c('POST', '/api/me/delete', { password: 'errada' })).status, 400);
  assert.equal((await c('POST', '/api/me/delete', { password: 'senha12345' })).status, 200);
  assert.equal((await c('GET', '/api/me')).status, 401);
  const again = client(); assert.equal((await again('POST', '/api/auth/login', { email: 'lgpd@t.com', password: 'senha12345' })).status, 401);
});
test('CSRF: origem diferente é bloqueada em métodos de escrita', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
  assert.equal(res.status, 403);
});
test('arquivos estáticos: não permite sair da pasta public', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/..%2Fserver%2Fconfig.js')).status, 404);
  assert.equal((await fetch(base + '/shared/gestation.js')).status, 200);
});
