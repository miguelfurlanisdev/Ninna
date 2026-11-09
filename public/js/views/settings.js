/**
 * settings.js — Configurações: perfil, jornada (datas), privacidade/LGPD, notificações, segurança.
 * Direitos do titular: consultar (esta tela), corrigir, exportar (JSON), excluir dados e conta.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { get, post, put, del } from '../lib/api.js';
import { store, setMe, today, stage } from '../lib/store.js';
import { field, input, select, textarea, toast, withBusy, confirmDialog, modal, formError, showFormError, hideFormError, downloadFile, fmtDate } from '../lib/ui.js';
import { logout } from '../lib/session.js';
import { notifPermission, askBrowserPermission, notifSupported } from '../lib/reminders.js';
import { navigate } from '../lib/router.js';

export const title = 'Configurações';

export default async function view() {
  const root = h('div', { class: 'page page-narrow' }); let tab = 'perfil';
  const T = [['perfil', 'Perfil'], ['jornada', 'Minha jornada'], ['privacidade', 'Privacidade'], ['notif', 'Notificações'], ['seguranca', 'Segurança']];
  const tabs = h('div', { class: 'tabs', role: 'tablist' }), body = h('div');
  const draw = () => { tabs.replaceChildren(...T.map(([k, l]) => h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === k), onclick: () => { tab = k; draw(); } }, l)));
    body.replaceChildren(h('div', { class: 'page-enter' }, { perfil, jornada, privacidade, notif, seguranca }[tab](draw))); };
  root.append(h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Conta'), h('h1', {}, 'Configurações'))), tabs, body);
  draw(); return root;
}

function saveBtn(label = 'Salvar') { return h('button', { class: 'btn', type: 'submit' }, icon('check'), label); }

/* ---------- Perfil ---------- */
function perfil() {
  const u = store.me.user, p = store.me.profile, err = formError();
  const name = input({ value: u.display_name, maxlength: 60 }), pub = input({ value: p.public_name || '', maxlength: 30 }), bio = textarea({ value: p.bio || '', maxlength: 280, style: 'min-height:80px' }), b = saveBtn();
  return h('form', { class: 'card stack', onsubmit: (e) => { e.preventDefault(); hideFormError(err); withBusy(b, async () => { try { setMe(await put('/profile', { display_name: name.value, public_name: pub.value, bio: bio.value })); toast('Perfil atualizado.'); } catch (ex) { showFormError(err, ex.message); } }); } },
    err, field('Nome', name), field('Nome de exibição na comunidade', pub, 'É o que as outras usuárias veem (mín. 2 letras).'), field('Apresentação (opcional)', bio), h('p', { class: 'small muted' }, 'E-mail da conta: ', u.email), h('div', {}, b));
}

