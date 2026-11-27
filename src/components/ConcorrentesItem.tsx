import { StatusExtensao } from '@/components/StatusExtensao'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, ListChecks, Trophy } from 'lucide-react'
import { Badge, Card } from '@/components/ui'
import { formatarCnpj, formatarMoeda } from '@/lib/format'
import type { ItemCompraFederal } from '@/lib/compraFederal'
import { concorrentesDoItem, type Concorrente, type SituacaoConcorrente } from '@/lib/concorrentesItem'
import type { ItemCompra } from '@/lib/filtrosOportunidades'
import type { ColocacaoItem } from '@/lib/resultadosEdital'
import type { AtasCompra } from '@/lib/atas'
import { cn } from '@/lib/utils'

export const SELO: Record<SituacaoConcorrente, { texto: string; cor: 'verde' | 'azul' | 'vermelho' | 'amarelo' | 'neutro' }> = {
  vencedora: { texto: 'Vencedora', cor: 'verde' }, classificada: { texto: 'Classificada', cor: 'azul' },
  desclassificacao: { texto: 'Desclassificada', cor: 'vermelho' }, inabilitacao: { texto: 'Inabilitada', cor: 'amarelo' },
  recusa: { texto: 'Proposta recusada', cor: 'vermelho' }, cancelado: { texto: 'Resultado cancelado', cor: 'neutro' },
  sem_proposta: { texto: 'Não enviou proposta', cor: 'neutro' }, participou: { texto: 'Participou', cor: 'neutro' },
}

const ORIGEM_FONTE: Record<Concorrente['fonte'], string> = { oficial: '', ata: ' · lido na ata', portal: ' · proposta no Compras.gov.br' }

export function LinhaConcorrente({ c }: { c: Concorrente }) {
  const selo = SELO[c.situacao]
  return (
    <li className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border p-3', ['desclassificacao', 'inabilitacao', 'recusa', 'cancelado', 'sem_proposta'].includes(c.situacao) && 'border-dashed')}>
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', c.situacao === 'vencedora' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-muted text-muted-foreground')} title={c.colocacao ? `${c.colocacao}º colocado` : 'Colocação não publicada'}>{c.colocacao ? `${c.colocacao}º` : '–'}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          {c.cnpj && /^\d{14}$/.test(c.cnpj) ? <Link className="font-semibold text-sky-700 hover:underline dark:text-sky-300" to={`/app/analise-empresas/${c.cnpj}`}>{c.nome ?? `CNPJ ${formatarCnpj(c.cnpj)}`}</Link> : <span className="font-semibold">{c.nome}</span>}
          <Badge cor={selo.cor}>{selo.texto}</Badge>
        </span>
        <span className="block text-xs text-muted-foreground">{c.cnpj ? `CNPJ ${formatarCnpj(c.cnpj)}` : 'CNPJ não informado na ata'}{c.porte ? ` · ${c.porte}` : ''}{c.meEpp ? ' · benefício ME/EPP' : ''}{c.marca ? ` · Marca: ${c.marca}` : ''}{c.quantidade ? ` · Qtd. ofertada ${c.quantidade.toLocaleString('pt-BR')}` : ''}{ORIGEM_FONTE[c.fonte]}</span>
        {c.motivo && <span className="mt-1 block text-xs text-muted-foreground">{c.situacao === 'cancelado' ? 'Motivo do cancelamento: ' : 'Motivo: '}{c.motivo.length > 220 ? `${c.motivo.slice(0, 217)}…` : c.motivo}</span>}
      </span>
      {(c.valorUnitario || c.valorTotal) && (
        <span className="text-right">
          <span className="block font-bold tabular-nums">{c.valorUnitario ? formatarMoeda(c.valorUnitario) : '—'}</span>
          <span className="block text-xs text-muted-foreground">total {c.valorTotal ? formatarMoeda(c.valorTotal) : '—'}</span>
          {c.valorInicial && c.valorUnitario && c.valorInicial !== c.valorUnitario && <span className="block text-[11px] text-muted-foreground">proposta inicial {formatarMoeda(c.valorInicial)}</span>}
        </span>
      )}
    </li>
  )
}

const PORTAL = 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra'
const EVENTO_ITEM = 'lf-disputa-item'

