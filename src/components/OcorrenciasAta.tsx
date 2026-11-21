import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, FileSearch, XCircle } from 'lucide-react'
import { Badge, Button, Card, Carregando } from '@/components/ui'
import { atasDaCompra, NOME_TIPO, type OcorrenciaAta } from '@/lib/atas'
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

/** Seção da página do edital: lê, sob demanda, as atas publicadas no PNCP. */
export default function DesclassificacoesCompra({ controle }: { controle: string }) {
  const [ativo, setAtivo] = useState(false)
  const q = useQuery({ queryKey: ['atas', controle], enabled: ativo, staleTime: 3_600_000, retry: 1, queryFn: ({ signal }) => atasDaCompra(controle, signal) })
  return (
    <Card className="mb-5 p-5">
      <h2 className="mb-2 flex items-center gap-2 font-semibold"><XCircle className="h-4 w-4 text-rose-400" />Desclassificações, inabilitações e motivos</h2>
      {!ativo ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-muted-foreground">O LicitaFlow abre as atas da sessão publicadas no PNCP e separa quem foi desclassificado ou inabilitado, e por quê.</p>
          <Button variante="contorno" tamanho="sm" onClick={() => setAtivo(true)}><FileSearch className="h-4 w-4" />Ler atas</Button>
        </div>
      ) : q.isLoading ? <Carregando texto="Abrindo as atas no PNCP…" /> : q.isError ? (
        <p className="text-sm">{(q.error as Error).message} <button className="font-semibold text-primary underline" onClick={() => q.refetch()}>Tentar novamente</button></p>
      ) : q.data && (
        <>
          {q.data.documentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não há ata da sessão publicada no PNCP para esta compra. As compras do Compras.gov.br (governo federal) normalmente não publicam a ata no PNCP.</p>
          ) : (
            <>
              <ul className="mb-3 flex flex-wrap gap-2 text-xs">
                {q.data.documentos.map((d) => (
                  <li key={d.url}><a href={d.url} target="_blank" rel="noopener noreferrer" title={d.aviso} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 hover:bg-muted">
                    <FileSearch className="h-3 w-3" />{d.titulo}{d.lido ? ` · ${d.paginas} pág.` : ` · ${d.aviso}`}
                  </a></li>
                ))}
              </ul>
              {q.data.ocorrencias.length === 0
                ? <p className="text-sm text-muted-foreground">{q.data.documentos.some((d) => d.lido) ? 'Nenhuma desclassificação ou inabilitação encontrada nas atas.' : 'Não foi possível ler o texto das atas (podem ser imagens escaneadas). Abra o arquivo para conferir.'}</p>
                : <ListaOcorrencias ocorrencias={q.data.ocorrencias} />}
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Leitura automática do texto das atas: confira o trecho na ata original antes de usar em recurso.</p>
        </>
      )}
    </Card>
  )
}