/* ---------- Jornada ---------- */
function jornada() {
  const p = store.me.profile, consent = store.me.consents.health_data, err = formError(), t = today();
  const st = select([['trying', 'Tentando engravidar'], ['pregnant', 'Gestante'], ['postpartum', 'Pós-parto'], ['support', 'Apoiando alguém']], p.stage);
  const dyn = h('div', { class: 'stack' }), warn = h('div'), b = saveBtn('Salvar jornada');
  const fields = {};
  const build = () => {
    const s = st.value; dyn.replaceChildren();
    if (s === 'support') return dyn.append(h('p', { class: 'muted small' }, 'Sem dados de saúde para informar.'));
    if (!consent) return dyn.append(h('div', { class: 'notice notice-warn' }, icon('lock'), 'Autorize o uso de dados de saúde na aba Privacidade para informar datas.'));
    if (s === 'pregnant') {
      Object.assign(fields, { method: select([['lmp', 'Última menstruação (DUM)'], ['dpp', 'Data provável do parto (DPP)'], ['ga', 'Idade gestacional conhecida']], p.dating_source || 'lmp'), lmp: input({ type: 'date', max: t, value: p.dating_source === 'lmp' || !p.dating_source ? p.lmp || '' : '' }), dpp: input({ type: 'date', value: p.dpp_input || '' }), gw: input({ type: 'number', min: 0, max: 42, placeholder: 'Semanas' }), gd: input({ type: 'number', min: 0, max: 6, value: 0 }), pre: select([['', 'Não informar'], ['sus', 'SUS'], ['private', 'Convênio/particular'], ['mixed', 'Misto'], ['none', 'Ainda não iniciei']], p.prenatal_type || '') });
      const lF = field('Primeiro dia da última menstruação', fields.lmp), dF = field('Data provável do parto', fields.dpp), gF = h('div', { class: 'form-grid' }, field('Semanas', fields.gw), field('Dias', fields.gd));
      const show = () => { lF.classList.toggle('hide', fields.method.value !== 'lmp'); dF.classList.toggle('hide', fields.method.value !== 'dpp'); gF.classList.toggle('hide', fields.method.value !== 'ga'); }; fields.method.addEventListener('change', show); show();
      dyn.append(h('div', { class: 'notice' }, icon('info'), 'A idade gestacional é uma estimativa e pode ser ajustada pela equipe de saúde. Se informar mais de uma data e elas divergirem, avisaremos.'), field('Informar por', fields.method), lF, dF, gF, field('Tipo de pré-natal', fields.pre));
      if (p.lmp) dyn.append(h('p', { class: 'small muted' }, `Data de referência atual (DUM equivalente): ${fmtDate(p.lmp)}.`));
    } else if (s === 'trying') {
      Object.assign(fields, { lmp: input({ type: 'date', max: t, value: p.lmp || '' }), len: input({ type: 'number', min: 21, max: 45, value: p.cycle_length || 28 }), reg: select([['unknown', 'Não sei'], ['regular', 'Regular'], ['irregular', 'Irregular']], p.cycle_regular || 'unknown') });
      dyn.append(h('div', { class: 'form-grid' }, field('Primeiro dia da última menstruação', fields.lmp), field('Duração média do ciclo', fields.len), field('Regularidade', fields.reg)), h('p', { class: 'xs muted' }, 'Estimativas por média; não confirmam ovulação nem fertilidade.'));
    } else {
      Object.assign(fields, { bd: input({ type: 'date', max: t, value: p.birth_date || '' }), bn: input({ value: p.baby_name || '', maxlength: 60 }) });
      dyn.append(h('div', { class: 'form-grid' }, field('Data do nascimento', fields.bd), field('Nome do bebê', fields.bn)));
    }
  };
  st.addEventListener('change', build); build();
  return h('form', { class: 'card stack', onsubmit: (e) => { e.preventDefault(); hideFormError(err); warn.replaceChildren();
    withBusy(b, async () => { try {
      const s = st.value, body = { stage: s };
      if (consent && s === 'pregnant') { const m = fields.method.value; if (m === 'lmp') body.lmp = fields.lmp.value || null; if (m === 'dpp') body.dpp_input = fields.dpp.value || null; if (m === 'ga' && fields.gw.value !== '') { body.ga_weeks = +fields.gw.value; body.ga_days = +fields.gd.value || 0; } body.prenatal_type = fields.pre.value || null; }
      if (consent && s === 'trying') Object.assign(body, { lmp: fields.lmp.value || null, cycle_length: +fields.len.value || null, cycle_regular: fields.reg.value });
      if (consent && s === 'postpartum') Object.assign(body, { birth_date: fields.bd.value || null, baby_name: fields.bn.value || null });
      const r = await put('/profile', body); setMe(r); toast('Jornada atualizada.');
      (r.warnings || []).forEach((w) => warn.append(h('div', { class: 'notice notice-warn' }, icon('alert'), w)));
    } catch (ex) { showFormError(err, ex.message); } }); } }, err, field('Em que fase você está?', st), dyn, warn, h('div', {}, b));
}

