/**
 * shopping.js — enxoval e compras: categorias, itens, prioridades, orçamento em R$, gastos,
 * exportar/imprimir e atalhos de BUSCA em lojas (links de busca públicos, identificados como tais).
 * Não inventamos produtos, preços ou avaliações: valores são os que a usuária digita.
 * 🔧 EDITAR: categorias/sugestões/lojas em content/meta.json; links manuais no painel admin.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, put, del } from '../lib/api.js';
import { store } from '../lib/store.js';
import { loadInto, skeleton, toast, modal, field, input, select, textarea, brl, toCents, empty, confirmDialog, withBusy, downloadFile, formError, showFormError } from '../lib/ui.js';
import { countUp } from '../lib/motion.js';

export const title = 'Enxoval e compras';
const PRIO = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export default async function view() {
  const root = h('div', { class: 'page' }), body = h('div');
  root.append(h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Organização'), h('h1', {}, 'Enxoval e compras'), h('p', {}, 'Cada família precisa de coisas diferentes. Monte a sua lista, acompanhe o orçamento e compartilhe com quem vai ajudar.'))), body);
  loadInto(body, async () => { const [a, p] = await Promise.all([get('/shopping'), get('/products')]); return { items: a.items, products: p.items }; }, (d) => ui(d.items, d.products), skeleton(6, 24));
  return root;
}

function ui(initial, products) {
  let items = initial, cat = '', hideBought = false;
  const cats = store.meta.shoppingCategories, catName = (s) => cats.find((c) => c.slug === s)?.name || s;
  const root = h('div', { class: 'stack stack-lg' }), summary = h('div', { class: 'grid grid-3' }), chips = h('div', { class: 'chip-scroll' }), listBox = h('div', { class: 'stack' }), safety = h('div');

  const draw = () => {
    const est = items.reduce((s, i) => s + i.est_cents * i.qty, 0), paid = items.reduce((s, i) => s + i.paid_cents, 0), bought = items.filter((i) => i.bought).length;
    const stat = (l, v, fmt) => { const n = h('div', { class: 'display big-num', style: { color: 'var(--forest-700)' } }, fmt(0)); countUp(n, v, { format: fmt }); return h('div', { class: 'card center' }, n, h('div', { class: 'small muted' }, l)); };
    summary.replaceChildren(stat('orçamento estimado', est, (n) => brl(Math.round(n))), stat('já gasto', paid, (n) => brl(Math.round(n))), stat(`comprados de ${items.length}`, bought, (n) => String(Math.round(n))));
    chips.replaceChildren(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(!cat), onclick: () => { cat = ''; draw(); } }, 'Todas'), ...cats.map((c) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(cat === c.slug), onclick: () => { cat = c.slug; draw(); } }, c.name)));
    const shown = items.filter((i) => (!cat || i.category === cat) && (!hideBought || !i.bought));
    listBox.replaceChildren(...(shown.length ? shown.map(row) : [empty('Nenhum item', 'Adicione itens ou use as sugestões da categoria.')]));
    safety.replaceChildren(...(store.meta.shoppingSafety[cat] ? [h('div', { class: 'notice notice-warn' }, icon('shield'), store.meta.shoppingSafety[cat])] : []));
  };

  function row(i) {
    const cb = h('input', { type: 'checkbox', checked: !!i.bought, id: 'sh' + i.id, 'aria-label': `Comprado: ${i.name}`, style: { width: '22px', height: '22px', accentColor: 'var(--forest-700)' } });
    cb.addEventListener('change', async () => { try { const r = await put('/shopping/' + i.id, { bought: cb.checked }); items = items.map((x) => (x.id === i.id ? r.item : x)); draw(); } catch (e) { cb.checked = !cb.checked; toast(e.message, 'error'); } });
    return h('div', { class: 'card shop-item' + (i.bought ? ' is-done' : '') }, h('div', { class: 'row row-nowrap' }, cb, h('div', { class: 'grow' }, h('strong', { style: i.bought ? { textDecoration: 'line-through', color: 'var(--muted)' } : {} }, `${i.qty}× ${i.name}`),
      h('div', { class: 'small muted' }, `${catName(i.category)} · prioridade ${PRIO[i.priority].toLowerCase()}${i.est_cents ? ` · est. ${brl(i.est_cents * i.qty)}` : ''}${i.paid_cents ? ` · pago ${brl(i.paid_cents)}` : ''}`), i.notes ? h('div', { class: 'small' }, i.notes) : null),
      h('span', { class: 'badge ' + (i.priority === 'alta' ? 'badge-rose' : i.priority === 'media' ? 'badge-sun' : '') }, PRIO[i.priority]),
      h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Editar ' + i.name, onclick: () => form(i) }, icon('edit', { size: 17 })),
      h('button', { class: 'iconbtn sm', type: 'button', 'aria-label': 'Excluir ' + i.name, onclick: async () => { if (!await confirmDialog({ title: 'Excluir item?', text: `"${i.name}" será removido da lista.`, confirmLabel: 'Excluir', danger: true })) return; try { await del('/shopping/' + i.id); items = items.filter((x) => x.id !== i.id); draw(); toast('Item excluído.'); } catch (e) { toast(e.message, 'error'); } } }, icon('trash', { size: 17 }))));
  }

  function form(i = {}) {
    const editing = !!i.id, err = formError();
    const name = input({ value: i.name || '', maxlength: 120 }), c = select(cats.map((x) => [x.slug, x.name]), i.category || cat || 'roupas'), qty = input({ type: 'number', min: 1, max: 999, value: i.qty || 1 });
    const pr = select(Object.entries(PRIO), i.priority || 'media'), est = input({ inputmode: 'decimal', value: i.est_cents ? (i.est_cents / 100).toFixed(2).replace('.', ',') : '', placeholder: '0,00' }), paid = input({ inputmode: 'decimal', value: i.paid_cents ? (i.paid_cents / 100).toFixed(2).replace('.', ',') : '', placeholder: '0,00' }), notes = textarea({ value: i.notes || '', maxlength: 300, style: 'min-height:70px' });
    const sug = h('datalist', { id: 'sug' }, Object.values(store.meta.shoppingSuggestions).flat().filter((x) => typeof x === 'string').map((x) => h('option', { value: x }))); name.setAttribute('list', 'sug');
    const btn = h('button', { class: 'btn', type: 'button' }, editing ? 'Salvar' : 'Adicionar');
    const m = modal({ title: editing ? 'Editar item' : 'Novo item', content: h('div', { class: 'stack' }, err, field('Item', name), sug, h('div', { class: 'form-grid' }, field('Categoria', c), field('Quantidade', qty), field('Prioridade', pr), field('Preço estimado por unidade (R$)', est), field('Valor pago no total (R$)', paid)), field('Observações', notes)), actions: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Cancelar'), btn] });
    btn.onclick = () => { if (!name.value.trim()) return showFormError(err, 'Informe o nome do item.'); withBusy(btn, async () => { try { const body = { name: name.value, category: c.value, qty: Number(qty.value) || 1, priority: pr.value, est_cents: toCents(est.value), paid_cents: toCents(paid.value), notes: notes.value.trim() || null };
      const r = editing ? await put('/shopping/' + i.id, body) : await post('/shopping', body); items = editing ? items.map((x) => (x.id === i.id ? r.item : x)) : [r.item, ...items]; m.close(); draw(); toast('Salvo na lista.'); } catch (e) { showFormError(err, e.message); } }); };
  }

  function suggestions() {
    const cur = cat || 'roupas', list = store.meta.shoppingSuggestions[cur] || [];
    const m = modal({ title: `Sugestões: ${catName(cur)}`, content: h('div', { class: 'stack' }, h('p', { class: 'small muted' }, store.meta.shoppingSuggestions._aviso), ...list.map((s) => h('div', { class: 'list-item' }, h('span', { class: 'grow' }, s), h('button', { class: 'btn btn-sm btn-soft', type: 'button', onclick: async (e) => { try { const r = await post('/shopping', { name: s, category: cur }); items = [r.item, ...items]; draw(); e.target.closest('button').replaceWith(h('span', { class: 'badge badge-ok' }, 'Adicionado')); } catch (ex) { toast(ex.message, 'error'); } } }, icon('plus'), 'Adicionar')))) });
  }

  const exportBtn = () => { const lines = items.map((i) => `${i.bought ? '[x]' : '[ ]'} ${i.qty}x ${i.name} (${catName(i.category)}, ${PRIO[i.priority]})${i.est_cents ? ' est. ' + brl(i.est_cents * i.qty) : ''}`); downloadFile('lista-ninna.txt', `Lista NINNA\n\n${lines.join('\n')}\n`, 'text/plain'); };

  const stores = h('section', { class: 'card stack' }, h('h3', {}, 'Onde pesquisar'), h('p', { class: 'small muted' }, 'São ', h('strong', {}, 'links de busca públicos'), ' nas lojas, não recomendações nem produtos selecionados pela NINNA. Não há comissão nem afiliados nesses links.'),
    h('div', { class: 'grid grid-auto' }, store.meta.storeSearches.map((s) => h('div', { class: 'card-flat stack stack-sm' }, h('strong', {}, s.category), h('div', { class: 'chip-row' }, store.meta.stores.map((st) => h('a', { class: 'chip', href: st.searchUrl.replace('{q}', encodeURIComponent(s.q)), target: '_blank', rel: 'noopener noreferrer sponsored' }, st.name)))))),
    products.length ? h('div', { class: 'stack' }, h('h4', {}, 'Links cadastrados pela equipe'), h('div', { class: 'list' }, products.map((p) => h('div', { class: 'list-item' }, h('div', { class: 'grow' }, h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' + (p.kind === 'afiliado' ? ' sponsored' : '') }, p.title), h('div', { class: 'xs muted' }, p.category + (p.note ? ' · ' + p.note : ''))), p.kind === 'afiliado' ? h('span', { class: 'badge badge-sun' }, 'Link de afiliado') : null)))) : null,
    h('p', { class: 'xs muted' }, 'Para itens de sono e transporte, siga o manual do fabricante e a legislação. Isto não é recomendação médica.'));

  root.append(summary, h('div', { class: 'spread' }, h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => form() }, icon('plus'), 'Novo item'), h('button', { class: 'btn btn-soft', type: 'button', onclick: suggestions }, icon('sparkle'), 'Sugestões')),
    h('div', { class: 'row' }, h('label', { class: 'check small' }, h('input', { type: 'checkbox', onchange: (e) => { hideBought = e.target.checked; draw(); } }), 'Ocultar comprados'), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: exportBtn }, icon('download'), 'Exportar'), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => window.print() }, icon('printer'), 'Imprimir'))),
    chips, safety, listBox, h('div', { class: 'notice notice-sage' }, icon('hands'), h('span', {}, 'Para compartilhar a lista com a pessoa de apoio, use ', h('a', { href: '#/juntos' }, 'Juntos'), ' e marque “Lista de compras”.')), stores);
  draw(); return root;
}
