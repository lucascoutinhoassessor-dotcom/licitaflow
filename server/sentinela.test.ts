import { afterEach, describe, expect, it, vi } from 'vitest'
import { avisarPorPush, compararFotos, dataLegivel, fotoDoPncp, proximaVerificacao, verificarEdital } from './sentinela.js'
import { criarHandler, MODELOS } from './agentes.js'

const CONTROLE = '11222333000144-1-000045/2026'
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const compra = (x: Record<string, unknown> = {}) => ({
  numeroControlePNCP: CONTROLE, dataAtualizacaoGlobal: '2026-11-20T10:00:00', situacaoCompraId: 1, situacaoCompraNome: 'Divulgada no PNCP',
  dataAberturaProposta: '2026-11-21T08:00:00', dataEncerramentoProposta: '2026-12-05T09:00:00', valorTotalEstimado: 1000, existeResultado: false, ...x,
})
const arq = (seq: number, titulo: string, tipo = 'Outros Documentos', ativo = true) => ({ sequencialDocumento: seq, titulo, tipoDocumentoNome: tipo, statusAtivo: ativo, dataPublicacaoPncp: '2026-11-20T10:00:00', url: `https://pncp/${seq}` })
const AGORA = new Date('2026-11-21T12:00:00-03:00')

describe('comparação das fotos do edital', () => {
  const antes = fotoDoPncp(compra(), [arq(1, 'Edital.pdf', 'Edital')], AGORA)

  it('a primeira leitura não gera eventos', () => {
    expect(compararFotos(null, antes)).toEqual([])
  })

  it('aponta suspensão, mudança de prazo, documento novo e resultado', () => {
    const depois = fotoDoPncp(compra({ situacaoCompraId: 4, situacaoCompraNome: 'Suspensa', dataEncerramentoProposta: '2026-12-10T09:00:00', existeResultado: true }),
      [arq(1, 'Edital.pdf', 'Edital'), arq(2, 'Errata 01.pdf'), arq(3, 'Planilha.xlsx')], AGORA)
    const ev = compararFotos(antes, depois)
    const tipos = ev.map((e) => `${e.tipo}:${e.nivel}`)
    expect(tipos).toContain('situacao:alto')
    expect(tipos).toContain('encerramento:alto')
    expect(tipos).toContain('resultado:medio')
    expect(ev.find((e) => e.detalhe.seq === 2)?.nivel).toBe('alto') // errata é importante
    expect(ev.find((e) => e.detalhe.seq === 3)?.nivel).toBe('medio')
    expect(ev.find((e) => e.tipo === 'encerramento')?.titulo).toContain('05/12/2026 09:00 → 10/12/2026 09:00')
  })

  it('documento inativado vira "retirado" e edital fora do PNCP gera alerta', () => {
    const depois = fotoDoPncp(compra(), [arq(1, 'Edital.pdf', 'Edital', false)], AGORA)
    expect(compararFotos(antes, depois).map((e) => e.tipo)).toEqual(['documento_retirado'])
    expect(compararFotos(antes, { ...antes, retirado: true })).toMatchObject([{ tipo: 'retirado', nivel: 'alto' }])
  })

  it('mostra datas do PNCP no formato brasileiro', () => {
    expect(dataLegivel('2026-12-05T09:00:00')).toBe('05/12/2026 09:00')
    expect(dataLegivel(null)).toBe('sem data')
  })
})

describe('frequência das verificações', () => {
  it('verifica mais perto da sessão e menos depois de muito tempo', () => {
    const min = (iso: string) => Math.round((Date.parse(iso) - AGORA.getTime()) / 60e3)
    expect(min(proximaVerificacao({ encerramento: '2026-11-22T09:00:00' }, AGORA))).toBe(30)
    expect(min(proximaVerificacao({ encerramento: '2026-12-30T09:00:00' }, AGORA))).toBe(120)
    expect(min(proximaVerificacao({ encerramento: '2026-09-01T09:00:00' }, AGORA))).toBe(720)
    expect(min(proximaVerificacao({ situacao_id: 4, encerramento: '2026-11-22T09:00:00' }, AGORA))).toBe(60)
    expect(min(proximaVerificacao(null, AGORA, 1))).toBe(30)
    expect(min(proximaVerificacao(null, AGORA, 9))).toBe(360)
  })
})

