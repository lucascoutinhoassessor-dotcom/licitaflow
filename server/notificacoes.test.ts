import { describe, expect, it, vi } from 'vitest'
import { entregarNotificacoes, paramWhatsapp, telefoneWhatsapp } from './notificacoes.js'
import { cifrar } from './asaas.js'

const ENV = { SUPABASE_SERVICE_ROLE_KEY: 'servico-teste' }

function cenario(opcoes: { canal_reserva?: string; whatsapp?: boolean; smtp?: boolean; lote: Record<string, unknown>[] }) {
  const concluidos: Record<string, unknown>[] = []
  let entregue = false
  const chamar = vi.fn(async (path: string, init?: { body?: string }) => {
    if (path.includes('lembretes_autorizar')) return null
    if (path.startsWith('/rest/v1/notificacoes_config')) return [{ canal_reserva: opcoes.canal_reserva ?? 'email', whatsapp_ativo: !!opcoes.whatsapp, whatsapp_phone_id: '123456', whatsapp_token_cifrado: cifrar('token-de-teste-com-mais-de-20', ENV), whatsapp_template: 'aviso', whatsapp_idioma: 'pt_BR' }]
    if (path.startsWith('/rest/v1/plataforma_email')) return opcoes.smtp === false ? [] : [{ ativo: true, host: 'smtp.gmail.com', porta: 465, usuario: 'a@b.com', senha_cifrada: cifrar('senha', ENV) }]
    if (path.startsWith('/rest/v1/push_vapid')) return [{ publica: 'PUB', privada: 'PRIV' }]
    if (path.includes('notificacoes_lote')) { if (entregue) return []; entregue = true; return opcoes.lote }
    if (path.includes('notificacoes_concluir')) { concluidos.push(JSON.parse(init!.body!)); return null }
    throw new Error('inesperado ' + path)
  })
  const webpush = { setVapidDetails: vi.fn(), sendNotification: vi.fn(async (s: { endpoint: string }) => { if (s.endpoint.endsWith('morto')) throw Object.assign(new Error('gone'), { statusCode: 410 }) }) }
  const enviarEmail = vi.fn(async () => ({}))
  const fetcher = vi.fn(async () => new Response('{}', { status: 200 }))
  return { concluidos, run: () => entregarNotificacoes({ token: 'a'.repeat(64), chamar, env: ENV, webpush, enviarEmail, fetcher } as never), enviarEmail, fetcher, webpush }
}
const item = (extra: Record<string, unknown>) => ({ id: 'e1', reserva: 'r1', titulo: 'Prazo chegando', texto: 'Linha 1\nLinha 2', link: '/app/prazos', nome: 'Ana', email: 'ana@t.com', telefone: null, inscricoes: [], ...extra })

describe('entrega de lembretes', () => {
  it('normaliza celular e texto do WhatsApp', () => {
    expect(telefoneWhatsapp('(11) 91234-5678')).toBe('5511912345678')
    expect(telefoneWhatsapp('+55 11 91234-5678')).toBe('5511912345678')
    expect(telefoneWhatsapp('1234')).toBeNull()
    expect(paramWhatsapp('a\n\nb    c')).toBe('a · b c')
  })

  it('push entregue não usa e-mail; aparelho vencido é informado ao banco', async () => {
    const c = cenario({ lote: [item({ canal: 'push', inscricoes: [{ id: 'i1', endpoint: 'https://p/ok' }, { id: 'i2', endpoint: 'https://p/morto' }] })] })
    expect(await c.run()).toEqual({ enviados: 1, falhas: 0 })
    expect(c.enviarEmail).not.toHaveBeenCalled()
    expect(c.concluidos[0]).toMatchObject({ p_status: 'enviado', p_mortas: ['i2'] })
  })

  it('push sem aparelho ativo cai no canal de reserva', async () => {
    const c = cenario({ lote: [item({ canal: 'push', inscricoes: [{ id: 'i2', endpoint: 'https://p/morto' }] })] })
    await c.run()
    expect(c.enviarEmail).toHaveBeenCalledOnce()
    expect(c.concluidos[0]).toMatchObject({ p_status: 'enviado' })
  })

  it('WhatsApp sem celular cai para o e-mail', async () => {
    const c = cenario({ whatsapp: true, lote: [item({ canal: 'whatsapp' })] })
    await c.run()
    expect(c.fetcher).not.toHaveBeenCalled()
    expect(c.enviarEmail).toHaveBeenCalledOnce()
    expect(c.concluidos[0]).toMatchObject({ p_status: 'enviado' })
  })

  it('WhatsApp com celular usa o modelo aprovado, sem quebras de linha', async () => {
    const c = cenario({ whatsapp: true, lote: [item({ canal: 'whatsapp', telefone: '11912345678' })] })
    await c.run()
    const [url, init] = c.fetcher.mock.calls[0] as unknown as [string, { body: string; headers: Record<string, string> }]
    expect(url).toContain('/123456/messages')
    expect(init.headers.Authorization).toBe('Bearer token-de-teste-com-mais-de-20')
    const corpo = JSON.parse(init.body)
    expect(corpo.to).toBe('5511912345678')
    expect(corpo.template.components[0].parameters[1].text).toBe('Linha 1 · Linha 2')
    expect(c.enviarEmail).not.toHaveBeenCalled()
  })

  it('sem nenhum canal configurado fica como sem contato', async () => {
    const c = cenario({ smtp: false, lote: [item({ canal: 'email' })] })
    expect(await c.run()).toEqual({ enviados: 0, falhas: 1 })
    expect(c.concluidos[0]).toMatchObject({ p_status: 'sem_contato' })
  })
})
