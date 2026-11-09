/**
 * ============================================================
 *  E-mail — AINDA NÃO CONECTADO a um provedor real
 * ============================================================
 *  Hoje esta função apenas registra no console. Para enviar e-mails de verdade,
 *  🔧 EDITAR aqui e chame o provedor escolhido (Resend, SendGrid, Amazon SES, SMTP...).
 *  Exemplo (Resend) com fetch:
 *    await fetch('https://api.resend.com/emails', { method:'POST',
 *      headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
 *      body: JSON.stringify({from:'NINNA <no-reply@seudominio.com>', to, subject, text}) });
 */
export async function sendMail({ to, subject, text }) {
  console.log(`\n[mailer] (SIMULADO — nenhum e-mail foi enviado)\n  Para: ${to}\n  Assunto: ${subject}\n  ${text}\n`);
  return { delivered: false };
}
export const MAIL_CONFIGURED = false;
