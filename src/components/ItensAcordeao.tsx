import { useState, type ReactNode } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { Input } from '@/components/ui'
import { agruparItens, identificacaoGrupo, tituloItem, valorItem } from '@/lib/itensEdital'
import { normalizar } from '@/lib/portais'
import { cn } from '@/lib/utils'
import type { ItemCompra } from '@/lib/filtrosOportunidades'

type Visao = 'item' | 'lote' | 'grupo'

function quantidade(i: ItemCompra) {
  return typeof i.quantidade === 'number' ? i.quantidade.toLocaleString('pt-BR') : '—'
}

function Item({ item, tipoPadrao, extra }: { item: ItemCompra; tipoPadrao?: string; extra?: (item: ItemCompra) => ReactNode }) {
  const [aberto, setAberto] = useState(false)
  const [completo, setCompleto] = useState(false)
  const descricao = (item.descricao ?? '').trim()
  const longa = descricao.length > 260
  const tipo = item.materialOuServicoNome ?? (item.materialOuServico === 'M' ? 'Material' : item.materialOuServico === 'S' ? 'Serviço' : tipoPadrao ?? null)
  return (
    <article className={cn('lf-cartao overflow-hidden rounded-2xl border bg-card transition-colors', aberto && 'border-primary/40')}>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold tabular-nums">{item.numeroItem}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{tituloItem(item.descricao)}</span>
          <span className="block text-xs text-muted-foreground">Qtd. {quantidade(item)} · {valorItem(item, true)}</span>
        </span>
        {item.orcamentoSigiloso && <span className="hidden rounded-full border border-amber-500/50 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-300 sm:inline">Sigiloso</span>}
        <ChevronDown className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <div className="border-t px-4 pb-4 pt-3">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Tipo', tipo ?? 'Não informado'],
              ['Quantidade', `${quantidade(item)} ${item.unidadeMedida ?? ''}`.trim()],
              ['Unitário (ref.)', valorItem(item)],
              ['Total (ref.)', valorItem(item, true)],
            ].map(([rotulo, valor]) => (
              <div key={rotulo}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
                <dd className="mt-1 font-semibold">{valor}</dd>
              </div>
            ))}
          </dl>
          <p className={cn('mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground', !completo && longa && 'line-clamp-4')}>{descricao || 'Descrição não informada pela fonte.'}</p>
          {longa && <button type="button" onClick={() => setCompleto((v) => !v)} className="mt-1 text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400">{completo ? 'Mostrar menos' : 'Ler descrição completa'}</button>}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {item.tipoBeneficioNome && <span className="rounded-full border px-2.5 py-1 font-semibold">{item.tipoBeneficioNome}</span>}
            {item.criterioJulgamentoNome && <span className="rounded-full border px-2.5 py-1 font-semibold">{item.criterioJulgamentoNome}</span>}
            {item.situacaoCompraItemNome && <span className="rounded-full border px-2.5 py-1 font-semibold">{item.situacaoCompraItemNome}</span>}
            {identificacaoGrupo(item, 'lote') && <span className="rounded-full border px-2.5 py-1 font-semibold">Lote {identificacaoGrupo(item, 'lote')}</span>}
            {identificacaoGrupo(item, 'grupo') && <span className="rounded-full border px-2.5 py-1 font-semibold">Grupo {identificacaoGrupo(item, 'grupo')}</span>}
          </div>
          {extra?.(item)}
        </div>
      )}
    </article>
  )
}

/** Itens do edital em lista que abre e fecha, com busca e agrupamento por lote ou grupo. */
/** tipoEdital: M ou S quando todos os itens do edital são do mesmo tipo. */
/** extra: conteúdo a mais dentro do item aberto (ex.: concorrentes do item). */
export default function ItensAcordeao({ itens, tipoEdital, extra }: { itens: ItemCompra[]; tipoEdital?: string; extra?: (item: ItemCompra) => ReactNode }) {
  const tipoPadrao = tipoEdital === 'M' ? 'Material' : tipoEdital === 'S' ? 'Serviço' : undefined
  const [busca, setBusca] = useState('')
  const temLote = itens.some((i) => identificacaoGrupo(i, 'lote'))
  const temGrupo = itens.some((i) => identificacaoGrupo(i, 'grupo'))
  const [visao, setVisao] = useState<Visao>(temLote ? 'lote' : temGrupo ? 'grupo' : 'item')
  const filtrados = itens.filter((i) => normalizar(`${i.numeroItem} ${i.descricao ?? ''}`).includes(normalizar(busca.trim())))
  const grupos = visao === 'item' ? new Map([['', filtrados]]) : agruparItens(filtrados, visao)
  const opcoes: [Visao, string, boolean][] = [['item', 'Por item', true], ['lote', 'Por lote', temLote], ['grupo', 'Por grupo', temGrupo]]
  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Pesquisar itens" className="pl-9" placeholder="Pesquisar itens: ex. capacete, ar-condicionado" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {(temLote || temGrupo) && (
          <div className="flex gap-1.5" role="group" aria-label="Agrupar itens">
            {opcoes.filter(([, , ok]) => ok).map(([id, rotulo]) => (
              <button key={id} type="button" onClick={() => setVisao(id)} aria-pressed={visao === id}
                className={cn('h-9 rounded-full border px-3.5 text-sm font-medium', visao === id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}>{rotulo}</button>
            ))}
          </div>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{itens.length} {itens.length === 1 ? 'item publicado' : 'itens publicados'}{busca && ` · ${filtrados.length} exibidos`}</p>
      {filtrados.length === 0 && <p className="py-6 text-sm text-muted-foreground">{itens.length ? 'Nenhum item corresponde à pesquisa.' : 'A fonte não disponibilizou itens para este edital.'}</p>}
      <div className="space-y-5">
        {[...grupos].map(([nome, lista]) => (
          <section key={nome || 'itens'}>
            {nome && (
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-sky-700 dark:text-sky-300">{nome}</span>
                <span className="text-muted-foreground">{lista.length} {lista.length === 1 ? 'item' : 'itens'}</span>
              </h3>
            )}
            <div className="space-y-2">{lista.map((i) => <Item key={i.numeroItem} item={i} tipoPadrao={tipoPadrao} extra={extra} />)}</div>
          </section>
        ))}
      </div>
    </div>
  )
}
