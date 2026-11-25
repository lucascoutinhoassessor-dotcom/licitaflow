import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { mensagemErro } from '@/lib/supabase'
import { formatarData, formatarMoeda, apenasDigitos } from '@/lib/format'
import { useCatalogoPlanos } from '@/hooks/useCatalogoPlanos'
import { carregarAssinatura, pagamentoAPI, FORMAS, STATUS_ASSINATURA, STATUS_FATURA, type Assinatura } from '@/lib/pagamentos'
import { Aviso, Badge, Button, Campo, Card, Carregando, Input, Modal, Select } from '@/components/ui'

/** Assinatura recorrente (Asaas) da organização: contratar, trocar de plano, cancelar e faturas. */
export function AssinaturaPainel({ org, master = false, planoInicial }: { org: string; master?: boolean; planoInicial?: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const catalogo = useCatalogoPlanos()
  const q = useQuery({ queryKey: ['assinatura', org], queryFn: () => carregarAssinatura(org) })
  const [modal, setModal] = useState<'assinar' | 'trocar' | null>(null)
  const [ocupado, setOcupado] = useState('')
  const [f, setF] = useState({ plano: '', ciclo: 'mensal', forma: 'UNDEFINED', documento: '', cupom: '' })
  const recarregar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['assinatura', org] }), qc.invalidateQueries({ queryKey: ['admin-assinaturas'] }),
    qc.invalidateQueries({ queryKey: ['admin-financeiro'] }), qc.invalidateQueries({ queryKey: ['plano-cliente'] }),
  ])
  const planos = (catalogo.data ?? []).filter(p => !['trial', 'cancelado'].includes(p.id) && p.mensal_centavos >= 100 && (p.ativo || master))
  const plano = planos.find(p => p.id === f.plano)
  const valor = plano ? (f.ciclo === 'anual' ? plano.anual_centavos : plano.mensal_centavos) : 0
  const economia = plano && plano.mensal_centavos * 12 > plano.anual_centavos ? plano.mensal_centavos * 12 - plano.anual_centavos : 0

  function abrir(tipo: 'assinar' | 'trocar', a?: Assinatura | null) {
    setF({ plano: a?.plano_id ?? planoInicial ?? planos[0]?.id ?? '', ciclo: a?.ciclo ?? 'mensal', forma: a?.forma ?? 'PIX', documento: '', cupom: '' })
    setModal(tipo)
  }
  async function enviar(e: FormEvent) {
    e.preventDefault(); setOcupado('form')
    try {
      if (modal === 'assinar') {
        const doc = apenasDigitos(f.documento)
        if (![11, 14].includes(doc.length)) throw new Error('Informe o CPF ou CNPJ de quem paga.')
        const r = await pagamentoAPI({ acao: 'assinar', org, plano: f.plano, ciclo: f.ciclo, forma: f.forma, documento: doc, cupom: f.cupom.trim() || undefined })
        toast.success(f.cupom.trim() && r.valor_centavos ? `Assinatura criada com o cupom: ${formatarMoeda(r.valor_centavos / 100)} por cobrança.` : 'Assinatura criada no Asaas.')
        if (master && r.url) window.open(r.url, '_blank', 'noopener,noreferrer')
        if (!master) navigate(`/checkout?org=${org}`)
      } else {
        await pagamentoAPI({ acao: 'trocar_plano', id: q.data?.assinatura?.id, plano: f.plano, ciclo: f.ciclo })
        toast.success('Plano alterado. As próximas cobranças já vêm com o novo valor.')
      }
      await recarregar(); setModal(null)
    } catch (err) { toast.error(mensagemErro(err)) } finally { setOcupado('') }
  }
  async function acao(tipo: 'cancelar_assinatura' | 'sincronizar') {
    const a = q.data?.assinatura
    if (!a) return
    if (tipo === 'cancelar_assinatura' && !confirm(`Cancelar a assinatura? Não haverá novas cobranças.${a.pago_ate ? ` O acesso pago vale até ${formatarData(a.pago_ate)}.` : ''}`)) return
    setOcupado(tipo)
    try {
      const r = await pagamentoAPI({ acao: tipo, id: a.id })
      toast.success(tipo === 'sincronizar' ? `Sincronizado com o Asaas: ${r.faturas} cobrança(s) conferida(s).` : 'Assinatura cancelada.')
      await recarregar()
    } catch (err) { toast.error(mensagemErro(err)) } finally { setOcupado('') }
  }

  if (q.isLoading) return <Card className="p-5"><Carregando /></Card>
  if (q.isError) return <Aviso>Não foi possível carregar a assinatura. Confira se a migração de assinaturas foi aplicada. <button className="underline" onClick={() => q.refetch()}>Tentar novamente</button></Aviso>
  const { assinatura: a, faturas } = q.data!
  const st = a && STATUS_ASSINATURA[a.status]
  const emAberto = faturas.find(x => ['pendente', 'atrasada'].includes(x.status) && x.link)
  const nomePlano = (id: string) => catalogo.data?.find(p => p.id === id)?.nome ?? id

  return <Card className="space-y-4 p-5">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="flex-1 font-semibold">Assinatura e pagamento</h2>
      {st && <Badge cor={st.cor}>{st.rotulo}</Badge>}
    </div>
    {!a && <>
      <p className="text-sm text-muted-foreground">{master ? 'Este cliente ainda não tem assinatura recorrente.' : 'Contrate um plano com cobrança recorrente por Pix, boleto ou cartão. O acesso é liberado assim que o pagamento é confirmado.'}</p>
      {!master && <div className="grid gap-3 sm:grid-cols-2">{planos.map(p => <div key={p.id} className="space-y-2 rounded-lg border p-4"><h3 className="font-semibold">{p.nome}</h3><p>{formatarMoeda(p.mensal_centavos / 100)}/mês</p><p className="text-xs text-muted-foreground">{p.limite_empresas ?? 'Ilimitadas'} empresa(s) · {p.limite_usuarios ?? 'Ilimitados'} usuário(s)</p><Button variante="contorno" onClick={() => { abrir('assinar'); setF(v => ({ ...v, plano: p.id })) }}>Escolher {p.nome}</Button></div>)}</div>}
      <Button onClick={() => abrir('assinar')} disabled={!planos.length}>{master ? 'Criar assinatura para o cliente' : 'Contratar plano'}</Button>
    </>}
    {a && <>
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-muted-foreground">Plano</p><p className="font-medium">{nomePlano(a.plano_id)} · {a.ciclo}</p></div>
        <div><p className="text-muted-foreground">Valor</p><p className="font-medium">{formatarMoeda(a.valor_centavos / 100)}/{a.ciclo === 'anual' ? 'ano' : 'mês'}</p></div>
        <div><p className="text-muted-foreground">Próximo vencimento</p><p className="font-medium">{formatarData(a.proximo_vencimento)}</p></div>
        <div><p className="text-muted-foreground">Pago até</p><p className="font-medium">{a.pago_ate ? formatarData(a.pago_ate) : '—'}</p></div>
      </div>
      {a.status === 'atrasada' && <Aviso>Há fatura vencida. {master ? 'A conta é suspensa automaticamente quando passa da tolerância configurada.' : 'Pague para evitar a suspensão do acesso.'}</Aviso>}
      {a.erro && master && <Aviso>Último erro no gateway: {a.erro}</Aviso>}
      <div className="flex flex-wrap gap-2">
        {!master && (a.status === 'pendente' || a.status === 'atrasada') && <Link to={`/checkout?org=${org}`} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Ir para checkout LicitaForce</Link>}
        {emAberto && <a href={emAberto.link!} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Pagar fatura em aberto</a>}
        {!emAberto && a.link_pagamento && a.status === 'pendente' && <a href={a.link_pagamento} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Pagar 1ª fatura</a>}
        {a.gateway_assinatura_id && <Button tamanho="sm" variante="contorno" disabled={!!ocupado} onClick={() => abrir('trocar', a)}>Trocar plano</Button>}
        {master && a.gateway_assinatura_id && <Button tamanho="sm" variante="contorno" carregando={ocupado === 'sincronizar'} disabled={!!ocupado} onClick={() => acao('sincronizar')}>Sincronizar com Asaas</Button>}
        <Button tamanho="sm" variante="contorno" carregando={ocupado === 'cancelar_assinatura'} disabled={!!ocupado} onClick={() => acao('cancelar_assinatura')}>Cancelar assinatura</Button>
      </div>
    </>}
    {faturas.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[520px] whitespace-nowrap text-sm">
      <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Vencimento</th><th className="font-medium">Valor</th><th className="font-medium">Situação</th><th className="font-medium">Pago em</th><th /></tr></thead>
      <tbody>{faturas.map(x => <tr key={x.id} className="border-b last:border-0">
        <td className="py-2">{formatarData(x.vencimento)}</td><td>{formatarMoeda(x.valor_centavos / 100)}</td>
        <td><Badge cor={STATUS_FATURA[x.status].cor}>{STATUS_FATURA[x.status].rotulo}</Badge></td>
        <td>{x.pago_em ? formatarData(x.pago_em) : '—'}</td>
        <td className="text-right">{x.link && <a className="text-primary hover:underline" href={x.link} target="_blank" rel="noopener noreferrer">{x.status === 'paga' ? 'Comprovante' : 'Abrir'}</a>}</td>
      </tr>)}</tbody>
    </table></div>}

    <Modal aberto={!!modal} aoFechar={() => { if (!ocupado) setModal(null) }} titulo={modal === 'trocar' ? 'Trocar plano' : 'Contratar plano'}>
      <form className="space-y-4" onSubmit={enviar}>
        <Campo rotulo="Plano" htmlFor="as-plano"><Select id="as-plano" required value={f.plano} onChange={e => setF({ ...f, plano: e.target.value })}>
          {planos.map(p => <option key={p.id} value={p.id}>{p.nome}{!p.ativo ? ' (oculto)' : ''}</option>)}
        </Select></Campo>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Ciclo de cobrança">
          {(['mensal', 'anual'] as const).map(c => <button type="button" role="radio" aria-checked={f.ciclo === c} key={c} onClick={() => setF({ ...f, ciclo: c })}
            className={`rounded-md border p-3 text-left text-sm ${f.ciclo === c ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted'}`}>
            <span className="block font-medium capitalize">{c}</span>
            {plano && <span className="text-muted-foreground">{formatarMoeda((c === 'anual' ? plano.anual_centavos : plano.mensal_centavos) / 100)}/{c === 'anual' ? 'ano' : 'mês'}</span>}
          </button>)}
        </div>
        {f.ciclo === 'anual' && economia > 0 && <p className="text-sm text-success">Economia de {formatarMoeda(economia / 100)} por ano em relação ao mensal.</p>}
        {modal === 'assinar' && <>
          <Campo rotulo="Forma de pagamento" htmlFor="as-forma"><Select id="as-forma" value={f.forma} onChange={e => setF({ ...f, forma: e.target.value })}>
            {Object.entries(FORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select></Campo>
          <Campo rotulo="CPF ou CNPJ de quem paga" htmlFor="as-doc" ajuda="Exigido pelo Asaas para emitir a cobrança."><Input id="as-doc" required inputMode="numeric" value={f.documento} onChange={e => setF({ ...f, documento: e.target.value })} /></Campo>
          <Campo rotulo="Cupom de desconto (opcional)" htmlFor="as-cupom"><Input id="as-cupom" maxLength={40} value={f.cupom} onChange={e => setF({ ...f, cupom: e.target.value.toUpperCase().replace(/\s/g, '') })} /></Campo>
        </>}
        <p className="text-sm">Total: <strong>{formatarMoeda(valor / 100)}</strong> por {f.ciclo === 'anual' ? 'ano' : 'mês'}. {modal === 'assinar' ? 'A primeira cobrança vence hoje e o acesso é liberado ao pagar.' : 'Faturas em aberto são atualizadas para o novo valor.'}</p>
        <Button type="submit" carregando={ocupado === 'form'} disabled={!plano}>{modal === 'trocar' ? 'Confirmar troca' : 'Gerar cobrança'}</Button>
      </form>
    </Modal>
  </Card>
}
