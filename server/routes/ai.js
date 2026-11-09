/**
 * ============================================================
 *  Ninna AI — assistente de maternidade (via API de modelo de linguagem)
 * ============================================================
 *  - A chave (ANTHROPIC_API_KEY) fica SÓ no servidor; o navegador nunca a vê.
 *  - Sem chave configurada: a rota devolve `configured:false` e a tela mostra o passo a passo.
 *  - NÃO enviamos diário, check-ins, consultas nem histórico de saúde ao modelo.
 *    Só vão: a conversa atual (últimas mensagens) e, SE a usuária autorizou, a semana gestacional.
 *  - Mensagens com sinais de urgência/crise recebem um AVISO DE SEGURANÇA fixo
 *    (não é "resposta de IA": é texto estático revisável abaixo).
 *
 *  🔧 EDITAR: SYSTEM_PROMPT (personalidade e regras), SAFETY_NOTICES (avisos), regexes de detecção.
 */
import { get, post, del, HttpError } from '../lib/http.js';
import { q, tx } from '../db.js';
import { config } from '../config.js';
import { validate } from '../lib/validate.js';
import { limit } from '../lib/ratelimit.js';
import { gestationFromLMP, todayISO } from '../../shared/gestation.js';

// ------------------------------------------------------------------
//  Regras de comportamento da IA (enviadas como "system prompt")
// ------------------------------------------------------------------
const SYSTEM_PROMPT = `Você é a Ninna AI, assistente de informação e organização para pessoas que tentam engravidar, gestantes, mães recentes e suas famílias, no Brasil. Responda sempre em português do Brasil, com tom acolhedor, claro e sem linguagem médica difícil (explique termos técnicos). Seja objetiva: respostas curtas a médias, com listas só quando ajudarem.

LIMITES (obrigatórios):
- Você NÃO é médica, obstetra, enfermeira ou psicóloga e não substitui a equipe de saúde. Nunca se apresente como profissional de saúde.
- NÃO diagnostique, NÃO interprete exames como laudo, NÃO prescreva nem sugira doses de medicamentos, suplementos ou fitoterápicos, NÃO sugira alterar tratamentos e NUNCA garanta que um sintoma é inofensivo.
- Diante de sintomas, dê informação geral e oriente buscar avaliação profissional conforme a gravidade. Diferencie o que costuma ser comum do que exige avaliação.
- Sinais potencialmente urgentes (sangramento vaginal importante, dificuldade para respirar, convulsão, dor intensa, desmaio, perda de líquido, febre alta, dor de cabeça forte com alteração visual, redução dos movimentos do bebê depois que já são percebidos): oriente atendimento imediato (maternidade/pronto atendimento; SAMU 192) de forma breve e direta, sem alongar a conversa.
- Sofrimento emocional intenso, pensamentos de se machucar ou violência: acolha com empatia, incentive buscar ajuda agora (CVV 188, Ligue 180 para violência contra a mulher, SAMU 192/190 em risco imediato) e peça que fale com alguém de confiança.
- NÃO invente dados científicos, estatísticas, estudos, títulos de documentos ou links. Se não tiver certeza, diga que não tem certeza e sugira confirmar com o pré-natal ou com fontes oficiais (Ministério da Saúde, OMS) sem inventar documentos específicos.
- Cada gestação é única: nunca diga que toda gestante terá os mesmos sintomas.
- Ajude também em: preparar perguntas para consultas, explicar termos médicos, organizar tarefas e enxoval, comunicação com parceiro(a) e rede de apoio, parto e amamentação (informação geral).
- Se o pedido fugir do tema de maternidade, gestação, bebê e família, responda brevemente e retome o foco.`;

