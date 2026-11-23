import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Calculator, Download, FileDown, Search, Sparkles, Wand2 } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { useLista, useRegistro } from '@/hooks/useDados'
import { formatarMoeda } from '@/lib/format'
import { precoLimite, totalItens } from '@/lib/dominio'
import { consultarItens } from '@/lib/filtrosOportunidades'
import { buscarCatalogo, historicoPrecos, type ItemCatalogo } from '@/lib/precos'
import { NOME_SITUACAO, escolherEstatistica, itemDoEdital, planilhaProposta, sugerirPreco, termoDeBusca, type MercadoItem } from '@/lib/cotador'
import type { CompraPNCP } from '@/lib/pncp'
import type { Processo, ProcessoItem } from '@/types/db'
import { cn } from '@/lib/utils'
import { Aviso, Badge, Button, Card, Carregando, Input, Modal, Vazio } from '@/components/ui'

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const num = (s: string) => { const t = s.trim(); if (!t) return null; const n = Number(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : undefined }
const txt = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','))

/** Itens do edital do PNCP a partir do número de controle (só usa CNPJ, ano e sequencial). */
async function itensDoPncp(controle: string) {
  const m = /^(\d{14})-1-0*(\d+)\/(\d{4})$/.exec(controle)
  if (!m) throw new Error('Este processo não tem o edital do PNCP vinculado.')
  return consultarItens({ orgaoEntidade: { cnpj: m[1] }, anoCompra: Number(m[3]), sequencialCompra: Number(m[2]) } as CompraPNCP)
}

/** Primeiro item do catálogo para a descrição, tentando com menos palavras se não achar. */
async function casarCatalogo(descricao: string, tipo: 'M' | 'S' | null | undefined): Promise<ItemCatalogo | null> {
  for (const n of [3, 2, 1]) {
    const termo = termoDeBusca(descricao, n)
    if (!termo) continue
    const r = await buscarCatalogo(termo, tipo ?? '').catch(() => null)
    if (r?.data?.length) return r.data[0]
  }
  return null
}

