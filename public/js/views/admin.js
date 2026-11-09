/**
 * admin.js — painel administrativo (moderadora/admin). A autorização é feita NO SERVIDOR;
 * esta tela só organiza as ações. Métricas são agregadas (sem dados de saúde individuais).
 * 🔧 EDITAR: abas em TABS (admin-only marcadas com `adm: true`).
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, put, del } from '../lib/api.js';
import { store, role } from '../lib/store.js';
import { loadInto, skeleton, toast, modal, field, input, textarea, select, withBusy, confirmDialog, empty, fmtDate, timeAgo, formError, showFormError } from '../lib/ui.js';

export const title = 'Administração';
const TABS = [['geral', 'Visão geral'], ['artigos', 'Artigos'], ['semanas', 'Semanas'], ['moderacao', 'Moderação'], ['produtos', 'Links de produtos'], ['perguntas', 'Perguntas dos jogos'], ['usuarias', 'Usuárias', true], ['logs', 'Registro de alterações', true]];

export default async function view() {
  const root = h('div', { class: 'page' }); let tab = 'geral';
  const tabs = h('div', { class: 'tabs', role: 'tablist' }), body = h('div');
  const draw = () => { tabs.replaceChildren(...TABS.filter(([, , adm]) => !adm || role() === 'admin').map(([k, l]) => h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === k), onclick: () => { tab = k; draw(); } }, l)));
    body.replaceChildren(h('div', { class: 'page-enter' }, { geral, artigos, semanas, moderacao, produtos, perguntas, usuarias, logs }[tab](() => draw()))); };
  root.append(h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Acesso restrito'), h('h1', {}, 'Painel administrativo'), h('p', {}, 'Conteúdo, moderação e métricas agregadas. Não exibimos dados de saúde individuais.'))), tabs, body);
  draw(); return root;
}

const table = (head, rows) => h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))), h('tbody', {}, rows)));
const td = (...c) => h('td', {}, ...c);

/* ---------- Visão geral ---------- */
function geral() {
  const box = h('div');
  loadInto(box, async () => { const [s, st] = await Promise.all([get('/admin/stats'), get('/admin/stale')]); return { s, st }; }, ({ s, st }) => {
    const stat = (v, l) => h('div', { class: 'card center' }, h('div', { class: 'display big-num', style: { color: 'var(--forest-700)' } }, String(v)), h('div', { class: 'small muted' }, l));
    return h('div', { class: 'stack stack-lg' }, h('div', { class: 'grid grid-3' }, stat(s.users, 'usuárias'), stat(s.newUsers7d, 'novas em 7 dias'), stat(s.openReports, 'denúncias abertas'), stat(s.posts, 'publicações'), stat(s.comments, 'comentários'), stat(s.aiConversations, 'conversas com a IA')),
      h('div', { class: 'card' }, h('h3', { class: 'mb' }, 'Usuárias por fase'), table(['Fase', 'Total'], s.byStage.map((r) => h('tr', {}, td(r.stage), td(String(r.n)))))),
      h('div', { class: 'card stack' }, h('h3', {}, 'Conteúdo que precisa de revisão'), h('p', { class: 'small muted' }, `${s.articlesPending} de ${s.articles} artigos e ${s.weeksPending} de 40 semanas aguardam revisão profissional. Artigos revisados há mais de 1 ano também aparecem.`),
        st.articles.length ? h('details', { class: 'faq' }, h('summary', {}, `${st.articles.length} artigos para revisar`), h('ul', { class: 'bullets mt' }, st.articles.map((a) => h('li', {}, a.title, a.reviewed_at ? ` (revisado em ${fmtDate(a.reviewed_at)})` : ' (nunca revisado)')))) : h('p', { class: 'small' }, 'Tudo em dia.'),
        st.weeks.length ? h('p', { class: 'small muted' }, `Semanas pendentes: ${st.weeks.map((w) => w.week).join(', ')}`) : null));
  }, skeleton(6));
  return box;
}

