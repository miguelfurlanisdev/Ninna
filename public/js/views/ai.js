/**
 * ai.js — Ninna AI: chat com histórico, sugestões e avisos de segurança.
 * A chave da API fica só no servidor (server/routes/ai.js). Sem chave → estado "não configurada".
 * Respostas NUNCA são simuladas. Avisos de urgência/crise são textos fixos vindos do servidor.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, del } from '../lib/api.js';
import { store, stage } from '../lib/store.js';
import { toast, textarea, confirmDialog, timeAgo, skeleton, errorBox, empty } from '../lib/ui.js';

export const title = 'Ninna AI';

export default async function view({ query }) {
  const root = h('div', { class: 'page ai-page' });
  let status; try { status = await get('/ai/status'); } catch (e) { root.append(errorBox(e)); return root; }
  let convId = null, busy = false, convs = [];
  const msgs = h('div', { class: 'chat-msgs', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversa' });
  const side = h('div', { class: 'chat-side stack stack-sm' });
  const ta = textarea({ placeholder: 'Escreva sua dúvida…', rows: 2, maxlength: 2000, 'aria-label': 'Mensagem para a Ninna AI' }); ta.style.minHeight = '54px';
  const send = h('button', { class: 'btn btn-icon', type: 'submit', 'aria-label': 'Enviar' }, icon('send'));

  const bubble = (role, text, safety) => h('div', { class: 'msg ' + role }, role === 'assistant' ? h('span', { class: 'f-ico f-ico-lav msg-ico' }, icon('sparkle')) : null, h('div', { class: 'bubble' }, h('div', { class: 'pre' }, text)));
  const noticeBox = (n) => h('div', { class: 'notice notice-danger safety', role: 'alert' }, icon('alert'), h('div', { class: 'stack stack-sm' }, h('strong', {}, n.title), h('span', {}, n.text),
    h('div', { class: 'row' }, (n.actions || []).map((a) => h('a', { class: 'btn btn-sm btn-danger', href: 'tel:' + a.phone }, icon('phone'), a.label)))));
  const intro = () => {
    const sug = store.meta.askSuggestions[stage()] || [];
    msgs.replaceChildren(h('div', { class: 'ai-intro stack' }, h('span', { class: 'f-ico f-ico-lav' }, icon('sparkle')), h('h2', {}, 'Olá! Eu sou a Ninna AI.'),
      h('p', { class: 'muted' }, 'Posso explicar termos, preparar perguntas para consultas, ajudar a organizar tarefas e conversar sobre o que você está sentindo. Não sou profissional de saúde e não substituo a sua equipe.'),
      h('div', { class: 'chip-row' }, sug.map((s) => h('button', { class: 'chip', type: 'button', onclick: () => ask(s) }, s)))));
  };
  const scroll = () => { msgs.scrollTop = msgs.scrollHeight; };

  async function ask(text) {
    text = (text || ta.value).trim(); if (!text || busy) return;
    busy = true; send.setAttribute('aria-busy', 'true'); ta.value = '';
    if (msgs.querySelector('.ai-intro')) msgs.replaceChildren();
    msgs.append(bubble('user', text));
    const typing = h('div', { class: 'msg assistant' }, h('div', { class: 'bubble typing', 'aria-label': 'Ninna AI está escrevendo' }, h('i'), h('i'), h('i'))); msgs.append(typing); scroll();
    try {
      const r = await post('/ai/chat', { message: text, conversation_id: convId || undefined });
      convId = r.conversation_id; typing.remove();
      if (r.notice) msgs.append(noticeBox(r.notice));
      if (!r.configured) msgs.append(h('div', { class: 'notice notice-warn' }, icon('info'), 'A Ninna AI ainda não está configurada neste servidor, então não consigo responder. Veja as instruções abaixo.'));
      else msgs.append(bubble('assistant', r.reply));
      loadConvs();
    } catch (e) {
      typing.remove(); if (e.data?.notice) msgs.append(noticeBox(e.data.notice)); msgs.append(errorBox(e, () => ask(text)));
    } finally { busy = false; send.removeAttribute('aria-busy'); scroll(); ta.focus(); }
  }

  async function open(id) {
    convId = id; msgs.replaceChildren(skeleton(4));
    try { const r = await get('/ai/conversations/' + id); msgs.replaceChildren(...r.messages.flatMap((m) => [m.role === 'assistant' && m.safety ? noticeBox({ title: m.safety === 'crisis' ? 'Você não está sozinha' : 'Atenção', text: 'Se for urgente, ligue SAMU 192. Apoio emocional: CVV 188.', actions: [] }) : null, bubble(m.role, m.content)])); scroll(); }
    catch (e) { msgs.replaceChildren(errorBox(e)); }
  }
  async function loadConvs() {
    try { convs = (await get('/ai/conversations')).items; } catch { return; }
    side.replaceChildren(h('button', { class: 'btn btn-soft btn-sm btn-block', type: 'button', onclick: () => { convId = null; intro(); } }, icon('plus'), 'Nova conversa'),
      ...convs.map((c) => h('div', { class: 'conv' + (c.id === convId ? ' active' : '') }, h('button', { class: 'conv-open', type: 'button', onclick: () => open(c.id) }, h('span', { class: 'small' }, c.title), h('span', { class: 'xs muted' }, timeAgo(c.created_at))),
        h('button', { class: 'iconbtn', style: { width: '32px', height: '32px' }, 'aria-label': 'Excluir conversa', type: 'button', onclick: async () => { if (!await confirmDialog({ title: 'Excluir conversa?', text: 'O histórico desta conversa será apagado.', confirmLabel: 'Excluir', danger: true })) return; await del('/ai/conversations/' + c.id).catch((e) => toast(e.message, 'error')); if (convId === c.id) { convId = null; intro(); } loadConvs(); } }, icon('trash', { size: 15 }))))); 
  }

  root.append(h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Assistente de maternidade'), h('h1', {}, 'Ninna AI'))),
    !status.configured ? h('div', { class: 'notice notice-warn mb' }, icon('settings'), h('div', {}, h('strong', {}, 'Ninna AI não configurada. '), 'Defina ', h('code', {}, 'ANTHROPIC_API_KEY'), ' no arquivo ', h('code', {}, '.env'), ' do servidor e reinicie. Enquanto isso, o chat não gera respostas (não simulamos IA), mas avisos de segurança continuam funcionando.')) : null,
    h('div', { class: 'chat' }, h('aside', { class: 'chat-aside' }, h('h4', { class: 'mb' }, 'Conversas'), side), h('section', { class: 'chat-main' }, msgs,
      h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); ask(); } }, ta, send))),
    h('p', { class: 'xs muted mt' }, 'Informativo, não substitui profissionais. Não enviamos seu diário nem seu histórico de saúde. Emergência: SAMU 192 · Apoio emocional: CVV 188.'));
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });
  intro(); loadConvs();
  if (query.q) setTimeout(() => ask(query.q), 100);
  return root;
}
