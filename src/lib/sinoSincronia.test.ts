import { describe, expect, it } from 'vitest'
import { caminhoDaNotificacao, itensDaTela, notificacoesDosItens } from './sinoSincronia'

const radar = { tipo: 'mensagem' as const, link: '/app/agentes/radar', id: 'r' }
const sentinela = { tipo: 'mensagem' as const, link: '/app/processos/123e4567-e89b-12d3-a456-426614174000', id: 's' }
const aviso = { tipo: 'aviso' as const, link: null, id: 'a' }
const geral = { tipo: 'mensagem' as const, link: '/app', id: 'g' }

describe('sincronia entre sino e barra do celular', () => {
  it('push aberto marca só os itens da tela dele', () => {
    expect(itensDaTela([radar, sentinela, aviso], '/app/agentes/radar')).toEqual([radar])
    expect(itensDaTela([radar, aviso], '/app/avisos')).toEqual([aviso])
    expect(itensDaTela([radar, geral], '/app/agentes/radar/')).toEqual([radar])
  })

  it('a tela inicial não marca nada', () => {
    expect(itensDaTela([geral, radar], '/app')).toEqual([])
  })

  it('lê o caminho da notificação, só do próprio site', () => {
    const o = 'https://licitaforce-app.vercel.app'
    expect(caminhoDaNotificacao('/app/agentes/radar', o)).toBe('/app/agentes/radar')
    expect(caminhoDaNotificacao(`${o}/app/avisos?de=push`, o)).toBe('/app/avisos')
    expect(caminhoDaNotificacao('https://outro.exemplo/app/avisos', o)).toBeNull()
    expect(caminhoDaNotificacao(undefined, o)).toBeNull()
  })

  it('marcar no sino fecha na barra só as notificações daquelas telas', () => {
    const o = 'https://licitaforce-app.vercel.app'
    const barra = [{ data: { url: '/app/agentes/radar' } }, { data: { url: '/app/avisos' } }, { data: { url: '/app' } }, { data: null }]
    expect(notificacoesDosItens(barra, [radar], o)).toEqual([barra[0]])
    expect(notificacoesDosItens(barra, [aviso, geral], o)).toEqual([barra[1]])
  })
})
