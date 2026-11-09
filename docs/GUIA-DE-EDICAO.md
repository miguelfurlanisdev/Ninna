# Guia de edição — "quero mudar X, onde mexo?"

| Quero mudar… | Arquivo |
|---|---|
| Cores, fontes, arredondamento, sombras | `public/css/tokens.css` |
| Visual de uma tela (landing, painel, calendário, jogos…) | `public/css/pages.css` (procure o comentário da seção) |
| Botões, cards, modais, formulários | `public/css/components.css` |
| Menu lateral / barra inferior | `public/js/shell.js` (lista `NAV`) + `public/css/layout.css` |
| Textos da página inicial | `public/js/views/landing.js` (arrays `FEATURES`, `STAGES`, `PROMISES`) |
| Logo e ilustrações | `public/js/lib/art.js` e `public/assets/favicon.svg` |
| Nome do produto / slogan | `index.html`, `landing.js`, `shell.js`, `art.js` (busque "NINNA") |
| Conteúdo das 40 semanas | `content/weeks.json`, `content/trimesters.json` → `npm run reseed:weeks`; ou edite no **Admin › Semanas** |
| Artigos, glossário | `content/articles.json` (1ª execução) ou **Admin › Artigos** |
| Categorias, grupos da comunidade, lojas, telefones, frases de incentivo, humores | `content/meta.json` |
| Perguntas de Mito/Verdade e Quiz | **Admin › Perguntas dos jogos**; itens da mala, memória e marcos: `content/games.json` |
| Tipos de compromisso do calendário | `public/js/lib/widgets.js` (`APPT_KINDS`) **e** `server/routes/personal.js` |
| Opções de antecedência de lembretes | `public/js/views/calendar.js` (`REMIND`) |
| Regras do prompt da Ninna AI e avisos de emergência | `server/routes/ai.js` (`SYSTEM_PROMPT`, `SAFETY_NOTICES`) |
| Regras de moderação da comunidade | `server/routes/community.js` (`checkContent`, `AUTO_HIDE_AFTER_REPORTS`) |
| Política de senha / duração do login | `server/lib/auth.js` / `server/config.js` |
| Cálculo de DPP, trimestres, ciclo | `shared/gestation.js` |
| Tabelas e campos novos | `server/db.js` (+ `MIGRATIONS`) e a rota correspondente |
| Termos e Privacidade (dados da empresa) | `public/js/views/legal.js` |
| E-mail real | `server/lib/mailer.js` |

**Nova página:** crie `public/js/views/minha.js` (`export default async function(ctx){ return elemento }`) e adicione uma linha em `ROUTES` em `public/js/lib/router.js` (e, se quiser, no menu em `shell.js`).
