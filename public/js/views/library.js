/**
 * library.js — Central de Conhecimento: categorias, busca, artigo com fontes e aviso de revisão.
 * Conteúdo vem do servidor (editável no painel admin). 🔧 Categorias: content/meta.json.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get } from '../lib/api.js';
import { store } from '../lib/store.js';
import { loadInto, skeleton, empty, fmtDate, renderRichText, disclaimer, input } from '../lib/ui.js';
import { debounce } from '../lib/dom.js';

export const title = 'Biblioteca';

const freshBadge = (a) => a.freshness === 'ok' ? h('span', { class: 'badge badge-ok' }, `Revisado em ${fmtDate(a.reviewed_at)}`)
  : a.freshness === 'stale' ? h('span', { class: 'badge badge-danger' }, 'Pode estar desatualizado')
  : h('span', { class: 'badge badge-sun' }, 'Aguardando revisão profissional');

export default async function view({ params }) {
  return params.slug ? articleView(params.slug) : listView();
}

function listView() {
  const root = h('div', { class: 'page' }), cats = store.meta.articleCategories;
  let cat = '', q = '';
  const res = h('div'), search = input({ type: 'search', placeholder: 'Buscar artigos (ex.: amamentação)', 'aria-label': 'Buscar artigos' });
  const chips = h('div', { class: 'chip-scroll' });
  const load = () => loadInto(res, () => get('/articles', { category: cat, q }), (r) => r.items.length
    ? h('div', { class: 'grid grid-auto' }, r.items.map((a) => h('a', { class: 'card card-link stack stack-sm reveal', href: '#/biblioteca/' + a.slug },
        h('span', { class: 'eyebrow' }, cats.find((c) => c.slug === a.category)?.name || a.category), h('h3', {}, a.title), h('p', { class: 'small muted' }, a.summary), h('div', {}, freshBadge(a)))))
    : empty('Nenhum artigo encontrado', 'Tente outra palavra ou categoria.'), skeleton(4));
  const drawChips = () => chips.replaceChildren(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(!cat), onclick: () => { cat = ''; drawChips(); load(); } }, 'Todos'),
    ...cats.map((c) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(cat === c.slug), onclick: () => { cat = c.slug; drawChips(); load(); } }, c.name)));
  search.addEventListener('input', debounce(() => { q = search.value.trim(); load(); }, 300));
  drawChips();
  root.append(h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Central de conhecimento'), h('h1', {}, 'Biblioteca'), h('p', {}, 'Informação em linguagem simples, com fontes e aviso de revisão.'))),
    h('div', { class: 'stack' }, search, chips, res));
  load();
  return root;
}

function articleView(slug) {
  const root = h('div', { class: 'page page-narrow' });
  loadInto(root, () => get('/articles/' + slug), ({ item: a, related }) => {
    const cat = store.meta.articleCategories.find((c) => c.slug === a.category)?.name || a.category;
    return h('article', { class: 'stack stack-lg' },
      h('a', { class: 'small', href: '#/biblioteca' }, '← Biblioteca'),
      h('div', { class: 'stack' }, h('span', { class: 'eyebrow' }, cat), h('h1', {}, a.title), h('p', { class: 'muted lead' }, a.summary),
        h('div', { class: 'row' }, freshBadge(a), a.review_status === 'reviewed' && a.reviewed_by ? h('span', { class: 'small muted' }, 'Revisão: ' + a.reviewed_by) : null)),
      a.freshness === 'stale' ? h('div', { class: 'notice notice-warn' }, icon('alert'), 'A última revisão deste conteúdo tem mais de um ano. Confira as fontes oficiais.') : null,
      renderRichText(a.body),
      disclaimer('Este conteúdo é informativo e não substitui a avaliação individual de profissionais de saúde.'),
      h('section', { class: 'card' }, h('h3', {}, 'Referências'), a.refs.length ? h('ul', { class: 'bullets mt' }, a.refs.map((r) => h('li', {}, r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.title) : r.title, r.org ? ` — ${r.org}` : ''))) : h('p', { class: 'small muted mt' }, 'Este artigo ainda não tem referências cadastradas.')),
      related.length ? h('section', {}, h('h3', { class: 'mb' }, 'Artigos relacionados'), h('div', { class: 'grid grid-3' }, related.map((r) => h('a', { class: 'card card-link', href: '#/biblioteca/' + r.slug }, h('h4', {}, r.title), h('p', { class: 'small muted mt' }, r.summary))))) : null);
  }, skeleton(8, 20));
  return root;
}
