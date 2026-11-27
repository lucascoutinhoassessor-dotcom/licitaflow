import { deflateRawSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { atualizarFederal, competencia, lerCsv, lerDia, lotes, proximoDia } from './termometroFederal.js'

/** ZIP mínimo (deflate) com os arquivos dados, em latin1 como o Portal publica. */
function zip(arquivos: Record<string, string>) {
  const locais: Buffer[] = [], centrais: Buffer[] = []
  let pos = 0
  for (const [nome, texto] of Object.entries(arquivos)) {
    const dados = deflateRawSync(Buffer.from(texto, 'latin1')), n = Buffer.from(nome)
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(dados.length, 18); l.writeUInt16LE(n.length, 26)
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(dados.length, 20); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42)
    locais.push(l, n, dados); centrais.push(c, n)
    pos += 30 + n.length + dados.length
  }
  const central = Buffer.concat(centrais)
  const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(Object.keys(arquivos).length, 10); fim.writeUInt32LE(central.length, 12); fim.writeUInt32LE(pos, 16)
  return Buffer.concat([...locais, central, fim])
}
const linha = (...c: string[]) => c.map((x) => `"${x}"`).join(';')
const E1 = '158129264042026NE000001', E2 = '158129264042026NE000002'
const PAG = ['Código Pagamento', 'Data Emissão', 'Código Tipo Documento', 'Código Órgão Superior', 'Órgão Superior', 'Código Órgão', 'Órgão', 'Código Unidade Gestora', 'Unidade Gestora', 'Código Favorecido', 'Código Modalidade de Aplicação', 'Valor do Pagamento Convertido pra R$']
const IF = ['26000', 'Ministério da Educação', '26404', 'Instituto Federal Baiano', '158129', 'INST FED BAIANO']
const dia = zip({
  '20261119_Despesas_Liquidacao.csv': [
    linha('Código Liquidação', 'Data Emissão', 'Código Favorecido', 'Observação', 'Código Modalidade de Aplicação'),
    linha('L1', '19/11/2026', '32106496000179', 'PGTO AO(S) MES(ES): 06/2026.', '90'),
    linha('L2', '19/11/2026', '32106496000179', 'IMPOSTO; RETENÇÃO\nlinha quebrada', '90'),
    linha('L3', '19/11/2026', '***.059.307-**', 'pessoa física', '90'),
    linha('L4', '19/11/2026', '32106496000179', 'transferência', '50'),
  ].join('\r\n'),
  '20261119_Despesas_Liquidacao_EmpenhosImpactados.csv': [
    linha('Código Liquidação', 'Código Empenho', 'Valor Liquidado (R$)'),
    linha('L1', E1, '1.000,00'), linha('L2', E1, '50,00'), linha('L3', E2, '10,00'), linha('L4', E2, '10,00'),
  ].join('\r\n'),
  '20261119_Despesas_Pagamento.csv': [
    linha(...PAG),
    linha('P1', '19/11/2026', 'OB', ...IF, '32106496000179', '90', '950,00'),
    linha('P2', '19/11/2026', 'OB', ...IF, '32106496000179', '90', '-950,00'),
    linha('P3', '19/11/2026', 'DF', ...IF, '00394460000141', '90', '50,00'),
  ].join('\r\n'),
  '20261119_Despesas_Pagamento_EmpenhosImpactados.csv': [linha('Código Pagamento', 'Código Empenho'), linha('P1', E1), linha('P2', E1), linha('P3', E1)].join('\r\n'),
})

