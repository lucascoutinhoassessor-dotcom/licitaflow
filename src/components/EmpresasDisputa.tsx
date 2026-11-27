import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { Badge, Card, Carregando } from '@/components/ui'
import { ListaOcorrencias } from '@/components/OcorrenciasAta'
import { atasDaCompra, NOME_TIPO, type ItemAta, type TipoOcorrencia } from '@/lib/atas'
import type { ColocacaoItem } from '@/lib/resultadosEdital'
import { formatarCnpj, formatarMoeda } from '@/lib/format'

export interface Vencedora { cnpj: string; nome: string | null; itens: number; valor: number }

type Linha = {
  chave: string; cnpj: string | null; nome: string | null; itens: number; valor: number
  /** Melhor colocação conhecida (1 = venceu). */
  colocacao: number | null; colocacoes: string[]; situacoes: { tipo: TipoOcorrencia; itens: string | null; motivo: string }[]
}
const COR_SITUACAO = { desclassificacao: 'vermelho', inabilitacao: 'amarelo', recusa: 'neutro', sem_proposta: 'neutro' } as const
// Ordem da lista: vencedoras, classificadas pela colocação, depois desclassificadas, inabilitadas, sem proposta e demais citadas.
const PESO: Record<TipoOcorrencia, number> = { recusa: 2, desclassificacao: 3, inabilitacao: 4, sem_proposta: 5 }
function peso(l: Linha) {
  if (l.itens > 0) return 0
  if (l.colocacao) return 1
  return l.situacoes.length ? Math.min(...l.situacoes.map((s) => PESO[s.tipo])) : 6
}
const so = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * Todas as empresas de uma compra, com a situação de cada uma:
 * - vencedoras e colocações homologadas (dados oficiais; no registro de preço vêm 2º, 3º... do cadastro de reserva);
 * - todas as propostas de cada item trazidas do Compras.gov.br pela extensão (portal): colocações, desclassificadas e inabilitadas com motivo;
 * - desclassificadas, inabilitadas, que não enviaram proposta e demais licitantes, lidas nas atas publicadas no PNCP.
 * Cada empresa com CNPJ leva à análise dela.
 */