// Avisos fixos (texto estático, NÃO gerado por IA). 🔧 EDITAR números e textos conforme necessário.
const SAFETY_NOTICES = {
  urgent: {
    title: 'Atenção: isso pode precisar de atendimento agora',
    text: 'Os sinais que você descreveu podem exigir avaliação imediata. Procure uma maternidade ou pronto atendimento agora, ou ligue para o SAMU (192). Se puder, peça para alguém ficar com você. Não espere a próxima consulta.',
    actions: [{ label: 'SAMU', phone: '192' }],
  },
  crisis: {
    title: 'Você não está sozinha',
    text: 'Sinto muito que você esteja passando por isso. Falar com alguém agora pode ajudar: o CVV atende 24h, de graça, pelo 188. Em caso de violência, ligue 180 (Central de Atendimento à Mulher). Se houver risco imediato, ligue 192 (SAMU) ou 190 (Polícia).',
    actions: [{ label: 'CVV 188', phone: '188' }, { label: 'Ligue 180', phone: '180' }, { label: 'SAMU 192', phone: '192' }],
  },
};

// Detecção simples por palavras-chave (pode haver falsos positivos/negativos — por isso é só um AVISO extra)
const URGENT_RX = [
  /sangr\w+\s+(muito|forte|intens|abundante|vermelh)/i, /muito\s+sangue/i, /(est(ou|á)|ficou)\s+sangrando/i,
  /falta\s+de\s+ar|n[aã]o\s+consigo\s+respirar|dificuldade\s+(para|de)\s+respirar/i,
  /convuls/i, /desmai|apag(uei|ou)|perdi\s+os\s+sentidos/i,
  /dor\s+(muito\s+)?(forte|intensa|insuport)/i, /bolsa\s+rompeu|perdendo\s+l[ií]quido|perda\s+de\s+l[ií]quido/i,
  /(n[aã]o|parou\s+de)\s+(sinto|sentir|mexe|mexer)[^.]{0,30}(beb[eê]|movimento)/i, /beb[eê]\s+(parou|n[aã]o\s+(est[aá]\s+)?mex)/i,
  /reduz\w+\s+(d[oe]s?\s+)?movimentos|menos\s+movimentos/i,
  /vis[aã]o\s+(emba[cç]ada|turva)|dor\s+de\s+cabe[cç]a\s+(muito\s+)?forte/i,
];
const CRISIS_RX = [
  /suic[ií]d|me\s+matar|quero\s+morrer|n[aã]o\s+quero\s+(mais\s+)?viver|acabar\s+com\s+(tudo|minha\s+vida)|me\s+machucar|me\s+ferir/i,
  /(me|nos)\s+(bate|bateu|agride|agrediu|ameaça|ameaçou)|viol[eê]ncia\s+dom[eé]stica|tenho\s+medo\s+d[oe]\s+(meu|minha)\s+(marido|namorado|companheiro|parceir)/i,
  /(n[aã]o\s+aguento\s+mais|desespero\s+total|vontade\s+de\s+sumir)/i,
];

export function detectSafety(text) {
  if (CRISIS_RX.some((r) => r.test(text))) return 'crisis';
  if (URGENT_RX.some((r) => r.test(text))) return 'urgent';
  return null;
}

get('/api/ai/status', async () => ({ configured: !!config.ai.apiKey, limitPer10min: config.ai.rateLimit }), { auth: true });

get('/api/ai/conversations', async ({ user }) => ({
  items: q.all('SELECT id, title, created_at FROM ai_conversations WHERE user_id = ? ORDER BY id DESC LIMIT 50', user.id),
}), { auth: true });

get('/api/ai/conversations/:id', async ({ user, params }) => {
  const c = q.get('SELECT id, title FROM ai_conversations WHERE id = ? AND user_id = ?', params.id, user.id);
  if (!c) throw new HttpError(404, 'Conversa não encontrada.');
  const messages = q.all('SELECT id, role, content, urgent, created_at FROM ai_messages WHERE conv_id = ? ORDER BY id', c.id)
    .map((m) => ({ ...m, safety: m.urgent ? (m.urgent === 2 ? 'crisis' : 'urgent') : null }));
  return { conversation: c, messages };
}, { auth: true });

