/**
 * partner.js — modo "Juntos": a gestante convida uma pessoa de apoio e escolhe o que compartilhar.
 * Todas as permissões são verificadas NO SERVIDOR (server/routes/partner.js).
 * Nunca compartilhados: diário, check-ins, dúvidas, conversas com a IA e anotações de consultas.
 * 🔧 EDITAR: PERMS (rótulos), TALK e FIRST_DAYS (conteúdo para o parceiro).
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, put } from '../lib/api.js';
import { store, stage } from '../lib/store.js';
import { loadInto, skeleton, toast, modal, field, input, withBusy, confirmDialog, empty, fmtDateTime, errorBox } from '../lib/ui.js';
import { checklist } from '../lib/widgets.js';

export const title = 'Juntos';
const PERMS = [['weekly', 'Semana atual e dicas de apoio'], ['calendar', 'Compromissos que eu marcar como compartilhados (sem anotações)'], ['tasks', 'Tarefas que eu marcar como compartilhadas (a pessoa pode concluir)'], ['shopping', 'Lista de compras (apenas ver)'], ['shopping_edit', 'Lista de compras: marcar como comprado e adicionar itens']];
const TALK = ['Como você está se sentindo hoje, de verdade?', 'O que posso fazer esta semana para aliviar o seu dia?', 'Como você imagina a divisão de tarefas depois que o bebê chegar?', 'Há algo que você gostaria que eu entendesse melhor sobre esta fase?', 'Como podemos combinar o transporte para a maternidade?'];
const FIRST_DAYS = ['Combinar quem faz refeições, compras e limpeza nas primeiras semanas.', 'Aprender com a equipe de saúde os cuidados básicos: pega na amamentação, sono seguro, banho.', 'Proteger o descanso de quem amamenta e de quem se recupera do parto.', 'Reservar tempo de colo e contato com o bebê para criar vínculo.', 'Observar sinais de cansaço extremo ou tristeza persistente e incentivar a procura por ajuda.'];

export default async function view() {
  const root = h('div', { class: 'page' }); let tab = stage() === 'support' ? 'apoio' : 'convidar';
  const tabs = h('div', { class: 'tabs', role: 'tablist' }), body = h('div');
  const draw = () => { tabs.replaceChildren(...[['convidar', 'Convidar alguém'], ['apoio', 'Sou pessoa de apoio'], ['conversa', 'Para conversar']].map(([k, l]) => h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === k), onclick: () => { tab = k; draw(); } }, l)));
    body.replaceChildren(h('div', { class: 'page-enter' }, tab === 'convidar' ? ownerTab() : tab === 'apoio' ? partnerTab() : talkTab())); };
  root.append(h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Participação do parceiro'), h('h1', {}, 'Juntos'), h('p', {}, 'Apoio prático, respeito e corresponsabilidade. Você escolhe se, com quem e o que compartilhar — ou não usar este recurso.'))), tabs, body);
  draw(); return root;
}

/* ---------- Lado da gestante ---------- */
function ownerTab() {
  const box = h('div');
  const load = () => loadInto(box, () => get('/partner/links'), (r) => h('div', { class: 'stack stack-lg' },
    h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => invite(load) }, icon('plus'), 'Criar convite')),
    r.mine.length ? h('div', { class: 'stack' }, r.mine.map((l) => linkCard(l, load))) : empty('Nenhum convite ainda', 'Crie um convite e escolha o que a pessoa de apoio poderá ver.')), skeleton(3));
  load(); return box;
}
function invite(done) {
  const label = input({ placeholder: 'Ex.: Meu companheiro, minha mãe', maxlength: 60 }), checks = {};
  const list = PERMS.map(([k, l]) => { const c = h('input', { type: 'checkbox', id: 'p-' + k }); checks[k] = c; return h('label', { class: 'check', for: 'p-' + k }, c, h('span', { class: 'small' }, l)); });
  const btn = h('button', { class: 'btn', type: 'button' }, 'Gerar código');
  const m = modal({ title: 'Convidar pessoa de apoio', content: h('div', { class: 'stack' }, field('Quem é? (só para você identificar)', label), h('h4', {}, 'O que ela poderá ver?'), ...list, h('div', { class: 'notice notice-sage' }, icon('lock'), 'Diário, check-ins, dúvidas e conversas com a IA nunca são compartilhados. A pessoa nunca edita informações médicas.')), actions: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Cancelar'), btn] });
  btn.onclick = () => withBusy(btn, async () => { try { const r = await post('/partner/invite', { label: label.value, perms: Object.fromEntries(Object.entries(checks).map(([k, c]) => [k, c.checked])) }); m.close(); done();
    const m2 = modal({ title: 'Convite criado', content: h('div', { class: 'stack center' }, h('p', { class: 'muted' }, 'Envie este código à pessoa. Ela entra em “Juntos › Sou pessoa de apoio”. Vale por 7 dias e só pode ser usado uma vez.'), h('div', { class: 'code' }, r.code), h('button', { class: 'btn btn-soft', type: 'button', onclick: () => navigator.clipboard?.writeText(r.code).then(() => toast('Código copiado.')).catch(() => toast('Copie manualmente.', 'error')) }, icon('share'), 'Copiar código')) }); } catch (e) { toast(e.message, 'error'); } });
}
function linkCard(l, reload) {
  const checks = {};
  const save = async () => { try { await put('/partner/links/' + l.id, { perms: Object.fromEntries(Object.entries(checks).map(([k, c]) => [k, c.checked])) }); toast('Permissões atualizadas.'); } catch (e) { toast(e.message, 'error'); } };
  return h('div', { class: 'card stack' }, h('div', { class: 'spread' }, h('div', {}, h('strong', {}, l.label || 'Pessoa de apoio'), h('div', { class: 'small muted' }, l.status === 'active' ? `Conectada: ${l.partner_name}` : `Aguardando · código ${l.invite_code}`)), h('span', { class: 'badge ' + (l.status === 'active' ? 'badge-ok' : 'badge-sun') }, l.status === 'active' ? 'Ativo' : 'Pendente')),
    h('div', { class: 'stack stack-sm' }, PERMS.map(([k, t]) => { const c = h('input', { type: 'checkbox', id: `lp${l.id}${k}`, checked: !!l.perms[k] }); c.addEventListener('change', save); checks[k] = c; return h('label', { class: 'switch', for: c.id }, h('span', { class: 'small' }, t), c); })),
    h('div', {}, h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: async () => { if (!await confirmDialog({ title: 'Encerrar vínculo?', text: 'A pessoa deixará de ver qualquer informação sua.', confirmLabel: 'Encerrar', danger: true })) return; try { await post(`/partner/links/${l.id}/revoke`); toast('Vínculo encerrado.'); reload(); } catch (e) { toast(e.message, 'error'); } } }, 'Encerrar vínculo')));
}

