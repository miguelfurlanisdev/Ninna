/**
 * games/hub.js — "Aprender Brincando": lista dos 6 jogos, progresso e conquistas.
 * Pontuação (melhor % e nº de partidas) é salva na conta. Sem ranking público (evita competição prejudicial).
 * 🔧 EDITAR: GAMES (nomes, descrições, ícones). Perguntas: painel admin. Dados da mala/memória/marcos: content/games.json.
 */
import { h } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { get } from '../../lib/api.js';
import { loadInto, skeleton, disclaimer } from '../../lib/ui.js';
import { PLAYERS } from './play.js';

export const title = 'Aprender Brincando';
export const GAMES = [
  { id: 'mito', icon: 'info', t: 'Mito ou verdade?', d: 'Afirmações sobre gestação e maternidade, com explicação e fonte.' },
  { id: 'mala', icon: 'bag', t: 'Organize a mala', d: 'Arraste os itens para o lugar certo na mala da maternidade.' },
  { id: 'quiz', icon: 'star', t: 'Quiz da gestação', d: 'Perguntas por trimestre, com dificuldade crescente.' },
  { id: 'apoio', icon: 'hands', t: 'Monte seu plano de apoio', d: 'Organize pessoas, contatos e tarefas para o parto e o pós-parto.' },
  { id: 'memoria', icon: 'sparkle', t: 'Memória da maternidade', d: 'Combine cada tema com a sua dica de cuidado.' },
  { id: 'jornada', icon: 'baby', t: 'Jornada das semanas', d: 'Descubra em que semana acontecem os principais marcos.' },
];

export default async function view({ params }) {
  const root = h('div', { class: 'page' });
  if (params.game) {
    const g = GAMES.find((x) => x.id === params.game);
    if (!g) { location.hash = '#/jogos'; return root; }
    const area = h('div');
    root.append(h('a', { class: 'small', href: '#/jogos' }, '← Todos os jogos'), h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Aprender Brincando'), h('h1', {}, g.t), h('p', {}, g.d))), area);
    PLAYERS[g.id](area); return root;
  }
  const body = h('div');
  root.append(h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Aprender Brincando'), h('h1', {}, 'Jogos para aprender'), h('p', {}, 'Curtos, simples e sem competição. Servem para aprender e se divertir — não substituem a orientação da sua equipe de saúde.'))), body);
  loadInto(body, () => get('/games/progress'), (p) => {
    const by = Object.fromEntries(p.scores.map((s) => [s.game, s]));
    return h('div', { class: 'stack stack-lg' }, h('div', { class: 'grid grid-3' }, GAMES.map((g) => h('a', { class: 'card card-link stack stack-sm reveal', href: '#/jogos/' + g.id }, h('span', { class: 'f-ico' }, icon(g.icon)), h('h3', {}, g.t), h('p', { class: 'small muted' }, g.d),
      h('div', {}, by[g.id] ? h('span', { class: 'badge badge-ok' }, `Melhor: ${by[g.id].best}% · ${by[g.id].plays}×`) : h('span', { class: 'badge' }, 'Ainda não jogou'))))),
      h('section', { class: 'card' }, h('h3', { class: 'mb' }, 'Conquistas'), h('div', { class: 'achv' }, Object.entries(p.catalog).map(([k, l]) => { const got = p.achievements.some((a) => a.key === k); return h('div', { class: 'achv-item' + (got ? ' got' : '') }, icon(got ? 'trophy' : 'lock'), h('span', { class: 'small' }, l)); }))),
      disclaimer('Os jogos são educativos e gerais. As necessidades variam conforme a maternidade, a família e a orientação da equipe de saúde.'));
  }, skeleton(5, 30));
  return root;
}
