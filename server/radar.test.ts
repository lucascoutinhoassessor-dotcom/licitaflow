import { afterEach, describe, expect, it, vi } from 'vitest'
import { avisarRadar, mensagemRadar } from './radar.js'
import { criarHandler } from './agentes.js'
import { cifrar } from './asaas.js'
import { emailRadar } from './email.js'

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const semEmail = { emails_enviados: 0, emails_falhas: 0, email_configurado: false }

describe('push do Radar', () => {
  it('escreve a mensagem por empresa, com o destaque', () => {
    expect(mensagemRadar({ empresa: 'Papelaria Ana', quantidade: 3, destaque: 'Aquisição de papel A4' }))
      .toEqual({ titulo: 'Radar · 3 oportunidades novas para Papelaria Ana', texto: 'Destaque: Aquisição de papel A4 (+2)' })
    expect(mensagemRadar({ empresa: 'X', quantidade: 1, destaque: null }).titulo).toBe('Radar · 1 oportunidade nova para X')
  })

  it('manda um push por empresa só para os membros da organização', async () => {
    const webpush = { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => ({})) }
    const rpc = vi.fn(async () => [{ org_id: 'o1', empresa_id: 'e1', empresa: 'Papelaria Ana', quantidade: 2, destaque: 'Papel A4' }])
    const chamar = vi.fn(async (caminho: string) => {
      if (caminho.includes('push_vapid')) return [{ publica: 'pub', privada: 'priv' }]
      if (caminho.includes('memberships')) return [{ org_id: 'o1', user_id: 'u1' }]
      if (caminho.includes('push_inscricoes')) return [{ id: 's1', user_id: 'u1', endpoint: 'https://p/1', p256dh: 'k', auth: 'a' }, { id: 's2', user_id: 'u9', endpoint: 'https://p/9', p256dh: 'k', auth: 'a' }]
      return null
    })
    const r = await avisarRadar({ token: 't', rpc, chamar, webpush })
    expect(r).toEqual({ empresas: 1, enviados: 1, falhas: 0, ...semEmail })
    const [, payload] = webpush.sendNotification.mock.calls[0] as unknown as [unknown, string]
    expect(JSON.parse(payload)).toMatchObject({ titulo: 'Radar · 2 oportunidades novas para Papelaria Ana', url: '/app/agentes/radar' })
  })

  it('sem sugestões novas não manda nada', async () => {
    const chamar = vi.fn()
    expect(await avisarRadar({ token: 't', rpc: vi.fn(async () => []), chamar, webpush: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } })).toEqual({ empresas: 0, enviados: 0, falhas: 0, ...semEmail })
    expect(chamar).toHaveBeenCalledTimes(1)
    expect(chamar).toHaveBeenCalledWith('/rest/v1/plataforma_email?select=*&id=eq.smtp')
  })
})

describe('rota do Radar', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('exige o token do agendador e chama os avisos', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://db.exemplo'); vi.stubEnv('SUPABASE_ANON_KEY', 'anon'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'servico')
    const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })
    const fetcher = vi.fn(async (url: string) => (url.endsWith('/rpc/radar_para_avisar') ? json([]) : json(null)))
    let r = resposta()
    await criarHandler({ fetcher: fetcher as unknown as typeof fetch })({ method: 'GET', headers: {}, query: { agente: 'radar', acao: 'avisar' } }, r)
    expect(r.status).toHaveBeenCalledWith(401)
    r = resposta()
    await criarHandler({ fetcher: fetcher as unknown as typeof fetch })({ method: 'GET', headers: { 'x-coleta': 'b'.repeat(64) }, query: { agente: 'radar', acao: 'avisar' } }, r)
    expect(r.status).toHaveBeenCalledWith(200)
    expect(r.json.mock.calls[0][0]).toEqual({ empresas: 0, enviados: 0, falhas: 0, ...semEmail })
  })
})