function TrocarCatalogo({ item, aoEscolher }: { item: ProcessoItem; aoEscolher: (c: ItemCatalogo) => void }) {
  const [termo, setTermo] = useState(termoDeBusca(item.descricao, 3))
  const [lista, setLista] = useState<ItemCatalogo[] | null>(null)
  const [busy, setBusy] = useState(false)
  async function procurar() {
    setBusy(true)
    try { setLista((await buscarCatalogo(termo, item.catalogo_tipo ?? '')).data) } catch (e) { toast.error(mensagemErro(e)) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{item.descricao}</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); procurar() }}>
        <Input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Ex.: papel para impressão" />
        <Button type="submit" carregando={busy}><Search className="h-4 w-4" />Procurar</Button>
      </form>
      {lista && (lista.length ? (
        <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
          {lista.map((c) => (
            <li key={`${c.tipo}${c.codigo}`}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => aoEscolher(c)}>
                <span className="font-medium">{c.nome}</span> <Badge>{c.tipo === 'M' ? 'Material' : 'Serviço'} {c.codigo}</Badge>
                {c.classe && <span className="block text-xs text-muted-foreground">{c.classe}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Nada encontrado. Tente outra palavra.</p>)}
    </div>
  )
}

function LinhaItem({ i, salvarItem, aoTrocar }: { i: ProcessoItem; salvarItem: (id: string, dados: Partial<ProcessoItem>) => Promise<void>; aoTrocar: () => void }) {
  const [custo, setCusto] = useState(txt(i.custo_unit))
  const [margem, setMargem] = useState(txt(i.margem_min_pct))
  const [preco, setPreco] = useState(txt(i.preco_proposto_unit))
  const [marca, setMarca] = useState(i.marca_modelo ?? '')
  const m = i.mercado ?? null
  const limite = precoLimite(num(custo) ?? null, num(margem) ?? null)
  const sug = sugerirPreco({ referencia: i.valor_ref_unit, mediana: m?.mediana ?? null, limite })
  const sit = NOME_SITUACAO[sug.situacao]
  const gravar = (dados: Partial<ProcessoItem>) => salvarItem(i.id, dados)
  const campo = (rotulo: string, valor: string, set: (v: string) => void, aoSair: () => void, extra?: string) => (
    <label className="block min-w-0"><span className="text-[11px] text-muted-foreground">{rotulo}</span>
      <Input className={cn('h-8 text-sm', extra)} inputMode="decimal" value={valor} onChange={(e) => set(e.target.value)} onBlur={aoSair} /></label>
  )
  return (
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Item {i.numero_item ?? '—'}{i.lote ? ` · Lote ${i.lote}` : ''} · {Number(i.quantidade).toLocaleString('pt-BR')} {i.unidade ?? ''}</p>
          <p className="line-clamp-2 text-sm font-medium">{i.descricao}</p>
        </div>
        <Badge cor={sit.cor} title={sug.texto}>{sit.rotulo}</Badge>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div><p className="text-muted-foreground">Valor do órgão</p><p className="text-sm font-medium tabular-nums">{i.valor_ref_unit ? formatarMoeda(i.valor_ref_unit) : 'não informado'}</p></div>
        <div className="col-span-1 sm:col-span-2">
          <p className="text-muted-foreground">Mercado (12 meses)</p>
          {m ? (
            <p className="text-sm"><span className="font-medium tabular-nums">{formatarMoeda(m.mediana)}</span> <span className="text-xs text-muted-foreground">mediana de {m.n} compra{m.n > 1 ? 's' : ''} · {formatarMoeda(m.minimo)} a {formatarMoeda(m.maximo)}</span>
              {m.outra_unidade && <span className="block text-xs text-amber-600">Preços em "{m.unidade}", unidade diferente da do item</span>}</p>
          ) : <p className="text-sm text-muted-foreground">{i.catalogo_codigo ? 'Sem compras no período' : 'Ainda não pesquisado'}</p>}
          <button type="button" className="text-xs text-primary hover:underline" onClick={aoTrocar}>{i.catalogo_nome ? `Catálogo: ${i.catalogo_nome.slice(0, 40)} · trocar` : 'Escolher item do catálogo'}</button>
        </div>
        <div><p className="text-muted-foreground">Preço-limite</p><p className="text-sm font-semibold tabular-nums text-primary">{limite != null ? formatarMoeda(limite) : '—'}</p></div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {campo('Seu custo (R$)', custo, setCusto, () => { const v = num(custo); if (v !== undefined) gravar({ custo_unit: v, preco_limite_unit: precoLimite(v, num(margem) ?? null) }) })}
        {campo('Margem mínima (%)', margem, setMargem, () => { const v = num(margem); if (v !== undefined && (v == null || v < 100)) gravar({ margem_min_pct: v, preco_limite_unit: precoLimite(num(custo) ?? null, v) }) })}
        <label className="block min-w-0"><span className="text-[11px] text-muted-foreground">Preço proposto (R$)</span>
          <div className="flex gap-1">
            <Input className="h-8 text-sm" inputMode="decimal" value={preco} placeholder={sug.preco != null ? txt(sug.preco) : ''} onChange={(e) => setPreco(e.target.value)} onBlur={() => { const v = num(preco); if (v !== undefined) gravar({ preco_proposto_unit: v }) }} />
            {sug.preco != null && txt(sug.preco) !== preco && <button type="button" title="Usar o preço sugerido" className="rounded-md border px-2 text-primary hover:bg-muted" onClick={() => { setPreco(txt(sug.preco)); gravar({ preco_proposto_unit: sug.preco }) }}><Wand2 className="h-3.5 w-3.5" /></button>}
          </div>
        </label>
        <label className="block min-w-0"><span className="text-[11px] text-muted-foreground">Marca / modelo</span>
          <Input className="h-8 text-sm" value={marca} onChange={(e) => setMarca(e.target.value)} onBlur={() => gravar({ marca_modelo: marca.trim() || null })} /></label>
      </div>
      <p className={cn('mt-1.5 text-xs', sug.situacao === 'prejuizo' ? 'text-red-600' : sug.situacao === 'apertado' ? 'text-amber-600' : 'text-muted-foreground')}>{sug.texto}</p>
    </div>
  )
}

export default function Cotador() {
  const { processoId } = useParams()
  const { org, empresas, podeEditar } = useOrg()
  const qc = useQueryClient()
  const proc = useRegistro<Processo>('processos', processoId)
  const itens = useLista<ProcessoItem>('processo_itens', { porEmpresa: false, chave: [processoId], filtro: (x) => x.eq('processo_id', processoId!), ordem: ['numero_item', true], habilitado: !!processoId })
  const [progresso, setProgresso] = useState<{ feito: number; total: number; texto: string } | null>(null)
  const [trocando, setTrocando] = useState<ProcessoItem | null>(null)
  const lista = useMemo(() => itens.data ?? [], [itens.data])
  const recarregar = () => qc.invalidateQueries({ queryKey: ['processo_itens'] })

  async function salvarItem(id: string, dados: Partial<ProcessoItem>) {
    const { error } = await supabase.from('processo_itens').update(dados).eq('id', id).eq('org_id', org!.id)
    if (error) toast.error(mensagemErro(error)); else recarregar()
  }
  async function usar() {
    const { error } = await supabase.rpc('cotador_usar', { p_processo: processoId })
    if (error) throw error
  }

  async function importar() {
    const p = proc.data!
    setProgresso({ feito: 0, total: 1, texto: 'Buscando os itens do edital no PNCP…' })
    try {
      await usar()
      const doEdital = await itensDoPncp(p.pncp_controle ?? '')
      const existentes = new Set(lista.map((i) => i.numero_item))
      const novos = doEdital.filter((i) => !existentes.has(i.numeroItem)).map((i) => ({ ...itemDoEdital(i), org_id: org!.id, processo_id: p.id }))
      if (!novos.length) { toast.info(doEdital.length ? 'Todos os itens do edital já estão no processo.' : 'O PNCP não trouxe itens para este edital.'); return }
      for (let k = 0; k < novos.length; k += 200) {
        const { error } = await supabase.from('processo_itens').insert(novos.slice(k, k + 200))
        if (error) throw error
      }
      toast.success(`${novos.length} ${novos.length === 1 ? 'item importado' : 'itens importados'} do edital.`)
      await recarregar()
    } catch (e) { toast.error(mensagemErro(e)) } finally { setProgresso(null) }
  }

  /** Casa cada item com o catálogo e busca o preço de mercado (uma consulta por item do catálogo, no ritmo do limite). */
  async function pesquisar(alvo: ProcessoItem[] = lista) {
    if (!alvo.length) return
    try { await usar() } catch (e) { toast.error(mensagemErro(e)); return }
    const de = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)
    const ate = new Date().toISOString().slice(0, 10)
    const casados = new Map<string, ProcessoItem & { cat: ItemCatalogo | null }>()
    let feito = 0
    const total = alvo.length * 2
    try {
      for (const i of alvo) {
        setProgresso({ feito: ++feito, total, texto: `Procurando no catálogo: item ${i.numero_item ?? ''}` })
        let cat: ItemCatalogo | null = i.catalogo_codigo && i.catalogo_tipo ? { tipo: i.catalogo_tipo, codigo: i.catalogo_codigo, nome: i.catalogo_nome ?? '', classe: '' } : null
        if (!cat) {
          cat = await casarCatalogo(i.descricao, i.catalogo_tipo)
          if (cat) await supabase.from('processo_itens').update({ catalogo_tipo: cat.tipo, catalogo_codigo: cat.codigo, catalogo_nome: cat.nome }).eq('id', i.id)
        }
        casados.set(i.id, { ...i, cat })
      }
      const porCodigo = new Map<string, Awaited<ReturnType<typeof historicoPrecos>> | null>()
      for (const i of casados.values()) {
        setProgresso({ feito: ++feito, total, texto: `Consultando preços: item ${i.numero_item ?? ''}` })
        if (!i.cat) continue
        const k = `${i.cat.tipo}${i.cat.codigo}`
        if (!porCodigo.has(k)) {
          try { porCodigo.set(k, await historicoPrecos(i.cat, { uf: '', de, ate })) } catch (e) {
            const msg = mensagemErro(e)
            if (/muitas consultas/i.test(msg)) { setProgresso({ feito, total, texto: 'Pausa de 1 minuto pelo limite de consultas…' }); await esperar(61_000); porCodigo.set(k, await historicoPrecos(i.cat, { uf: '', de, ate }).catch(() => null)) }
            else porCodigo.set(k, null)
          }
          await esperar(2100) // 30 consultas por minuto
        }
        const h = porCodigo.get(k)
        const est = h ? escolherEstatistica(h.unidades, i.unidade) : null
        const mercado: MercadoItem | null = est ? { unidade: est.unidade, n: est.n, minimo: est.minimo, maximo: est.maximo, media: est.media, mediana: est.mediana, consultado_em: new Date().toISOString(), outra_unidade: est.outra_unidade } : null
        await supabase.from('processo_itens').update({ mercado }).eq('id', i.id)
      }
      const comPreco = [...casados.values()].filter((i) => i.cat && porCodigo.get(`${i.cat.tipo}${i.cat.codigo}`)?.unidades.length).length
      toast.success(`Preço de mercado encontrado para ${comPreco} de ${alvo.length} itens.`)
    } catch (e) { toast.error(mensagemErro(e)) } finally { setProgresso(null); await recarregar() }
  }

  async function aplicarSugestoes() {
    let n = 0
    for (const i of lista) {
      if (i.preco_proposto_unit != null) continue
      const s = sugerirPreco({ referencia: i.valor_ref_unit, mediana: i.mercado?.mediana ?? null, limite: i.preco_limite_unit })
      if (s.preco == null) continue
      await supabase.from('processo_itens').update({ preco_proposto_unit: s.preco }).eq('id', i.id)
      n++
    }
    toast.success(n ? `Preço sugerido aplicado em ${n} itens sem preço.` : 'Todos os itens já têm preço proposto.')
    await recarregar()
  }

  function baixar() {
    const p = proc.data!
    const emp = empresas.find((e) => e.id === p.empresa_id)
    const csv = planilhaProposta({ empresa: emp?.razao_social ?? '', cnpj: emp?.cnpj ?? '', processo: [p.numero, p.objeto.slice(0, 120)].filter(Boolean).join(' · '), orgao: p.orgao_nome },
      lista.map((i) => ({ numero_item: i.numero_item, lote: i.lote, descricao: i.descricao, unidade: i.unidade, quantidade: Number(i.quantidade), marca_modelo: i.marca_modelo, preco: i.preco_proposto_unit ?? null })))
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `proposta-${(p.numero ?? p.id.slice(0, 8)).replace(/[^\w-]+/g, '_')}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (proc.isLoading || itens.isLoading) return <Carregando />
  const p = proc.data
  if (!p) return <Vazio titulo="Processo não encontrado" acao={<Link to="/app/agentes/cotador"><Button variante="contorno">Voltar</Button></Link>} />
  const contagem = lista.reduce((c, i) => {
    const s = sugerirPreco({ referencia: i.valor_ref_unit, mediana: i.mercado?.mediana ?? null, limite: i.preco_limite_unit }).situacao
    c[s] = (c[s] ?? 0) + 1; return c
  }, {} as Record<string, number>)

  return (
    <>
      <Link to="/app/agentes/cotador" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Cotador</Link>
      <Card className="mb-5 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Calculator className="h-4 w-4" />Cotador <Badge cor="azul">Beta</Badge></p>
        <h1 className="mt-1 text-xl font-bold leading-tight">{p.numero ? `${p.numero} · ` : ''}{p.objeto}</h1>
        {p.orgao_nome && <p className="mt-1 text-sm text-muted-foreground">{p.orgao_nome}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Valor do órgão</p><p className="mt-1 font-semibold tabular-nums">{formatarMoeda(totalItens(lista, (i) => i.valor_ref_unit))}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Sua proposta</p><p className="mt-1 font-semibold tabular-nums text-primary">{formatarMoeda(totalItens(lista, (i) => i.preco_proposto_unit))}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Preço-limite total</p><p className="mt-1 font-semibold tabular-nums">{formatarMoeda(totalItens(lista, (i) => i.preco_limite_unit))}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Itens</p><p className="mt-1 text-sm">
            {lista.length} · <span className="text-emerald-600">{contagem.competitivo ?? 0} competitivos</span>{contagem.prejuizo ? <> · <span className="text-red-600">{contagem.prejuizo} com prejuízo</span></> : null}</p></div>
        </div>
        {podeEditar && (
          <div className="mt-4 flex flex-wrap gap-2">
            {p.pncp_controle && <Button variante={lista.length ? 'contorno' : undefined} disabled={!!progresso} onClick={importar}><FileDown className="h-4 w-4" />Importar itens do edital</Button>}
            {lista.length > 0 && <Button disabled={!!progresso} onClick={() => pesquisar()}><Search className="h-4 w-4" />Pesquisar preços de mercado</Button>}
            {lista.length > 0 && <Button variante="contorno" disabled={!!progresso} onClick={aplicarSugestoes}><Sparkles className="h-4 w-4" />Aplicar preços sugeridos</Button>}
            {lista.length > 0 && <Button variante="contorno" onClick={baixar}><Download className="h-4 w-4" />Baixar planilha da proposta</Button>}
          </div>
        )}
        {progresso && (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">{progresso.texto}</p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((progresso.feito / Math.max(progresso.total, 1)) * 100)}%` }} /></div>
          </div>
        )}
        {!p.pncp_controle && <div className="mt-4"><Aviso tipo="info">Este processo não tem o edital do PNCP vinculado: cadastre os itens na aba Itens do processo e depois pesquise os preços aqui.</Aviso></div>}
        <p className="mt-3 text-xs text-muted-foreground">Preço de mercado: mediana das compras públicas do mesmo item do catálogo nos últimos 12 meses (Painel de Preços do governo). Preço-limite = custo ÷ (1 − margem). Confira sempre a especificação antes de enviar a proposta.</p>
      </Card>

      {!lista.length ? (
        <Vazio icone={Calculator} titulo="Nenhum item ainda" texto={p.pncp_controle ? 'Toque em "Importar itens do edital" para trazer os itens do PNCP.' : 'Cadastre os itens na aba Itens do processo.'}
          acao={<Link to={`/app/processos/${p.id}`}><Button variante="contorno">Abrir processo</Button></Link>} />
      ) : (
        <Card className="divide-y">{lista.map((i) => <LinhaItem key={`${i.id}-${i.preco_proposto_unit}-${i.custo_unit}-${i.margem_min_pct}`} i={i} salvarItem={salvarItem} aoTrocar={() => setTrocando(i)} />)}</Card>
      )}

      <Modal aberto={!!trocando} aoFechar={() => setTrocando(null)} titulo="Item do catálogo para o preço de mercado" largo>
        {trocando && <TrocarCatalogo item={trocando} aoEscolher={async (c) => {
          const alvo = trocando
          setTrocando(null)
          await supabase.from('processo_itens').update({ catalogo_tipo: c.tipo, catalogo_codigo: c.codigo, catalogo_nome: c.nome, mercado: null }).eq('id', alvo.id)
          await pesquisar([{ ...alvo, catalogo_tipo: c.tipo, catalogo_codigo: c.codigo, catalogo_nome: c.nome }])
        }} />}
      </Modal>
    </>
  )
}
