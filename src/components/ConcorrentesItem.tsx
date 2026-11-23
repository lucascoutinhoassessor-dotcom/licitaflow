import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Copy, ExternalLink, ListChecks, Trophy } from 'lucide-react'
import { Badge, Card } from '@/components/ui'
import { formatarCnpj, formatarMoeda } from '@/lib/format'
import { linkCompraComprasGov, type ItemCompraFederal } from '@/lib/compraFederal'
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
        <span className="block text-xs text-muted-foreground">{c.cnpj ? `CNPJ ${formatarCnpj(c.cnpj)}` : 'CNPJ não informado na ata'}{c.porte ? ` · ${c.porte}` : ''}{c.meEpp ? ' · benefício ME/EPP' : ''}{c.marca ? ` · Marca: ${c.marca}` : ''}{ORIGEM_FONTE[c.fonte]}</span>
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

/** Código do botão favorito: carrega o coletor deste site na página de acompanhamento do Compras.gov.br. */
export function codigoFavorito(origem = window.location.origin) {
  return `javascript:(function(){var s=document.createElement('script');s.src='${origem}/coletor-propostas.js?v='+Date.now();document.body.appendChild(s)})()`
}

/**
 * Como trazer todas as propostas de uma compra federal: botão favorito que, na página da compra no Compras.gov.br
 * (com o captcha resolvido pela própria pessoa), guarda as propostas de cada item aberto e manda para o LicitaForce.
 */
export function FavoritoPropostas({ idCompra, className }: { idCompra: string | null; className?: string }) {
  const link = useRef<HTMLAnchorElement>(null)
  const [copiado, setCopiado] = useState(false)
  // O React bloqueia href "javascript:" no JSX; o endereço entra direto no elemento.
  useEffect(() => { link.current?.setAttribute('href', codigoFavorito()) }, [])
  const copiar = async () => {
    try { await navigator.clipboard.writeText(codigoFavorito()); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sem permissão de cópia */ }
  }
  return (
    <Card className={cn('p-4 text-sm', className)}>
      <span className="flex items-center gap-2 font-semibold"><ListChecks className="h-4 w-4 text-emerald-400" />Todas as propostas de cada item, direto do Compras.gov.br</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">Os dados abertos só trazem as empresas homologadas. Com o botão favorito, você abre a compra no Compras.gov.br e o LicitaForce guarda todas as propostas (valores, classificação, desclassificadas e motivos) para todos os usuários. Use no computador.</span>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-xs">
        <li>
          Arraste este botão para a barra de favoritos do navegador (só na primeira vez):{' '}
          <a ref={link} onClick={(e) => e.preventDefault()} draggable title="Arraste para a barra de favoritos" className="ml-1 inline-flex h-7 cursor-grab items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2.5 font-semibold text-emerald-700 dark:text-emerald-300">
            <Bookmark className="h-3.5 w-3.5" />LicitaForce: propostas
          </a>
          <button type="button" onClick={copiar} className="ml-2 inline-flex items-center gap-1 text-muted-foreground underline hover:text-foreground"><Copy className="h-3 w-3" />{copiado ? 'Copiado: crie um favorito e cole no endereço' : 'ou copiar o código'}</button>
        </li>
        <li>
          {idCompra ? <a href={linkCompraComprasGov(idCompra)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline dark:text-sky-300">Abra esta compra no Compras.gov.br<ExternalLink className="h-3 w-3" /></a> : 'Abra a compra no Compras.gov.br'} e clique no favorito.
        </li>
        <li>Abra os itens que quiser (ícone de lista ao lado de cada item). O quadro do LicitaForce conta os itens guardados.</li>
        <li>Clique em <b>Enviar para o LicitaForce</b>. As propostas aparecem aqui, em cada item.</li>
      </ol>
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
export function ConcorrentesEdital({ item, todos, colocacoes, atas }: { item: ItemCompra; todos: ItemCompra[]; colocacoes?: ColocacaoItem[]; atas?: AtasCompra }) {
  const { lista } = concorrentesDoItem(itemParaConcorrentes(item, colocacoes), todos.map((i) => itemParaConcorrentes(i)), atas)
  if (!lista.length) return null
  return (
    <div className="mt-4 text-sm">
      <h4 className="mb-2 flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-amber-400" />Concorrentes do item<span className="text-sm font-normal text-muted-foreground">· {lista.length}</span></h4>
      <ol className="space-y-2">{lista.map((c) => <LinhaConcorrente key={c.chave} c={c} />)}</ol>
      {!lista.some((c) => c.fonte === 'portal') && <p className="mt-2 text-xs text-muted-foreground">Só as empresas homologadas e as lidas na ata. Para ver todas as propostas, use o botão favorito do Compras.gov.br acima dos itens.</p>}
    </div>
  )
}