/** Leva a seção "Disputa completa" até o item pedido (os botões ficam dentro de cada item da lista). */
export function verDisputaDoItem(numero: number) {
  window.dispatchEvent(new CustomEvent(EVENTO_ITEM, { detail: numero }))
  document.getElementById('disputa-completa')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function BotaoDisputaItem({ numero }: { numero: number }) {
  return (
    <button type="button" onClick={() => verDisputaDoItem(numero)} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
      <ListChecks className="h-3.5 w-3.5" />Ver todas as propostas deste item (marcas, colocações e situação)
    </button>
  )
}

/**
 * A própria página de acompanhamento do Compras.gov.br, embutida: todas as propostas de cada item
 * (colocação, valores, marca, modelo, quantidade, desclassificadas e inabilitadas com motivo).
 * Carrega no navegador do usuário, com a verificação invisível do portal; o LicitaForce não lê o conteúdo.
 */
export function DisputaComprasGov({ idCompra, itens = [], guardados = null, className }: { idCompra: string; itens?: number[]; guardados?: number | null; className?: string }) {
  const [item, setItem] = useState<number | null>(null)
  useEffect(() => {
    const ouvir = (e: Event) => setItem(Number((e as CustomEvent<number>).detail) || null)
    window.addEventListener(EVENTO_ITEM, ouvir)
    return () => window.removeEventListener(EVENTO_ITEM, ouvir)
  }, [])
  const endereco = `${PORTAL}${item ? `/item/${item}` : ''}?compra=${encodeURIComponent(idCompra)}`
  return (
    <Card id="disputa-completa" className={cn('scroll-mt-20 overflow-hidden', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b p-4">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-semibold"><ListChecks className="h-4 w-4 text-emerald-400" />Disputa completa no Compras.gov.br</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Todas as empresas de cada item: colocação, valor ofertado e negociado, marca, modelo, quantidade e se foi vencedora, desclassificada ou inabilitada (com o motivo). Clique numa empresa para abrir a proposta.</span>
        </span>
        {itens.length > 0 && (
          <select aria-label="Item da disputa" value={item ?? ''} onChange={(e) => setItem(Number(e.target.value) || null)} className="h-9 rounded-full border bg-card px-3 text-sm">
            <option value="">Todos os itens</option>
            {itens.map((n) => <option key={n} value={n}>Item {n}</option>)}
          </select>
        )}
        <a href={endereco} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold hover:bg-muted"><ExternalLink className="h-4 w-4" />Abrir no portal</a>
      </div>
      <StatusExtensao idCompra={idCompra} itens={itens} guardados={guardados} />
      <iframe key={endereco} src={endereco} title="Disputa completa no Compras.gov.br" loading="lazy" referrerPolicy="no-referrer" className="block h-[80vh] min-h-[520px] w-full bg-white" />
    </Card>
  )
}

/** Item do edital (PNCP) no formato que concorrentesDoItem usa, com as colocações homologadas dele. */
export function itemParaConcorrentes(item: ItemCompra, colocacoes: ColocacaoItem[] = []): ItemCompraFederal {
  const grupo = Number(item.numeroGrupo ?? item.grupo)
  return {
    numero: item.numeroItem, descricao: item.descricao ?? '', resumo: null, tipo: null, quantidade: null, unidade: null, valorEstimado: null,
    sigiloso: false, situacao: null, criterio: null, beneficio: null, grupo: Number.isInteger(grupo) && grupo > 0 ? grupo : null, marca: null,
    resultados: colocacoes.filter((c) => c.item === item.numeroItem).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99)).map((c) => ({
      fornecedor: c.nome, cnpj: c.cnpj, porte: null, quantidade: null, valorUnitario: c.valorUnitario, valorTotal: c.valorTotal, ordem: c.ordem, meEpp: false, desconto: null, situacao: null,
    })),
  }
}

/** Concorrentes de um item da página do edital: homologadas, propostas do Compras.gov.br e leitura das atas. */
export function ConcorrentesEdital({ item, todos, colocacoes, atas, comDisputa = false }: { item: ItemCompra; todos: ItemCompra[]; colocacoes?: ColocacaoItem[]; atas?: AtasCompra; comDisputa?: boolean }) {
  const { lista } = concorrentesDoItem(itemParaConcorrentes(item, colocacoes), todos.map((i) => itemParaConcorrentes(i)), atas)
  if (!lista.length && !comDisputa) return null
  return (
    <div className="mt-4 text-sm">
      <h4 className="mb-2 flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-amber-400" />Concorrentes do item<span className="text-sm font-normal text-muted-foreground">· {lista.length}</span></h4>
      {lista.length > 0 && <ol className="space-y-2">{lista.map((c) => <LinhaConcorrente key={c.chave} c={c} />)}</ol>}
      {comDisputa && <BotaoDisputaItem numero={item.numeroItem} />}
    </div>
  )
}
