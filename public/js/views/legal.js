/**
 * ============================================================
 *  legal.js — Termos de Uso e Política de Privacidade
 *  ⚠️ MODELO INICIAL: foi escrito para refletir o que o sistema realmente faz,
 *  mas DEVE ser revisado por advogado(a) antes de lançar publicamente.
 *  🔧 EDITAR: preencha os dados do controlador (nome da empresa, CNPJ, e-mail do encarregado/DPO).
 * ============================================================
 */
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { logo } from '../lib/art.js';

// 🔧 EDITAR: dados da empresa responsável (controladora dos dados)
const EMPRESA = { nome: '[Nome da empresa responsável]', cnpj: '[CNPJ]', contato: '[e-mail do encarregado de dados (DPO)]' };

const TERMS = [
  ['1. O que é a NINNA', 'A NINNA é uma plataforma de informação, organização e apoio para quem está tentando engravidar, gestantes, mães recentes e suas famílias. Não é um serviço médico.'],
  ['2. Sem substituição de profissionais', 'O conteúdo, os cálculos (como idade gestacional, data provável do parto e fases do ciclo) e a Ninna AI têm caráter informativo e são estimativas. Não fazem diagnóstico, não prescrevem medicamentos e não substituem consulta, exame ou orientação de profissionais de saúde. Em emergências, ligue 192 (SAMU).'],
  ['3. Sua conta', 'Você é responsável por manter a senha em sigilo e pelas atividades da conta. Informe dados verdadeiros. Você pode excluir a conta a qualquer momento em Configurações.'],
  ['4. Comunidade "Nossa Rede"', 'Respeite as outras pessoas. Não é permitido assédio, discurso de ódio, spam, divulgação de dados pessoais, indicação de doses ou medicamentos, nem apresentar experiências pessoais como orientação médica. Conteúdos podem ser ocultados ou removidos pela moderação e contas podem ser limitadas em caso de violação.'],
  ['5. Publicações anônimas', 'Publicar como "anônima" oculta a sua identidade para as outras usuárias. Ainda assim, a equipe de moderação pode acessar registros técnicos quando necessário (por exemplo, em casos de abuso ou por obrigação legal). Não é anonimato absoluto.'],
  ['6. Links e produtos', 'Links para lojas ou buscas são apenas atalhos e podem ser identificados como comerciais. Não recomendamos produtos como medida de saúde. Para sono e transporte do bebê, siga sempre o manual e a legislação.'],
  ['7. Alterações', 'Podemos atualizar estes termos. Mudanças relevantes serão comunicadas no aplicativo.'],
];

const PRIVACY = [
  ['1. Quem é o controlador', `${EMPRESA.nome}, CNPJ ${EMPRESA.cnpj}. Contato do encarregado: ${EMPRESA.contato}.`],
  ['2. Quais dados coletamos', 'Conta: nome, e-mail e senha (guardada de forma criptografada, nunca em texto). Perfil: fase da jornada, nome de exibição, apresentação opcional. Saúde (opcional, com seu consentimento): datas como última menstruação ou data provável do parto, ciclo, consultas, diário, check-ins emocionais, dúvidas. Uso: conversas com a Ninna AI, publicações e comentários, listas e pontuação de jogos.'],
  ['3. Para que usamos', 'Somente para oferecer as funcionalidades que você usa: calcular semanas, mostrar conteúdo da sua fase, organizar compromissos, permitir a comunidade e o modo parceiro. Não vendemos seus dados e não usamos dados de saúde para publicidade.'],
  ['4. Base legal e consentimento', 'Dados pessoais sensíveis (saúde) são tratados com o seu consentimento específico, que você pode retirar a qualquer momento em Configurações › Privacidade. Ao retirar, as datas de saúde guardadas no perfil são apagadas. Sem consentimento, funcionalidades que dependem desses dados ficam indisponíveis.'],
  ['5. Ninna AI', 'As mensagens que você envia à assistente são processadas por um provedor de modelo de linguagem contratado pela plataforma. Não enviamos o seu diário, check-ins, consultas nem histórico de saúde. A semana de gestação só é enviada se você autorizar. Evite digitar dados que identifiquem você ou terceiros.'],
  ['6. Compartilhamento com parceiro', 'Nada é compartilhado por padrão. Você cria um convite e escolhe o que a outra pessoa pode ver (semana atual, compromissos marcados como compartilhados, listas e tarefas). Diário, check-ins, dúvidas, conversas com a IA e anotações de consultas nunca são compartilhados. Você pode revogar quando quiser.'],
  ['7. Seus direitos (LGPD)', 'Você pode confirmar o tratamento, acessar, corrigir, exportar (arquivo JSON), apagar seus dados e retirar consentimentos diretamente em Configurações. Para outros pedidos, fale com o encarregado de dados.'],
  ['8. Segurança e retenção', 'Usamos conexão segura (HTTPS em produção), senhas com hash, controle de acesso no servidor e limites contra abuso. Mantemos os dados enquanto a conta existir; ao excluir a conta, todos os seus registros são apagados do banco.'],
  ['9. Cookies', 'Usamos apenas um cookie essencial de sessão (para manter você logada). Não usamos cookies de publicidade.'],
];

export const title = 'Termos e privacidade';
export default async function view({ mode }) {
  const isTerms = mode === 'terms';
  return h('div', { class: 'page page-narrow legal' },
    h('header', { class: 'row', style: { padding: '16px 0' } }, h('a', { class: 'brand', href: '#/' }, logo(34), 'NINNA')),
    h('h1', {}, isTerms ? 'Termos de Uso' : 'Política de Privacidade'),
    h('div', { class: 'notice notice-warn mt' }, icon('alert'), h('span', {}, h('strong', {}, 'Documento-modelo. '), 'Revise com um(a) advogado(a) e preencha os dados da empresa antes de publicar o NINNA.')),
    h('div', { class: 'stack mt-lg' }, (isTerms ? TERMS : PRIVACY).map(([t, p]) => h('section', {}, h('h3', {}, t), h('p', { class: 'muted mt' }, p)))),
    h('p', { class: 'mt-lg' }, h('a', { href: isTerms ? '#/privacidade' : '#/termos' }, isTerms ? 'Ler a Política de Privacidade →' : 'Ler os Termos de Uso →')),
    h('p', { class: 'mt small' }, h('a', { href: 'javascript:history.back()' }, '← Voltar')));
}