describe('e-mail do Radar', () => {
  const env = { SUPABASE_SERVICE_ROLE_KEY: 'segredo-teste' }
  const smtp = { ativo: true, host: 'smtp.exemplo', usuario: 'radar@licitaforce.com', senha_cifrada: cifrar('senha', env) }
  const lote = { id: 'l1', reserva: 'r1', org_id: 'o1', empresa_id: 'e1', empresa: 'Papelaria & Cia', email: 'ana@exemplo.com', nome: 'Ana', oportunidades: [{ id: 7, objeto: '<script>papel</script>', orgao: 'Prefeitura', uf: 'SP', valor: 1234.56, encerramento: '2026-12-01T13:00:00Z', motivos: ['Objeto cita: papel'] }] }
  it('usa a marca, escapa conteúdo e inclui dados e links para decidir', () => {
    const e = emailRadar(lote)
    expect(e.html).toContain('cid:licitaflow-logo')
    expect(e.html).toContain('Papelaria &amp; Cia')
    expect(e.html).toContain('&lt;script&gt;papel&lt;/script&gt;')
    expect(e.html).not.toContain('<script>')
    expect(e.html).toContain('01/12/2026, 10:00 (Brasília)')
    expect(e.html).toContain('1.234,56')
    expect(e.html).toContain('Adicionar'.toLowerCase())
    expect(e.texto).toContain('/app/agentes/radar?org=o1&empresa=e1&sugestao=7')
    expect(e.html).toContain('Avaliar oportunidade')
    expect(e.html).toContain('https://licitaflow.com.br/app/agentes/radar?')
    expect(e.html).not.toContain('licitaforce-app.vercel.app')
  })
  it('envia sem push configurado e confirma somente o destinatário enviado', async () => {
    const enviar = vi.fn(async () => ({ accepted: [lote.email], rejected: [] }))
    const rpc = vi.fn(async (nome: string) => nome === 'radar_emails_reservar' ? [lote] : [])
    const chamar = vi.fn(async (p: string) => p.includes('plataforma_email') ? [smtp] : [])
    const r = await avisarRadar({ token: 't', rpc, chamar, env, enviar })
    expect(r).toMatchObject({ enviados: 0, emails_enviados: 1, emails_falhas: 0, email_configurado: true })
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.exemplo' }), expect.objectContaining({ para: lote.email }))
    expect(rpc).toHaveBeenCalledWith('radar_email_concluir', { p_token: 't', p_id: 'l1', p_reserva: 'r1', p_sucesso: true })
  })
  it('libera falhas SMTP para nova tentativa e continua os outros destinatários', async () => {
    const enviar = vi.fn().mockRejectedValueOnce(new Error('SMTP indisponível')).mockResolvedValueOnce({})
    const rpc = vi.fn(async (nome: string) => nome === 'radar_emails_reservar' ? [lote, { ...lote, id: 'l2', email: 'b@exemplo.com' }] : [])
    const r = await avisarRadar({ token: 't', rpc, chamar: vi.fn(async () => [smtp]), env, enviar })
    expect(r).toMatchObject({ emails_enviados: 1, emails_falhas: 1 })
    expect(rpc).toHaveBeenCalledWith('radar_email_concluir', expect.objectContaining({ p_id: 'l1', p_sucesso: false }))
    expect(rpc).toHaveBeenCalledWith('radar_email_concluir', expect.objectContaining({ p_id: 'l2', p_sucesso: true }))
  })
  it('SMTP desativado não reserva nem perde oportunidades', async () => {
    const rpc = vi.fn(async () => [])
    const enviar = vi.fn()
    await avisarRadar({ token: 't', rpc, chamar: vi.fn(async () => [{ ...smtp, ativo: false }]), env, enviar })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(enviar).not.toHaveBeenCalled()
  })
  it('falha no push não impede o envio por e-mail', async () => {
    const enviar = vi.fn().mockResolvedValue({})
    const rpc = vi.fn(async (nome: string) => nome === 'radar_para_avisar' ? [{ org_id: 'o1', empresa_id: 'e1' }] : nome === 'radar_emails_reservar' ? [lote] : [])
    const chamar = vi.fn(async (p: string) => {
      if (p.includes('push_vapid')) throw new Error('Push indisponível')
      return [smtp]
    })
    await expect(avisarRadar({ token: 't', rpc, chamar, env, enviar })).rejects.toThrow('Push indisponível')
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('radar_email_concluir', expect.objectContaining({ p_sucesso: true }))
  })
  it('token recusado não lê SMTP nem envia e-mail', async () => {
    const chamar = vi.fn(), enviar = vi.fn()
    await expect(avisarRadar({ token: 'invalido', rpc: vi.fn(async () => { throw new Error('Token inválido') }), chamar, env, enviar })).rejects.toThrow('Token inválido')
    expect(chamar).not.toHaveBeenCalled()
    expect(enviar).not.toHaveBeenCalled()
  })
})
