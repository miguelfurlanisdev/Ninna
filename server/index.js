/**
 * ============================================================
 *  NINNA — Servidor principal
 *  Rodar:  npm start   (ou: node server/index.js)
 * ============================================================
 *  Fluxo de cada requisição:
 *   1. Cabeçalhos de segurança
 *   2. /api/*  → encontra a rota, confere login/permissão, valida origem, executa
 *   3. outros  → arquivos estáticos de /public (e /shared)
 */
import http from 'node:http';
import { config } from './config.js';
import './db.js';
import { seedContent } from './seed.js';
import {
  HttpError, matchRoute, pathExistsForOtherMethod, readJson, sendJson, securityHeaders, serveStatic,
} from './lib/http.js';
import { getSessionUser } from './lib/auth.js';
// Registro das rotas (cada import adiciona suas rotas)
import './routes/auth.js';
import './routes/me.js';
import './routes/personal.js';
import './routes/content.js';
import './routes/community.js';
import './routes/ai.js';
import './routes/partner.js';
import './routes/games.js';
import './routes/admin.js';

seedContent();

const ROLE_RANK = { user: 0, moderator: 1, admin: 2 };

export function createServer() {
  return http.createServer(async (req, res) => {
    securityHeaders(res);
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        const m = matchRoute(req.method, url.pathname);
        if (!m) {
          if (pathExistsForOtherMethod(req.method, url.pathname)) throw new HttpError(405, 'Método não permitido.');
          throw new HttpError(404, 'Rota não encontrada.');
        }
        // Proteção CSRF extra: em métodos que alteram dados, a origem deve ser este mesmo site
        if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin) {
          if (new URL(req.headers.origin).host !== req.headers.host) throw new HttpError(403, 'Origem não permitida.');
        }
        const user = getSessionUser(req);
        const need = m.route.opts.auth;
        if (need && !user) throw new HttpError(401, 'Entre na sua conta para continuar.');
        if (need === 'mod' && ROLE_RANK[user.role] < 1) throw new HttpError(403, 'Acesso restrito.');
        if (need === 'admin' && ROLE_RANK[user.role] < 2) throw new HttpError(403, 'Acesso restrito à administração.');

        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readJson(req) : {};
        const query = Object.fromEntries(url.searchParams);
        // Atrás de proxy/Cloudflare/Render: defina TRUST_PROXY=true para usar o IP real do cabeçalho.
        const ip = config.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : (req.socket.remoteAddress || '');
        const out = await m.route.handler({ req, res, params: m.params, query, body, user, ip });
        return sendJson(res, 200, out ?? { ok: true });
      }
      if (!serveStatic(req, res, decodeURIComponent(url.pathname))) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Página não encontrada');
      }
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.status === 429 && e.extra.retryAfter) res.setHeader('Retry-After', e.extra.retryAfter);
        return sendJson(res, e.status, { error: e.message, ...e.extra });
      }
      console.error('[erro]', req.method, url.pathname, e);
      sendJson(res, 500, { error: 'Algo deu errado do nosso lado. Tente novamente.' });
    }
  });
}

// Só inicia a porta quando executado diretamente (os testes importam createServer)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()) && !process.env.NINNA_NO_LISTEN) {
  createServer().listen(config.port, () => {
    console.log(`\n🌿 NINNA rodando em http://localhost:${config.port}`);
    console.log(`   IA: ${config.ai.apiKey ? 'configurada' : 'NÃO configurada (defina ANTHROPIC_API_KEY)'} · Modo: ${config.isProd ? 'produção' : 'desenvolvimento'}\n`);
  });
}
