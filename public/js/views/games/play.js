/**
 * games/play.js — a lógica dos 6 jogos. Cada função recebe um elemento e desenha o jogo nele.
 * Ao terminar, `finish()` salva a pontuação (POST /api/games/score) e mostra conquistas novas.
 * Acessível: tudo funciona por teclado/toque (a mala também aceita "tocar no item e depois na área").
 */
import { h } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { get, post } from '../../lib/api.js';
import { skeleton, errorBox, toast, empty } from '../../lib/ui.js';
import { celebrate, reduced } from '../../lib/motion.js';
import { supportUI } from '../wellbeing.js';

const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

/** Salva a pontuação e mostra a tela final com conquistas. */
async function finish(area, game, score, { title = 'Muito bem!', text, again }) {
  let earned = [];
  try { earned = (await post('/games/score', { game, score })).earned; } catch (e) { toast('Não foi possível salvar a pontuação: ' + e.message, 'error'); }
  const btn = h('a', { class: 'btn', href: '#/jogos' }, 'Voltar aos jogos');
  area.replaceChildren(h('div', { class: 'card stack center page-enter', style: { alignItems: 'center' } }, h('span', { class: 'f-ico' }, icon('trophy')), h('h2', {}, title), h('div', { class: 'display big-num', style: { color: 'var(--forest-700)' } }, score + '%'), text ? h('p', { class: 'muted' }, text) : null,
    earned.length ? h('div', { class: 'stack stack-sm' }, earned.map((e) => h('span', { class: 'badge badge-rose' }, '🏆 ' + e.label))) : null,
    h('div', { class: 'row', style: { justifyContent: 'center' } }, again ? h('button', { class: 'btn btn-secondary', type: 'button', onclick: again }, icon('refresh'), 'Jogar de novo') : null, btn)));
  celebrate(area.querySelector('.f-ico'));
}
async function load(area, fn, start) { area.replaceChildren(skeleton(5, 28)); try { start(await fn()); } catch (e) { area.replaceChildren(errorBox(e, () => load(area, fn, start))); } }

/* ---------- 1) Mito ou verdade ---------- */
function mito(area) {
  load(area, () => get('/games/questions', { game: 'mito' }), ({ items }) => {
    if (!items.length) return area.replaceChildren(empty('Sem perguntas ainda'));
    const qs = shuffle(items).slice(0, 8); let i = 0, ok = 0;
    const next = () => {
      if (i >= qs.length) return finish(area, 'mito', Math.round((ok / qs.length) * 100), { text: `Você acertou ${ok} de ${qs.length}. O importante é aprender — e conversar com a sua equipe de saúde.`, again: () => mito(area) });
      const q = qs[i], fb = h('div', { 'aria-live': 'polite' });
      const btns = q.options.map((o, k) => h('button', { class: 'btn btn-secondary btn-lg', type: 'button', onclick: () => { const right = k === q.answer_index; if (right) ok++; btns.forEach((b, j) => { b.disabled = true; if (j === q.answer_index) b.classList.add('right'); else if (j === k) b.classList.add('wrong'); });
        fb.replaceChildren(h('div', { class: 'notice ' + (right ? 'notice-success' : 'notice-warn') }, icon(right ? 'check' : 'info'), h('div', { class: 'stack stack-sm' }, h('strong', {}, right ? 'Isso mesmo!' : 'Quase!'), h('span', {}, q.explanation), q.source ? h('span', { class: 'xs muted' }, 'Fonte: ' + q.source) : null)), h('button', { class: 'btn mt', type: 'button', onclick: () => { i++; next(); } }, i + 1 === qs.length ? 'Ver resultado' : 'Próxima', icon('arrow-r'))); } }, o));
      area.replaceChildren(h('div', { class: 'card stack page-enter' }, h('div', { class: 'spread' }, h('span', { class: 'badge' }, `${i + 1} de ${qs.length}`), h('div', { class: 'progress', style: { width: '120px' } }, h('i', { style: { width: (i / qs.length) * 100 + '%' } }))), h('h2', { class: 'center', style: { padding: '12px 0' } }, `“${q.question}”`), h('div', { class: 'grid grid-2' }, btns), fb));
    };
    next();
  });
}

