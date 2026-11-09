# 🌿 NINNA — Cuidar de quem gera a vida.

Plataforma web (pt-BR) de informação, organização e apoio para quem está **tentando engravidar, gestantes, mães recentes e suas famílias**.
Aplicação real e navegável: contas, onboarding, painel por fase, 40 semanas, calendário, biblioteca, Ninna AI, comunidade, modo parceiro, jogos, enxoval/compras e painel administrativo.

> ⚠️ Conteúdo **informativo**. Não substitui profissionais de saúde. Todo conteúdo inicial entra como **"aguardando revisão profissional"** — nenhuma revisão foi inventada. Os Termos/Privacidade são **modelos** que precisam de revisão jurídica.

## Rodar localmente

Requisitos: **Node.js 22.5+** (usa o SQLite embutido; **zero dependências** para instalar).

```bash
cp .env.example .env        # opcional: preencha ADMIN_EMAIL e ANTHROPIC_API_KEY
npm start                   # http://localhost:3000
npm test                    # 25 testes automatizados
npm run seed:demo           # (opcional) conta/posts de DEMONSTRAÇÃO, com selo visível
```

- **Administradora:** coloque seu e-mail em `ADMIN_EMAIL` e cadastre-se com ele → aparece "Painel administrativo" no menu. Ou: `npm run make-admin -- email@dominio.com`.
- **Ninna AI:** sem `ANTHROPIC_API_KEY` a tela mostra "não configurada" (nada é simulado). Com a chave (só no servidor), o chat funciona.

## Estrutura de pastas (onde mudar cada coisa)

```
ninna/
├── server/                  BACKEND (Node, sem frameworks)
│   ├── index.js             servidor: segurança, rotas /api, arquivos estáticos
│   ├── config.js            configurações (.env)
│   ├── db.js                ⭐ tabelas do banco (SQLite) e migrações
│   ├── seed.js              carrega /content no banco na 1ª execução
│   ├── lib/                 auth (scrypt+sessão), validação, limite de requisições, e-mail
│   └── routes/              auth, me (perfil/LGPD), personal, content, community, ai, partner, games, admin
├── shared/gestation.js      ⭐ cálculos de semanas/DPP/ciclo (usado no servidor E no navegador)
├── content/                 ⭐ CONTEÚDO EDITÁVEL sem mexer em código
│   ├── weeks.json + trimesters.json   as 40 semanas
│   ├── articles.json, glossary.json, games.json
│   └── meta.json            categorias, grupos, lojas, telefones, frases, humores
├── public/                  FRONTEND (HTML/CSS/JS puro, sem build)
│   ├── index.html
│   ├── css/  tokens.css ⭐(cores/fontes) · base · components · layout · pages
│   └── js/
│       ├── main.js · shell.js (menu) · lib/ (router, api, ui, art, motion, reminders...)
│       └── views/  uma tela por arquivo (landing, dashboard, weeks, calendar, ...)
├── scripts/                 seed-demo, make-admin, reseed-weeks
├── tests/                   gestation.test.js, api.test.js
└── docs/GUIA-DE-EDICAO.md   receitas "quero mudar X → edite Y"
```
Todo arquivo tem comentários em português; procure por **🔧 EDITAR** para achar os pontos de personalização.

## Tecnologia e por quê
| Pedido original | O que foi usado | Motivo |
|---|---|---|
| Next.js/React/Tailwind/shadcn | **HTML+CSS+JS (módulos ES) sem build** | O ambiente não tinha acesso ao npm. Resultado: nenhuma dependência, sobe em qualquer Node 22. Componentes reutilizáveis em `public/js/lib`. |
| Framer Motion | CSS + Web Animations API (`lib/motion.js`) | Mesmas animações; respeita "reduzir movimento". |
| Supabase/PostgreSQL + RLS | **SQLite** (node:sqlite) + isolamento por `user_id` em toda rota | Funciona sem serviço externo. Esquema compatível com Postgres (ver `server/db.js`). |
| Zod | `server/lib/validate.js` | Validação no servidor, sem dependência. |
| API de LLM | Anthropic Messages API via backend | Chave nunca vai ao navegador. |

