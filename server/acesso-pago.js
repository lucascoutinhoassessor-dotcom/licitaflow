import { decifrar } from './asaas.js'
import { emailAcessoLiberado, enviarEmail, montarSmtp } from './email.js'

// Compartilhado entre webhook e consulta do checkout: uma reserva atômica evita envios repetidos.
export async function enviarAcessoPago(sv, pagamento, env) {
  let d
  try {
    d = await sv('/rest/v1/rpc/reservar_boas_vindas', { method: 'POST', body: JSON.stringify({ p_pagamento: pagamento }) })
    if (!d?.email) return ''
    const [linha] = await sv('/rest/v1/plataforma_email?select=*&id=eq.smtp')
    const cfg = montarSmtp(linha, env)
    if (!cfg?.ativo) throw new Error('SMTP incompleto')
    const [acesso] = await sv(`/rest/v1/checkout_acessos?select=senha_cifrada&org_id=eq.${d.org_id}`)
    if (acesso) d.senha = decifrar(acesso.senha_cifrada, env)
    await enviarEmail(cfg, { para: d.email, ...emailAcessoLiberado(d) })
    if (acesso) await sv(`/rest/v1/checkout_acessos?org_id=eq.${d.org_id}`, { method: 'DELETE' })
    return '; e-mail enviado'
  } catch {
    if (d?.assinatura) await sv('/rest/v1/assinaturas?id=eq.' + d.assinatura, { method: 'PATCH', body: JSON.stringify({ boas_vindas_em: null }) }).catch(() => {})
    return d?.email ? '; e-mail falhou' : ''
  }
}