/* ---------- 2) Organize a mala (arrastar e soltar + toque) ---------- */
const ZONES = { essencial: 'Documentos e essenciais', bebe: 'Para o bebê', mae: 'Para você', opcional: 'Opcionais' };
function mala(area) {
  load(area, () => get('/games/data'), ({ bag }) => {
    const items = shuffle(bag), placed = {}; let picked = null;
    const pile = h('div', { class: 'bag-pile', 'aria-label': 'Itens para organizar' }), zonesEl = h('div', { class: 'bag-zones' }), msg = h('p', { class: 'small muted', 'aria-live': 'polite' }, 'Arraste cada item para a área certa — ou toque no item e depois na área.');
    const chip = (it) => { const b = h('button', { class: 'bag-item' + (picked === it.id ? ' picked' : ''), type: 'button', draggable: 'true', 'data-id': it.id, onclick: () => { picked = picked === it.id ? null : it.id; msg.textContent = picked ? `Escolha a área para “${it.name}”.` : ''; draw(); } }, it.name);
      b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move'; }); return b; };
    const put = (id, zone) => { placed[id] = zone; picked = null; msg.textContent = ''; draw(); };
    function draw() {
      pile.replaceChildren(...items.filter((i) => !placed[i.id]).map(chip));
      zonesEl.replaceChildren(...Object.entries(ZONES).map(([z, label]) => { const el = h('div', { class: 'bag-zone', role: 'group', 'aria-label': label, tabindex: '0', onclick: () => picked && put(picked, z), onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && picked) { e.preventDefault(); put(picked, z); } } }, h('strong', { class: 'small' }, label), h('div', { class: 'bag-zone-items' }, items.filter((i) => placed[i.id] === z).map((i) => h('span', { class: 'bag-chip' }, i.name))));
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); }); el.addEventListener('dragleave', () => el.classList.remove('over')); el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id) put(id, z); }); return el; }));
      check.disabled = Object.keys(placed).length < items.length;
    }
    const check = h('button', { class: 'btn', type: 'button', disabled: true, onclick: () => { const ok = items.filter((i) => placed[i.id] === i.zone).length, score = Math.round((ok / items.length) * 100);
      const wrong = items.filter((i) => placed[i.id] !== i.zone);
      area.replaceChildren(h('div', { class: 'card stack page-enter' }, h('h2', {}, `Você organizou ${ok} de ${items.length} itens como sugerido`), h('p', { class: 'muted small' }, 'Cada maternidade e cada família tem necessidades diferentes — confirme a lista com a sua maternidade e a sua equipe.'),
        wrong.length ? h('div', { class: 'stack stack-sm' }, h('h4', {}, 'Para rever'), wrong.map((i) => h('div', { class: 'list-item', style: { alignItems: 'flex-start' } }, h('div', {}, h('strong', {}, i.name), h('div', { class: 'small muted' }, `Sugestão: ${ZONES[i.zone]}. ${i.why}`))))) : h('div', { class: 'notice notice-success' }, icon('check'), 'Tudo certo!'),
        h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => finish(area, 'mala', score, { text: 'Mala organizada!', again: () => mala(area) }) }, 'Concluir')))); } }, 'Conferir');
    draw();
    area.replaceChildren(h('div', { class: 'stack' }, msg, h('div', { class: 'card' }, h('h4', { class: 'mb' }, 'Itens'), pile), zonesEl, h('div', {}, check)));
  });
}