export default function EmpresasDisputa({ controle, vencedoras = [], colocacoes = [], portal = [], carregandoResultados = false }: {
  controle: string | null; vencedoras?: Vencedora[]; colocacoes?: ColocacaoItem[]; portal?: ItemAta[]; carregandoResultados?: boolean
}) {
  const valido = controle && /^\d{14}-1-\d+\/\d{4}$/.test(controle) ? controle : null
  const q = useQuery({ queryKey: ['atas-compra', valido], enabled: !!valido, staleTime: 3_600_000, retry: 1, queryFn: ({ signal }) => atasDaCompra(valido!, signal) })

  const por = new Map<string, Linha>()
  const pegar = (cnpj: string, nome: string | null) => {
    const l = por.get(cnpj) ?? { chave: cnpj, cnpj, nome, itens: 0, valor: 0, colocacao: null, colocacoes: [], situacoes: [] }
    l.nome ??= nome
    por.set(cnpj, l)
    return l
  }
  for (const v of vencedoras) { const l = pegar(v.cnpj, v.nome); l.itens += v.itens; l.valor += v.valor; l.colocacao = 1 }
  // Resultados homologados por item: ordem 1 (ou única) é a vencedora; as demais são colocações do cadastro de reserva.
  const porItem = new Map<number, ColocacaoItem[]>()
  for (const c of colocacoes) porItem.set(c.item, [...(porItem.get(c.item) ?? []), c])
  for (const lista of porItem.values()) {
    for (const c of lista) {
      const ordem = c.ordem ?? (lista.length === 1 ? 1 : null)
      const l = pegar(c.cnpj, c.nome)
      if (ordem === 1 && !vencedoras.length) { l.itens++; l.valor += c.valorTotal ?? 0 }
      if (ordem) {
        l.colocacao = Math.min(l.colocacao ?? ordem, ordem)
        if (ordem > 1) l.colocacoes.push(`${ordem}º no item ${c.item}`)
      }
    }
  }
  // Propostas do Compras.gov.br: colocação de cada empresa em cada item e quem caiu (com o motivo).
  // A vencedora já entrou pelos resultados homologados; aqui só conta item vencido se não houver resultado oficial do item.
  for (const i of portal) {
    const rotulo = `${i.tipo === 'grupo' ? 'grupo' : 'item'} ${i.numero}`
    const itens = `${i.tipo === 'grupo' ? 'Grupo' : 'Item'} ${i.numero}`
    for (const e of i.empresas) {
      const l = pegar(e.cnpj, e.nome)
      if (e.adjudicada && !porItem.has(i.numero) && !vencedoras.length) { l.itens++; l.valor += e.valorTotal ?? 0 }
      if (e.situacao === 'desclassificacao' || e.situacao === 'inabilitacao' || e.situacao === 'recusa') {
        if (!l.situacoes.some((s) => s.itens === itens && s.tipo === e.situacao)) l.situacoes.push({ tipo: e.situacao, itens, motivo: e.motivo ?? 'Motivo não informado.' })
      } else if (e.colocacao) {
        l.colocacao = Math.min(l.colocacao ?? e.colocacao, e.colocacao)
        const texto = `${e.colocacao}º no ${rotulo}`
        if (e.colocacao > 1 && !l.colocacoes.includes(texto)) l.colocacoes.push(texto)
      }
    }
  }
  for (const p of q.data?.participantes ?? []) {
    const l = pegar(p.cnpj, p.nome)
    if (p.colocacao && !l.colocacao) l.colocacao = p.colocacao
    l.situacoes.push(...(p.situacoes ?? []))
  }
  // Ocorrências da ata cuja empresa não tem CNPJ no texto: entram pelo nome, para nenhuma desclassificada sumir.
  const nomes = [...por.values()].map((l) => so(l.nome ?? ''))
  for (const o of q.data?.ocorrencias ?? []) {
    if (!o.empresa) continue
    if (o.cnpj && por.has(o.cnpj)) { if (!por.get(o.cnpj)!.situacoes.some((s) => s.motivo === o.motivo)) por.get(o.cnpj)!.situacoes.push(o); continue }
    const chave = so(o.empresa)
    if (chave.length < 5 || nomes.some((n) => n && (n.includes(chave) || chave.includes(n)))) continue
    const l = por.get(`nome:${chave}`) ?? { chave: `nome:${chave}`, cnpj: o.cnpj, nome: o.empresa, itens: 0, valor: 0, colocacao: null, colocacoes: [], situacoes: [] }
    l.situacoes.push({ tipo: o.tipo, itens: o.itens, motivo: o.motivo })
    por.set(l.chave, l)
  }
  const linhas = [...por.values()].sort((a, b) => peso(a) - peso(b) || (a.colocacao ?? 99) - (b.colocacao ?? 99) || b.valor - a.valor)
  const lidos = q.data?.documentos.filter((d) => d.lido) ?? []
  const contagem = { vencedoras: linhas.filter((l) => l.itens > 0).length, fora: linhas.filter((l) => l.situacoes.length && !l.itens).length }

  return (
    <Card className="mb-5 p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Users className="h-4 w-4 text-sky-400" />Empresas que disputaram</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {linhas.length ? `${linhas.length} ${linhas.length === 1 ? 'empresa' : 'empresas'} · ${contagem.vencedoras} com item vencido · ${contagem.fora} desclassificadas, inabilitadas ou sem proposta. ` : ''}
        Toque em uma empresa para abrir a análise dela.
      </p>
      {linhas.length > 0 && (
        <ol className="divide-y">
          {linhas.map((l) => (
            <li key={l.chave} className="flex gap-3 py-2.5 text-sm">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${l.colocacao === 1 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`} title={l.colocacao ? `${l.colocacao}º colocado` : 'Colocação não publicada'}>
                {l.colocacao ? `${l.colocacao}º` : '–'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1">
                    {l.cnpj ? <Link to={`/app/analise-empresas/${l.cnpj}`} className="font-semibold text-sky-700 hover:underline dark:text-sky-300">{l.nome ?? `CNPJ ${formatarCnpj(l.cnpj)}`}</Link> : <span className="font-semibold">{l.nome}</span>}
                    <span className="block text-xs text-muted-foreground">{l.cnpj ? `CNPJ ${formatarCnpj(l.cnpj)}` : 'CNPJ não informado na ata'}</span>
                  </span>
                  {l.itens > 0 && <><Badge cor="verde">Venceu {l.itens} {l.itens === 1 ? 'item' : 'itens'}</Badge>{l.valor > 0 && <span className="font-semibold tabular-nums">{formatarMoeda(l.valor)}</span>}</>}
                  {[...new Set(l.situacoes.map((s) => s.tipo))].map((t) => <Badge key={t} cor={COR_SITUACAO[t]}>{t === 'desclassificacao' ? 'Desclassificada' : t === 'inabilitacao' ? 'Inabilitada' : t === 'recusa' ? 'Proposta recusada' : NOME_TIPO[t]}</Badge>)}
                  {!l.itens && !l.situacoes.length && (l.colocacao ? <Badge cor="azul">Classificada</Badge> : <Badge>Participou</Badge>)}
                </span>
                {l.colocacoes.length > 0 && <span className="mt-1 block text-xs text-muted-foreground">{portal.length ? 'Colocações' : 'Cadastro de reserva'}: {l.colocacoes.slice(0, 6).join(', ')}{l.colocacoes.length > 6 ? '…' : ''}</span>}
                {l.situacoes.slice(0, 2).map((s, i) => <span key={i} className="mt-1 block text-xs text-muted-foreground">{s.itens ? `${s.itens}: ` : ''}{s.motivo.length > 180 ? `${s.motivo.slice(0, 177)}…` : s.motivo}</span>)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {carregandoResultados && <div className="mt-3"><Carregando texto="Buscando vencedores e colocações homologadas…" /></div>}
      {!valido ? (linhas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma empresa identificada.</p>)
        : q.isLoading ? <div className="mt-3"><Carregando texto="Procurando os participantes nas atas da compra…" /></div>
        : q.isError ? <p className="mt-3 text-sm">{(q.error as Error).message} <button className="font-semibold text-primary underline" onClick={() => q.refetch()}>Tentar novamente</button></p>
        : lidos.length === 0 && portal.length ? <p className="mt-3 text-xs text-muted-foreground">Colocações, desclassificadas e inabilitadas de {portal.length} {portal.length === 1 ? 'item' : 'itens'} vieram das propostas no Compras.gov.br.</p>
        : lidos.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">{linhas.length ? 'Aparecem só os resultados homologados: esta' : 'Esta'} compra não tem ata da sessão em PDF com texto publicada, e é na ata que ficam as desclassificadas, inabilitadas e quem não enviou proposta. A lista completa fica na página da disputa, no portal de compras.</p>
        : <>
          {linhas.length === 0 && <p className="text-sm text-muted-foreground">A ata foi lida, mas não traz o CNPJ nem o nome das empresas (alguns portais mostram só "Licitante 01, 02…").</p>}
          <p className="mt-3 text-xs text-muted-foreground">Situações e colocações lidas em: {lidos.map((d, i) => <span key={d.url}>{i > 0 && ', '}<a href={d.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{d.titulo}</a></span>)}. A leitura é automática: confira na ata original.</p>
          {!!q.data?.ocorrencias.length && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Trechos da ata ({q.data.ocorrencias.length})</summary><div className="mt-2"><ListaOcorrencias ocorrencias={q.data.ocorrencias} /></div></details>}
        </>}
    </Card>
  )
}
