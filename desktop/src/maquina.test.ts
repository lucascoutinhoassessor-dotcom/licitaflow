import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import maq from './maquina.cjs'
import estr from './estrategias.cjs'
import cg from './conectores/comprasgov.cjs'

const CHAVE = '15841905900122026'
const API = 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-disputa/api'

function montar({ simulacao = true, resposta = { ok: true, status: 201, mensagem: '' } as { ok: boolean; status: number; mensagem: string } } = {}) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pav-'))
  const estrategias = estr.criarEstrategias(pasta)
  estrategias.definirSimulacao(simulacao)
  const registros: Record<string, unknown>[] = []
  const avisos: string[] = []
  let relogio = 1_000_000
  const executar = vi.fn(async () => resposta)
  const m = maq.criarMaquina({
    estrategias, executar, registrar: (r: Record<string, unknown>) => registros.push(r), notificar: (t: string) => avisos.push(t),
    tituloDe: () => 'Pregão 90012/2026', agora: () => relogio,
  })
  const ctx = { estado: new Map(), apis: new Map(), empresas: [], agora: new Date() }
  cg.lerResposta(`${API}/v1/compras/${CHAVE}/itens/em-disputa`, [{ numero: 1, faseItem: 'AB', situacao: 'Em disputa aberta', melhorValor: 10, valorMeuLance: 12, posicao: 3 }], ctx)
  return { m, ctx, estrategias, registros, avisos, executar, passar: (ms: number) => { relogio += ms } }
}

describe('ciclo da máquina de lances', () => {
  it('item parado não faz nada', async () => {
    const t = montar()
    const r = t.m.avaliar('comprasgov', cg, t.ctx)
    expect(r.envios).toHaveLength(0)
    expect(t.registros).toHaveLength(0)
  })

  it('em simulação mostra o lance e não chama o portal; respeita o intervalo', async () => {
    const t = montar()
    t.estrategias.mudar('comprasgov', CHAVE, '1', { ligado: true, minimo: 8, desconto: 0.5 })
    await Promise.all(t.m.avaliar('comprasgov', cg, t.ctx).envios)
    expect(t.executar).not.toHaveBeenCalled()
    expect(t.registros[0]).toMatchObject({ enviado: false, valor: 9.5 })
    expect(String(t.registros[0].texto)).toContain('Simulação')
    expect(t.m.avaliar('comprasgov', cg, t.ctx).envios).toHaveLength(0)
    t.passar(21_000)
    expect(t.m.avaliar('comprasgov', cg, t.ctx).envios).toHaveLength(1)
  })

  it('de verdade, envia pela página com o endereço e a fase vistos', async () => {
    const t = montar({ simulacao: false })
    t.estrategias.mudar('comprasgov', CHAVE, '1', { ligado: true, minimo: 8, desconto: 0.5 })
    await Promise.all(t.m.avaliar('comprasgov', cg, t.ctx).envios)
    expect(t.executar).toHaveBeenCalledTimes(1)
    const codigo = String((t.executar.mock.calls[0] as unknown[])[1])
    expect(codigo).toContain(`${API}/v1/compras/${CHAVE}/itens/1/lances`)
    expect(codigo).toContain('\\"faseItem\\":\\"AB\\"')
    expect(t.registros[0]).toMatchObject({ enviado: true, valor: 9.5 })
  })

  it('três recusas seguidas desligam o item e avisam', async () => {
    const t = montar({ simulacao: false, resposta: { ok: false, status: 422, mensagem: 'Lance inferior à variação mínima' } })
    t.estrategias.mudar('comprasgov', CHAVE, '1', { ligado: true, minimo: 8, desconto: 0.5 })
    for (let i = 0; i < 3; i++) { await Promise.all(t.m.avaliar('comprasgov', cg, t.ctx).envios); t.passar(21_000) }
    expect(t.registros.filter((r) => r.recusado)).toHaveLength(3)
    expect(String(t.registros[0].texto)).toContain('variação mínima')
    expect(t.estrategias.de('comprasgov', CHAVE, '1').ligado).toBe(false)
    expect(t.avisos).toContain('Máquina de lances parou um item')
    expect(t.m.avaliar('comprasgov', cg, t.ctx).envios).toHaveLength(0)
  })

  it('avisa uma vez quando chega ao mínimo e não envia', async () => {
    const t = montar({ simulacao: false })
    t.estrategias.mudar('comprasgov', CHAVE, '1', { ligado: true, minimo: 11, desconto: 0.5 })
    t.m.avaliar('comprasgov', cg, t.ctx); t.m.avaliar('comprasgov', cg, t.ctx)
    expect(t.executar).not.toHaveBeenCalled()
    expect(t.avisos.filter((a) => a === 'Lance mínimo alcançado')).toHaveLength(1)
  })

  it('parar tudo desliga os itens na hora', () => {
    const t = montar()
    t.estrategias.mudar('comprasgov', CHAVE, '1', { ligado: true, minimo: 8, desconto: 0.5 })
    t.estrategias.pararTudo()
    expect(t.m.avaliar('comprasgov', cg, t.ctx).envios).toHaveLength(0)
  })
})
