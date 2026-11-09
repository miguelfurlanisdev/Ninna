/**
 * ============================================================
 *  weeks.js — Central de acompanhamento semanal (as 40 semanas de referência)
 * ============================================================
 *  O conteúdo de cada semana vem do servidor (GET /api/weeks/:n) e pode ser editado
 *  no painel admin, sem mexer neste arquivo. Aqui só montamos a tela.
 *  Abas: Bebê · Seu corpo · Checklist · Curiosidades · Emocional · Parceiro · Diário · Progresso
 *  🔧 EDITAR: a lista TABS controla as abas e a ordem.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, put, del } from '../lib/api.js';
import { store, hasHealthConsent } from '../lib/store.js';
import { bloomArt } from '../lib/art.js';
import { loadInto, skeleton, toast, fmtDate, textarea, withBusy, empty, disclaimer, confirmDialog, timeAgo, input, errorBox } from '../lib/ui.js';
import { checklist, consentPrompt } from '../lib/widgets.js';
import { navigate } from '../lib/router.js';
import { fillBar } from '../lib/motion.js';

export const title = 'Semana a semana';
const TABS = [['bebe', 'Bebê'], ['corpo', 'Seu corpo'], ['checklist', 'Checklist'], ['curiosidades', 'Curiosidades'], ['emocional', 'Emocional'], ['parceiro', 'Parceiro'], ['diario', 'Diário'], ['progresso', 'Progresso']];
let lastTab = 'bebe'; // lembra a aba ao trocar de semana

export default async function view({ params }) {
  const g = store.me.gestation;
  const current = g && g.status !== 'future' ? Math.min(Math.max(g.weeks, 1), 40) : null;
  if (!params.n) { navigate('/semanas/' + (current || 1), { replace: true }); return h('div'); }
  const n = Math.min(Math.max(Number(params.n) || current || 1, 1), 40);
  const root = h('div', { class: 'page' });

  // ---- Seletor de semanas (rolagem horizontal) ----
  const chips = h('div', { class: 'chip-scroll', role: 'tablist', 'aria-label': 'Escolha a semana' });
  for (let i = 1; i <= 40; i++) chips.append(h('a', { class: 'chip week-chip' + (i === n ? ' active' : ''), href: '#/semanas/' + i, role: 'tab', 'aria-selected': String(i === n), 'aria-label': `Semana ${i}${i === current ? ' (atual)' : ''}` }, String(i), i === current ? h('i', { class: 'now-dot', title: 'Semana atual' }) : null));
  setTimeout(() => chips.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' }), 50);

  const content = h('div');
  root.append(
    h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Central de acompanhamento'), h('h1', {}, 'Semana a semana')),
      current && current !== n ? h('a', { class: 'btn btn-soft btn-sm', href: '#/semanas/' + current }, icon('baby'), 'Ir para a semana atual') : null),
    chips, content);

  loadInto(content, () => get('/weeks/' + n), (res) => weekView(n, res, current), skeleton(6, 22));
  return root;
}

function weekView(n, res, current) {
  const d = res.data, wrap = h('div', { class: 'stack stack-lg' });
  const panel = h('div', { role: 'tabpanel' });
  const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Seções da semana' });
  const show = (key) => {
    lastTab = key; [...tabs.children].forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === key)));
    panel.replaceChildren(h('div', { class: 'page-enter' }, PANELS[key](n, d, res)));
  };
  TABS.forEach(([k, l]) => tabs.append(h('button', { class: 'tab', role: 'tab', type: 'button', 'data-k': k, onclick: () => show(k) }, l)));

  const review = res.review_status === 'reviewed'
    ? h('span', { class: 'badge badge-ok' }, icon('check', { size: 12 }), `Revisado em ${fmtDate(res.reviewed_at)}`)
    : h('span', { class: 'badge badge-sun', title: 'Este conteúdo ainda não passou por revisão profissional' }, 'Aguardando revisão profissional');

  wrap.append(
    h('section', { class: 'week-hero' },
      h('div', { class: 'stack' },
        h('div', { class: 'row' }, h('span', { class: 'badge badge-lav' }, `${d.trimester}º trimestre`), review, n === current ? h('span', { class: 'badge badge-rose' }, 'Semana atual') : null),
        h('h2', { class: 'week-title' }, `Semana ${n}`, h('small', {}, d.title)),
        h('p', {}, d.dev.summary),
        d.size ? h('p', { class: 'small muted' }, `Tamanho ilustrativo: ${d.size.label}. `, d.size.note) : null,
        h('div', { class: 'row' },
          n > 1 ? h('a', { class: 'btn btn-secondary btn-sm', href: '#/semanas/' + (n - 1) }, icon('chev-l'), 'Anterior') : null,
          n < 40 ? h('a', { class: 'btn btn-secondary btn-sm', href: '#/semanas/' + (n + 1) }, 'Próxima', icon('chev-r')) : null)),
      h('div', { class: 'week-art' }, bloomArt(n, { size: 230 }), h('p', { class: 'xs muted center' }, 'Ilustração simbólica — não é o tamanho real do bebê.'))),
    tabs, panel);
  show(lastTab);
  return wrap;
}

const list = (arr) => h('ul', { class: 'bullets' }, arr.map((x) => h('li', {}, x)));

const PANELS = {
  /* ---------- A. Desenvolvimento do bebê ---------- */
  bebe: (n, d) => h('div', { class: 'stack' },
    h('div', { class: 'card' }, h('h3', {}, 'Resumo do desenvolvimento'), h('p', { class: 'mt' }, d.dev.summary)),
    d.dev.highlights?.length ? h('div', { class: 'card' }, h('h3', {}, 'Principais mudanças desta fase'), h('div', { class: 'mt' }, list(d.dev.highlights))) : null,
    disclaimer('Cada bebê se desenvolve em seu ritmo. As descrições são médias de referência e a sua equipe de saúde acompanha o que é esperado para a sua gestação.')),

  /* ---------- B. Mudanças no corpo materno ---------- */
  corpo: (n, d) => h('div', { class: 'stack' },
    h('div', { class: 'card' }, h('h3', {}, 'Como o corpo pode mudar'), h('p', { class: 'mt' }, d.body.summary), h('h4', { class: 'mt' }, 'Sintomas que algumas gestantes relatam'), h('div', { class: 'mt' }, list(d.body.common)),
      h('p', { class: 'small muted mt' }, 'Nem toda gestante sente tudo isso — e sentir pouco ou nada também é comum.')),
    h('div', { class: 'card-rose' }, h('h3', {}, d.body.alerts.title), h('p', { class: 'mt' }, d.body.alerts.intro), h('div', { class: 'mt' }, list(d.body.alerts.items)),
      h('div', { class: 'notice notice-danger mt' }, icon('phone'), h('span', {}, d.body.alerts.emergency)))),

  /* ---------- C. O que fazer nesta semana ---------- */
  checklist: (n, d, res) => {
    const bar = h('div', { class: 'progress' }, h('i'));
    const done = Object.values(res.progress).filter(Boolean).length;
    fillBar(bar, (done / d.checklist.length) * 100);
    const mine = h('div');
    loadInto(mine, () => get('/tasks'), (r) => myTasks(r.items), skeleton(2));
    return h('div', { class: 'stack' },
      h('div', { class: 'card stack' }, h('h3', {}, 'O que fazer nesta semana'), h('p', { class: 'muted small' }, 'Sugestões gerais de organização. Não são prescrições: exames, medicamentos e suplementos são definidos pela sua equipe de saúde.'), bar,
        checklist(d.checklist, res.progress, { onChange: (x, t) => fillBar(bar, (x / t) * 100) })),
      h('div', { class: 'card stack' }, h('h3', {}, 'Meus itens'), h('p', { class: 'muted small' }, 'Personalize: adicione suas próprias tarefas. Elas aparecem também na central de lembretes.'), mine));
  },

  /* ---------- D. Curiosidades e aprendizado ---------- */
  curiosidades: (n, d) => {
    const gl = h('div');
    return h('div', { class: 'stack' },
      d.curiosity ? h('div', { class: 'card-sage' }, h('span', { class: 'eyebrow' }, 'Curiosidade'), h('p', { class: 'mt display', style: { fontSize: '1.25rem' } }, d.curiosity)) : null,
      h('div', { class: 'card' }, h('h3', {}, 'Mito ou verdade?'), h('p', { class: 'mt' }, `“${d.myth.claim}”`), h('p', { class: 'mt' }, h('span', { class: 'badge ' + (d.myth.truth === 'Mito' ? 'badge-rose' : 'badge-ok') }, d.myth.truth), ' ', d.myth.why)),
      h('div', { class: 'card' }, h('h3', { class: 'mb' }, 'Perguntas frequentes'), d.faq.map((f) => h('details', { class: 'faq' }, h('summary', {}, f.q), h('p', { class: 'small muted' }, f.a)))),
      h('div', { class: 'card' }, h('h3', { class: 'mb' }, 'Glossário de termos médicos'), gl, (() => { loadInto(gl, () => get('/glossary'), (r) => glossary(r.items), skeleton(3)); return null; })()));
  },

  /* ---------- E. Preparação emocional ---------- */
  emocional: (n, d) => h('div', { class: 'stack' },
    h('div', { class: 'card-lav' }, h('span', { class: 'eyebrow' }, 'Reflexão da semana'), h('p', { class: 'mt display', style: { fontSize: '1.25rem' } }, d.emotional.prompt),
      h('a', { class: 'btn btn-secondary btn-sm mt', href: '#/semanas/' + n, onclick: (e) => { e.preventDefault(); lastTab = 'diario'; navigate('/semanas/' + n + '?r=' + Date.now()); } }, icon('pen'), 'Escrever no diário')),
    h('div', { class: 'card' }, h('h3', {}, 'Comunicação com a rede de apoio'), h('div', { class: 'mt' }, list(['Diga com palavras simples do que você precisa hoje (descanso, companhia, ajuda com tarefas).', 'Combine com antecedência quem pode ajudar em cada situação.', 'Se algo preocupa, anote para a próxima consulta em vez de guardar sozinha.']))),
    h('div', { class: 'notice' }, icon('heart'), h('span', {}, 'Sentimentos mudam ao longo da gestação e é normal ter dias melhores e piores. Se a tristeza ou a ansiedade estiverem pesando, converse com a sua equipe de saúde. Apoio gratuito 24h: CVV 188.'))),

  /* ---------- F. Participação do parceiro ---------- */
  parceiro: (n, d) => h('div', { class: 'stack' },
    h('div', { class: 'card' }, h('h3', {}, 'Como apoiar nesta fase'), h('p', { class: 'muted small mt' }, 'Sugestões práticas e respeitosas. A gestação é da gestante; o apoio é compartilhar tarefas, escutar e participar do que ela quiser.'), h('div', { class: 'mt' }, list(d.partner))),
    h('a', { class: 'btn btn-secondary', href: '#/juntos' }, icon('hands'), 'Convidar uma pessoa de apoio')),

  /* ---------- G. Diário ---------- */
  diario: (n) => diaryPanel(n),

  /* ---------- H. Progresso ---------- */
  progresso: (n) => progressPanel(n),
};

