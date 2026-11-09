/**
 * community.js — "Nossa Rede": feed, posts, comentários, reações, salvos, grupos, denúncia e bloqueio.
 * Anonimato = oculto às outras usuárias (aviso exibido; a moderação pode ver registros técnicos).
 * 🔧 Regras de conteúdo: server/routes/community.js (checkContent). Categorias: content/meta.json.
 */
import { h, debounce } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, put, del } from '../lib/api.js';
import { store } from '../lib/store.js';
import { loadInto, skeleton, empty, toast, modal, confirmDialog, textarea, input, field, timeAgo, errorBox, withBusy, select, formError, showFormError, hideFormError } from '../lib/ui.js';
import { demoTag } from '../lib/widgets.js';

export const title = 'Nossa Rede';

export default async function view({ params }) {
  return params.id ? postView(Number(params.id)) : feedView();
}

const GUIDE = ['Compartilhe a sua experiência — ela não é regra para todas.', 'Sem diagnósticos, doses ou indicação de medicamentos.', 'Respeito sempre: nada de julgamentos ou assédio.', 'Não publique telefone, e-mail, CPF ou links.'];

function feedView() {
  const root = h('div', { class: 'page' }), groups = store.meta.groups;
  let cat = '', filter = '', q = '', items = [], more = false, mine = new Set();
  const list = h('div', { class: 'stack' }), loadMore = h('div', { class: 'center' });
  const search = input({ type: 'search', placeholder: 'Buscar publicações', 'aria-label': 'Buscar publicações' });
  const chips = h('div', { class: 'chip-scroll' });

  const drawChips = () => chips.replaceChildren(
    ...[['', 'Tudo'], ['saved', 'Salvos'], ['mine', 'Minhas'], ['grp', 'Meus grupos']].map(([k, l]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(filter === k && !cat), onclick: () => { filter = k; cat = ''; drawChips(); fetchFeed(true); } }, l)),
    ...groups.map((g) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(cat === g.slug), onclick: () => { cat = g.slug; filter = ''; drawChips(); fetchFeed(true); } }, g.name)));

  async function fetchFeed(reset) {
    if (reset) { items = []; list.replaceChildren(skeleton(4, 40)); }
    try {
      const r = await get('/community/posts', { category: cat, q, before: reset ? undefined : items[items.length - 1]?.id, saved: filter === 'saved' ? 1 : undefined, mine: filter === 'mine' ? 1 : undefined, group: filter === 'grp' ? 'mine' : undefined });
      items = reset ? r.items : [...items, ...r.items]; more = r.hasMore; drawList();
    } catch (e) { list.replaceChildren(errorBox(e, () => fetchFeed(true))); }
  }
  function drawList() {
    list.replaceChildren(...(items.length ? items.map((p) => postCard(p, { onChange: drawList, onDelete: () => { items = items.filter((x) => x.id !== p.id); drawList(); } })) : [empty('Nada por aqui ainda', cat || filter || q ? 'Tente outro filtro.' : 'Seja a primeira a compartilhar.')]));
    loadMore.replaceChildren(...(more ? [h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => fetchFeed(false) }, 'Carregar mais')] : []));
  }
  search.addEventListener('input', debounce(() => { q = search.value.trim(); fetchFeed(true); }, 350));

  // Grupos: entrar/sair
  const groupBox = h('div');
  const drawGroups = () => groupBox.replaceChildren(h('div', { class: 'chip-row' }, groups.map((g) => { const j = mine.has(g.slug);
    return h('button', { class: 'chip', type: 'button', 'aria-pressed': String(j), title: g.about, onclick: async () => { try { await post(`/community/groups/${g.slug}/${j ? 'leave' : 'join'}`); j ? mine.delete(g.slug) : mine.add(g.slug); drawGroups(); toast(j ? `Você saiu de "${g.name}".` : `Você entrou em "${g.name}".`); } catch (e) { toast(e.message, 'error'); } } }, icon(j ? 'check' : 'plus', { size: 14 }), g.name); })));
  get('/community/my-groups').then((r) => { mine = new Set(r.items); drawGroups(); }).catch(() => {});

  root.append(h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Entre mulheres'), h('h1', {}, 'Nossa Rede'), h('p', {}, 'Um espaço para trocar experiências, dúvidas e conquistas, sem julgamentos.')),
    h('button', { class: 'btn', type: 'button', onclick: () => openComposer((p) => { items = [p, ...items]; drawList(); }) }, icon('plus'), 'Nova publicação')),
    h('div', { class: 'community-layout' }, h('div', { class: 'stack' }, search, chips, list, loadMore),
      h('aside', { class: 'stack' }, h('div', { class: 'card-sage' }, h('h4', {}, 'Orientações da comunidade'), h('ul', { class: 'bullets small mt' }, GUIDE.map((g) => h('li', {}, g)))),
        h('div', { class: 'card' }, h('h4', { class: 'mb' }, 'Grupos temáticos'), groupBox), blocksCard())));
  drawChips(); fetchFeed(true);
  return root;
}