describe('leitura de um edital no PNCP', () => {
  it('sem mudança na compra, não baixa a lista de arquivos de novo', async () => {
    const antes = fotoDoPncp(compra(), [arq(1, 'Edital.pdf', 'Edital')], AGORA)
    const fetcher = vi.fn(async () => json(compra()))
    const r = await verificarEdital({ controle: CONTROLE, estado: antes }, { fetcher: fetcher as unknown as typeof fetch, agora: AGORA })
    expect(r).toEqual({ estado: antes, eventos: [] })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('compra atualizada: relê os arquivos e compara', async () => {
    const antes = fotoDoPncp(compra(), [arq(1, 'Edital.pdf', 'Edital')], AGORA)
    const fetcher = vi.fn(async (url: string) => url.endsWith('/arquivos') ? json([arq(1, 'Edital.pdf', 'Edital'), arq(2, 'Resposta ao esclarecimento.pdf')]) : json(compra({ dataAtualizacaoGlobal: '2026-11-21T11:00:00' })))
    const r = await verificarEdital({ controle: CONTROLE, estado: antes }, { fetcher: fetcher as unknown as typeof fetch, agora: AGORA })
    expect(r.eventos).toMatchObject([{ tipo: 'documento_novo', nivel: 'alto' }])
  })

  it('só diz que saiu do PNCP quando a compra e os arquivos somem', async () => {
    const antes = fotoDoPncp(compra(), [], AGORA)
    let r = await verificarEdital({ controle: CONTROLE, estado: antes }, { fetcher: (async () => new Response('', { status: 404 })) as unknown as typeof fetch, agora: AGORA })
    expect(r.eventos).toMatchObject([{ tipo: 'retirado' }])
    r = await verificarEdital({ controle: CONTROLE, estado: antes }, { fetcher: (async (u: string) => new Response('[]', { status: u.endsWith('/arquivos') ? 200 : 404 })) as unknown as typeof fetch, agora: AGORA })
    expect(r.erro).toBeTruthy()
    r = await verificarEdital({ controle: CONTROLE, estado: antes }, { fetcher: (async () => new Response('', { status: 503 })) as unknown as typeof fetch, agora: AGORA })
    expect(r.erro).toBeTruthy()
  })
})

describe('push da Sentinela', () => {
  it('junta os avisos por processo, só manda para membros da organização e pula o nível baixo', async () => {
    const webpush = { setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => ({})) }
    const chamar = vi.fn(async (caminho: string) => {
      if (caminho.includes('push_vapid')) return [{ publica: 'pub', privada: 'priv' }]
      if (caminho.includes('memberships')) return [{ org_id: 'o1', user_id: 'u1' }, { org_id: 'o2', user_id: 'u2' }]
      if (caminho.includes('push_inscricoes')) return [{ id: 's1', user_id: 'u1', endpoint: 'https://p/1', p256dh: 'k', auth: 'a' }, { id: 's2', user_id: 'u2', endpoint: 'https://p/2', p256dh: 'k', auth: 'a' }]
      return null
    })
    const r = await avisarPorPush([
      { titulo: 'Compra suspensa', nivel: 'alto', org_id: 'o1', processo_id: 'p1' },
      { titulo: 'Novo documento', nivel: 'medio', org_id: 'o1', processo_id: 'p1' },
      { titulo: 'Valor mudou', nivel: 'baixo', org_id: 'o2', processo_id: 'p2' },
    ], { chamar, webpush })
    expect(r).toEqual({ enviados: 1, falhas: 0 })
    const [destino, payload] = webpush.sendNotification.mock.calls[0] as unknown as [{ endpoint: string }, string]
    expect(destino.endpoint).toBe('https://p/1')
    expect(JSON.parse(payload)).toMatchObject({ titulo: 'Sentinela: atenção no edital', texto: 'Compra suspensa · Novo documento', url: '/app/processos/p1' })
  })
})

describe('rota da Sentinela', () => {
  afterEach(() => vi.unstubAllEnvs())
  const ambiente = () => { vi.stubEnv('SUPABASE_URL', 'https://db.exemplo'); vi.stubEnv('SUPABASE_ANON_KEY', 'anon'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'servico') }
  const resposta = () => ({ setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() })
  const TOKEN = 'a'.repeat(64)

  it('exige o token do agendador', async () => {
    ambiente()
    const r = resposta()
    await criarHandler({ fetcher: vi.fn() as unknown as typeof fetch })({ method: 'GET', headers: {}, query: { agente: 'sentinela', acao: 'verificar' } }, r)
    expect(r.status).toHaveBeenCalledWith(401)
  })

  it('roda o lote, grava os eventos e devolve o resumo', async () => {
    ambiente()
    const gravado: unknown[] = []
    const antes = fotoDoPncp(compra(), [], AGORA)
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/rpc/sentinela_lote')) return json([{ controle: CONTROLE, estado: antes }])
      if (url.endsWith('/rpc/sentinela_gravar')) { gravado.push(JSON.parse(String(init?.body))); return json([]) }
      if (url.endsWith('/arquivos')) return json([])
      return json(compra({ dataAtualizacaoGlobal: '2026-11-21T11:00:00', situacaoCompraId: 4, situacaoCompraNome: 'Suspensa' }))
    })
    const r = resposta()
    await criarHandler({ fetcher: fetcher as unknown as typeof fetch })({ method: 'GET', headers: { 'x-coleta': TOKEN }, query: { agente: 'sentinela', acao: 'verificar' } }, r)
    expect(r.status).toHaveBeenCalledWith(200)
    expect(r.json.mock.calls[0][0]).toMatchObject({ verificados: 1, erros: 0, eventos: 1 })
    const corpo = gravado[0] as { p_token: string; p_itens: { eventos: { tipo: string }[] }[] }
    expect(corpo.p_token).toBe(TOKEN)
    expect(corpo.p_itens[0].eventos[0].tipo).toBe('situacao')
  })
})

describe('modelo de IA por agente', () => {
  it('Opus na leitura e no jurídico; Haiku nos agentes leves', () => {
    expect(MODELOS['leitor-editais'].modelo).toBe('claude-opus-5-5')
    expect(MODELOS.juridico.modelo).toBe('claude-opus-5-5')
    expect(MODELOS.radar.modelo).toBe('claude-haiku-5-5')
    expect(MODELOS.cotador.modelo).toBe('claude-haiku-5-5')
  })
})