/* ---------- Glossário com busca ---------- */
function glossary(items) {
  const out = h('div'), q = input({ type: 'search', placeholder: 'Buscar termo (ex.: DPP)', 'aria-label': 'Buscar no glossário' });
  const draw = () => { const t = q.value.trim().toLowerCase(); const f = items.filter((i) => !t || i.term.toLowerCase().includes(t) || i.def.toLowerCase().includes(t));
    out.replaceChildren(...(f.length ? f.map((i) => h('div', { class: 'list-item', style: { alignItems: 'flex-start' } }, h('strong', { style: { minWidth: '110px' } }, i.term), h('span', { class: 'small muted' }, i.def))) : [h('p', { class: 'muted small' }, 'Nenhum termo encontrado.')])); };
  q.addEventListener('input', draw); draw();
  return h('div', { class: 'stack' }, q, out);
}

/* ---------- "Meus itens" (tarefas personalizadas) ---------- */
function myTasks(initial) {
  let items = initial.filter((t) => !t.done);
  const box = h('div', { class: 'stack stack-sm' }), inp = input({ placeholder: 'Ex.: ligar para a maternidade', maxlength: 160, 'aria-label': 'Nova tarefa' });
  const btn = h('button', { class: 'btn btn-sm', type: 'submit' }, icon('plus'), 'Adicionar');
  const draw = () => box.replaceChildren(...(items.length ? items.map((t) => {
    const cb = h('input', { type: 'checkbox', id: 'mt' + t.id });
    cb.addEventListener('change', async () => { try { await put('/tasks/' + t.id, { done: true }); items = items.filter((x) => x.id !== t.id); toast('Tarefa concluída!'); draw(); } catch (e) { cb.checked = false; toast(e.message, 'error'); } });
    return h('label', { class: 'todo', for: cb.id }, cb, h('span', {}, t.title));
  }) : [h('p', { class: 'muted small' }, 'Você ainda não adicionou itens.')]));
  draw();
  return h('div', { class: 'stack' }, box, h('form', { class: 'row row-nowrap', onsubmit: (e) => { e.preventDefault(); const v = inp.value.trim(); if (!v) return;
    withBusy(btn, async () => { try { const r = await post('/tasks', { title: v }); items = [r.item, ...items]; inp.value = ''; draw(); } catch (ex) { toast(ex.message, 'error'); } }); } }, inp, btn));
}