/* ---------- Lado da pessoa de apoio ---------- */
function partnerTab() {
  const box = h('div');
  const load = () => loadInto(box, () => get('/partner/links'), (r) => {
    const code = input({ placeholder: 'Código de convite', maxlength: 20, autocapitalize: 'characters', 'aria-label': 'Código de convite' }), btn = h('button', { class: 'btn', type: 'submit' }, 'Conectar');
    return h('div', { class: 'stack stack-lg' }, h('form', { class: 'card stack', onsubmit: (e) => { e.preventDefault(); if (!code.value.trim()) return; withBusy(btn, async () => { try { await post('/partner/join', { code: code.value }); toast('Conectado!'); load(); } catch (ex) { toast(ex.message, 'error'); } }); } },
      h('h3', {}, 'Tenho um código de convite'), h('div', { class: 'row row-nowrap' }, code, btn)),
      r.asPartner.length ? r.asPartner.map((l) => sharedView(l, load)) : empty('Você ainda não apoia ninguém por aqui', 'Peça à gestante para criar um convite em “Juntos”.'));
  }, skeleton(3));
  load(); return box;
}
function sharedView(l, reload) {
  const box = h('div');
  loadInto(box, () => get('/partner/shared/' + l.id), (s) => {
    const sec = [];
    sec.push(h('div', { class: 'spread' }, h('h2', {}, `Apoiando ${s.owner_name}`), h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { if (!await confirmDialog({ title: 'Sair deste vínculo?', text: 'Você deixará de ver as informações compartilhadas.', confirmLabel: 'Sair', danger: true })) return; await post(`/partner/links/${l.id}/revoke`).catch((e) => toast(e.message, 'error')); reload(); } }, 'Sair do vínculo')));
    if (s.weekly) sec.push(h('div', { class: 'card stack' }, h('span', { class: 'eyebrow' }, 'Semana atual'), h('h3', {}, `${s.weekly.weeks} semanas e ${s.weekly.days} dias — ${s.weekly.title || ''}`), s.weekly.bodySummary ? h('p', { class: 'muted' }, s.weekly.bodySummary) : null, h('h4', {}, 'Como apoiar agora'), h('ul', { class: 'bullets' }, s.weekly.partner.map((x) => h('li', {}, x))), h('p', { class: 'xs muted' }, 'Estimativas; a equipe de saúde da gestante é quem orienta.')));
    if (s.perms.calendar) sec.push(h('div', { class: 'card' }, h('h3', { class: 'mb' }, 'Compromissos compartilhados'), s.appointments.length ? h('div', { class: 'list' }, s.appointments.map((a) => h('div', { class: 'list-item' }, icon('calendar'), h('div', {}, h('strong', {}, a.title), h('div', { class: 'small muted' }, fmtDateTime(a.starts_at)))))) : h('p', { class: 'muted small' }, 'Nada compartilhado.')));
    if (s.perms.tasks) sec.push(h('div', { class: 'card stack' }, h('h3', {}, 'Tarefas compartilhadas'), s.tasks.length ? s.tasks.map((t) => { const c = h('input', { type: 'checkbox', checked: !!t.done, id: 'st' + t.id }); c.addEventListener('change', async () => { try { await put(`/partner/shared/${l.id}/tasks/${t.id}`, { done: c.checked }); toast('Atualizado.'); } catch (e) { c.checked = !c.checked; toast(e.message, 'error'); } }); return h('label', { class: 'todo', for: c.id }, c, h('span', {}, t.title)); }) : h('p', { class: 'muted small' }, 'Nenhuma tarefa compartilhada.')));
    if (s.perms.shopping) { const can = s.perms.shopping_edit, nm = input({ placeholder: 'Adicionar item à lista', maxlength: 120 }), b = h('button', { class: 'btn btn-sm', type: 'submit' }, 'Adicionar');
      sec.push(h('div', { class: 'card stack' }, h('h3', {}, 'Lista de compras'), s.shopping.length ? s.shopping.map((it) => { const c = h('input', { type: 'checkbox', checked: !!it.bought, disabled: !can, id: 'si' + it.id }); c.addEventListener('change', async () => { try { await put(`/partner/shared/${l.id}/shopping/${it.id}`, { bought: c.checked }); } catch (e) { c.checked = !c.checked; toast(e.message, 'error'); } }); return h('label', { class: 'todo', for: c.id }, c, h('span', {}, `${it.qty}× ${it.name}`)); }) : h('p', { class: 'muted small' }, 'Lista vazia.'),
        can ? h('form', { class: 'row row-nowrap', onsubmit: (e) => { e.preventDefault(); if (!nm.value.trim()) return; withBusy(b, async () => { try { await post(`/partner/shared/${l.id}/shopping`, { name: nm.value }); toast('Item adicionado.'); reload(); } catch (ex) { toast(ex.message, 'error'); } }); } }, nm, b) : h('p', { class: 'xs muted' }, 'Você pode apenas ver esta lista.'))); }
    if (!s.weekly && !s.perms.calendar && !s.perms.tasks && !s.perms.shopping) sec.push(h('div', { class: 'notice' }, icon('lock'), `${s.owner_name} ainda não compartilhou nada. Respeite o tempo dela.`));
    return h('div', { class: 'stack' }, ...sec);
  }, skeleton(4));
  return box;
}

function talkTab() {
  return h('div', { class: 'stack' }, h('div', { class: 'card' }, h('h3', {}, 'Perguntas para conversar'), h('ul', { class: 'bullets mt' }, TALK.map((x) => h('li', {}, x)))),
    h('div', { class: 'card' }, h('h3', {}, 'Preparação para os primeiros dias'), h('ul', { class: 'bullets mt' }, FIRST_DAYS.map((x) => h('li', {}, x)))),
    h('div', { class: 'card' }, h('h3', {}, 'Tarefas concretas que ajudam'), h('ul', { class: 'bullets mt' }, ['Organizar e acompanhar uma consulta, se ela quiser.', 'Preparar refeições e cuidar das tarefas domésticas.', 'Planejar o transporte e a rota até a maternidade.', 'Pesquisar cursos de preparação e ajudar no orçamento.'].map((x) => h('li', {}, x)))),
    h('a', { class: 'btn btn-secondary', href: '#/biblioteca' }, icon('book'), 'Artigos sobre participação do parceiro'));
}
