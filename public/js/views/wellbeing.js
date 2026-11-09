/**
 * wellbeing.js — Bem-estar: diário privado, check-in emocional opcional, reflexões,
 * rede de apoio e recursos de ajuda.
 * ⚠️ O check-in NÃO é teste nem diagnóstico: não calculamos pontuações clínicas.
 * 🔧 EDITAR: reflexões, humores e telefones em content/meta.json.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, put, del } from '../lib/api.js';
import { store, hasHealthConsent } from '../lib/store.js';
import { loadInto, skeleton, toast, textarea, input, field, withBusy, empty, confirmDialog, timeAgo, fmtDate } from '../lib/ui.js';
import { consentPrompt } from '../lib/widgets.js';
import { pulseOk } from '../lib/motion.js';

export const title = 'Bem-estar';

export default async function view({ query }) {
  const root = h('div', { class: 'page' }); let tab = query.aba || 'diario';
  const tabs = h('div', { class: 'tabs', role: 'tablist' }), body = h('div');
  const T = [['diario', 'Diário'], ['checkin', 'Check-in'], ['reflexoes', 'Reflexões'], ['apoio', 'Rede de apoio'], ['ajuda', 'Pedir ajuda']];
  const draw = () => { tabs.replaceChildren(...T.map(([k, l]) => h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === k), onclick: () => { tab = k; draw(); } }, l)));
    body.replaceChildren(h('div', { class: 'page-enter' }, { diario, checkin, reflexoes: () => reflexoes((t) => { prefill = t; tab = 'diario'; draw(); }), apoio, ajuda }[tab]())); };
  let prefill = '';
  function diario() { const r = diaryTab(prefill); prefill = ''; return r; }
  root.append(h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Cuidar de você'), h('h1', {}, 'Bem-estar'), h('p', {}, 'Um espaço só seu. Tudo aqui é opcional — e você pode pular ou apagar quando quiser.'))), tabs, body);
  draw(); return root;
}

function diaryTab(prefill) {
  if (!hasHealthConsent()) return consentPrompt();
  const box = h('div', { class: 'stack' }), listBox = h('div', { class: 'stack' });
  const ta = textarea({ placeholder: 'Escreva livremente…', maxlength: 5000, value: prefill, 'aria-label': 'Nova entrada' }), btn = h('button', { class: 'btn', type: 'submit' }, icon('check'), 'Salvar');
  let items = [];
  const draw = () => listBox.replaceChildren(...(items.length ? items.map((e) => h('div', { class: 'card' }, h('div', { class: 'spread' }, h('span', { class: 'xs muted' }, `${e.week ? 'Semana ' + e.week + ' · ' : ''}${timeAgo(e.created_at)}`), h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Excluir entrada', onclick: async () => { if (!await confirmDialog({ title: 'Excluir entrada?', text: 'Não pode ser desfeito.', confirmLabel: 'Excluir', danger: true })) return; try { await del('/diary/' + e.id); items = items.filter((x) => x.id !== e.id); draw(); } catch (ex) { toast(ex.message, 'error'); } } }, icon('trash', { size: 16 }))), h('p', { class: 'mt pre' }, e.body))) : [empty('Seu diário está vazio', 'Escreva a primeira entrada quando quiser.')]));
  box.append(h('div', { class: 'notice notice-sage' }, icon('lock'), h('span', {}, h('strong', {}, 'Privado por padrão. '), 'Não é compartilhado com ninguém nem enviado à Ninna AI.')),
    h('form', { class: 'card stack', onsubmit: (e) => { e.preventDefault(); if (!ta.value.trim()) return; const g = store.me.gestation; withBusy(btn, async () => { try { const r = await post('/diary', { body: ta.value, week: g && g.status === 'ongoing' ? g.weeks : undefined }); items = [r.item, ...items]; ta.value = ''; draw(); pulseOk(btn); toast('Salvo no diário.'); } catch (ex) { toast(ex.message, 'error'); } }); } }, ta, h('div', {}, btn)), listBox);
  loadInto(listBox, () => get('/diary'), (r) => { items = r.items; draw(); return h('div'); }, skeleton(3));
  return box;
}

function checkin() {
  if (!hasHealthConsent()) return consentPrompt();
  const moods = store.meta.moods, histBox = h('div'); let sel = null;
  const note = textarea({ placeholder: 'Quer anotar algo? (opcional)', maxlength: 500, style: 'min-height:80px' }), save = h('button', { class: 'btn', type: 'button', disabled: true }, 'Registrar');
  const row = h('div', { class: 'mood-row', role: 'radiogroup', 'aria-label': 'Como você está hoje?' }, moods.map((m) => h('button', { class: 'mood', type: 'button', role: 'radio', 'aria-checked': 'false', onclick: (e) => { sel = m.v; row.querySelectorAll('.mood').forEach((x) => x.setAttribute('aria-checked', 'false')); e.currentTarget.setAttribute('aria-checked', 'true'); save.disabled = false; } }, h('span', { class: 'mood-face m' + m.v }, icon(m.v >= 4 ? 'smile' : 'heart')), h('span', { class: 'xs' }, m.label))));
  const loadHist = () => loadInto(histBox, () => get('/checkins'), (r) => r.items.length ? h('div', { class: 'list' }, r.items.slice(0, 20).map((c) => h('div', { class: 'list-item' }, h('span', { class: 'badge' }, moods.find((m) => m.v === c.mood)?.label), h('span', { class: 'grow small' }, c.note || ''), h('span', { class: 'xs muted' }, timeAgo(c.created_at))))) : h('p', { class: 'muted small' }, 'Nenhum registro.'), skeleton(2));
  save.onclick = () => withBusy(save, async () => { try { await post('/checkins', { mood: sel, note: note.value.trim() || undefined }); toast('Registrado. Obrigada por se cuidar.'); note.value = ''; loadHist(); } catch (e) { toast(e.message, 'error'); } });
  loadHist();
  return h('div', { class: 'stack' }, h('div', { class: 'card stack' }, h('h3', {}, 'Como você está hoje?'), row, note, h('div', { class: 'row' }, save, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => toast('Tudo bem pular. Estamos aqui quando quiser.') }, 'Pular hoje'))),
    h('div', { class: 'notice' }, icon('info'), h('span', {}, 'Este registro é só para você acompanhar como se sente. ', h('strong', {}, 'Não é teste nem diagnóstico'), ' e não gera pontuação. Se estiver pesado demais, veja “Pedir ajuda”.')),
    h('div', { class: 'card' }, h('div', { class: 'spread mb' }, h('h3', {}, 'Histórico'), h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { if (!await confirmDialog({ title: 'Apagar histórico emocional?', text: 'Todos os check-ins serão removidos.', confirmLabel: 'Apagar', danger: true })) return; try { await del('/me/emotional'); toast('Histórico apagado.'); loadHist(); } catch (e) { toast(e.message, 'error'); } } }, icon('trash'), 'Apagar tudo')), histBox));
}

function reflexoes(toDiary) {
  return h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Perguntas leves para pensar com carinho. Escolha uma e, se quiser, escreva no diário.'),
    store.meta.reflections.map((r) => h('div', { class: 'card-lav stack' }, h('p', { class: 'display', style: { fontSize: '1.15rem' } }, r), h('div', {}, h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => toDiary(r + '\n\n') }, icon('pen'), 'Responder no diário')))));
}

function apoio() {
  const box = h('div');
  loadInto(box, () => get('/support'), (r) => supportUI(r.items), skeleton(3));
  return box;
}
export function supportUI(initial) {
  let items = initial; const list = h('div', { class: 'stack' });
  const p = input({ placeholder: 'Pessoa (ex.: Mãe)', maxlength: 80 }), c = input({ placeholder: 'Contato (opcional)', maxlength: 80 }), t = input({ placeholder: 'Como pode ajudar (ex.: levar ao hospital)', maxlength: 160 }), b = h('button', { class: 'btn', type: 'submit' }, icon('plus'), 'Adicionar');
  const draw = () => list.replaceChildren(...(items.length ? items.map((i) => h('div', { class: 'card row row-nowrap' }, h('span', { class: 'avatar' }, i.person[0]), h('div', { class: 'grow' }, h('strong', {}, i.person), h('div', { class: 'small' }, i.task), i.contact ? h('div', { class: 'xs muted' }, i.contact) : null), h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Remover ' + i.person, onclick: async () => { try { await del('/support/' + i.id); items = items.filter((x) => x.id !== i.id); draw(); } catch (e) { toast(e.message, 'error'); } } }, icon('trash', { size: 16 })))) : [empty('Monte a sua rede de apoio', 'Quem pode ajudar no parto e no pós-parto? Anote pessoas, contatos e tarefas.')]));
  draw();
  return h('div', { class: 'stack' }, h('form', { class: 'card stack', onsubmit: (e) => { e.preventDefault(); if (!p.value.trim() || !t.value.trim()) return toast('Informe a pessoa e como ela pode ajudar.', 'error'); withBusy(b, async () => { try { const r = await post('/support', { person: p.value, contact: c.value, task: t.value }); items = [...items, r.item]; p.value = c.value = t.value = ''; draw(); toast('Adicionado à sua rede.'); } catch (ex) { toast(ex.message, 'error'); } }); } }, h('div', { class: 'form-grid' }, field('Pessoa', p), field('Contato', c), h('div', { class: 'full' }, field('Como pode ajudar', t))), h('div', {}, b)), list,
    h('a', { class: 'small', href: '#/biblioteca/rede-de-apoio' }, 'Ler: como montar uma rede de apoio →'));
}

function ajuda() {
  return h('div', { class: 'stack' }, h('div', { class: 'card-rose' }, h('h3', {}, 'Você não precisa passar por isso sozinha'), h('p', { class: 'mt' }, 'Tristeza que não passa, ansiedade intensa, medo, irritação ou pensamentos de se machucar podem acontecer na gestação e no pós-parto — e têm cuidado. Falar com alguém é um bom começo.')),
    h('div', { class: 'grid grid-auto' }, store.meta.hotlines.map((l) => h('a', { class: 'card card-link stack stack-sm', href: 'tel:' + l.phone }, h('div', { class: 'row' }, h('span', { class: 'f-ico' }, icon('phone')), h('strong', { class: 'display', style: { fontSize: '1.6rem' } }, l.phone)), h('strong', {}, l.name), h('span', { class: 'small muted' }, l.about)))),
    h('div', { class: 'card' }, h('h3', {}, 'Como pedir ajuda'), h('ul', { class: 'bullets mt' }, ['Diga em poucas palavras: “Estou precisando de ajuda com…”.', 'Procure a unidade de saúde ou a equipe do pré-natal e conte como você está se sentindo.', 'Peça a alguém de confiança para ficar com você enquanto busca ajuda.'].map((x) => h('li', {}, x)))),
    h('a', { class: 'btn btn-secondary', href: '#/biblioteca/saude-mental-no-pos-parto' }, icon('book'), 'Ler sobre saúde mental perinatal'));
}
