import { describe, expect, it } from 'vitest'
import cg from './comprasgov.cjs'
import comum from './comum.cjs'

const base = 'https://cnetmobile.estaleiro.serpro.gov.br'
const compra = '15841905900122026'
const empresas = [{ cnpj: '12345678000190', razao_social: 'Ana Comércio de Papéis LTDA - ME', nome_fantasia: 'Papelaria Ana' }]
const ctx = () => ({ estado: new Map(), empresas, agora: new Date('2026-11-27T13:00:00-03:00') })

describe('comum', () => {
  it('lê datas do portal no horário de Brasília', () => {
    expect(comum.lerData('27/11/2026 14:30:05')!.toISOString()).toBe('2026-11-27T17:30:05.000Z')
    expect(comum.lerData('2026-11-27T14:30:00')!.toISOString()).toBe('2026-11-27T17:30:00.000Z')
    expect(comum.lerData('2026-11-27T17:30:00Z')!.toISOString()).toBe('2026-11-27T17:30:00.000Z')
  })

  it('acha o prazo citado pelo pregoeiro', () => {
    const base = new Date('2026-11-27T10:00:00-03:00')
    expect(comum.extrairPrazo('Envie a proposta até as 14:30 do dia 28/11/2026.', base)!.toISOString()).toBe('2026-11-28T17:30:00.000Z')
    expect(comum.extrairPrazo('anexar até 28/11 às 10h', base)!.toISOString()).toBe('2026-11-28T13:00:00.000Z')
    expect(comum.extrairPrazo('no prazo de 2 (duas) horas', base)!.toISOString()).toBe('2026-11-27T15:00:00.000Z')
    expect(comum.extrairPrazo('em até 30 minutos', base)!.toISOString()).toBe('2026-11-27T13:30:00.000Z')
    expect(comum.extrairPrazo('até as 9h', base)!.toISOString()).toBe('2026-11-28T12:00:00.000Z')
    expect(comum.extrairPrazo('Bom dia a todos', base)).toBeNull()
  })

  it('reconhece a empresa do cliente pelo nome ou pelo CNPJ', () => {
    expect(comum.citaCliente('Convoco a ANA COMERCIO DE PAPEIS LTDA', empresas)).toBe(true)
    expect(comum.citaCliente('empresa 12.345.678/0001-90 convocada', empresas)).toBe(true)
    expect(comum.citaCliente('Convoco a Papelaria Ana', empresas)).toBe(true)
    expect(comum.citaCliente('Convoco a Beta Papéis LTDA', empresas)).toBe(false)
  })
})

describe('Compras.gov.br', () => {
  it('acha a compra no endereço e filtra só os serviços da sala', () => {
    expect(cg.chaveDaUrl(`${base}/comprasnet-disputa/api/v1/compras/${compra}/itens/em-disputa`)).toBe(compra)
    expect(cg.chaveDaUrl(`/topic/disputa/fornec/${compra}/123/`)).toBe(compra)
    expect(cg.interessa(`${base}/comprasnet-mensagem/api/v2/chat/${compra}/itens/1`)).toBe(true)
    expect(cg.interessa('https://sso.acesso.gov.br/login')).toBe(false)
    expect(cg.interessa('https://exemplo.com/comprasnet-disputa/api')).toBe(false)
    expect(cg.tituloDaChave(compra)).toBe('UASG 158419 · Pregão 90012/2026')
  })

  it('percebe o login pelo cabeçalho de autorização, sem ler o token', () => {
    expect(cg.indicaLogin(`${base}/comprasnet-disputa/api/v1/datahorabrasilia`, { Authorization: 'Bearer x' })).toBe(true)
    expect(cg.indicaLogin(`${base}/comprasnet-disputa/api/v1/datahorabrasilia`, {})).toBe(false)
  })

  it('transforma o chat em mensagens e convocações com prazo', () => {
    const corpo = JSON.stringify([
      { dataHora: '27/11/2026 13:05:00', remetente: 'Pregoeiro', mensagem: 'Srs. licitantes, bom dia.' },
      { dataHora: '27/11/2026 13:10:00', remetente: 'Pregoeiro', mensagem: 'Convoco a empresa ANA COMERCIO DE PAPEIS LTDA a enviar a proposta ajustada no prazo de 2 (duas) horas.' },
      { dataHora: '27/11/2026 13:11:00', remetente: 'Fornecedor', mensagem: 'Ok, obrigado' },
      { dataHora: '27/11/2026 13:20:00', remetente: 'Sistema', mensagem: 'A sessão foi suspensa pelo pregoeiro.' },
    ])
    const r = cg.lerResposta(`${base}/comprasnet-mensagem/api/v2/chat/${compra}/itens/1`, corpo, ctx())
    expect(r.chave).toBe(compra)
    expect(r.eventos.map((e: { tipo: string }) => e.tipo)).toEqual(['mensagem', 'convocacao', 'situacao'])
    const conv = r.eventos[1]
    expect(conv.item).toBe('1')
    expect(conv.autor).toBe('Pregoeiro')
    expect(conv.cita_cliente).toBe(true)
    expect(conv.prazo).toBe('2026-11-27T18:10:00.000Z')
    // A mesma resposta de novo gera as mesmas impressões (o banco ignora repetidos).
    const r2 = cg.lerResposta(`${base}/comprasnet-mensagem/api/v2/chat/${compra}/itens/1`, corpo, ctx())
    expect(r2.eventos.map((e: { impressao: string }) => e.impressao)).toEqual(r.eventos.map((e: { impressao: string }) => e.impressao))
  })

  it('gera eventos só quando o item muda de fase, de melhor lance ou de posição', () => {
    const c = ctx()
    const url = `${base}/comprasnet-disputa/api/v1/compras/${compra}/itens/em-disputa`
    const um = cg.lerResposta(url, [{ numero: 1, faseItem: { descricao: 'Em disputa aberta' }, melhorValor: 10.5, posicao: 2 }], c)
    expect(um.eventos.map((e: { tipo: string }) => e.tipo)).toEqual(['fase', 'lance', 'posicao'])
    expect(cg.lerResposta(url, [{ numero: 1, faseItem: { descricao: 'Em disputa aberta' }, melhorValor: 10.5, posicao: 2 }], c).eventos).toHaveLength(0)
    const tres = cg.lerResposta(url, [{ numero: 1, faseItem: { descricao: 'Em disputa aberta' }, melhorValor: '10,2', posicao: 1 }], c)
    expect(tres.eventos.map((e: { tipo: string }) => e.tipo)).toEqual(['lance', 'posicao'])
    expect(tres.eventos[1].cita_cliente).toBe(true)
    expect(tres.eventos[0].texto).toContain('R$')
  })

  it('lê quadros STOMP do WebSocket da página', () => {
    const quadro = `MESSAGE\ndestination:/topic/disputa/fornec/${compra}/999\ncontent-type:application/json\n\n${JSON.stringify({ numeroItem: 3, situacao: 'Encerramento aleatório' })}\u0000`
    const r = cg.lerQuadroWs(quadro, ctx())
    expect(r.chave).toBe(compra)
    expect(r.eventos[0]).toMatchObject({ tipo: 'fase', item: '3', texto: 'Item 3: Encerramento aleatório' })
    expect(cg.lerQuadroWs('CONNECTED\nversion:1.2\n\n\u0000', ctx()).eventos).toHaveLength(0)
  })

  it('ignora respostas que não são JSON', () => {
    expect(cg.lerResposta(`${base}/comprasnet-disputa/api/v1/x`, '<html>', ctx()).eventos).toHaveLength(0)
  })
})