/* ---------- Privacidade (LGPD) ---------- */
function privacidade(redraw) {
  const c = store.me.consents;
  const hd = h('input', { type: 'checkbox', id: 'cs-h', checked: !!c.health_data }), ai = h('input', { type: 'checkbox', id: 'cs-a', checked: !!c.ai_context, disabled: !c.health_data });
  const update = async (patch, back) => { try { setMe(await put('/consents', patch)); toast('Preferência salva.'); redraw(); } catch (e) { back(); toast(e.message, 'error'); } };
  hd.addEventListener('change', async () => { if (!hd.checked && !await confirmDialog({ title: 'Retirar consentimento?', text: 'As datas de saúde guardadas no seu perfil (menstruação, parto, ciclo...) serão apagadas.', confirmLabel: 'Retirar e apagar', danger: true })) { hd.checked = true; return; } update({ health_data: hd.checked }, () => { hd.checked = !hd.checked; }); });
  ai.addEventListener('change', () => update({ ai_context: ai.checked }, () => { ai.checked = !ai.checked; }));
  const pw = input({ type: 'password', autocomplete: 'current-password' });
  return h('div', { class: 'stack' },
    h('div', { class: 'card stack' }, h('h3', {}, 'Consentimentos'), h('label', { class: 'switch', for: 'cs-h' }, h('span', {}, h('strong', {}, 'Dados de saúde'), h('span', { class: 'small muted', style: { display: 'block' } }, 'Datas, compromissos, diário, check-ins e dúvidas. Finalidade: calcular semanas, organizar e personalizar.')), hd),
      h('label', { class: 'switch', for: 'cs-a' }, h('span', {}, h('strong', {}, 'Ninna AI saber minha semana'), h('span', { class: 'small muted', style: { display: 'block' } }, 'Só a semana de gestação é enviada. Diário e histórico nunca.')), ai), c.accepted_at ? h('p', { class: 'xs muted' }, 'Primeiro consentimento registrado em ' + fmtDate(c.accepted_at.slice(0, 10))) : null),
    h('div', { class: 'card stack' }, h('h3', {}, 'Seus dados'), h('p', { class: 'small muted' }, 'Você pode baixar uma cópia de tudo que guardamos (JSON).'),
      h('div', {}, h('button', { class: 'btn btn-soft', type: 'button', onclick: async (e) => withBusy(e.currentTarget, async () => { try { const d = await get('/me/export'); downloadFile('meus-dados-ninna.json', JSON.stringify(d, null, 2)); toast('Arquivo gerado.'); } catch (ex) { toast(ex.message, 'error'); } }) }, icon('download'), 'Exportar meus dados')),
      h('div', {}, h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { if (!await confirmDialog({ title: 'Apagar histórico emocional?', text: 'Remove todos os check-ins.', confirmLabel: 'Apagar', danger: true })) return; try { await del('/me/emotional'); toast('Histórico apagado.'); } catch (e) { toast(e.message, 'error'); } } }, icon('trash'), 'Apagar check-ins emocionais'))),
    h('div', { class: 'card stack' }, h('h3', { style: { color: 'var(--danger)' } }, 'Excluir conta'), h('p', { class: 'small muted' }, 'Apaga a conta e TODOS os seus dados (perfil, diário, publicações, conversas...). Não pode ser desfeito.'),
      h('div', {}, h('button', { class: 'btn btn-danger', type: 'button', onclick: () => { const err = formError(), go = h('button', { class: 'btn btn-danger', type: 'button' }, 'Excluir definitivamente'); const m = modal({ title: 'Excluir conta', content: h('div', { class: 'stack' }, err, field('Confirme com sua senha', pw)), actions: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => m.close() }, 'Cancelar'), go] });
        go.onclick = () => withBusy(go, async () => { try { await post('/me/delete', { password: pw.value }); m.close(); location.hash = '#/'; location.reload(); } catch (e) { showFormError(err, e.message); } }); } }, icon('trash'), 'Excluir minha conta'))),
    h('p', { class: 'small' }, h('a', { href: '#/privacidade' }, 'Política de Privacidade'), ' · ', h('a', { href: '#/termos' }, 'Termos de Uso')));
}

/* ---------- Notificações ---------- */
function notif() {
  const p = store.me.profile, perm = notifPermission();
  const rem = select([[0, 'Na hora'], [15, '15 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes'], [120, '2 horas antes'], [1440, '1 dia antes'], [2880, '2 dias antes']], p.remind_default);
  const br = h('input', { type: 'checkbox', id: 'bn', checked: !!p.browser_notifs && perm === 'granted', disabled: !notifSupported() });
  br.addEventListener('change', async () => { try { if (br.checked && (await askBrowserPermission()) !== 'granted') { br.checked = false; return toast('Permissão não concedida pelo navegador.', 'error'); } setMe(await put('/profile', { browser_notifs: br.checked })); toast('Preferência salva.'); } catch (e) { br.checked = !br.checked; toast(e.message, 'error'); } });
  rem.addEventListener('change', async () => { try { setMe(await put('/profile', { remind_default: Number(rem.value) })); toast('Antecedência padrão salva.'); } catch (e) { toast(e.message, 'error'); } });
  return h('div', { class: 'card stack' }, h('h3', {}, 'Lembretes'), field('Antecedência padrão para novos compromissos', rem),
    h('label', { class: 'switch', for: 'bn' }, h('span', {}, h('strong', {}, 'Notificações do navegador'), h('span', { class: 'small muted', style: { display: 'block' } }, notifSupported() ? (perm === 'denied' ? 'Bloqueadas no navegador: libere nas configurações do site.' : 'O navegador pedirá a sua permissão.') : 'Este navegador não oferece notificações — os avisos continuam dentro do app.')), br),
    h('div', { class: 'notice notice-sage' }, icon('info'), 'Os avisos só aparecem com o NINNA aberto neste navegador. Ainda não enviamos notificações com o app fechado, por e-mail ou SMS.'));
}

/* ---------- Segurança ---------- */
function seguranca() {
  const err = formError(), cur = input({ type: 'password', autocomplete: 'current-password' }), nw = input({ type: 'password', autocomplete: 'new-password', minlength: 8 }), b = saveBtn('Alterar senha');
  return h('div', { class: 'stack' }, h('form', { class: 'card stack', onsubmit: (e) => { e.preventDefault(); hideFormError(err); withBusy(b, async () => { try { await post('/auth/change-password', { current: cur.value, password: nw.value }); cur.value = nw.value = ''; toast('Senha alterada. Outros dispositivos foram desconectados.'); } catch (ex) { showFormError(err, ex.message); } }); } },
    h('h3', {}, 'Alterar senha'), err, field('Senha atual', cur), field('Nova senha', nw, 'Mínimo de 8 caracteres.'), h('div', {}, b)),
    h('button', { class: 'btn btn-secondary', type: 'button', onclick: logout }, icon('logout'), 'Sair da conta'));
}