del('/api/ai/conversations/:id', async ({ user, params }) => {
  q.run('DELETE FROM ai_conversations WHERE id = ? AND user_id = ?', params.id, user.id);
  return { ok: true };
}, { auth: true });

del('/api/ai/conversations', async ({ user }) => { q.run('DELETE FROM ai_conversations WHERE user_id = ?', user.id); return { ok: true }; }, { auth: true });

post('/api/ai/chat', async ({ user, body }) => {
  const d = validate(body, {
    message: { type: 'string', required: true, min: 1, max: 2000, label: 'Mensagem' },
    conversation_id: { type: 'int', min: 1 },
  });
  limit(`ai:${user.id}`, config.ai.rateLimit, 600_000);

  // Conversa (cria se for nova)
  let conv = d.conversation_id ? q.get('SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?', d.conversation_id, user.id) : null;
  if (d.conversation_id && !conv) throw new HttpError(404, 'Conversa não encontrada.');
  if (!conv) {
    const r = q.run('INSERT INTO ai_conversations (user_id, title) VALUES (?,?)', user.id, d.message.slice(0, 60));
    conv = { id: Number(r.lastInsertRowid) };
  }

  const safety = detectSafety(d.message);
  q.run('INSERT INTO ai_messages (conv_id, role, content, urgent) VALUES (?,?,?,?)', conv.id, 'user', d.message, 0);

  const notice = safety ? SAFETY_NOTICES[safety] : null;
  if (!config.ai.apiKey) {
    // IA não configurada: devolve só o aviso de segurança (se houver) e o estado "não configurada"
    return { conversation_id: conv.id, configured: false, notice: notice && { kind: safety, ...notice }, reply: null };
  }

  // Contexto: só a semana gestacional e SOMENTE com consentimento
  let system = SYSTEM_PROMPT;
  const consent = q.get('SELECT ai_context FROM consents WHERE user_id = ?', user.id);
  const profile = q.get('SELECT stage, lmp FROM profiles WHERE user_id = ?', user.id);
  if (consent?.ai_context && profile?.stage === 'pregnant' && profile.lmp) {
    const g = gestationFromLMP(profile.lmp, todayISO());
    system += `\n\nContexto autorizado pela usuária: ela está com cerca de ${g.weeks} semanas e ${g.days} dias de gestação (estimativa; ${g.trimester}º trimestre). Use apenas para contextualizar.`;
  }
  if (safety) system += '\n\nA mensagem atual contém possíveis sinais de urgência ou sofrimento. Responda de forma BREVE (até 5 frases), priorize a orientação de procurar ajuda imediata e acolha.';

  // Histórico recente da conversa (máx. 12 mensagens)
  const history = q.all('SELECT role, content FROM ai_messages WHERE conv_id = ? ORDER BY id DESC LIMIT 12', conv.id).reverse();

  let reply;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    const resp = await fetch(config.ai.url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': config.ai.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.ai.model, max_tokens: config.ai.maxTokens, system, messages: history }),
    });
    clearTimeout(timer);
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.error('[ai] erro da API', resp.status, txt.slice(0, 300));
      throw new HttpError(502, resp.status === 401 || resp.status === 403
        ? 'A chave da Ninna AI parece inválida. Avise a administração.'
        : 'A Ninna AI está indisponível no momento. Tente novamente em instantes.', { notice: notice && { kind: safety, ...notice } });
    }
    const json = await resp.json();
    reply = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!reply) throw new Error('resposta vazia');
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('[ai] falha', e.message);
    throw new HttpError(502, 'Não consegui falar com a Ninna AI agora. Verifique sua conexão e tente de novo.', { notice: notice && { kind: safety, ...notice } });
  }

  q.run('INSERT INTO ai_messages (conv_id, role, content, urgent) VALUES (?,?,?,?)', conv.id, 'assistant', reply, safety === 'crisis' ? 2 : safety ? 1 : 0);
  return { conversation_id: conv.id, configured: true, notice: notice && { kind: safety, ...notice }, reply };
}, { auth: true });
