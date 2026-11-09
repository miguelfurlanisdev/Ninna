/**
 * ============================================================
 *  dashboard.js — painel inicial personalizado (muda conforme a fase da usuária)
 * ============================================================
 *  pregnant   → semana/dia, contagem regressiva, conteúdo da semana, checklist
 *  trying     → fase estimada do ciclo (previsão!), calendário
 *  postpartum → dias desde o nascimento, checklist de recuperação e rotina
 *  support    → atalho para o modo "Juntos"
 *  Módulos incompatíveis com a fase NÃO são exibidos.
 *  🔧 EDITAR: ordem e conteúdo dos blocos em `render()`; frases de incentivo em content/meta.json.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, del } from '../lib/api.js';
import { store, stage, today, firstName, hasHealthConsent } from '../lib/store.js';
import { heroArt } from '../lib/art.js';
import { loadInto, skeletonCards, toast, fmtDate, timeAgo, input, withBusy } from '../lib/ui.js';
import { sectionHead, apptRow, checklist, consentPrompt, demoTag } from '../lib/widgets.js';
import { countUp, fillBar } from '../lib/motion.js';
import { cycleEstimate, postpartumDays } from '/shared/gestation.js';
import { nowLocal } from '../lib/reminders.js';

export const title = 'Início';

const greeting = () => { const hr = new Date().getHours(); return hr < 5 ? 'Boa madrugada' : hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'; };

export default async function view() {
  const root = h('div', { class: 'page dash' });
  const g = store.me.gestation, s = stage();
  const week = s === 'pregnant' && g?.status === 'ongoing' ? g.week : null;

  loadInto(root, async () => {
    const [dash, weekData, ck] = await Promise.all([
      get('/dashboard', { week, now: nowLocal() }),
      week ? get('/weeks/' + week) : Promise.resolve(null),
      s === 'postpartum' ? get('/checklist') : Promise.resolve({ items: {} }),
    ]);
    return { dash, weekData, ck: ck.items };
  }, ({ dash, weekData, ck }) => render(dash, weekData, week, ck), skeletonCards(3));
  return root;
}

/* ------------------------------------------------------------------ */
function render(dash, weekData, week, ck = {}) {
  const s = stage(), meta = store.meta, consent = hasHealthConsent();
  const enc = meta.encouragements[new Date().getDate() % meta.encouragements.length];
  const wrap = h('div', { class: 'stack stack-lg' });
  wrap.append(hero(s, week), ...(consent || s === 'support' ? [] : [consentPrompt()]));

  const grid = h('div', { class: 'dash-grid' });

  // ---- Conteúdo principal por fase ----
  if (s === 'pregnant' && weekData) {
    const d = weekData.data;
    grid.append(
      h('section', { class: 'card span-2 reveal' }, sectionHead(`Semana ${week}: ${d.title}`, 'Ver a semana completa', `#/semanas/${week}`),
        h('p', {}, d.dev.summary),
        d.size ? h('p', { class: 'small muted mt' }, icon('info', { size: 14 }), ` Tamanho ilustrativo: ${d.size.label}. ${d.size.note}`) : null,
        h('div', { class: 'chip-row mt' }, d.dev.highlights.map((x) => h('span', { class: 'badge badge-lav' }, x)))),
      h('section', { class: 'card reveal' }, sectionHead('Checklist da semana'),
        checklist(d.checklist.slice(0, 5), weekData.progress), h('a', { class: 'small', href: `#/semanas/${week}` }, 'Ver todas →')));
  } else if (s === 'pregnant') {
    grid.append(h('section', { class: 'card span-3 reveal' }, h('h3', {}, 'Informe a data da sua gestação'),
      h('p', { class: 'muted mt' }, store.me.gestation?.status === 'future' ? 'A data informada parece estar no futuro. Confira em Configurações.' : 'Com a data da última menstruação (ou da data provável do parto), mostramos a semana atual e o conteúdo de cada fase.'),
      h('a', { class: 'btn mt', href: '#/configuracoes' }, 'Informar agora')));
  } else if (s === 'postpartum') {
    grid.append(h('section', { class: 'card span-2 reveal' }, sectionHead('Cuidados desta fase'),
      checklist(meta.postpartumChecklist.map((c) => ({ key: c.k, text: c.t })), ck),
      h('p', { class: 'small muted mt' }, 'Cada recuperação é única. Em caso de febre, sangramento intenso, dor forte ou tristeza que pesa demais, procure atendimento.')),
      h('section', { class: 'card-rose reveal' }, h('h3', {}, 'Precisa de ajuda agora?'), h('p', { class: 'small mt' }, 'Apoio emocional gratuito 24h: CVV 188. Emergência de saúde: SAMU 192.'),
        h('a', { class: 'btn btn-rose btn-sm mt', href: '#/bem-estar' }, 'Ver recursos de ajuda')));
  } else if (s === 'trying') {
    grid.append(cycleCard());
  } else if (s === 'support') {
    grid.append(h('section', { class: 'card span-3 reveal' }, h('div', { class: 'row row-nowrap' }, h('span', { class: 'f-ico' }, icon('hands')),
      h('div', { class: 'grow' }, h('h3', {}, 'Juntos'), h('p', { class: 'muted small' }, 'Conecte-se à gestante com um convite e veja o que ela decidir compartilhar, com tarefas práticas para apoiar.'))),
      h('a', { class: 'btn mt', href: '#/juntos' }, 'Abrir Juntos')));
  }

  // ---- Compromissos e tarefas (só com consentimento de saúde) ----
  if (consent && s !== 'support') {
    grid.append(
      h('section', { class: 'card reveal' }, sectionHead('Próximos compromissos', 'Calendário', '#/calendario'),
        dash.appointments.length ? h('div', { class: 'list' }, dash.appointments.map(apptRow))
          : h('div', { class: 'stack stack-sm' }, h('p', { class: 'muted small' }, 'Nenhum compromisso por enquanto.'), h('a', { class: 'btn btn-soft btn-sm', href: '#/calendario' }, icon('plus'), 'Adicionar'))),
      questionsCard(dash.questions));
  }

  // ---- Artigo recomendado ----
  if (dash.article) grid.append(h('a', { class: 'card card-link reveal', href: '#/biblioteca/' + dash.article.slug },
    h('span', { class: 'eyebrow' }, 'Leitura recomendada'), h('h3', { class: 'mt' }, dash.article.title), h('p', { class: 'small muted mt' }, dash.article.summary), h('span', { class: 'small mt', style: { display: 'block', color: 'var(--forest-700)', fontWeight: 600 } }, 'Ler artigo →')));

  // ---- Ninna AI ----
  const sug = (meta.askSuggestions[s] || []).slice(0, 3);
  grid.append(h('section', { class: 'card-lav ai-card span-2 reveal' },
    h('div', { class: 'row row-nowrap' }, h('span', { class: 'f-ico f-ico-lav' }, icon('sparkle')), h('div', {}, h('h3', {}, 'Pergunte à Ninna AI'), h('p', { class: 'small muted' }, 'Tire dúvidas e prepare perguntas para a consulta. Não substitui a sua equipe de saúde.'))),
    h('div', { class: 'chip-row mt' }, sug.map((q) => h('a', { class: 'chip', href: '#/ninna-ai?q=' + encodeURIComponent(q) }, q))),
    h('a', { class: 'btn mt', href: '#/ninna-ai' }, 'Conversar', icon('arrow-r'))));

  // ---- Comunidade ----
  grid.append(h('section', { class: 'card reveal' }, sectionHead('Nossa Rede', 'Abrir', '#/rede'),
    dash.community.length ? h('div', { class: 'list' }, dash.community.map((p) => h('a', { class: 'list-item community-peek', href: '#/rede/' + p.id },
      h('span', { class: 'avatar' }, (p.author || 'A')[0]), h('div', { class: 'grow' }, h('div', { class: 'small' }, h('strong', {}, p.author), ' ', p.is_demo ? demoTag() : null, h('span', { class: 'muted' }, ' · ' + timeAgo(p.created_at))), h('p', { class: 'small muted clamp-2' }, p.body))))) 
      : h('p', { class: 'muted small' }, 'Seja a primeira a compartilhar. Conversas sem julgamentos.')));

  // ---- Atalhos ----
  wrap.append(grid, h('section', { class: 'shortcuts reveal' },
    shortcut('calendar', 'Calendário', '#/calendario'), shortcut('pen', 'Diário', '#/bem-estar'),
    s !== 'trying' ? shortcut('bag', 'Lista de compras', '#/compras') : shortcut('book', 'Biblioteca', '#/biblioteca'), shortcut('gamepad', 'Aprender Brincando', '#/jogos')),
    h('p', { class: 'encourage reveal' }, h('span', { class: 'display' }, '“'), enc, h('span', { class: 'display' }, '”')));
  return wrap;
}

