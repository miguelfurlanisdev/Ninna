/**
 * ============================================================
 *  landing.js — página pública (explica o valor do produto e leva ao cadastro)
 *  🔧 EDITAR: textos das seções nos arrays abaixo (FEATURES, STAGES, PROMISES).
 *  Nenhum depoimento, número de usuárias ou avaliação é inventado aqui.
 * ============================================================
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { logo, bloomArt, botanical } from '../lib/art.js';

export const title = 'Cuidar de quem gera a vida';

// Funcionalidades em destaque
const FEATURES = [
  ['baby', 'Semana a semana', 'As 40 semanas de referência com desenvolvimento do bebê, mudanças no corpo, checklist e diário.'],
  ['calendar', 'Calendário e lembretes', 'Consultas, exames já indicados, tarefas e datas importantes — com lembretes dentro do app.'],
  ['book', 'Biblioteca confiável', 'Artigos em linguagem simples, com fontes oficiais e aviso de revisão visível.'],
  ['sparkle', 'Ninna AI', 'Uma assistente para tirar dúvidas e preparar perguntas para a consulta. Não diagnostica nem prescreve.'],
  ['users', 'Nossa Rede', 'Comunidade para trocar experiências sem julgamentos, com moderação e denúncia.'],
  ['hands', 'Juntos', 'Seu parceiro ou pessoa de apoio vê só o que você autorizar. Você controla tudo.'],
  ['gamepad', 'Aprender Brincando', 'Seis jogos curtos: mito ou verdade, quiz, mala da maternidade, memória e mais.'],
  ['bag', 'Enxoval e compras', 'Listas, orçamento em reais, gastos e compartilhamento com quem vai ajudar.'],
];
const STAGES = [
  ['cycle', 'Tentando engravidar', 'Calendário do ciclo com estimativas — previsões, nunca promessas.'],
  ['heart', 'Gestante', 'Idade gestacional calculada, contagem para o parto e conteúdo de cada semana.'],
  ['moon', 'Pós-parto', 'Recuperação, amamentação, sono seguro e saúde emocional.'],
  ['hands', 'Apoiando alguém', 'Tarefas concretas e informação para participar de verdade.'],
];
const PROMISES = [
  'Você escolhe o que informar. Dados de saúde só são guardados com o seu consentimento.',
  'Exporte ou apague tudo quando quiser, direto nas configurações.',
  'A Ninna AI não recebe o seu diário nem o seu histórico de saúde.',
  'Seu parceiro só enxerga o que você liberar — e nunca edita informações médicas.',
];

export default async function view() {
  const cta = (cls = '') => h('a', { class: 'btn btn-lg ' + cls, href: '#/criar-conta' }, 'Criar minha conta', icon('arrow-r'));
  return h('div', { class: 'landing' },
    h('a', { class: 'skip-link', href: '#conteudo' }, 'Pular para o conteúdo'),
    // ---------- Cabeçalho ----------
    h('header', { class: 'l-nav' },
      h('a', { class: 'brand', href: '#/', 'aria-label': 'NINNA' }, logo(36), 'NINNA'),
      h('nav', { class: 'l-links', 'aria-label': 'Seções' },
        h('a', { href: '#recursos', onclick: scrollTo('recursos') }, 'Recursos'),
        h('a', { href: '#fases', onclick: scrollTo('fases') }, 'Para cada fase'),
        h('a', { href: '#privacidade', onclick: scrollTo('privacidade') }, 'Privacidade')),
      h('div', { class: 'row', style: { gap: '8px' } },
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/entrar' }, 'Entrar'),
        h('a', { class: 'btn btn-sm', href: '#/criar-conta' }, 'Criar conta'))),

    h('main', { id: 'conteudo' },
      // ---------- Hero ----------
      h('section', { class: 'l-hero' },
        h('div', { class: 'l-hero-copy stack stack-lg' },
          h('span', { class: 'eyebrow' }, 'Gestação · maternidade · apoio familiar'),
          h('h1', { class: 'l-title' }, 'Cuidar de quem ', h('em', {}, 'gera a vida.')),
          h('p', { class: 'l-lead' }, 'A NINNA é uma companheira digital de informação, organização e apoio emocional — da tentativa de engravidar ao início da maternidade. Sem julgamentos e sem linguagem difícil.'),
          h('div', { class: 'row' }, cta(), h('a', { class: 'btn btn-secondary btn-lg', href: '#recursos', onclick: scrollTo('recursos') }, 'Conhecer recursos')),
          h('p', { class: 'small muted' }, 'Gratuito para começar · em português do Brasil · seus dados, suas regras')),
        h('div', { class: 'l-hero-art', 'aria-hidden': 'true' },
          bloomArt(24, { size: 420 }),
          h('div', { class: 'float-chip c1' }, icon('check'), 'Checklist da semana'),
          h('div', { class: 'float-chip c2' }, icon('heart'), 'Apoio sem julgamentos'),
          h('div', { class: 'float-chip c3' }, icon('shield'), 'Você controla seus dados'))),

      // ---------- Faixa de confiança ----------
      h('section', { class: 'l-trust reveal' },
        h('div', {}, icon('shield'), h('span', {}, h('strong', {}, 'Informação com fontes'), ' — Ministério da Saúde, OMS, Fiocruz e sociedades médicas.')),
        h('div', {}, icon('stethoscope'), h('span', {}, h('strong', {}, 'Não substitui sua equipe de saúde'), ' — sem diagnósticos, sem receitas.')),
        h('div', {}, icon('lock'), h('span', {}, h('strong', {}, 'Privacidade (LGPD)'), ' — consentimento, exportação e exclusão.'))),

      // ---------- Recursos ----------
      h('section', { class: 'l-section', id: 'recursos' },
        h('div', { class: 'l-head reveal' }, h('span', { class: 'eyebrow' }, 'Tudo em um só lugar'), h('h2', {}, 'Menos abas abertas, mais tranquilidade.'),
          h('p', { class: 'muted' }, 'Cada área foi pensada para ser simples, mesmo para quem nunca usou um aplicativo parecido.')),
        h('div', { class: 'grid grid-auto l-features' }, FEATURES.map(([ic, t, d]) =>
          h('article', { class: 'card feature reveal' }, h('span', { class: 'f-ico' }, icon(ic)), h('h3', {}, t), h('p', { class: 'muted small' }, d))))),

      // ---------- Fases ----------
      h('section', { class: 'l-section', id: 'fases' },
        h('div', { class: 'l-split' },
          h('div', { class: 'stack reveal' }, h('span', { class: 'eyebrow' }, 'Personalizada'), h('h2', {}, 'A NINNA muda com você.'),
            h('p', { class: 'muted' }, 'No cadastro você escolhe a sua fase. O painel mostra só o que faz sentido para o momento — nada de módulos que não combinam com a sua jornada.'),
            h('div', { class: 'l-botanical' }, botanical({ size: 220 }))),
          h('div', { class: 'stack' }, STAGES.map(([ic, t, d]) =>
            h('div', { class: 'card-sage row row-nowrap reveal', style: { gap: '16px', padding: '20px' } }, h('span', { class: 'f-ico' }, icon(ic)), h('div', {}, h('h4', {}, t), h('p', { class: 'small muted' }, d))))))),

      // ---------- Privacidade ----------
      h('section', { class: 'l-privacy', id: 'privacidade' },
        h('div', { class: 'l-privacy-in' },
          h('div', { class: 'stack reveal' }, h('span', { class: 'eyebrow', style: { color: 'var(--rose-300)' } }, 'Privacidade de verdade'), h('h2', {}, 'Informações de saúde são sensíveis. Tratamos assim.')),
          h('ul', { class: 'promises' }, PROMISES.map((p) => h('li', { class: 'reveal' }, icon('check'), p))))),

      // ---------- Honestidade ----------
      h('section', { class: 'l-section' },
        h('div', { class: 'card-lav l-honest reveal' }, icon('info'),
          h('div', {}, h('h3', {}, 'O que a NINNA não é'),
            h('p', { class: 'muted' }, 'Não somos serviço médico. As estimativas (como a data provável do parto ou o ciclo menstrual) são previsões, não diagnósticos. Em caso de sinais de alerta, procure atendimento — no Brasil, o SAMU atende pelo 192.')))),

      // ---------- CTA final ----------
      h('section', { class: 'l-cta reveal' }, h('h2', {}, 'Pronta para começar?'), h('p', { class: 'muted' }, 'Leva poucos minutos e você só informa o que quiser.'), h('div', { class: 'row', style: { justifyContent: 'center' } }, cta(), h('a', { class: 'btn btn-ghost btn-lg', href: '#/entrar' }, 'Já tenho conta')))),

    // ---------- Rodapé ----------
    h('footer', { class: 'l-footer' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } },
        h('div', { class: 'row' }, logo(28), h('strong', { class: 'display' }, 'NINNA'), h('span', { class: 'muted small' }, 'Cuidar de quem gera a vida.')),
        h('div', { class: 'row small' }, h('a', { href: '#/termos' }, 'Termos de uso'), h('a', { href: '#/privacidade' }, 'Política de privacidade'))),
      h('p', { class: 'xs muted' }, 'Emergência: SAMU 192 · Apoio emocional: CVV 188 · Violência contra a mulher: Ligue 180. Conteúdo informativo; não substitui avaliação profissional.')));
}

/** Rolagem suave até uma seção (sem mudar o #hash, que é usado pelo roteador). */
function scrollTo(id) { return (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }; }