/* ---------- Diário (privado) ---------- */
function diaryPanel(n) {
  if (!hasHealthConsent()) return consentPrompt();
  const wrap = h('div', { class: 'stack' }), listBox = h('div', { class: 'stack' });
  const ta = textarea({ placeholder: 'Como foi a sua semana? Pensamentos, sensações, perguntas, momentos especiais…', maxlength: 5000, 'aria-label': 'Nova entrada no diário' });
  const btn = h('button', { class: 'btn', type: 'submit' }, icon('check'), 'Salvar no diário');
  let all = [];
  const draw = () => {
    const mine = all.filter((e) => e.week === n), others = all.filter((e) => e.week !== n);
    const row = (e) => h('div', { class: 'card diary-entry' }, h('div', { class: 'spread' }, h('span', { class: 'xs muted' }, `${e.week ? 'Semana ' + e.week + ' · ' : ''}${timeAgo(e.created_at)}`),
      h('button', { class: 'iconbtn', style: { width: '36px', height: '36px' }, 'aria-label': 'Excluir entrada do diário', type: 'button', onclick: async () => { if (!await confirmDialog({ title: 'Excluir esta entrada?', text: 'Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', danger: true })) return; try { await del('/diary/' + e.id); all = all.filter((x) => x.id !== e.id); draw(); toast('Entrada excluída.'); } catch (ex) { toast(ex.message, 'error'); } } }, icon('trash', { size: 16 }))), h('p', { class: 'mt pre' }, e.body));
    listBox.replaceChildren(h('h4', {}, `Entradas da semana ${n}`), ...(mine.length ? mine.map(row) : [h('p', { class: 'muted small' }, 'Nenhuma entrada ainda.')]),
      others.length ? h('details', { class: 'faq mt' }, h('summary', {}, `Outras semanas (${others.length})`), h('div', { class: 'stack mt' }, others.map(row))) : null);
  };
  wrap.append(h('div', { class: 'notice notice-sage' }, icon('lock'), h('span', {}, h('strong', {}, 'Só você vê o diário. '), 'Ele não é enviado à Ninna AI nem compartilhado com ninguém.')),
    h('form', { class: 'card stack', onsubmit: (e) => { e.preventDefault(); const v = ta.value.trim(); if (!v) return toast('Escreva algo antes de salvar.', 'error');
      withBusy(btn, async () => { try { const r = await post('/diary', { body: v, week: n }); all = [r.item, ...all]; ta.value = ''; draw(); toast('Salvo no seu diário.'); } catch (ex) { toast(ex.message, 'error'); } }); } }, ta, h('div', {}, btn)), listBox);
  loadInto(listBox, () => get('/diary'), (r) => { all = r.items; draw(); return h('div'); }, skeleton(3));
  return wrap;
}