function blocksCard() {
  const box = h('div');
  const draw = (items) => box.replaceChildren(items.length ? h('div', { class: 'list' }, items.map((b) => h('div', { class: 'list-item' }, h('span', { class: 'grow small' }, b.label), h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: async () => { await del('/community/blocks/' + b.handle).catch((e) => toast(e.message, 'error')); toast('Desbloqueada.'); load(); } }, 'Desbloquear')))) : h('p', { class: 'small muted' }, 'Você não bloqueou ninguém.'));
  const load = () => get('/community/blocks').then((r) => draw(r.items)).catch(() => {});
  load();
  return h('div', { class: 'card' }, h('h4', { class: 'mb' }, 'Usuárias bloqueadas'), box);
}

/* ---------- Cartão de publicação ---------- */
function postCard(p, { onChange, onDelete, detail = false }) {
  const grp = store.meta.groups.find((g) => g.slug === p.category);
  const react = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-pressed': String(p.reacted), onclick: async () => { try { const r = await post(`/community/posts/${p.id}/react`); p.reacted = r.reacted; p.reactions = r.reactions; onChange?.(); redraw(); } catch (e) { toast(e.message, 'error'); } } });
  const save = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-pressed': String(p.saved), onclick: async () => { try { const r = await post(`/community/posts/${p.id}/save`); p.saved = r.saved; redraw(); toast(r.saved ? 'Salvo nos seus itens.' : 'Removido dos salvos.'); } catch (e) { toast(e.message, 'error'); } } });
  const card = h('article', { class: 'card post' + (p.status === 'hidden' ? ' hidden-post' : '') });
  function redraw() {
    react.replaceChildren(icon('heart', { cls: p.reacted ? 'filled' : '' }), `Abraço · ${p.reactions}`); react.setAttribute('aria-pressed', String(p.reacted)); react.classList.toggle('on', p.reacted);
    save.replaceChildren(icon('bookmark', { cls: p.saved ? 'filled' : '' }), p.saved ? 'Salvo' : 'Salvar'); save.classList.toggle('on', p.saved);
  }
  redraw();
  const menu = h('div', { class: 'row', style: { gap: '2px' } },
    p.mine ? h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Editar publicação', onclick: () => editPost(p, () => { onChange?.(); card.replaceWith(postCard(p, { onChange, onDelete, detail })); }) }, icon('edit', { size: 17 })) : null,
    p.mine ? h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Excluir publicação', onclick: async () => { if (!await confirmDialog({ title: 'Excluir publicação?', text: 'Ela e os comentários serão removidos.', confirmLabel: 'Excluir', danger: true })) return; try { await del('/community/posts/' + p.id); toast('Publicação excluída.'); onDelete?.(); if (detail) location.hash = '#/rede'; } catch (e) { toast(e.message, 'error'); } } }, icon('trash', { size: 17 })) : null,
    !p.mine ? h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Denunciar ou bloquear', onclick: () => reportDialog('post', p.id, onDelete) }, icon('flag', { size: 17 })) : null);
  card.append(h('div', { class: 'spread' }, h('div', { class: 'row row-nowrap' }, h('span', { class: 'avatar' }, (p.author || 'A')[0].toUpperCase()), h('div', {}, h('strong', {}, p.author, ' ', p.is_demo ? demoTag() : null, p.anonymous ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, 'anônima') : null), h('div', { class: 'xs muted' }, `${grp?.name || p.category} · ${timeAgo(p.created_at)}${p.edited_at ? ' · editado' : ''}`))), menu),
    p.status === 'hidden' ? h('div', { class: 'notice notice-warn mt' }, icon('eye'), 'Oculta por denúncias, em análise. Só você vê isto.') : null,
    h('p', { class: 'mt pre' }, p.body),
    h('div', { class: 'row mt' }, react, h('a', { class: 'btn btn-ghost btn-sm', href: '#/rede/' + p.id }, icon('message'), `${p.comments} ${p.comments === 1 ? 'comentário' : 'comentários'}`), save));
  return card;
}