describe('Termômetro federal', () => {
  it('lê CSV com ";" e quebra de linha dentro das aspas', () => {
    expect(lerCsv('"a";"b;c"\r\n"x\ny";"z"\n')).toEqual([['a', 'b;c'], ['x\ny', 'z']])
  })

  it('acha o mês do serviço na observação', () => {
    expect(competencia('PRESTADO(S) AO(S) MES(ES): 06/2026.')).toBe('2026-06-30')
    expect(competencia('MES(ES): 01/2026, 02/2026')).toBe('2026-02-28')
    expect(competencia('sem mês')).toBeNull()
  })

  it('lê o dia: só PJ com aplicação direta; notas do mesmo empenho no dia viram uma; só OB positiva', () => {
    const d = lerDia(dia)
    expect(d.liquidacoes).toEqual([[E1, '2026-11-19', '2026-06-30']])
    expect(d.pagamentos).toEqual([[E1, '2026-11-19']])
    expect(d.ugs).toEqual([['158129', 'INST FED BAIANO', '26404', 'Instituto Federal Baiano', '26000', 'Ministério da Educação']])
  })

  it('avança o dia', () => {
    expect(proximoDia('20261130')).toBe('20261201')
    expect(proximoDia('20261231')).toBe('20270101')
  })

  it('rodada: lê os dias depois do último e para no que ainda não saiu', async () => {
    const chamadas: string[] = []
    const rpc = vi.fn(async (nome: string, corpo: Record<string, unknown>) => {
      if (nome === 'termometro_estado') return { ativo: true, recursos: { federal: '20261118' } }
      chamadas.push(String(corpo.p_dia)); return { casados: 1 }
    })
    const fetcher = vi.fn(async (url: string) => (url.endsWith('20261119') ? new Response(dia) : new Response('', { status: 403 })))
    const r = await atualizarFederal({ token: 't', rpc, fetcher: fetcher as unknown as typeof fetch, agora: Date.parse('2026-11-26T12:00:00Z') })
    expect(chamadas).toEqual(['20261119'])
    expect(r.feitos?.[1]).toMatchObject({ dia: '20261120', situacao: expect.stringContaining('ainda não publicado') })
  })

  it('rodada: dia que não sai há mais de 10 dias é pulado', async () => {
    const chamadas: string[] = []
    const rpc = vi.fn(async (nome: string, corpo: Record<string, unknown>) => {
      if (nome === 'termometro_estado') return { ativo: true, recursos: { federal: '20261030' } }
      chamadas.push(String(corpo.p_dia)); return { casados: 0 }
    })
    const fetcher = vi.fn(async (url: string) => (url.endsWith('20261031') ? new Response('', { status: 404 }) : url.endsWith('20261101') ? new Response(dia) : new Response('', { status: 403 })))
    const r = await atualizarFederal({ token: 't', rpc, fetcher: fetcher as unknown as typeof fetch, agora: Date.parse('2026-11-26T12:00:00Z') })
    expect(chamadas).toEqual(['20261031', '20261101'])
    expect(r.feitos?.[0]).toMatchObject({ situacao: 'pulado (404)' })
  })

  it('lotes: tudo de um empenho no mesmo lote, UGs no primeiro, ao menos um lote', () => {
    const A = '111111000012026NE000001', B = '222222000012026NE000002', C = '333333000012026NE000003'
    const l = lotes({ liquidacoes: [[A, 'd', null], [B, 'd', null], [C, 'd', null]], pagamentos: [[A, 'd'], [A, 'd'], [B, 'd']], ugs: [['111111']] }, 3)
    expect(l.map((x) => [x.liq.length, x.pag.length, x.ugs.length])).toEqual([[1, 2, 1], [2, 1, 0]])
    expect(l[1].liq.map((x) => x[0])).toEqual([B, C])
    expect(lotes({ liquidacoes: [], pagamentos: [], ugs: [] })).toEqual([{ liq: [], pag: [], ugs: [] }])
  })

  it('rodada: manda o dia em lotes e retoma do lote em que parou', async () => {
    const chamadas: string[] = []
    const rpc = vi.fn(async (nome: string, corpo: Record<string, unknown>) => {
      if (nome === 'termometro_estado') return { ativo: true, recursos: { federal: '20261118', federal_parte: '20261119:1' } }
      chamadas.push(`${corpo.p_dia}:${corpo.p_parte}/${corpo.p_partes}`); return { casados: 1 }
    })
    const fetcher = vi.fn(async (url: string) => (url.endsWith('20261119') ? new Response(dia) : new Response('', { status: 403 })))
    // O dia de teste cabe num lote só: com federal_parte 1, já está todo gravado e nada é reenviado.
    const r = await atualizarFederal({ token: 't', rpc, fetcher: fetcher as unknown as typeof fetch, agora: Date.parse('2026-11-26T12:00:00Z') })
    expect(chamadas).toEqual([])
    expect(r.feitos?.[0]).toMatchObject({ dia: '20261119', lotes: '1/1' })
  })

  it('rodada: no máximo maxDias dias por vez', async () => {
    const rpc = vi.fn(async (nome: string) => (nome === 'termometro_estado' ? { ativo: true, recursos: { federal: '20261110' } } : { casados: 0 }))
    const fetcher = vi.fn(async () => new Response(dia))
    const r = await atualizarFederal({ token: 't', rpc, fetcher: fetcher as unknown as typeof fetch, agora: Date.parse('2026-11-26T12:00:00Z'), maxDias: 2 })
    expect(r.feitos?.map((f) => f.dia)).toEqual(['20261111', '20261112'])
  })
})