/* ---------- 3) Quiz por trimestre ---------- */
function quiz(area) {
  const pick = h('div', { class: 'stack' }, h('div', { class: 'card stack' }, h('h3', {}, 'Escolha o trimestre'), h('div', { class: 'chip-row' }, [[0, 'Todos'], [1, '1º trimestre'], [2, '2º trimestre'], [3, '3º trimestre']].map(([s, l]) => h('button', { class: 'chip', type: 'button', onclick: () => start(s) }, l)))));
  area.replaceChildren(pick);
  function start(stage) {
    load(area, () => get('/games/questions', { game: 'quiz', stage: stage || undefined }), ({ items }) => {
      if (!items.length) return area.replaceChildren(empty('Sem perguntas para este trimestre'), h('button', { class: 'btn', type: 'button', onclick: () => quiz(area) }, 'Voltar'));
      const qs = [...items].sort((a, b) => a.difficulty - b.difficulty).slice(0, 8); let i = 0, ok = 0;
      const next = () => {
        if (i >= qs.length) return finish(area, 'quiz', Math.round((ok / qs.length) * 100), { text: `${ok} de ${qs.length} respostas certas.`, again: () => quiz(area) });
        const q = qs[i], fb = h('div', { 'aria-live': 'polite' });
        const btns = q.options.map((o, k) => h('button', { class: 'choice', type: 'button', onclick: () => { const right = k === q.answer_index; if (right) ok++; btns.forEach((b, j) => { b.disabled = true; if (j === q.answer_index) b.classList.add('right'); else if (j === k) b.classList.add('wrong'); });
          fb.replaceChildren(h('div', { class: 'notice ' + (right ? 'notice-success' : 'notice-warn') }, icon(right ? 'check' : 'info'), h('div', { class: 'stack stack-sm' }, h('strong', {}, right ? 'Correto!' : 'Não foi dessa vez.'), h('span', {}, q.explanation), q.source ? h('span', { class: 'xs muted' }, 'Fonte: ' + q.source) : null)), h('button', { class: 'btn mt', type: 'button', onclick: () => { i++; next(); } }, i + 1 === qs.length ? 'Ver resultado' : 'Próxima', icon('arrow-r'))); } }, o));
        area.replaceChildren(h('div', { class: 'card stack page-enter' }, h('div', { class: 'spread' }, h('span', { class: 'badge' }, `Pergunta ${i + 1} de ${qs.length}`), h('span', { class: 'badge badge-lav' }, ['', 'Fácil', 'Médio', 'Desafio'][q.difficulty] || 'Fácil')), h('h2', {}, q.question), h('div', { class: 'stack stack-sm' }, btns), fb));
      }; next();
    });
  }
}

/* ---------- 4) Plano de apoio ---------- */
function apoio(area) {
  load(area, () => get('/support'), ({ items }) => {
    const done = h('button', { class: 'btn', type: 'button', onclick: async () => { const n = (await get('/support').catch(() => ({ items }))).items.length; finish(area, 'apoio', Math.min(100, Math.round((n / 3) * 100)), { title: n >= 3 ? 'Rede de apoio montada!' : 'Bom começo!', text: n >= 3 ? 'Você já tem 3 ou mais pessoas na sua rede.' : 'Adicione pelo menos 3 pessoas para completar o plano.' }); } }, 'Concluir plano');
    area.replaceChildren(h('div', { class: 'stack' }, h('div', { class: 'notice' }, icon('info'), 'Pense em quem pode ajudar no parto e no pós-parto: transporte, refeições, cuidado com outros filhos, descanso. Meta: 3 ou mais pessoas.'), supportUI(items), h('div', {}, done)));
  });
}

