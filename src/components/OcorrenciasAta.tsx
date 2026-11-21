import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui'
import { NOME_TIPO, type OcorrenciaAta } from '@/lib/atas'
import { rotaPorControle } from '@/lib/analiseEmpresa'
import { formatarCnpj } from '@/lib/format'

const COR = { desclassificacao: 'vermelho', inabilitacao: 'amarelo', recusa: 'neutro' } as const

/** Lista de desclassificações/inabilitações lidas nas atas, com o trecho da ata como motivo. */
export function ListaOcorrencias({ ocorrencias, mostrarCompra = false }: { ocorrencias: OcorrenciaAta[]; mostrarCompra?: boolean }) {
  const [filtro, setFiltro] = useState<'todas' | OcorrenciaAta['tipo']>('todas')
  const contagem = { desclassificacao: 0, inabilitacao: 0, recusa: 0 }
  for (const o of ocorrencias) contagem[o.tipo]++
  const visiveis = filtro === 'todas' ? ocorrencias : ocorrencias.filter((o) => o.tipo === filtro)
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
        {(['todas', 'desclassificacao', 'inabilitacao', 'recusa'] as const).filter((t) => t === 'todas' || contagem[t]).map((t) => (
          <button key={t} type="button" onClick={() => setFiltro(t)} aria-pressed={filtro === t}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filtro === t ? 'border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'todas' ? `Todas (${ocorrencias.length})` : `${NOME_TIPO[t]} (${contagem[t]})`}
          </button>
        ))}
      </div>
      <ul className="divide-y">
        {visiveis.map((o, i) => {
          const rota = o.controle ? rotaPorControle(o.controle) : null
          return (
            <li key={`${o.url}-${i}`} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge cor={COR[o.tipo]}>{NOME_TIPO[o.tipo]}</Badge>
                <span className="font-semibold">{o.empresa ?? 'Empresa não identificada no trecho'}</span>
                {o.cnpj && <span className="text-xs text-muted-foreground">CNPJ {formatarCnpj(o.cnpj)}</span>}
                {o.itens && <Badge>{o.itens}</Badge>}
                {o.data && <span className="text-xs text-muted-foreground">{o.data}</span>}
              </div>
              <p className="mt-1.5 break-words text-muted-foreground">“{o.motivo}”</p>
              <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">Abrir ata ({o.documento}) <ExternalLink className="h-3 w-3" /></a>
                {mostrarCompra && o.controle && (rota ? <Link to={rota} className="font-semibold text-sky-700 hover:underline dark:text-sky-300">Compra {o.controle}</Link> : <span>Compra {o.controle}</span>)}
              </p>
            </li>
          )
        })}
      </ul>
    </>
  )
}
