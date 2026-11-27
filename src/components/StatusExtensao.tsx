import { useState } from 'react'
import { Download, Loader2, Puzzle } from 'lucide-react'
import { Button } from '@/components/ui'
import { PACOTE_EXTENSAO, useBuscaPropostas } from '@/lib/extensao'

/**
 * Faixa da extensão dentro da "Disputa completa": com a extensão instalada, busca sozinha as propostas
 * da compra (quando ainda não há nenhuma guardada) e grava para o histórico de preços; sem ela, mostra como instalar.
 * guardados: itens da compra com propostas já guardadas; null enquanto carrega (a busca automática espera).
 */
export function StatusExtensao({ idCompra, itens, guardados: carregados }: { idCompra: string; itens: number[]; guardados: number | null }) {
  const { estado, buscar } = useBuscaPropostas(idCompra, itens, carregados === 0)
  const guardados = carregados ?? 0
  const [comoInstalar, setComoInstalar] = useState(false)

  if (estado.fase === 'sem-extensao') {
    return (
      <div className="border-b bg-muted/40 px-4 py-3 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <Puzzle className="h-4 w-4 text-sky-400" />
          <span className="min-w-0 flex-1">{guardados ? `${guardados} itens desta compra já estão no histórico de preços. ` : ''}Com a extensão do LicitaForce, estas propostas vão sozinhas para o histórico de preços.</span>
          <button type="button" onClick={() => setComoInstalar((v) => !v)} className="font-semibold text-sky-700 underline dark:text-sky-300">{comoInstalar ? 'Fechar' : 'Como instalar'}</button>
        </p>
        {comoInstalar && (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li><a href={PACOTE_EXTENSAO} download className="inline-flex items-center gap-1 font-semibold text-sky-700 underline dark:text-sky-300"><Download className="h-3 w-3" />Baixe a extensão</a> e descompacte o arquivo numa pasta.</li>
            <li>No Chrome ou no Edge, abra <b>chrome://extensions</b> (no Edge, <b>edge://extensions</b>) e ligue o <b>Modo do desenvolvedor</b>.</li>
            <li>Clique em <b>Carregar sem compactação</b> e escolha a pasta descompactada.</li>
            <li>Volte a esta página e recarregue. A busca começa sozinha.</li>
          </ol>
        )}
      </div>
    )
  }

  const ocupado = estado.fase === 'fila' || estado.fase === 'buscando' || estado.fase === 'gravando'
  const texto = estado.fase === 'fila' ? `Na fila da extensão (posição ${estado.posicao}).`
    : estado.fase === 'buscando' ? `Buscando as propostas no Compras.gov.br: ${estado.feitos} de ${estado.total} itens…`
    : estado.fase === 'gravando' ? 'Guardando as propostas…'
    : estado.fase === 'concluida' ? `Pronto: propostas de ${estado.itens} ${estado.itens === 1 ? 'item guardadas' : 'itens guardadas'}. Já aparecem no histórico de preços e nos itens abaixo.${estado.faltaram ? ` ${estado.faltaram} sem resposta do portal.` : ''}`
    : estado.fase === 'ajuda' || estado.fase === 'erro' ? estado.mensagem
    : guardados ? `${guardados} itens desta compra já estão no histórico de preços.` : 'Extensão pronta.'
  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm">
      {ocupado && <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />}
      <p className={estado.fase === 'erro' ? 'min-w-0 flex-1 text-red-600 dark:text-red-400' : 'min-w-0 flex-1'} role="status">{texto}</p>
      <Button tamanho="sm" variante="contorno" disabled={ocupado || !itens.length} onClick={buscar}>{guardados ? 'Atualizar propostas' : 'Buscar propostas'}</Button>
    </div>
  )
}
