import { describe, expect, it } from 'vitest'
import { dataLocalQuadro, linkQuadroSeguro, validarPostQuadro } from './quadro'
const post = { titulo: 'Dica educativa', texto: 'Confira os documentos do edital.', tipo: 'dica' as const, imagem_url: '', link_url: '/app/documentos', link_texto: 'Conferir documentos', publicar_em: '2026-11-26T12:00:00Z', expira_em: null }
describe('Quadro informativo', () => {
  it('aceita destinos internos e HTTPS, inclusive caracteres escapados na URL', () => {
    for (const link of ['', '/app/documentos', 'https://example.com/evento?q=dica%20nova']) expect(linkQuadroSeguro(link)).toBe(true)
    expect(linkQuadroSeguro('https://example.com/banner.png', true)).toBe(true)
  })
  it('bloqueia scripts, protocolos inseguros e URLs ambíguas', () => {
    for (const link of ['javascript:alert(1)', 'data:text/html,x', '//example.com', '/\\example.com', 'http://example.com', '\nhttps://example.com', '/app\u0000', '/app\u007f']) expect(linkQuadroSeguro(link)).toBe(false)
    expect(linkQuadroSeguro('/banner.png', true)).toBe(false)
  })
  it('valida os dados antes de salvar ou publicar', () => {
    expect(validarPostQuadro(post)).toBeNull()
    expect(validarPostQuadro({ ...post, titulo: '  ' })).toBeTruthy()
    expect(validarPostQuadro({ ...post, texto: '  ' })).toBeTruthy()
    expect(validarPostQuadro({ ...post, tipo: 'banner' })).toBeTruthy()
    expect(validarPostQuadro({ ...post, link_texto: '' })).toBeTruthy()
    expect(validarPostQuadro({ ...post, publicar_em: 'invalida' })).toBeTruthy()
    expect(validarPostQuadro({ ...post, expira_em: post.publicar_em })).toBeTruthy()
    expect(validarPostQuadro({ ...post, expira_em: '2026-11-27T12:00:00Z' })).toBeNull()
  })
  it('converte o instante para o horário local do editor sem perder a data', () => {
    const entrada = '2026-11-26T12:34:00Z'
    expect(new Date(dataLocalQuadro(entrada)).toISOString()).toBe(entrada.replace(':00Z', ':00.000Z'))
  })
})