function editPost(p, done) {
  const ta = textarea({ value: p.body, maxlength: 1500 }), err = formError(), btn = h('button', { class: 'btn', type: 'button' }, 'Salvar');
  const m = modal({ title: 'Editar publicação', content: h('div', { class: 'stack' }, err, ta), actions: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Cancelar'), btn] });
  btn.onclick = () => withBusy(btn, async () => { try { await put('/community/posts/' + p.id, { body: ta.value }); p.body = ta.value.trim(); p.edited_at = 'agora'; m.close(); toast('Publicação atualizada.'); done(); } catch (e) { showFormError(err, e.message); } });
}

function reportDialog(type, id, after) {
  const reason = select([['Informação médica perigosa', 'Informação médica perigosa'], ['Assédio ou desrespeito', 'Assédio ou desrespeito'], ['Dados pessoais expostos', 'Dados pessoais expostos'], ['Spam', 'Spam'], ['Outro motivo', 'Outro motivo']], '');
  const m = modal({ title: 'Denunciar ou bloquear', content: h('div', { class: 'stack' }, field('Motivo da denúncia', reason), h('p', { class: 'small muted' }, 'Com 3 denúncias o conteúdo é ocultado até a moderação analisar.')),
    actions: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { try { await post('/community/block', { type, id }); toast('Usuária bloqueada. Você não verá mais o conteúdo dela.'); m.close(); after?.(); } catch (e) { toast(e.message, 'error'); } } }, 'Bloquear autora'),
      h('button', { class: 'btn btn-danger', type: 'button', onclick: async () => { try { const r = await post('/community/report', { type, id, reason: reason.value }); toast(r.message); m.close(); } catch (e) { toast(e.message, 'error'); } } }, 'Enviar denúncia')] });
}

