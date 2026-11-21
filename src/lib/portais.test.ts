import { describe, expect, it } from 'vitest'
import { codigoComprasnet } from './portais'

describe('UASG e número no ComprasNet', () => {
  it('lê do código da compra no link do edital, com o número completo', () => {
    const link = 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=16800805002832026'
    expect(codigoComprasnet({ linkSistemaOrigem: link })).toEqual({ uasg: '168008', numero: '00283/2026' })
  })
  it('sem código válido (outros portais) não mostra nada', () => {
    expect(codigoComprasnet({ linkSistemaOrigem: 'https://www.portaldecompraspublicas.com.br/processos/123' })).toBeNull()
    expect(codigoComprasnet({ linkSistemaOrigem: null })).toBeNull()
    expect(codigoComprasnet({ linkSistemaOrigem: 'https://x.gov.br/?compra=123' })).toBeNull()
  })
})
