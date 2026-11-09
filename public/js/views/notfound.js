/** Página 404 — endereço inexistente. */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
export const title = 'Página não encontrada';
export default async function view() {
  return h('div', { class: 'page page-narrow center', style: { paddingTop: '18vh' } },
    h('div', { class: 'stack', style: { alignItems: 'center' } }, icon('leaf', { cls: 'big', size: 56 }), h('h1', {}, 'Não encontramos esta página'),
      h('p', { class: 'muted' }, 'O endereço pode ter mudado ou não existe mais.'), h('a', { class: 'btn', href: '#/' }, 'Voltar ao início')));
}