const shortcut = (ic, label, href) => h('a', { class: 'shortcut', href }, h('span', { class: 'f-ico' }, icon(ic)), label);

/* ---------- Cartão principal (hero) ---------- */
function hero(s, week) {
  const me = store.me, g = me.gestation, p = me.profile;
  const card = h('section', { class: 'hero-card' });
  const left = h('div', { class: 'stack' });
  left.append(h('span', { class: 'eyebrow', style: { color: 'var(--rose-300)' } }, `${greeting()}, ${firstName()}`));

  let art = heroArt(s, { size: 250 });
  if (s === 'pregnant' && g) {
    if (g.status === 'future') {
      left.append(h('h1', {}, 'Confira a data informada'), h('p', { class: 'hero-sub' }, 'A data da última menstruação parece estar no futuro.'), h('a', { class: 'btn btn-light', href: '#/configuracoes' }, 'Corrigir data'));
    } else {
      const days = h('span', { class: 'display big-num' }, '0');
      art = heroArt('pregnant', { week: g.weeks || 1, size: 250 });
      const bar = h('div', { class: 'progress hero-progress', role: 'progressbar', 'aria-valuenow': Math.round(g.percent), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Progresso estimado da gestação' }, h('i'));
      left.append(
        h('h1', {}, `${g.weeks} ${g.weeks === 1 ? 'semana' : 'semanas'}`, g.days ? ` e ${g.days} ${g.days === 1 ? 'dia' : 'dias'}` : ''),
        h('div', { class: 'row' }, h('span', { class: 'badge badge-lav' }, `${g.trimester}º trimestre`), h('span', { class: 'hero-sub small' }, 'Idade gestacional estimada')),
        bar,
        g.status === 'overdue' ? h('p', { class: 'hero-sub' }, 'A data prevista já passou. Siga as orientações da sua equipe de saúde.') :
          h('div', { class: 'row countdown' }, days, h('span', { class: 'hero-sub' }, g.daysToDpp >= 0 ? `dias para a data provável do parto (${fmtDate(g.dpp)}) — uma estimativa` : 'dias após a data provável do parto')),
        h('p', { class: 'xs hero-sub' }, `Datação a partir ${p.dating_source === 'dpp' ? 'da data provável do parto' : p.dating_source === 'ga' ? 'da idade gestacional informada' : 'da última menstruação'}. Pode ser ajustada pela sua equipe de saúde.`));
      fillBar(bar, g.percent); countUp(days, Math.abs(g.daysToDpp));
    }
  } else if (s === 'pregnant') {
    left.append(h('h1', {}, 'Vamos calcular a sua jornada'), h('p', { class: 'hero-sub' }, 'Informe uma data de referência para ver a semana atual.'), h('a', { class: 'btn btn-light', href: '#/configuracoes' }, 'Informar data'));
  } else if (s === 'trying') {
    const est = p.lmp ? cycleEstimate(p.lmp, p.cycle_length || 28, today()) : null;
    art = heroArt('trying', { day: est?.cycleDay || 1, length: p.cycle_length || 28, size: 250 });
    if (est) left.append(h('h1', {}, `Dia ${est.cycleDay} do ciclo`), h('div', { class: 'row' }, h('span', { class: 'badge badge-lav' }, `Fase estimada: ${est.phase}`)),
      h('p', { class: 'hero-sub' }, `Próxima menstruação prevista em cerca de ${est.daysToNextPeriod} dias (${fmtDate(est.nextPeriod)}).`),
      h('p', { class: 'xs hero-sub' }, 'São previsões baseadas em médias. Não confirmam ovulação nem fertilidade.'));
    else left.append(h('h1', {}, 'Acompanhe o seu ciclo'), h('p', { class: 'hero-sub' }, 'Informe o primeiro dia da última menstruação para ver estimativas.'), h('a', { class: 'btn btn-light', href: '#/configuracoes' }, 'Informar data'));
  } else if (s === 'postpartum') {
    const pd = p.birth_date ? postpartumDays(p.birth_date, today()) : null;
    left.append(pd ? h('h1', {}, pd.days <= 0 ? 'Bem-vinda ao pós-parto' : `${pd.weeks} ${pd.weeks === 1 ? 'semana' : 'semanas'} e ${pd.remDays} ${pd.remDays === 1 ? 'dia' : 'dias'}`) : h('h1', {}, 'Cuidar de você também importa'),
      h('p', { class: 'hero-sub' }, p.baby_name ? `Com ${p.baby_name}, cada dia é um aprendizado. Vá com calma.` : 'Cada dia é um aprendizado. Vá com calma.'));
  } else {
    left.append(h('h1', {}, 'Apoio faz diferença'), h('p', { class: 'hero-sub' }, 'Pequenas ações práticas ajudam muito. Veja o que você pode fazer.'));
  }
  card.append(left, h('div', { class: 'hero-art', 'aria-hidden': s === 'pregnant' ? null : 'true' }, art));
  return card;
}

/* ---------- Ciclo (tentantes) ---------- */
function cycleCard() {
  const p = store.me.profile;
  if (!p.lmp) return h('section', { class: 'card span-3 reveal' }, h('h3', {}, 'Calendário do ciclo'), h('p', { class: 'muted mt' }, 'Informe o primeiro dia da última menstruação e a duração média do ciclo para ver as estimativas.'), h('a', { class: 'btn mt', href: '#/configuracoes' }, 'Informar agora'));
  const e = cycleEstimate(p.lmp, p.cycle_length || 28, today());
  const row = (l, v) => h('div', { class: 'list-item' }, h('span', { class: 'grow' }, l), h('strong', {}, v));
  return h('section', { class: 'card span-2 reveal' }, sectionHead('Estimativas do seu ciclo', 'Ver no calendário', '#/calendario'),
    row('Menstruação (estimada)', `${fmtDate(e.periodStart)} a ${fmtDate(e.periodEnd)}`), row('Janela fértil estimada', `${fmtDate(e.fertileStart)} a ${fmtDate(e.fertileEnd)}`), row('Ovulação estimada', fmtDate(e.ovulation)), row('Próxima menstruação', fmtDate(e.nextPeriod)),
    h('div', { class: 'notice mt' }, icon('info'), h('span', {}, 'Previsões com base na média informada: variam de ciclo para ciclo e não confirmam ovulação nem fertilidade.')));
}

/* ---------- Dúvidas para a próxima consulta ---------- */
function questionsCard(initial) {
  const list = h('div', { class: 'list' });
  const draw = (items) => list.replaceChildren(...(items.length ? items.map((q) => h('div', { class: 'list-item' }, icon('message'), h('span', { class: 'grow small' }, q.text),
    h('button', { class: 'iconbtn', style: { width: '36px', height: '36px' }, 'aria-label': 'Remover dúvida: ' + q.text, type: 'button', onclick: async () => { try { await del('/questions/' + q.id); items = items.filter((x) => x.id !== q.id); draw(items); } catch (e) { toast(e.message, 'error'); } } }, icon('x', { size: 16 })))) : [h('p', { class: 'muted small' }, 'Anote aqui o que quiser perguntar na próxima consulta.')]));
  let items = [...initial]; draw(items);
  const inp = input({ placeholder: 'Ex.: posso viajar de avião?', maxlength: 400, 'aria-label': 'Nova dúvida para a consulta' });
  const btn = h('button', { class: 'btn btn-sm', type: 'submit' }, icon('plus'), 'Anotar');
  return h('section', { class: 'card reveal' }, sectionHead('Dúvidas para a consulta'), list,
    h('form', { class: 'row row-nowrap mt', onsubmit: (e) => { e.preventDefault(); const t = inp.value.trim(); if (t.length < 2) return;
      withBusy(btn, async () => { try { const r = await post('/questions', { text: t }); items = [r.item, ...items]; draw(items); inp.value = ''; toast('Dúvida anotada.'); } catch (ex) { toast(ex.message, 'error'); } }); } }, inp, btn));
}