/* ---------- 5) Memória ---------- */
function memoria(area) {
  load(area, () => get('/games/data'), ({ memory }) => {
    const cards = shuffle(memory.flatMap((m) => [{ pid: m.id, kind: 'label', ico: m.icon, text: m.label }, { pid: m.id, kind: 'fact', text: m.fact }]));
    let open = [], matched = new Set(), moves = 0, lock = false;
    const grid = h('div', { class: 'mem-grid' }), info = h('div', { class: 'spread' }), tip = h('div', { 'aria-live': 'polite' });
    const draw = () => { info.replaceChildren(h('span', { class: 'badge' }, `Jogadas: ${moves}`), h('span', { class: 'badge badge-ok' }, `Pares: ${matched.size}/${memory.length}`));
      grid.replaceChildren(...cards.map((c, idx) => { const shown = open.includes(idx) || matched.has(c.pid);
        return h('button', { class: 'mem-card' + (shown ? ' shown' : '') + (matched.has(c.pid) ? ' matched' : ''), type: 'button', 'aria-label': shown ? (c.kind === 'label' ? c.text : c.text) : 'Carta virada', disabled: matched.has(c.pid), onclick: () => flip(idx) }, shown ? [c.kind === 'label' ? icon(c.ico) : null, h('span', { class: c.kind === 'fact' ? 'small' : '' }, c.text)] : icon('leaf')); })); };
    function flip(idx) {
      if (lock || open.includes(idx)) return; open.push(idx); draw();
      if (open.length === 2) { moves++; const [a, b] = open.map((i) => cards[i]);
        if (a.pid === b.pid && a.kind !== b.kind) { matched.add(a.pid); const m = memory.find((x) => x.id === a.pid); tip.replaceChildren(h('div', { class: 'notice notice-success' }, icon('check'), `${m.label}: ${m.fact}`)); open = []; draw();
          if (matched.size === memory.length) setTimeout(() => finish(area, 'memoria', Math.max(20, 100 - Math.max(0, moves - memory.length) * 6), { text: `Você completou em ${moves} jogadas.`, again: () => memoria(area) }), 700); }
        else { lock = true; setTimeout(() => { open = []; lock = false; draw(); }, reduced() ? 300 : 900); } }
    }
    draw(); area.replaceChildren(h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Vire duas cartas: combine o tema (com ícone) com a dica de cuidado correspondente.'), info, grid, tip));
  });
}

/* ---------- 6) Jornada das semanas ---------- */
function jornada(area) {
  load(area, () => get('/games/data'), ({ milestones }) => {
    const qs = shuffle(milestones).slice(0, 8); let i = 0, ok = 0;
    const next = () => {
      if (i >= qs.length) return finish(area, 'jornada', Math.round((ok / qs.length) * 100), { text: `${ok} de ${qs.length} marcos no lugar certo. As semanas são referências — cada gestação tem seu ritmo.`, again: () => jornada(area) });
      const m = qs[i], fb = h('div', { 'aria-live': 'polite' });
      const opts = shuffle([...new Set([m.week, ...shuffle(milestones.map((x) => x.week).filter((w) => w !== m.week)).slice(0, 3)])]);
      const btns = opts.map((w) => h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { const right = w === m.week; if (right) ok++; btns.forEach((b) => { b.disabled = true; if (+b.dataset.w === m.week) b.classList.add('right'); else if (+b.dataset.w === w) b.classList.add('wrong'); });
        fb.replaceChildren(h('div', { class: 'notice ' + (right ? 'notice-success' : 'notice-warn') }, icon(right ? 'check' : 'info'), h('span', {}, h('strong', {}, `Semana ${m.week}. `), m.info)), h('button', { class: 'btn mt', type: 'button', onclick: () => { i++; next(); } }, i + 1 === qs.length ? 'Ver resultado' : 'Próximo', icon('arrow-r'))); }, 'data-w': w }, `Semana ${w}`));
      area.replaceChildren(h('div', { class: 'card stack page-enter' }, h('span', { class: 'badge' }, `${i + 1} de ${qs.length}`), h('h2', {}, 'Em que semana acontece:'), h('p', { class: 'display', style: { fontSize: '1.5rem', color: 'var(--forest-700)' } }, m.text), h('div', { class: 'grid grid-2' }, btns), fb));
    }; next();
  });
}

export const PLAYERS = { mito, mala, quiz, apoio, memoria, jornada };
