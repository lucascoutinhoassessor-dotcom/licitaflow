import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { enviarPropostas, type AtaEnviada, type PropostasColetadas } from './atas'

/** Pacote da extensão (gerado de extensao/ por scripts/empacotar-extensao.mjs). */
export const PACOTE_EXTENSAO = '/licitaforce-extensao.zip'

export type EstadoBusca =
  | { fase: 'sem-extensao' }
  | { fase: 'pronta' }
  | { fase: 'fila'; posicao: number }
  | { fase: 'buscando'; feitos: number; total: number }
  | { fase: 'ajuda'; mensagem: string }
  | { fase: 'gravando' }
  | { fase: 'concluida'; itens: number; faltaram: number }
  | { fase: 'erro'; mensagem: string }

interface MsgExtensao {
  origem: 'lf-extensao'; tipo: string; idCompra?: string; feitos?: number; total?: number; posicao?: number
  mensagem?: string; itens?: PropostasColetadas['itens']; faltaram?: number
}

const paraExtensao = (dados: Record<string, unknown>) => window.postMessage({ origem: 'licitaforce', ...dados }, window.location.origin)

/**
 * Busca, pela extensão do LicitaForce, todas as propostas de uma compra no Compras.gov.br (no navegador da pessoa)
 * e grava na compra, para todos os usuários e para o histórico de preços.
 * automatico: começa sozinho quando a extensão está instalada (usado quando a compra ainda não tem propostas guardadas).
 */
export function useBuscaPropostas(idCompra: string | null, itens: number[], automatico: boolean) {
  const qc = useQueryClient()
  const [estado, setEstado] = useState<EstadoBusca>({ fase: 'sem-extensao' })
  const pedido = useRef<string | null>(null)
  const listaItens = useRef(itens)
  listaItens.current = itens

  const buscar = useCallback(() => {
    if (!idCompra || !listaItens.current.length) return
    pedido.current = idCompra
    setEstado({ fase: 'buscando', feitos: 0, total: listaItens.current.length })
    paraExtensao({ tipo: 'buscar-propostas', idCompra, itens: listaItens.current })
  }, [idCompra])

  useEffect(() => {
    const ouvir = async (e: MessageEvent<MsgExtensao>) => {
      if (e.source !== window || e.origin !== window.location.origin || e.data?.origem !== 'lf-extensao') return
      const m = e.data
      if (m.tipo === 'pronta') { setEstado((s) => (s.fase === 'sem-extensao' ? { fase: 'pronta' } : s)); return }
      if (!idCompra || m.idCompra !== idCompra) return
      if (m.tipo === 'fila') setEstado({ fase: 'fila', posicao: m.posicao ?? 1 })
      if (m.tipo === 'progresso') setEstado({ fase: 'buscando', feitos: m.feitos ?? 0, total: m.total ?? 0 })
      if (m.tipo === 'ajuda') setEstado({ fase: 'ajuda', mensagem: m.mensagem ?? '' })
      if ((m.tipo === 'concluido' || m.tipo === 'erro') && m.itens?.length) {
        setEstado({ fase: 'gravando' })
        try {
          const r = await enviarPropostas({ v: 1, idCompra, itens: m.itens })
          qc.setQueryData<AtaEnviada[]>(['atas-enviadas', idCompra], (atual = []) => [r, ...atual.filter((a) => a.hash !== r.hash)])
          // O histórico de preços passa a trazer as propostas na próxima consulta.
          qc.invalidateQueries({ queryKey: ['precos'] })
          setEstado({ fase: 'concluida', itens: m.itens.length, faltaram: m.faltaram ?? 0 })
        } catch (err) {
          setEstado({ fase: 'erro', mensagem: (err as Error).message })
        }
      } else if (m.tipo === 'erro') setEstado({ fase: 'erro', mensagem: m.mensagem ?? 'A busca não terminou.' })
    }
    window.addEventListener('message', ouvir)
    paraExtensao({ tipo: 'ping' })
    return () => window.removeEventListener('message', ouvir)
  }, [idCompra, qc])

  // Começa sozinho uma vez por compra, quando a extensão responde e a compra ainda não tem as propostas.
  useEffect(() => {
    if (automatico && estado.fase === 'pronta' && idCompra && itens.length && pedido.current !== idCompra) buscar()
  }, [automatico, estado.fase, idCompra, itens.length, buscar])

  return { estado, buscar }
}
