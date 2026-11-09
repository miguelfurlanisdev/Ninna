/**
 * ============================================================
 *  auth.js — entrar, criar conta, esqueci a senha, redefinir senha
 *  Todas as validações importantes acontecem de novo no servidor (server/routes/auth.js).
 *  🔧 EDITAR: textos e frases do painel lateral em ART_COPY.
 * ============================================================
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { logo, bloomArt } from '../lib/art.js';
import { post } from '../lib/api.js';
import { loadMe } from '../lib/store.js';
import { startReminders } from '../lib/reminders.js';
import { field, input, formError, showFormError, hideFormError, withBusy, toast } from '../lib/ui.js';
import { navigate } from '../lib/router.js';

export const title = 'Acesso';
const COPY = {
  login: ['Que bom ter você de volta.', 'Entre para continuar a sua jornada.'],
  register: ['Sua jornada começa aqui.', 'Crie a conta em poucos minutos. Você só informa o que quiser.'],
  forgot: ['Vamos recuperar o seu acesso.', 'Informe o e-mail da sua conta.'],
  reset: ['Crie uma nova senha.', 'Escolha uma senha com pelo menos 8 caracteres.'],
};

export default async function view({ mode, query }) {
  const builders = { login, register, forgot, reset };
  const [head, sub] = COPY[mode];
  return h('div', { class: 'auth-wrap' },
    h('aside', { class: 'auth-art', 'aria-hidden': 'true' },
      h('a', { class: 'brand', href: '#/' }, logo(38), 'NINNA'),
      h('div', {}, h('h2', {}, 'Cuidar de quem gera a vida.'), h('p', {}, 'Informação confiável, organização e apoio — no seu ritmo, sem julgamentos.')),
      h('div', { class: 'auth-bloom' }, bloomArt(28, { size: 300 }))),
    h('main', { class: 'auth-form', id: 'main' },
      h('a', { class: 'brand auth-brand-mobile', href: '#/' }, logo(34), 'NINNA'),
      h('div', { class: 'stack stack-sm' }, h('h1', { style: { fontSize: '2rem' } }, head), h('p', { class: 'muted' }, sub)),
      builders[mode](query)));
}

/* ---------- Entrar ---------- */
function login(query) {
  const err = formError();
  const email = input({ type: 'email', autocomplete: 'email', required: true, inputmode: 'email' });
  const pw = input({ type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn btn-lg btn-block', type: 'submit' }, 'Entrar');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
    e.preventDefault(); hideFormError(err);
    if (!email.value.trim() || !pw.value) return showFormError(err, 'Preencha o e-mail e a senha.');
    withBusy(btn, async () => {
      try {
        await post('/auth/login', { email: email.value, password: pw.value });
        const me = await loadMe(); startReminders();
        navigate(me.profile?.onboarded ? (query.volta || '/painel') : '/boas-vindas');
      } catch (ex) { showFormError(err, ex.message); }
    });
  } }, err, field('E-mail', email), field('Senha', pw), btn,
    h('div', { class: 'spread small' }, h('a', { href: '#/esqueci-senha' }, 'Esqueci minha senha'), h('a', { href: '#/criar-conta' }, 'Criar conta')));
  return form;
}

/* ---------- Criar conta ---------- */
function register() {
  const err = formError();
  const name = input({ autocomplete: 'given-name', required: true, maxlength: 60 });
  const email = input({ type: 'email', autocomplete: 'email', required: true, inputmode: 'email' });
  const pw = input({ type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
  const terms = h('input', { type: 'checkbox', id: 'terms' });
  const btn = h('button', { class: 'btn btn-lg btn-block', type: 'submit' }, 'Criar minha conta');
  return h('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
    e.preventDefault(); hideFormError(err);
    if (!name.value.trim()) return showFormError(err, 'Como podemos chamar você?');
    if (!email.value.includes('@')) return showFormError(err, 'Informe um e-mail válido.');
    if (pw.value.length < 8) return showFormError(err, 'A senha precisa ter pelo menos 8 caracteres.');
    if (!terms.checked) return showFormError(err, 'Para criar a conta, aceite os Termos e a Política de Privacidade.');
    withBusy(btn, async () => {
      try {
        await post('/auth/register', { display_name: name.value, email: email.value, password: pw.value, accept_terms: true });
        await loadMe(); startReminders(); toast('Conta criada! Vamos personalizar a sua experiência.');
        navigate('/boas-vindas');
      } catch (ex) { showFormError(err, ex.message); }
    });
  } }, err, field('Como podemos chamar você?', name), field('E-mail', email), field('Senha', pw, 'Mínimo de 8 caracteres.'),
    h('label', { class: 'check', for: 'terms' }, terms, h('span', { class: 'small' }, 'Li e aceito os ', h('a', { href: '#/termos', target: '_blank', rel: 'noopener' }, 'Termos de Uso'), ' e a ', h('a', { href: '#/privacidade', target: '_blank', rel: 'noopener' }, 'Política de Privacidade'), '.')),
    btn, h('p', { class: 'small center' }, 'Já tem conta? ', h('a', { href: '#/entrar' }, 'Entrar')));
}

/* ---------- Esqueci a senha ---------- */
function forgot() {
  const err = formError(); const out = h('div', { class: 'stack' });
  const email = input({ type: 'email', autocomplete: 'email', required: true, inputmode: 'email' });
  const btn = h('button', { class: 'btn btn-lg btn-block', type: 'submit' }, 'Enviar instruções');
  return h('div', { class: 'stack' }, h('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
    e.preventDefault(); hideFormError(err);
    if (!email.value.includes('@')) return showFormError(err, 'Informe um e-mail válido.');
    withBusy(btn, async () => {
      try {
        const r = await post('/auth/forgot', { email: email.value });
        out.replaceChildren(h('div', { class: 'notice notice-success', role: 'status' }, icon('check'), h('span', {}, r.message)),
          // Só aparece em desenvolvimento: o servidor ainda não envia e-mails de verdade.
          r.devLink ? h('div', { class: 'notice notice-warn' }, icon('info'), h('span', {}, h('strong', {}, 'Modo de desenvolvimento: '), 'o envio de e-mails ainda não está configurado, então use este link: ', h('a', { href: r.devLink }, 'redefinir minha senha'))) : null);
      } catch (ex) { showFormError(err, ex.message); }
    });
  } }, err, field('E-mail da conta', email), btn), out, h('a', { class: 'small', href: '#/entrar' }, '← Voltar para entrar'));
}

/* ---------- Redefinir a senha (link recebido) ---------- */
function reset(query) {
  const err = formError();
  if (!query.token) return h('div', { class: 'stack' }, h('div', { class: 'notice notice-danger' }, icon('alert'), 'Link inválido. Solicite um novo.'), h('a', { class: 'btn', href: '#/esqueci-senha' }, 'Solicitar novo link'));
  const pw = input({ type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
  const btn = h('button', { class: 'btn btn-lg btn-block', type: 'submit' }, 'Salvar nova senha');
  return h('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
    e.preventDefault(); hideFormError(err);
    withBusy(btn, async () => {
      try { await post('/auth/reset', { token: query.token, password: pw.value }); toast('Senha alterada! Entre com a nova senha.'); navigate('/entrar'); }
      catch (ex) { showFormError(err, ex.message); }
    });
  } }, err, field('Nova senha', pw, 'Mínimo de 8 caracteres.'), btn);
}