## Funcionalidades prontas
Cadastro/login/logout/recuperação de senha · onboarding com consentimento (LGPD) · painel por fase (gestante, tentante, pós-parto, apoio) · cálculo de idade gestacional (DUM/DPP/semanas, com alerta de conflito) · 40 semanas com 8 abas, checklist salvo, diário privado, linha do tempo · calendário (mês/lista, CRUD, lembretes, ciclo estimado) · biblioteca com busca, referências e selo de revisão/desatualizado · Ninna AI (histórico, limites, avisos fixos de urgência/crise) · Nossa Rede (posts, comentários, reações, salvos, grupos, anônimo, denúncia, bloqueio, moderação automática por 3 denúncias) · Juntos (convite com permissões; parceiro nunca edita dados médicos) · 6 jogos com conquistas · enxoval com orçamento em R$, exportar/imprimir · bem-estar (diário, check-in, reflexões, rede de apoio, ajuda: SAMU 192, CVV 188, Ligue 180) · configurações (jornada, privacidade, exportar JSON, excluir conta) · painel admin (artigos, semanas, moderação, produtos, perguntas, usuárias, logs).

## Depende de configuração externa / não incluído
- **Ninna AI**: precisa de `ANTHROPIC_API_KEY`. RAG sobre documentos revisados **não** implementado.
- **E-mail** (recuperação de senha): `server/lib/mailer.js` apenas registra no console; em desenvolvimento o link aparece na tela. Plugue Resend/SES/SMTP antes de produção.
- **Notificações**: funcionam **com o app aberto** (toast + Notification API com permissão). Push/e-mail/SMS com app fechado **não existe**, e a interface avisa isso.
- **Links de compras**: só buscas públicas das lojas (identificadas) + links cadastrados no admin. Nenhum produto/preço inventado.
- **Revisão profissional** dos textos, **Termos/Privacidade** (dados da empresa/DPO) e **ilustrações** (SVG próprias, simbólicas).
- Limite de requisições é em memória (use Redis se rodar várias instâncias).

## Banco de dados (tabelas)
users, sessions, reset_tokens · profiles, consents · checklist, tasks, appointments, diary, checkins, questions, shopping_items, support_plan · game_scores, achievements, quiz_questions · articles, week_content, product_links · groups, group_members, posts, comments, reactions, saved_posts, reports, blocks · ai_conversations, ai_messages · partner_links · admin_logs. Detalhes e comentários em `server/db.js`.

## Variáveis de ambiente (`.env.example`)
`PORT`, `NODE_ENV`, `DB_PATH`, `ADMIN_EMAIL`, `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_RATE_LIMIT`, `TRUST_PROXY`.

## Deploy
Qualquer host com **Node 22.5+** e disco persistente (Render, Railway, Fly.io, VPS):
1. `NODE_ENV=production`, `ADMIN_EMAIL`, `ANTHROPIC_API_KEY`, `TRUST_PROXY=true` (atrás de proxy), `DB_PATH` apontando para o **volume persistente**.
2. Comando de início: `npm start`. Sirva por **HTTPS** (cookies ficam `Secure` em produção).
3. Faça backup do arquivo `.db`. Em produção o link de recuperação de senha **não** é exibido: configure o e-mail primeiro.

## Subir no GitHub
```bash
git init && git add . && git commit -m "NINNA: primeira versão"
git branch -M main && git remote add origin https://github.com/SEU-USUARIO/ninna.git && git push -u origin main
```
`.gitignore` já exclui `.env`, bancos `.db` e `node_modules`.

## Segurança (resumo)
Senhas com scrypt · sessão em cookie HttpOnly/SameSite · checagem de origem (CSRF) · CSP restritiva · validação e autorização **no servidor** (admin/moderação testados) · isolamento por usuária (testado) · limites de requisições · exportação e exclusão de dados · publicações anônimas ocultam identidade (não é anonimato absoluto; avisado na tela).

## Limitações conhecidas / próximos passos
Revisão profissional do conteúdo · e-mail transacional · RAG com fontes revisadas · push real · testes E2E automatizados no CI · migrar para Postgres se escalar · ilustrações editoriais profissionais · acessibilidade: auditar com leitor de tela real.
