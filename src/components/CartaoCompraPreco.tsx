import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, ExternalLink, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui'
import { controleDaCompra } from '@/lib/compraFederal'
import { rotaPorControle } from '@/lib/analiseEmpresa'
import { identificacaoCompra, linkPesquisaMarca, type CompraPreco, type PropostaPreco } from '@/lib/precos'
import { SELO } from '@/components/ConcorrentesItem'
import { formatarData, formatarMoeda } from '@/lib/format'
import { UF_NOME } from '@/lib/mercado'
import { cn } from '@/lib/utils'

/** Todas as propostas do item, em ordem de colocação, com marca e situação (vindas do Compras.gov.br). */
function TodasPropostas({ propostas }: { propostas: PropostaPreco[] }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">Todas as propostas do item · {propostas.length}</p>
      <ol className="divide-y rounded-xl border">
        {propostas.map((p) => (
          <li key={p.cnpj} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
            <span className="w-8 shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{p.colocacao ? `${p.colocacao}º` : '–'}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <Link className="font-semibold text-sky-700 hover:underline dark:text-sky-300" to={`/app/analise-empresas/${p.cnpj}`}>{p.fornecedor ?? p.cnpj}</Link>
                <Badge cor={SELO[p.situacao].cor}>{SELO[p.situacao].texto}</Badge>
              </span>
              <span className="block text-xs text-muted-foreground">Marca: {p.marca ?? 'não informada'}{p.modelo && p.modelo !== p.marca ? ` · ${p.modelo}` : ''}{p.quantidade ? ` · Qtd. ofertada ${p.quantidade.toLocaleString('pt-BR')}` : ''}</span>
              {p.motivo && <span className="block text-xs text-muted-foreground">Motivo: {p.motivo.length > 200 ? `${p.motivo.slice(0, 197)}…` : p.motivo}</span>}
            </span>
            <span className="text-right">
              <span className="block font-bold tabular-nums">{p.preco ? formatarMoeda(p.preco) : '—'}</span>
              {p.precoInicial && p.preco && p.precoInicial !== p.preco && <span className="block text-[11px] text-muted-foreground">inicial {formatarMoeda(p.precoInicial)}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Uma compra do histórico de preços, no formato: órgão · modalidade, "Item N — descrição", objeto e dados do item. */
export default function CartaoCompraPreco({ compra: c }: { compra: CompraPreco }) {
  const navigate = useNavigate()
  const [aberto, setAberto] = useState(false)
  const [abrindo, setAbrindo] = useState(false)
  const idValido = /^\d{15,20}$/.test(c.idCompra)

  async function abrirEdital() {
    if (!idValido || abrindo) return
    setAbrindo(true)
    try {
      const rota = rotaPorControle(await controleDaCompra(c.idCompra))
      if (rota) navigate(rota)
      else navigate(`/app/compras/${c.idCompra}`)
    } catch {
      toast.info('Edital não encontrado no PNCP. Abrindo os itens, empresas e marcas desta compra.')
      navigate(`/app/compras/${c.idCompra}`)
    } finally { setAbrindo(false) }
  }

  const titulo = `Item ${c.numeroItem ?? '—'} — ${c.descricao || 'Sem descrição'}`
  return (
    <article className="lf-cartao rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <button type="button" onClick={abrirEdital} disabled={!idValido} className="inline-flex items-center gap-1 text-left uppercase hover:text-sky-600 hover:underline disabled:no-underline dark:hover:text-sky-300" title="Abrir o edital desta compra">
          {abrindo && <Loader2 className="h-3 w-3 animate-spin" />}
          {c.orgao ?? 'Órgão não informado'}
        </button>
        <span>·</span>
        <span>{identificacaoCompra(c.idCompra, c.modalidade)}</span>
        {c.uf && <span className="rounded-full bg-muted px-2 py-0.5 normal-case tracking-normal text-foreground">{UF_NOME[c.uf] ?? c.uf}</span>}
      </div>

      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="mt-2 flex w-full items-start justify-between gap-3 text-left">
        <span className="font-semibold text-sky-700 hover:underline dark:text-sky-300">{titulo}</span>
        <ChevronDown className={cn('mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>
      {c.objeto && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{c.objeto}</p>}
      {c.propostas?.length ? <button type="button" onClick={() => setAberto(true)} className="mt-2 inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">{c.propostas.length} propostas com marca e colocação</button> : null}

      <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-muted/60 p-3 text-sm sm:grid-cols-4">
        <div><dt className="text-[11px] font-semibold uppercase text-muted-foreground">Data</dt><dd className="mt-0.5 font-semibold">{formatarData(c.data ?? c.dataCompra)}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase text-muted-foreground">Quantidade</dt><dd className="mt-0.5 font-semibold">{c.quantidade?.toLocaleString('pt-BR') ?? '—'}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase text-muted-foreground">Unidade</dt><dd className="mt-0.5 font-semibold">{c.unidade}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase text-muted-foreground">Valor homologado (unit.)</dt><dd className="mt-0.5 font-bold text-emerald-600 dark:text-emerald-400">{formatarMoeda(c.preco)}</dd></div>
      </dl>

      {aberto && (
        <div className="mt-3 space-y-3 border-t pt-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase text-muted-foreground">Marca</span>
            {c.marca ? <>
              <Badge cor="azul">{c.marca}</Badge>
              <a href={linkPesquisaMarca(c.marca, c.descricao)} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold hover:bg-muted">
                <Search className="h-3.5 w-3.5" />Pesquisar marca no Google
              </a>
            </> : <span className="text-muted-foreground">Não informada pelo órgão</span>}
          </div>
          <p><span className="text-[11px] font-semibold uppercase text-muted-foreground">Vencedor </span>
            {c.fornecedor ? (c.cnpj && /^\d{14}$/.test(c.cnpj) ? <Link className="font-semibold text-sky-700 hover:underline dark:text-sky-300" to={`/app/analise-empresas/${c.cnpj}`}>{c.fornecedor}</Link> : c.fornecedor) : 'Não informado'}</p>
          {c.propostas?.length ? <TodasPropostas propostas={c.propostas} /> : null}
          {c.detalhe && <p className="whitespace-pre-wrap break-words text-muted-foreground">{c.detalhe}</p>}
          <p className="text-xs text-muted-foreground">{c.unidadeCompradora ?? ''}{c.municipio ? ` · ${c.municipio}` : ''}{c.uf ? `/${c.uf}` : ''}</p>
          {idValido && <div className="flex flex-wrap gap-2">
            <button type="button" onClick={abrirEdital} className="lf-degrade inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white hover:brightness-110"><ExternalLink className="h-4 w-4" />Acessar a oportunidade</button>
            <Link to={`/app/compras/${c.idCompra}`} className="inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold hover:bg-muted">Ver todos os itens, empresas e marcas</Link>
          </div>}
        </div>
      )}
    </article>
  )
}
