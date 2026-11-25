import { afterEach, describe, expect, it, vi } from 'vitest'
import { avisarPorPush, categoriaDocumento, compararFotos, dataLegivel, fotoDoPncp, identificacao, nomeDocumento, proximaVerificacao, verificarEdital } from './sentinela.js'
import { criarHandler, MODELOS } from './agentes.js'

const CONTROLE = '11222333000144-1-000045/2026'
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const compra = (x: Record<string, unknown> = {}) => ({
  numeroControlePNCP: CONTROLE, dataAtualizacaoGlobal: '2026-11-20T10:00:00', situacaoCompraId: 1, situacaoCompraNome: 'Divulgada no PNCP',
  dataAberturaProposta: '2026-11-21T08:00:00', dataEncerramentoProposta: '2026-12-05T09:00:00', valorTotalEstimado: 1000, existeResultado: false,
  modalidadeNome: 'Pregão - Eletrônico', numeroCompra: '45', anoCompra: 2026, orgaoEntidade: { razaoSocial: 'Prefeitura de Cidade' }, unidadeOrgao: { ufSigla: 'MG', municipioNome: 'Cidade' }, ...x,
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
    const enc = ev.find((e) => e.tipo === 'encerramento')!
    expect(enc.titulo).toBe('Prazo final das propostas adiado para 10/12/2026 09:00 (+5 dias)')
    expect(enc.detalhe).toMatchObject({ antes: '05/12/2026 09:00', depois: '10/12/2026 09:00' })
    expect(enc.orientacao).toContain('art. 164')
    expect(ev.find((e) => e.tipo === 'situacao')?.titulo).toBe('Compra suspensa pelo órgão')
    expect(ev.find((e) => e.detalhe.seq === 2)?.titulo).toBe('Errata / retificação do edital: Errata 01')
    expect(ev.every((e) => e.detalhe.contexto === 'Pregão Eletrônico nº 45/2026 · Prefeitura de Cidade (MG)')).toBe(true)
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

describe('textos profissionais dos avisos', () => {
  it('limpa o nome do arquivo e tira códigos internos', () => {
    expect(nomeDocumento('Relatorio__Edital__WCO6211023740RFJWGXPLHZASK1.pdf')).toBe('Relatorio Edital')
    expect(nomeDocumento('ERRATA_01-PE_045-2026.PDF')).toBe('ERRATA 01 - PE 045 - 2026')
    expect(nomeDocumento('')).toBe('documento sem nome')
  })
  it('classifica o documento e orienta o licitante', () => {
    expect(categoriaDocumento('Outros Documentos', 'Resposta ao pedido de esclarecimento 02.pdf')).toMatchObject({ rotulo: 'Resposta a pedido de esclarecimento', nivel: 'alto' })
    expect(categoriaDocumento('Edital', 'Edital retificado.pdf').rotulo).toBe('Errata / retificação do edital')
    expect(categoriaDocumento('Ata', 'Ata da sessão pública.pdf').rotulo).toBe('Ata / julgamento da sessão')
    expect(categoriaDocumento('Ata de Registro de Preço', 'ARP 12.pdf').rotulo).toBe('Contrato / ata de registro de preços')
    expect(categoriaDocumento('Outros Documentos', 'Contrarrazões empresa X.pdf').orientacao).toContain('art. 165')
    expect(categoriaDocumento('Termo de Referência', 'TR.pdf').rotulo).toBe('Anexo do edital')
    expect(categoriaDocumento('Outros Documentos', 'foto.jpg').rotulo).toBe('Documento publicado')
  })
  it('identifica a compra em uma linha', () => {
    expect(identificacao({ modalidade: 'Pregão - Eletrônico', numero: '45/2026', orgao: 'Prefeitura de Cidade', uf: 'MG' })).toBe('Pregão Eletrônico nº 45/2026 · Prefeitura de Cidade (MG)')
    expect(identificacao(null)).toBeNull()
  })
  it('compra retomada depois de suspensa é aviso de atenção', () => {
    const antes = fotoDoPncp(compra({ situacaoCompraId: 4, situacaoCompraNome: 'Suspensa' }), [], AGORA)
    const ev = compararFotos(antes, fotoDoPncp(compra(), [], AGORA))
    expect(ev).toMatchObject([{ tipo: 'situacao', nivel: 'alto', titulo: 'Compra retomada pelo órgão' }])
  })
  it('valor estimado mostra a variação em reais e em percentual', () => {
    const ev = compararFotos(fotoDoPncp(compra(), [], AGORA), fotoDoPncp(compra({ valorTotalEstimado: 1250 }), [], AGORA))
    expect(ev[0].titulo.replace(/\s/g, ' ')).toBe('Valor estimado alterado para R$ 1.250,00 (+25%)')
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
    const antes = { ...fotoDoPncp(compra(), [arq(1, 'Edital.pdf', 'Edital')], AGORA), historico_em: AGORA.toISOString(), historico: [] }
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

describe('resultados dos itens e CNPJ público do fornecedor', () => {
  const resultado = (x: Record<string, unknown> = {}) => ({ sequencialResultado: 1, niFornecedor: '12.345.678/0001-90', nomeRazaoSocialFornecedor: 'Empresa A', situacaoCompraItemResultadoId: 1, situacaoCompraItemResultadoNome: 'Informado', valorTotalHomologado: 100, ...x })
  const consultar = async (itens: unknown[], dados: unknown = [resultado()], antes: unknown = null) => {
    const fetcher = vi.fn(async (url: string) => url.includes('/historico?') ? json([]) : url.includes('/itens?') ? json(itens) : url.endsWith('/resultados') ? json(dados) : url.endsWith('/arquivos') ? json([]) : json(compra({ existeResultado: true })))
    const r = await verificarEdital({ controle: CONTROLE, estado: antes }, { fetcher, agora: AGORA })
    return { r, fetcher }
  }
  it('lê o resultado e normaliza o CNPJ, sem precisar transmitir dados privados do cliente ao PNCP', async () => {
    const { r } = await consultar([{ numeroItem: 1, temResultado: true }])
    expect(r.estado.resultados).toMatchObject([{ item: 1, cnpj: '12345678000190', situacao_id: 1 }])
    expect(r.estado.resultados_parcial).toBe(false)
    expect(r.estado.resultados_consultados_em).toBe(AGORA.toISOString())
  })
  it('não trata uma resposta inválida como ausência de resultados', async () => {
    const { r } = await consultar([{ numeroItem: 1, temResultado: true }], {})
    expect(r.estado.resultados_erro).toContain('inválido')
    expect(r.estado.resultados_parcial).toBe(true)
    expect(r.estado.resultados_consultados_em).toBeNull()
  })
  it('retoma os itens restantes na rodada seguinte', async () => {
    const itens = Array.from({ length: 12 }, (_, i) => ({ numeroItem: i + 1, temResultado: true }))
    const primeira = await consultar(itens)
    expect(primeira.r.estado.resultados_offset).toBe(10)
    expect(primeira.r.estado.resultados_parcial).toBe(true)
    const segunda = await consultar(itens, [resultado()], primeira.r.estado)
    expect(segunda.r.estado.resultados).toHaveLength(12)
    expect(segunda.r.estado.resultados_parcial).toBe(false)
    expect(segunda.fetcher.mock.calls.filter(([u]) => u.endsWith('/resultados'))).toHaveLength(2)
  })
  it('não repete o alerta quando o banco reordena as chaves do JSON e avisa cancelamento', async () => {
    const { r } = await consultar([{ numeroItem: 1, temResultado: true }])
    const antes = { ...r.estado, resultados: r.estado.resultados.map((x: Record<string, unknown>) => Object.fromEntries(Object.entries(x).reverse())) }
    expect(compararFotos(antes, r.estado)).toEqual([])
    const depois = { ...r.estado, resultados: [{ ...r.estado.resultados[0], situacao_id: 2, situacao: 'Cancelado' }] }
    expect(compararFotos(antes, depois)).toMatchObject([{ tipo: 'resultado_item', nivel: 'alto' }])
  })
  it('preserva resultados anteriores quando o PNCP falha', async () => {
    const { r: primeira } = await consultar([{ numeroItem: 1, temResultado: true }])
    const { r } = await consultar([{ numeroItem: 1, temResultado: true }], null, { ...primeira.estado, resultados_parcial: true, resultados_pagina: 1 })
    expect(r.estado.resultados).toEqual(primeira.estado.resultados)
    expect(r.estado.resultados_erro).toBeTruthy()
  })
  it('consulta publicações anteriores ao início do monitoramento, sem inventar fases da disputa', async () => {
    const fetcher = vi.fn(async (url: string) => url.includes('/historico?') ? json([
      { logManutencaoDataInclusao: '2026-11-10T10:00:00', tipoLogManutencaoNome: 'Inclusão', categoriaLogManutencaoNome: 'Contratação' },
      { logManutencaoDataInclusao: '2026-11-11T10:00:00', tipoLogManutencaoNome: 'Retificação', categoriaLogManutencaoNome: 'Documento de Contratação', documentoTitulo: 'Errata_01.pdf' },
    ]) : url.endsWith('/arquivos') ? json([]) : json(compra()))
    const r = await verificarEdital({ controle: CONTROLE, estado: null }, { fetcher, agora: AGORA })
    expect(r.estado.historico).toMatchObject([{ operacao: 'Retificação', documento: 'Errata 01' }, { operacao: 'Inclusão' }])
    expect(r.estado.historico_parcial).toBe(false)
    expect(r.eventos).toEqual([])
  })
  it('percorre a próxima página do histórico sem perder publicações já consultadas', async () => {
    const publicacoes = Array.from({ length: 100 }, (_, i) => ({ logManutencaoDataInclusao: '2026-11-10T10:00:00', tipoLogManutencaoNome: 'Inclusão', categoriaLogManutencaoNome: 'Documento', documentoTitulo: `Anexo_${i}.pdf` }))
    const fetcher = vi.fn(async (url: string) => url.includes('/historico?') ? json(url.includes('pagina=1&') ? publicacoes : []) : url.endsWith('/arquivos') ? json([]) : json(compra()))
    const primeira = await verificarEdital({ controle: CONTROLE, estado: null }, { fetcher, agora: AGORA })
    expect(primeira.estado.historico_parcial).toBe(true)
    const segunda = await verificarEdital({ controle: CONTROLE, estado: primeira.estado }, { fetcher, agora: AGORA })
    expect(segunda.estado.historico).toHaveLength(100)
    expect(segunda.estado.historico_parcial).toBe(false)
    expect(fetcher.mock.calls.some(([u]) => u.includes('/historico?pagina=2&'))).toBe(true)
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
      { titulo: 'Novo documento', nivel: 'medio', org_id: 'o1', processo_id: 'p1', contexto: 'Pregão nº 1/2026' },
      { titulo: 'Compra suspensa', nivel: 'alto', org_id: 'o1', processo_id: 'p1' },
      { titulo: 'Valor mudou', nivel: 'baixo', org_id: 'o2', processo_id: 'p2' },
    ], { chamar, webpush })
    expect(r).toEqual({ enviados: 1, falhas: 0 })
    const [destino, payload] = webpush.sendNotification.mock.calls[0] as unknown as [{ endpoint: string }, string]
    expect(destino.endpoint).toBe('https://p/1')
    expect(JSON.parse(payload)).toMatchObject({ titulo: 'Sentinela · Atenção · Pregão nº 1/2026', texto: 'Compra suspensa (+1 outra mudança)', url: '/app/processos/p1' })
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
