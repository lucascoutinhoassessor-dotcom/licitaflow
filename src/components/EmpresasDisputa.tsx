import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { Badge, Card, Carregando } from '@/components/ui'
import { ListaOcorrencias } from '@/components/OcorrenciasAta'
import { atasDaCompra } from '@/lib/atas'
import { formatarCnpj, formatarMoeda } from '@/lib/format'

export interface Vencedora { cnpj: string; nome: string | null; itens: number; valor: number }

/**
 * Todas as empresas de uma compra: as vencedoras (dados oficiais, quando houver) e as demais que aparecem
 * nas atas publicadas no PNCP. Os dados abertos só trazem quem venceu; a lista de licitantes vem da ata.
 * Cada empresa leva à análise dela.
 */
export default function EmpresasDisputa({ controle, vencedoras = [] }: { controle: string | null; vencedoras?: Vencedora[] }) {
  const valido = controle && /^\d{14}-1-\d+\/\d{4}$/.test(controle) ? controle : null
  const q = useQuery({ queryKey: ['atas-compra', valido], enabled: !!valido, staleTime: 3_600_000, retry: 1, queryFn: ({ signal }) => atasDaCompra(valido!, signal) })
  const jaVenceu = new Set(vencedoras.map((v) => v.cnpj))
  const linhas = [
    ...[...vencedoras].sort((a, b) => b.valor - a.valor),
    ...(q.data?.participantes ?? []).filter((p) => !jaVenceu.has(p.cnpj)).map((p) => ({ cnpj: p.cnpj, nome: p.nome, itens: 0, valor: 0 })),
  ]
  const lidos = q.data?.documentos.filter((d) => d.lido) ?? []
  return (
    <Card className="mb-5 p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-sky-400" />Empresas que disputaram</h2>
      <p className="mb-3 text-xs text-muted-foreground">Toque em uma empresa para abrir a análise dela.</p>
      {linhas.length > 0 && (
        <ul className="divide-y">
          {linhas.map((l) => (
            <li key={l.cnpj} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <Link to={`/app/analise-empresas/${l.cnpj}`} className="font-semibold text-sky-700 hover:underline dark:text-sky-300">{l.nome ?? `CNPJ ${formatarCnpj(l.cnpj)}`}</Link>
                <span className="block text-xs text-muted-foreground">CNPJ {formatarCnpj(l.cnpj)}</span>
              </span>
              {l.itens > 0
                ? <><Badge cor="verde">Venceu {l.itens} {l.itens === 1 ? 'item' : 'itens'}</Badge>{l.valor > 0 && <span className="font-semibold tabular-nums">{formatarMoeda(l.valor)}</span>}</>
                : <Badge>Citada na ata</Badge>}
            </li>
          ))}
        </ul>
      )}
      {!valido ? (linhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma empresa identificada.</p>)
        : q.isLoading ? <div className="mt-3"><Carregando texto="Procurando os participantes nas atas do PNCP…" /></div>
        : q.isError ? <p className="mt-3 text-sm">{(q.error as Error).message} <button className="font-semibold text-primary underline" onClick={() => q.refetch()}>Tentar novamente</button></p>
        : lidos.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">{linhas.length ? 'Só aparecem as vencedoras: esta' : 'Esta'} compra não tem ata da sessão em PDF com texto no PNCP. A lista completa de licitantes fica na página da disputa, no portal de compras.</p>
        : <>
          {linhas.length === 0 && <p className="text-sm text-muted-foreground">A ata foi lida, mas não traz o CNPJ das empresas (alguns portais mostram só "Licitante 01, 02…").</p>}
          <p className="mt-3 text-xs text-muted-foreground">Empresas lidas em: {lidos.map((d, i) => <span key={d.url}>{i > 0 && ', '}<a href={d.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{d.titulo}</a></span>)}. A leitura é automática: confira na ata original.</p>
          {!!q.data?.ocorrencias.length && <div className="mt-4"><h3 className="mb-2 text-sm font-semibold">Desclassificações e inabilitações</h3><ListaOcorrencias ocorrencias={q.data.ocorrencias} /></div>}
        </>}
    </Card>
  )
}
