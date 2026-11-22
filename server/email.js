// Somente servidor: envio de e-mail da plataforma por SMTP (configurado em Master → Integrações).
import nodemailer from 'nodemailer'
import { decifrar } from './asaas.js'

export const URL_SITE = 'https://licitaflow-prod.vercel.app'

/** Configuração de envio a partir da linha de plataforma_email (senha decifrada). null se incompleta. */
export function montarSmtp(linha, env) {
  if (!linha?.host || !linha.usuario || !linha.senha_cifrada || !linha.remetente_email) return null
  return {
    ativo: !!linha.ativo, boasVindas: !!linha.boas_vindas,
    host: linha.host, porta: linha.porta, usuario: linha.usuario, senha: decifrar(linha.senha_cifrada, env),
    de: `"${String(linha.remetente_nome || 'LicitaFlow').replace(/["\r\n]/g, '')}" <${linha.remetente_email}>`,
  }
}

export async function enviarEmail(cfg, { para, assunto, html, texto }, transporte = nodemailer.createTransport) {
  const t = transporte({
    host: cfg.host, port: cfg.porta, secure: cfg.porta === 465, auth: { user: cfg.usuario, pass: cfg.senha },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  })
  return t.sendMail({ from: cfg.de, to: para, subject: assunto, html, text: texto })
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const data = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : '')

function moldura(titulo, corpo) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="background:#0f3d5e;color:#ffffff;padding:18px 24px;font-size:20px;font-weight:bold">LicitaFlow</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 16px;font-size:20px">${esc(titulo)}</h1>${corpo}</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb">Você recebeu este e-mail porque tem uma conta no LicitaFlow.</td></tr>
</table></td></tr></table></body></html>`
}

/** E-mail "pagamento confirmado, acesso liberado" (dados vindos de reservar_boas_vindas). */
export function emailAcessoLiberado(d) {
  const link = `${URL_SITE}/entrar`
  const ate = data(d.pago_ate)
  const corpo = `<p>Olá, ${esc(d.nome)}!</p>
<p>Recebemos o pagamento da assinatura de <strong>${esc(d.organizacao)}</strong>. O plano <strong>${esc(d.plano)}</strong> (${esc(d.ciclo)}) já está liberado${ate ? `, com acesso pago até <strong>${ate}</strong>` : ''}.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#0f3d5e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;font-weight:bold">Entrar no LicitaFlow</a></p>
<p>Entre com o mesmo e-mail e senha do cadastro. Esqueceu a senha? Use "Esqueci minha senha" na tela de login.</p>
<p>O recibo e as próximas faturas chegam por e-mail pelo Asaas, nosso parceiro de pagamentos.</p>`
  const texto = `Olá, ${d.nome}!\n\nRecebemos o pagamento da assinatura de ${d.organizacao}. O plano ${d.plano} (${d.ciclo}) já está liberado${ate ? `, com acesso pago até ${ate}` : ''}.\n\nEntre em ${link} com o mesmo e-mail e senha do cadastro.\n\nLicitaFlow`
  return { assunto: 'Pagamento confirmado: seu acesso ao LicitaFlow está liberado', html: moldura('Acesso liberado', corpo), texto }
}

export function emailTeste() {
  return { assunto: 'Teste de e-mail do LicitaFlow', html: moldura('Envio funcionando', '<p>Este é um e-mail de teste enviado pelo painel master. Se chegou, o SMTP está correto.</p>'), texto: 'Este é um e-mail de teste enviado pelo painel master. Se chegou, o SMTP está correto.' }
}