/* ---------- Nova publicação ---------- */
function openComposer(onCreated) {
  const err = formError(), cat = select(store.meta.groups.map((g) => [g.slug, g.name]), 'duvidas-gerais');
  const ta = textarea({ placeholder: 'Conte como você está, uma dúvida ou uma conquista…', maxlength: 1500 });
  const anon = h('input', { type: 'checkbox', id: 'anon' }), pseud = input({ placeholder: 'Pseudônimo (opcional)', maxlength: 30, disabled: true });
  anon.addEventListener('change', () => { pseud.disabled = !anon.checked; });
  const btn = h('button', { class: 'btn', type: 'button' }, 'Publicar');
  const m = modal({ title: 'Nova publicação', content: h('div', { class: 'stack' }, err, field('Onde publicar', cat), field('Texto', ta, 'Sem diagnósticos, doses ou dados pessoais.'),
    h('label', { class: 'check', for: 'anon' }, anon, h('span', { class: 'small' }, 'Publicar como anônima. ', h('span', { class: 'muted' }, 'Sua identidade fica oculta para as outras usuárias; a moderação pode acessar registros técnicos se necessário. Não é anonimato absoluto.'))), pseud),
    actions: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Cancelar'), btn] });
  btn.onclick = () => { hideFormError(err); withBusy(btn, async () => { try { const r = await post('/community/posts', { category: cat.value, body: ta.value, anonymous: anon.checked, pseudonym: pseud.value }); m.close(); toast('Publicado!'); onCreated(r.post); } catch (e) { showFormError(err, e.message); } }); };
}

/* ---------- Publicação com comentários ---------- */
function postView(id) {
  const root = h('div', { class: 'page page-narrow' });
  loadInto(root, () => get('/community/posts/' + id), (r) => {
    const box = h('div', { class: 'stack' }), list = h('div', { class: 'stack' });
    let comments = r.comments, replyTo = null;
    const ta = textarea({ placeholder: 'Escreva um comentário acolhedor…', maxlength: 800, rows: 3, 'aria-label': 'Comentário' }), anon = h('input', { type: 'checkbox', id: 'canon' });
    const info = h('div', { class: 'xs muted' }), btn = h('button', { class: 'btn btn-sm', type: 'submit' }, 'Comentar');
    const draw = () => { const roots = comments.filter((c) => !c.parent_id);
      const item = (c, depth) => h('div', { class: 'comment', style: { marginLeft: depth ? '28px' : 0 } }, h('div', { class: 'row row-nowrap', style: { alignItems: 'flex-start' } }, h('span', { class: 'avatar', style: { width: '32px', height: '32px', fontSize: '.8rem' } }, c.author[0]),
        h('div', { class: 'grow' }, h('div', { class: 'small' }, h('strong', {}, c.author), h('span', { class: 'muted' }, ' · ' + timeAgo(c.created_at))), h('p', { class: 'pre' }, c.body),
          h('div', { class: 'row', style: { gap: '4px' } }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { replyTo = c; info.textContent = `Respondendo a ${c.author}`; ta.focus(); } }, 'Responder'),
            c.mine ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => { if (!await confirmDialog({ title: 'Excluir comentário?', text: 'Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', danger: true })) return; try { await del('/community/comments/' + c.id); comments = comments.filter((x) => x.id !== c.id); draw(); toast('Comentário excluído.'); } catch (e) { toast(e.message, 'error'); } } }, 'Excluir')
              : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => reportDialog('comment', c.id, () => { comments = comments.filter((x) => x.id !== c.id); draw(); }) }, 'Denunciar')))));
      list.replaceChildren(...(roots.length ? roots.flatMap((c) => [item(c, 0), ...comments.filter((x) => x.parent_id === c.id).map((x) => item(x, 1))]) : [h('p', { class: 'muted small' }, 'Ainda não há comentários. Que tal acolher?')])); };
    draw();
    return h('div', { class: 'stack stack-lg' }, h('a', { class: 'small', href: '#/rede' }, '← Nossa Rede'), postCard(r.post, { detail: true }),
      h('section', { class: 'card stack' }, h('h3', {}, 'Comentários'), list,
        h('form', { class: 'stack', onsubmit: (e) => { e.preventDefault(); if (ta.value.trim().length < 2) return;
          withBusy(btn, async () => { try { await post(`/community/posts/${id}/comments`, { body: ta.value, parent_id: replyTo?.id, anonymous: anon.checked }); const fresh = await get('/community/posts/' + id); comments = fresh.comments; ta.value = ''; replyTo = null; info.textContent = ''; draw(); toast('Comentário enviado.'); } catch (ex) { toast(ex.message, 'error'); } }); } },
          ta, info, h('div', { class: 'spread' }, h('label', { class: 'check small', for: 'canon' }, anon, 'Comentar como anônima'), btn))));
  }, skeleton(6, 24));
  return root;
}
