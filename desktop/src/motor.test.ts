import { describe, expect, it } from 'vitest'
import motor from './motor.cjs'
import cg from './conectores/comprasgov.cjs'

const { decidir } = motor
const aberto = { fase: 'Em disputa aberta', melhor: 10, meu: 12, posicao: 3 }
const cfg = { ligado: true, minimo: 8, desconto: 0.5 }

describe('motor de lances', () => {
  it('parado, sem mínimo ou sem desconto não dá lance', () => {
    expect(decidir({ ...cfg, ligado: false }, aberto).acao).toBe('parado')
    expect(decidir({ ...cfg, minimo: null }, aberto).acao).toBe('erro')
    expect(decidir({ ...cfg, desconto: 0 }, aberto).acao).toBe('erro')
  })

  it('cobre o melhor lance com o desconto', () => {
    expect(decidir(cfg, aberto)).toMatchObject({ acao: 'enviar', valor: 9.5 })
    expect(decidir({ ...cfg, tipoDesconto: 'percentual', desconto: 1 }, aberto)).toMatchObject({ acao: 'enviar', valor: 9.9 })
  })

  it('nunca desce abaixo do mínimo: vai no mínimo quando ainda cobre, senão para', () => {
    expect(decidir({ ...cfg, minimo: 9.8 }, aberto)).toMatchObject({ acao: 'enviar', valor: 9.8 })
    expect(decidir({ ...cfg, minimo: 10 }, aberto).acao).toBe('limite')
    expect(decidir({ ...cfg, minimo: 11 }, aberto).acao).toBe('limite')
  })

  it('respeita a variação mínima do item e as casas decimais', () => {
    expect(decidir({ ...cfg, desconto: 0.01 }, { ...aberto, variacao: 0.2 })).toMatchObject({ valor: 9.8 })
    expect(decidir({ ...cfg, desconto: 1, tipoDesconto: 'percentual' }, { ...aberto, melhor: 10.1234 })).toMatchObject({ valor: 10.02 })
    expect(decidir({ ...cfg, desconto: 1, tipoDesconto: 'percentual', casas4: true }, { ...aberto, melhor: 10.1234 })).toMatchObject({ valor: 10.0221 })
  })

  it('não dá lance quem está ganhando, com item fechado ou durante o envio', () => {
    expect(decidir(cfg, { ...aberto, posicao: 1 }).acao).toBe('esperar')
    expect(decidir(cfg, { ...aberto, meu: 10 }).acao).toBe('esperar')
    expect(decidir(cfg, { ...aberto, fase: 'Encerrado' }).acao).toBe('esperar')
    expect(decidir(cfg, { ...aberto, fase: 'Aguardando disputa' }).acao).toBe('esperar')
    expect(decidir(cfg, aberto, { enviando: true }).acao).toBe('esperar')
  })

  it('respeita o intervalo mínimo entre os próprios lances', () => {
    const agora = 1_000_000
    expect(decidir(cfg, aberto, { ultimoEnvio: agora - 5000 }, agora)).toMatchObject({ acao: 'esperar' })
    expect(decidir(cfg, aberto, { ultimoEnvio: agora - 21000 }, agora)).toMatchObject({ acao: 'enviar' })
    expect(decidir({ ...cfg, intervaloSeg: 3 }, aberto, { ultimoEnvio: agora - 4000 }, agora)).toMatchObject({ acao: 'enviar' })
  })

  it('modo "só no fim" espera a fase final', () => {
    expect(decidir({ ...cfg, soNoFim: true }, aberto).acao).toBe('esperar')
    expect(decidir({ ...cfg, soNoFim: true }, { ...aberto, fase: 'Encerramento aleatório' }).acao).toBe('enviar')
  })
})

describe('envio do lance pela página', () => {
  it('monta o código só com endereço e valores válidos, sem expor o token', () => {
    const codigo = cg.codigoEnviarLance({ apiBase: 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-disputa/api', chave: '15841905900122026', item: '3', valor: 9.5, faseBruta: 'AB' })
    expect(codigo).toContain('/v1/compras/15841905900122026/itens/3/lances')
    expect(codigo).toContain('sessionStorage.getItem')
    expect(codigo).toContain('\\"valorInformado\\":9.5')
    expect(() => cg.codigoEnviarLance({ apiBase: 'https://exemplo.com/x', chave: '15841905900122026', item: '3', valor: 1 })).toThrow()
    expect(() => cg.codigoEnviarLance({ apiBase: 'https://a.gov.br/comprasnet-disputa/api', chave: '1', item: '3', valor: 1 })).toThrow()
    expect(() => cg.codigoEnviarLance({ apiBase: 'https://a.gov.br/comprasnet-disputa/api', chave: '15841905900122026', item: '3', valor: -1 })).toThrow()
  })

  it('guarda os itens por pregão, com o endereço da API visto', () => {
    const ctx = { estado: new Map(), empresas: [], agora: new Date() }
    const url = 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-disputa/api/v1/compras/15841905900122026/itens/em-disputa'
    cg.lerResposta(url, [{ numero: 1, descricao: 'Papel A4', faseItem: 'AB', situacao: 'Em disputa aberta', melhorValor: 10 }], ctx)
    cg.lerResposta(url.replace('15841905900122026', '99999905000012026'), [{ numero: 1, situacao: 'Aguardando disputa', melhorValor: 50 }], ctx)
    const itens = cg.itensDe(ctx, '15841905900122026')
    expect(itens).toHaveLength(1)
    expect(itens[0]).toMatchObject({ item: '1', descricao: 'Papel A4', melhor: 10, faseBruta: 'AB', apiBase: 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-disputa/api' })
    expect(cg.itensDe(ctx, '99999905000012026')[0].melhor).toBe(50)
  })
})

import estr from './estrategias.cjs'
describe('estratégias da tela', () => {
  it('aceita só campos conhecidos e valores válidos', () => {
    expect(estr.limparEstrategia({ minimo: '3,99', desconto: '1,5', ligado: true, tipoDesconto: 'x', intervaloSeg: 1, outro: 'y' } as never))
      .toEqual({ minimo: 3.99, desconto: 1.5, ligado: true, tipoDesconto: 'valor', intervaloSeg: 3 })
    expect(estr.limparEstrategia({ minimo: '-1', ligado: 'sim' } as never)).toEqual({ minimo: null, ligado: false })
  })
})