/* ---------- Artigos ---------- */
function artigos() {
  const box = h('div');
  const load = () => loadInto(box, () => get('/admin/articles'), (r) => h('div', { class: 'stack' }, h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => artForm(null, load) }, icon('plus'), 'Novo artigo')),
    table(['Título', 'Categoria', 'Revisão', 'Publicado', ''], r.items.map((a) => h('tr', {}, td(h('strong', {}, a.title)), td(a.category), td(a.review_status === 'reviewed' ? h('span', { class: 'badge badge-ok' }, fmtDate(a.reviewed_at)) : h('span', { class: 'badge badge-sun' }, 'pendente')), td(a.published ? 'Sim' : 'Não'),
      td(h('button', { class: 'btn btn-sm btn-soft', type: 'button', onclick: () => artForm(a.id, load) }, 'Editar'), ' ', h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': 'Excluir ' + a.title, onclick: async () => { if (!await confirmDialog({ title: 'Excluir artigo?', text: a.title, confirmLabel: 'Excluir', danger: true })) return; try { await del('/admin/articles/' + a.id); toast('Excluído.'); load(); } catch (e) { toast(e.message, 'error'); } } }, icon('trash', { size: 16 })))))))), skeleton(5));
  load(); return box;
}
async function artForm(id, done) {
  let a = { slug: '', title: '', category: store.meta.articleCategories[0].slug, summary: '', body: '', refs: '[]', stages: '[]', published: 1, review_status: 'pending' };
  if (id) { try { a = (await get('/admin/articles/' + id)).item; } catch (e) { return toast(e.message, 'error'); } }
  const refs = JSON.parse(a.refs || '[]'), stages = JSON.parse(a.stages || '[]'), err = formError();
  const f = { slug: input({ value: a.slug, disabled: !!id }), title: input({ value: a.title }), cat: select(store.meta.articleCategories.map((c) => [c.slug, c.name]), a.category), summary: textarea({ value: a.summary, style: 'min-height:70px' }), body: textarea({ value: a.body, style: 'min-height:220px' }),
    refs: textarea({ value: refs.map((r) => [r.title, r.org || '', r.url || ''].join(' | ')).join('\n'), style: 'min-height:90px', placeholder: 'Título | Órgão | https://link' }), wf: input({ type: 'number', min: 0, max: 42, value: a.weeks_from ?? '' }), wt: input({ type: 'number', min: 0, max: 42, value: a.weeks_to ?? '' }),
    rs: select([['pending', 'Pendente de revisão profissional'], ['reviewed', 'Revisado por profissional']], a.review_status), rb: input({ value: a.reviewed_by || '', placeholder: 'Nome/registro REAL de quem revisou' }), rd: input({ type: 'date', value: a.reviewed_at || '' }), pub: h('input', { type: 'checkbox', id: 'pub', checked: !!a.published }) };
  const stg = ['trying', 'pregnant', 'postpartum', 'support'].map((s) => { const c = h('input', { type: 'checkbox', id: 'sg' + s, checked: stages.includes(s) }); c.dataset.s = s; return c; });
  const btn = h('button', { class: 'btn', type: 'button' }, 'Salvar artigo');
  const m = modal({ title: id ? 'Editar artigo' : 'Novo artigo', content: h('div', { class: 'stack' }, err, h('div', { class: 'form-grid' }, field('Slug (endereço)', f.slug), field('Título', f.title), field('Categoria', f.cat), field('Publicado', h('label', { class: 'check' }, f.pub, 'Visível na biblioteca'))), field('Resumo', f.summary), field('Conteúdo', f.body, 'Parágrafos separados por linha em branco; “## ” cria subtítulo; linhas com “- ” viram lista.'),
    field('Referências (uma por linha)', f.refs, 'Só cadastre fontes reais e verificadas.'), h('div', { class: 'form-grid' }, field('Recomendar da semana', f.wf), field('até a semana', f.wt)), h('div', {}, h('strong', { class: 'small' }, 'Recomendar para as fases:'), h('div', { class: 'row' }, ['Tentando', 'Gestante', 'Pós-parto', 'Apoio'].map((l, i) => h('label', { class: 'check small', for: stg[i].id }, stg[i], l)))),
    h('div', { class: 'form-grid' }, field('Status da revisão', f.rs), field('Data da revisão', f.rd), h('div', { class: 'full' }, field('Revisado por', f.rb)))), actions: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Cancelar'), btn] });
  btn.onclick = () => withBusy(btn, async () => { try {
    const body = { slug: f.slug.value, title: f.title.value, category: f.cat.value, summary: f.summary.value, body: f.body.value, published: f.pub.checked, review_status: f.rs.value, reviewed_by: f.rb.value || undefined, reviewed_at: f.rd.value || undefined, stages: stg.filter((c) => c.checked).map((c) => c.dataset.s), weeks_from: f.wf.value === '' ? undefined : +f.wf.value, weeks_to: f.wt.value === '' ? undefined : +f.wt.value,
      refs: f.refs.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [t, o, u] = l.split('|').map((x) => x.trim()); return { title: t, org: o || undefined, url: u || undefined }; }) };
    if (id) delete body.slug; if (id) await put('/admin/articles/' + id, body); else await post('/admin/articles', body); m.close(); toast('Artigo salvo.'); done(); } catch (e) { showFormError(err, e.message); } });
}

/* ---------- Semanas ---------- */
function semanas() {
  let n = 1; const box = h('div');
  const load = () => loadInto(box, () => get('/admin/weeks/' + n), (r) => {
    const ta = textarea({ value: JSON.stringify(r.data, null, 2), style: 'min-height:380px;font-family:ui-monospace,monospace;font-size:.82rem' }), rs = select([['pending', 'Pendente'], ['reviewed', 'Revisada']], r.review_status), rd = input({ type: 'date', value: r.reviewed_at || '' }), err = formError(), b = h('button', { class: 'btn', type: 'button' }, 'Salvar semana');
    b.onclick = () => withBusy(b, async () => { try { await put('/admin/weeks/' + n, { data: JSON.parse(ta.value), review_status: rs.value, reviewed_at: rd.value || undefined }); toast('Semana salva.'); } catch (e) { showFormError(err, e instanceof SyntaxError ? 'JSON inválido: ' + e.message : e.message); } });
    return h('div', { class: 'stack' }, err, h('div', { class: 'form-grid' }, field('Revisão', rs), field('Data da revisão', rd)), field('Conteúdo (JSON)', ta, 'Campos: title, trimester, size, dev, body, checklist, curiosity, myth, emotional, partner, faq.'), h('div', {}, b));
  }, skeleton(6));
  const sel = select(Array.from({ length: 40 }, (_, i) => [i + 1, `Semana ${i + 1}`]), 1); sel.addEventListener('change', () => { n = +sel.value; load(); });
  load(); return h('div', { class: 'stack' }, field('Semana', sel), box);
}

/* ---------- Moderação ---------- */
function moderacao() {
  let st = 'open'; const box = h('div');
  const load = () => loadInto(box, () => get('/admin/reports', { status: st }), (r) => r.items.length ? h('div', { class: 'stack' }, r.items.map((x) => h('div', { class: 'card stack' }, h('div', { class: 'spread' }, h('span', { class: 'badge badge-rose' }, `${x.target_type === 'post' ? 'Publicação' : 'Comentário'} · ${x.report_count} denúncia(s)`), h('span', { class: 'xs muted' }, timeAgo(x.created_at))),
    h('p', { class: 'pre' }, x.content), h('p', { class: 'small muted' }, 'Motivo: ' + x.reason + ` · estado: ${x.content_status}`),
    st === 'open' ? h('div', { class: 'row' }, [['hide', 'Ocultar', 'btn-soft'], ['delete', 'Excluir', 'btn-danger'], ['dismiss', 'Manter (descartar)', 'btn-ghost']].map(([a, l, c]) => h('button', { class: 'btn btn-sm ' + c, type: 'button', onclick: async () => { try { await post(`/admin/reports/${x.id}/resolve`, { action: a }); toast('Feito.'); load(); } catch (e) { toast(e.message, 'error'); } } }, l))) : null))) : empty('Nada por aqui', 'Sem denúncias neste estado.'), skeleton(3));
  load(); return h('div', { class: 'stack' }, h('div', { class: 'chip-row' }, [['open', 'Abertas'], ['hidden', 'Ocultadas'], ['dismissed', 'Descartadas']].map(([k, l]) => h('button', { class: 'chip', type: 'button', onclick: (e) => { st = k; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); load(); }, 'aria-pressed': String(k === st) }, l))), box);
}

/* ---------- Links de produtos ---------- */
function produtos() {
  const box = h('div');
  const form = (p = {}) => { const err = formError(), f = { cat: input({ value: p.category || '' }), t: input({ value: p.title || '' }), u: input({ value: p.url || '', placeholder: 'https://…' }), n: input({ value: p.note || '' }), k: select([['manual', 'Link manual'], ['afiliado', 'Link de afiliado (comercial)']], p.kind || 'manual') }, b = h('button', { class: 'btn', type: 'button' }, 'Salvar');
    const m = modal({ title: p.id ? 'Editar link' : 'Novo link', content: h('div', { class: 'stack' }, err, field('Categoria', f.cat), field('Título', f.t), field('URL (https)', f.u), field('Observação', f.n), field('Natureza', f.k)), actions: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Cancelar'), b] });
    b.onclick = () => withBusy(b, async () => { try { const body = { category: f.cat.value, title: f.t.value, url: f.u.value, note: f.n.value || undefined, kind: f.k.value }; p.id ? await put('/admin/products/' + p.id, body) : await post('/admin/products', body); m.close(); toast('Salvo.'); load(); } catch (e) { showFormError(err, e.message); } }); };
  const load = () => loadInto(box, () => get('/admin/products'), (r) => r.items.length ? table(['Categoria', 'Título', 'Natureza', 'Ativo', ''], r.items.map((p) => h('tr', {}, td(p.category), td(h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, p.title)), td(p.kind), td(p.active ? 'Sim' : 'Não'), td(h('button', { class: 'btn btn-sm btn-soft', type: 'button', onclick: () => form(p) }, 'Editar'), ' ', h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': 'Excluir', onclick: async () => { await del('/admin/products/' + p.id).catch((e) => toast(e.message, 'error')); load(); } }, icon('trash', { size: 16 })))))) : empty('Nenhum link cadastrado', 'Cadastre apenas links reais. Indique se é afiliado.'), skeleton(3));
  load(); return h('div', { class: 'stack' }, h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => form() }, icon('plus'), 'Novo link')), box);
}

/* ---------- Perguntas ---------- */
function perguntas() {
  const box = h('div');
  const form = (q = {}) => { const err = formError(), opts = JSON.parse(q.options || '["Mito","Verdade"]'), f = { g: select([['mito', 'Mito ou verdade'], ['quiz', 'Quiz']], q.game || 'mito'), s: input({ type: 'number', min: 1, max: 3, value: q.stage ?? '' }), d: input({ type: 'number', min: 1, max: 3, value: q.difficulty || 1 }), q: textarea({ value: q.question || '', style: 'min-height:70px' }), o: textarea({ value: opts.join('\n'), style: 'min-height:90px' }), a: input({ type: 'number', min: 1, max: 6, value: (q.answer_index ?? 0) + 1 }), e: textarea({ value: q.explanation || '', style: 'min-height:80px' }), src: input({ value: q.source || '' }) }, b = h('button', { class: 'btn', type: 'button' }, 'Salvar');
    const m = modal({ title: q.id ? 'Editar pergunta' : 'Nova pergunta', content: h('div', { class: 'stack' }, err, h('div', { class: 'form-grid' }, field('Jogo', f.g), field('Trimestre (quiz)', f.s), field('Dificuldade (1-3)', f.d), field('Nº da resposta certa', f.a)), field('Pergunta/afirmação', f.q), field('Alternativas (uma por linha)', f.o), field('Explicação', f.e), field('Fonte (real)', f.src)), actions: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Cancelar'), b] });
    b.onclick = () => withBusy(b, async () => { try { const body = { game: f.g.value, stage: f.s.value === '' ? undefined : +f.s.value, difficulty: +f.d.value, question: f.q.value, options: f.o.value.split('\n').map((x) => x.trim()).filter(Boolean), answer_index: (+f.a.value || 1) - 1, explanation: f.e.value, source: f.src.value || undefined }; q.id ? await put('/admin/questions/' + q.id, body) : await post('/admin/questions', body); m.close(); toast('Salvo.'); load(); } catch (e) { showFormError(err, e.message); } }); };
  const load = () => loadInto(box, () => get('/admin/questions'), (r) => table(['Jogo', 'Pergunta', 'Ativa', ''], r.items.map((q) => h('tr', {}, td(q.game + (q.stage ? ` (${q.stage}º tri)` : '')), td(q.question), td(q.active ? 'Sim' : 'Não'), td(h('button', { class: 'btn btn-sm btn-soft', type: 'button', onclick: () => form(q) }, 'Editar'), ' ', h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-label': 'Excluir', onclick: async () => { if (!await confirmDialog({ title: 'Excluir pergunta?', text: q.question, confirmLabel: 'Excluir', danger: true })) return; await del('/admin/questions/' + q.id).catch((e) => toast(e.message, 'error')); load(); } }, icon('trash', { size: 16 })))))), skeleton(4));
  load(); return h('div', { class: 'stack' }, h('div', {}, h('button', { class: 'btn', type: 'button', onclick: () => form() }, icon('plus'), 'Nova pergunta')), box);
}

/* ---------- Usuárias e logs (somente admin) ---------- */
function usuarias() {
  const box = h('div'), q = input({ type: 'search', placeholder: 'Buscar por nome ou e-mail' }); let t;
  const load = () => loadInto(box, () => get('/admin/users', { q: q.value.trim() }), (r) => table(['Nome', 'E-mail', 'Papel', 'Desde'], r.items.map((u) => { const s = select([['user', 'Usuária'], ['moderator', 'Moderadora'], ['admin', 'Admin']], u.role); s.addEventListener('change', async () => { try { await put(`/admin/users/${u.id}/role`, { role: s.value }); toast('Papel atualizado.'); } catch (e) { s.value = u.role; toast(e.message, 'error'); } }); return h('tr', {}, td(u.display_name), td(u.email), td(s), td(fmtDate(u.created_at.slice(0, 10)))); })), skeleton(4));
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); }); load();
  return h('div', { class: 'stack' }, q, box);
}
function logs() { const box = h('div'); loadInto(box, () => get('/admin/logs'), (r) => table(['Quando', 'Quem', 'Ação', 'Alvo'], r.items.map((l) => h('tr', {}, td(l.at), td(l.admin || '—'), td(l.action), td(`${l.target || ''} ${l.detail || ''}`)))), skeleton(4)); return box; }
