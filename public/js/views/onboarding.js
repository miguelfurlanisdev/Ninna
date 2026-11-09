/**
 * ============================================================
 *  onboarding.js — cadastro inicial em etapas curtas, com indicador de progresso
 * ============================================================
 *  Etapas:  1) fase  →  2) privacidade (consentimento)  →  3) detalhes (opcionais)  →  4) pronto
 *  Quem escolhe "apoiar alguém" pula a privacidade/detalhes (não informa dados de saúde).
 *  Tudo é opcional: dá para pular e informar depois em Configurações.
 *  🔧 EDITAR: textos das opções em STAGES; regras de datas ficam em shared/gestation.js.
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { logo, heroArt } from '../lib/art.js';
import { put, post } from '../lib/api.js';
import { store, setMe, today } from '../lib/store.js';
import { field, input, select, formError, showFormError, hideFormError, withBusy, toast } from '../lib/ui.js';
import { navigate } from '../lib/router.js';
import { celebrate } from '../lib/motion.js';
import { startReminders } from '../lib/reminders.js';

export const title = 'Boas-vindas';

// 🔧 EDITAR: as 5 opções iniciais (key → fase gravada no banco)
const STAGES = [
  { id: 'trying',   stage: 'trying',     icon: 'cycle', t: 'Estou tentando engravidar', d: 'Calendário do ciclo e estimativas.' },
  { id: 'new',      stage: 'pregnant',   icon: 'heart', t: 'Descobri que estou grávida', d: 'Vamos calcular a sua idade gestacional.', variant: 'lmp' },
  { id: 'follow',   stage: 'pregnant',   icon: 'stethoscope', t: 'Já estou acompanhando minha gestação', d: 'Use a data que a sua equipe informou.', variant: 'dpp' },
  { id: 'post',     stage: 'postpartum', icon: 'moon', t: 'Estou no pós-parto', d: 'Recuperação, amamentação e rotina.' },
  { id: 'support',  stage: 'support',    icon: 'hands', t: 'Quero acompanhar ou apoiar alguém', d: 'Para parceiros, familiares e pessoas de apoio.' },
];

export default async function view() {
  const st = { choice: store.me.profile?.stage ? STAGES.find((s) => s.stage === store.me.profile.stage) : null, health: false, ai: false, data: {}, result: null };
  const root = h('div', { class: 'ob' });
  const body = h('div', { class: 'ob-body' });
  const steps = h('div', { class: 'steps', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': 4 });
  root.append(
    h('header', { class: 'ob-head' }, h('a', { class: 'brand', href: '#/' }, logo(32), 'NINNA'), steps),
    h('main', { class: 'ob-main', id: 'main' }, body));

  // Lista de etapas muda conforme a fase escolhida
  const flow = () => (st.choice?.stage === 'support' ? ['stage', 'details', 'ready'] : ['stage', 'privacy', 'details', 'ready']);
  let idx = 0;
  const go = (name) => {
    const f = flow(); idx = f.indexOf(name);
    steps.setAttribute('aria-valuenow', idx + 1);
    steps.replaceChildren(...f.map((_, i) => h('i', { class: i <= idx ? 'done' : '' })));
    body.replaceChildren(h('div', { class: 'page-enter' }, { stage: stepStage, privacy: stepPrivacy, details: stepDetails, ready: stepReady }[name]()));
    body.querySelector('h1')?.focus?.();
  };

  /* ---------- 1) Fase ---------- */
  function stepStage() {
    const list = h('div', { class: 'stack', role: 'radiogroup', 'aria-label': 'Sua fase' });
    const next = h('button', { class: 'btn btn-lg', type: 'button', disabled: !st.choice, onclick: () => go(st.choice.stage === 'support' ? 'details' : 'privacy') }, 'Continuar', icon('arrow-r'));
    STAGES.forEach((s) => {
      const b = h('button', { class: 'choice', type: 'button', role: 'radio', 'aria-checked': String(st.choice?.id === s.id), onclick: () => {
        st.choice = s; list.querySelectorAll('.choice').forEach((x) => x.setAttribute('aria-checked', 'false')); b.setAttribute('aria-checked', 'true'); next.disabled = false;
      } }, h('span', { class: 'ico' }, icon(s.icon)), h('span', {}, h('strong', {}, s.t), h('span', { class: 'small muted' }, s.d)));
      list.append(b);
    });
    return h('div', { class: 'stack stack-lg' },
      h('div', { class: 'stack stack-sm' }, h('h1', { tabindex: '-1' }, `Olá, ${store.me.user.display_name.split(' ')[0]}. Em que momento você está?`), h('p', { class: 'muted' }, 'Isso personaliza o seu painel. Você pode mudar depois, em Configurações.')),
      list, h('div', {}, next));
  }

  /* ---------- 2) Privacidade e consentimento ---------- */
  function stepPrivacy() {
    const hd = h('input', { type: 'checkbox', id: 'c-health', checked: st.health });
    const ai = h('input', { type: 'checkbox', id: 'c-ai', checked: st.ai, disabled: !st.health });
    hd.addEventListener('change', () => { st.health = hd.checked; ai.disabled = !hd.checked; if (!hd.checked) { ai.checked = false; st.ai = false; } });
    ai.addEventListener('change', () => { st.ai = ai.checked; });
    const btn = h('button', { class: 'btn btn-lg', type: 'button', onclick: () => withBusy(btn, async () => {
      try { setMe(await put('/consents', { health_data: st.health, ai_context: st.ai })); go('details'); }
      catch (e) { toast(e.message, 'error'); }
    }) }, 'Continuar', icon('arrow-r'));
    return h('div', { class: 'stack stack-lg' },
      h('div', { class: 'stack stack-sm' }, h('h1', { tabindex: '-1' }, 'Seus dados, suas regras'),
        h('p', { class: 'muted' }, 'Informações de saúde são sensíveis. Só guardamos o que você autorizar, e você pode ver, corrigir, exportar ou apagar tudo quando quiser.')),
      h('div', { class: 'card stack' },
        h('label', { class: 'check', for: 'c-health' }, hd, h('span', {}, h('strong', {}, 'Autorizo o uso dos meus dados de saúde'), h('span', { class: 'small muted', style: { display: 'block' } }, 'Datas (última menstruação, data provável do parto), compromissos, diário e check-ins. Usados só para calcular semanas, organizar e personalizar. Opcional.'))),
        h('label', { class: 'check', for: 'c-ai' }, ai, h('span', {}, h('strong', {}, 'Permitir que a Ninna AI saiba em que semana estou'), h('span', { class: 'small muted', style: { display: 'block' } }, 'Só a semana de gestação é enviada para contextualizar as respostas. Seu diário e histórico nunca são enviados.')))),
      h('div', { class: 'notice notice-sage' }, icon('lock'), h('span', {}, 'Sem autorização, você ainda pode usar a biblioteca, a comunidade, os jogos e a lista de compras. Muda de ideia? Ajuste em Configurações › Privacidade.')),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-ghost btn-lg', type: 'button', onclick: () => go('stage') }, 'Voltar'), btn));
  }

  /* ---------- 3) Detalhes opcionais ---------- */
  function stepDetails() {
    const err = formError(); const kind = st.choice.stage; const t = today();
    const nodes = []; const read = {};
    const finish = (skip) => withBusy(saveBtn, async () => {
      hideFormError(err);
      try {
        const payload = { stage: kind, onboarded: true };
        if (!skip && st.health) Object.assign(payload, collect());
        const res = await put('/profile', payload); st.result = res; setMe(res); startReminders(); go('ready');
      } catch (e) { showFormError(err, e.message); }
    });
    const saveBtn = h('button', { class: 'btn btn-lg', type: 'button', onclick: () => finish(false) }, 'Salvar e continuar', icon('arrow-r'));
    let collect = () => ({});

    if (kind === 'support') {
      const code = input({ placeholder: 'Ex.: K7M2Q9XA', maxlength: 20, autocapitalize: 'characters' });
      nodes.push(h('p', { class: 'muted' }, 'Você não precisa informar nenhum dado de saúde. Se a gestante já enviou um convite, digite o código abaixo para conectar as contas — ela decide o que você pode ver.'),
        field('Código de convite (opcional)', code, 'Você também pode fazer isso depois, em "Juntos".'));
      saveBtn.onclick = () => withBusy(saveBtn, async () => {
        hideFormError(err);
        try {
          if (code.value.trim()) await post('/partner/join', { code: code.value });
          const res = await put('/profile', { stage: 'support', onboarded: true }); st.result = res; setMe(res); startReminders(); go('ready');
        } catch (e) { showFormError(err, e.message); }
      });
    } else if (!st.health) {
      nodes.push(h('div', { class: 'notice notice-warn' }, icon('info'), h('span', {}, 'Como você não autorizou o uso de dados de saúde, vamos pular as datas. Você pode informar depois em Configurações.')));
      saveBtn.textContent = 'Continuar sem datas';
      saveBtn.onclick = () => finish(true);
    } else if (kind === 'trying') {
      const lmp = input({ type: 'date', max: t }), len = input({ type: 'number', min: 21, max: 45, value: 28 });
      const reg = select([['unknown', 'Não sei'], ['regular', 'Regular'], ['irregular', 'Irregular']], 'unknown');
      const goal = select([['', 'Prefiro não informar'], ['Acompanhar meu ciclo', 'Acompanhar meu ciclo'], ['Me preparar para engravidar', 'Me preparar para engravidar'], ['Organizar consultas e exames', 'Organizar consultas e exames']], '');
      nodes.push(h('div', { class: 'notice' }, icon('info'), h('span', {}, 'As fases do ciclo são ', h('strong', {}, 'previsões'), ', não confirmam ovulação nem fertilidade, e não garantem gravidez.')),
        h('div', { class: 'form-grid' }, field('Primeiro dia da última menstruação', lmp), field('Duração média do ciclo (dias)', len, 'Entre 21 e 45.'), field('Regularidade do ciclo', reg), field('Objetivo de acompanhamento', goal)));
      collect = () => ({ lmp: lmp.value || undefined, cycle_length: Number(len.value) || undefined, cycle_regular: reg.value, goal: goal.value || undefined });
    } else if (kind === 'pregnant') {
      const method = select([['lmp', 'Sei a data da última menstruação (DUM)'], ['dpp', 'Tenho a data provável do parto (DPP) informada pela equipe'], ['ga', 'Sei quantas semanas tenho (ex.: pelo ultrassom)']], st.choice.variant || 'lmp');
      const lmp = input({ type: 'date', max: t }), dpp = input({ type: 'date' });
      const gaW = input({ type: 'number', min: 0, max: 42, placeholder: 'Semanas' }), gaD = input({ type: 'number', min: 0, max: 6, placeholder: 'Dias', value: 0 });
      const pre = select([['', 'Prefiro não informar'], ['sus', 'SUS (rede pública)'], ['private', 'Convênio ou particular'], ['mixed', 'Misto'], ['none', 'Ainda não iniciei']], '');
      const lmpF = field('Primeiro dia da última menstruação', lmp), dppF = field('Data provável do parto', dpp), gaF = h('div', { class: 'form-grid' }, field('Semanas completas', gaW), field('Dias', gaD));
      const show = () => { lmpF.classList.toggle('hide', method.value !== 'lmp'); dppF.classList.toggle('hide', method.value !== 'dpp'); gaF.classList.toggle('hide', method.value !== 'ga'); };
      method.addEventListener('change', show); show();
      nodes.push(h('div', { class: 'notice' }, icon('info'), h('span', {}, 'A idade gestacional é calculada a partir de uma data de referência e ', h('strong', {}, 'pode ser ajustada'), ' pela sua equipe de saúde (por exemplo, após o ultrassom). Se a data não estiver certa, corrija depois em Configurações.')),
        field('Como você quer informar?', method), lmpF, dppF, gaF, field('Tipo de pré-natal (opcional)', pre));
      collect = () => {
        const m = method.value;
        const d = { prenatal_type: pre.value || undefined };
        if (m === 'lmp' && lmp.value) d.lmp = lmp.value;
        if (m === 'dpp' && dpp.value) d.dpp_input = dpp.value;
        if (m === 'ga' && gaW.value !== '') { d.ga_weeks = Number(gaW.value); d.ga_days = Number(gaD.value) || 0; }
        return d;
      };
    } else if (kind === 'postpartum') {
      const bd = input({ type: 'date', max: t }), nm = input({ maxlength: 60, placeholder: 'Opcional' });
      nodes.push(h('div', { class: 'form-grid' }, field('Data do nascimento', bd), field('Nome do bebê', nm)));
      collect = () => ({ birth_date: bd.value || undefined, baby_name: nm.value.trim() || undefined });
    }

    const skipBtn = kind !== 'support' ? h('button', { class: 'btn btn-ghost btn-lg', type: 'button', onclick: () => finish(true) }, 'Informar depois') : null;
    return h('div', { class: 'stack stack-lg' },
      h('div', { class: 'stack stack-sm' }, h('h1', { tabindex: '-1' }, kind === 'trying' ? 'Vamos conhecer o seu ciclo' : kind === 'pregnant' ? 'Vamos calcular a sua jornada' : kind === 'postpartum' ? 'Conte um pouco sobre vocês' : 'Quase lá!'),
        h('p', { class: 'muted' }, 'Tudo aqui é opcional.')),
      err, ...nodes, h('div', { class: 'row' }, h('button', { class: 'btn btn-ghost btn-lg', type: 'button', onclick: () => go(kind === 'support' ? 'stage' : 'privacy') }, 'Voltar'), skipBtn && st.health ? skipBtn : null, saveBtn));
  }

  /* ---------- 4) Pronto ---------- */
  function stepReady() {
    const me = store.me, g = me.gestation, kind = st.choice.stage;
    let line = 'Seu painel está pronto.';
    if (g) line = g.status === 'ongoing' ? `Você está com cerca de ${g.weeks} semanas e ${g.days} ${g.days === 1 ? 'dia' : 'dias'} (estimativa).` : 'Confira a data informada em Configurações.';
    const art = heroArt(kind, { week: g?.weeks || 1, size: 240 });
    const go2 = h('button', { class: 'btn btn-lg', type: 'button', onclick: () => navigate('/painel') }, 'Ir para o meu painel', icon('arrow-r'));
    setTimeout(() => celebrate(go2), 400);
    return h('div', { class: 'stack stack-lg center', style: { alignItems: 'center' } },
      h('div', { class: 'ob-art' }, art),
      h('div', { class: 'stack stack-sm' }, h('h1', { tabindex: '-1' }, 'Tudo pronto. Bem-vinda à NINNA.'), h('p', { class: 'muted' }, line)),
      (st.result?.warnings || []).map((w) => h('div', { class: 'notice notice-warn', style: { textAlign: 'left' } }, icon('alert'), w)), go2);
  }

  go('stage');
  return root;
}