/* ---------- Progresso: linha do tempo, marcos e tarefas ---------- */
function progressPanel(n) {
  const box = h('div');
  loadInto(box, async () => { const [j, gm] = await Promise.all([get('/journey'), get('/games/data')]); return { j, ms: gm.milestones }; }, ({ j, ms }) => {
    const g = store.me.gestation, cur = g && g.status !== 'future' ? g.weeks : null;
    const totalTasks = Object.values(j.tasksByWeek).reduce((a, b) => a + b, 0), totalDiary = Object.values(j.diaryByWeek).reduce((a, b) => a + b, 0);
    const tl = h('ol', { class: 'timeline' }, ms.map((m) => {
      const state = cur == null ? '' : m.week < (cur || 0) ? 'past' : m.week === cur ? 'now' : '';
      return h('li', { class: state }, h('a', { href: '#/semanas/' + m.week }, h('span', { class: 'tl-week' }, `Semana ${m.week}`), h('strong', {}, m.text), h('span', { class: 'small muted' }, m.info)));
    }));
    const bars = h('div', { class: 'week-bars', role: 'img', 'aria-label': 'Tarefas concluídas por semana' }, Array.from({ length: 40 }, (_, i) => { const c = j.tasksByWeek[i + 1] || 0; return h('a', { href: '#/semanas/' + (i + 1), title: `Semana ${i + 1}: ${c} tarefas concluídas`, class: i + 1 === n ? 'on' : '' }, h('i', { style: { height: Math.min(100, 8 + c * 16) + '%' }, class: c ? 'has' : '' })); }));
    return h('div', { class: 'stack' },
      h('div', { class: 'grid grid-3' }, stat(totalTasks, 'tarefas concluídas'), stat(totalDiary, 'entradas no diário'), stat(cur ?? '—', 'semana atual')),
      h('div', { class: 'card' }, h('h3', { class: 'mb' }, 'Tarefas por semana'), bars), h('div', { class: 'card' }, h('h3', { class: 'mb' }, 'Marcos da gestação'), tl,
        h('p', { class: 'xs muted mt' }, 'Os marcos são referências gerais. Cada gestação tem seu ritmo.')));
  }, skeleton(4));
  return box;
}
const stat = (v, l) => h('div', { class: 'card center' }, h('div', { class: 'display big-num', style: { color: 'var(--forest-700)' } }, String(v)), h('div', { class: 'small muted' }, l));
