import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Abas, Badge, Button, Campo, Card, Carregando, Input, Modal, Select, Textarea, Vazio } from '@/components/ui'
import { STATUS_EMPENHO, STATUS_FATURA, TIPOS_CONTRATO } from '@/lib/dominio'
import { diasAte, formatarData, formatarMoeda } from '@/lib/format'
import { useLista, useNomeEmpresa, useRegistro, useSalvar } from '@/hooks/useDados'
import { useOrg } from '@/providers/OrgProvider'
import type { Contrato, Empenho, Entrega, Fatura } from '@/types/db'
import NaoEncontrada from '@/pages/NaoEncontrada'
import { BadgeVigencia, ContratoForm } from './Contratos'

type Aba = 'empenhos' | 'faturas'
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\./g, '').replace(',', '.')))
const hojeISO = () => new Date().toISOString().slice(0, 10)

function EmpenhoForm({ contrato, empenho, aoSalvar }: { contrato: Contrato; empenho?: Empenho; aoSalvar: () => void }) {
  const [f, setF] = useState({
    numero: empenho?.numero ?? '',
    data_emissao: empenho?.data_emissao ?? hojeISO(),
    valor: empenho ? String(empenho.valor).replace('.', ',') : '',
    prazo_entrega: empenho?.prazo_entrega ?? '',
    status: empenho?.status ?? 'recebido',
    observacoes: empenho?.observacoes ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const { salvar } = useSalvar('empenhos')
  async function enviar(e: FormEvent) {
    e.preventDefault()
    await salvar.mutateAsync({ id: empenho?.id, dados: { ...f, valor: num(f.valor) ?? 0, contrato_id: contrato.id, processo_id: contrato.processo_id } })
    toast.success(empenho ? 'Empenho atualizado.' : 'Empenho registrado.')
    aoSalvar()
  }
  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nota de empenho nº" htmlFor="ne-num"><Input id="ne-num" required value={f.numero} onChange={set('numero')} placeholder="ex.: 2026NE000123" /></Campo>
        <Campo rotulo="Valor (R$)" htmlFor="ne-valor"><Input id="ne-valor" required inputMode="decimal" value={f.valor} onChange={set('valor')} /></Campo>
        <Campo rotulo="Emissão" htmlFor="ne-emissao"><Input id="ne-emissao" type="date" value={f.data_emissao} onChange={set('data_emissao')} /></Campo>
        <Campo rotulo="Prazo de entrega" htmlFor="ne-prazo"><Input id="ne-prazo" type="date" value={f.prazo_entrega} onChange={set('prazo_entrega')} /></Campo>
      </div>
      <Campo rotulo="Status" htmlFor="ne-status">
        <Select id="ne-status" value={f.status} onChange={set('status')}>{Object.entries(STATUS_EMPENHO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
      </Campo>
      <Campo rotulo="Observações" htmlFor="ne-obs"><Textarea id="ne-obs" rows={2} value={f.observacoes} onChange={set('observacoes')} /></Campo>
      <Button type="submit" className="w-full" carregando={salvar.isPending}>{empenho ? 'Salvar empenho' : 'Registrar empenho'}</Button>
    </form>
  )
}

function EntregaForm({ empenho, aoSalvar }: { empenho: Empenho; aoSalvar: () => void }) {
  const [f, setF] = useState({ data_entrega: hojeISO(), descricao: '', valor: '', status: 'entregue' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const { salvar } = useSalvar('entregas')
  async function enviar(e: FormEvent) {
    e.preventDefault()
    await salvar.mutateAsync({ dados: { ...f, valor: num(f.valor), empenho_id: empenho.id } })
    toast.success('Entrega registrada.')
    aoSalvar()
  }
  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Data" htmlFor="en-data"><Input id="en-data" type="date" required value={f.data_entrega} onChange={set('data_entrega')} /></Campo>
        <Campo rotulo="Valor entregue (R$)" htmlFor="en-valor"><Input id="en-valor" inputMode="decimal" value={f.valor} onChange={set('valor')} /></Campo>
      </div>
      <Campo rotulo="O que foi entregue" htmlFor="en-desc"><Input id="en-desc" value={f.descricao} onChange={set('descricao')} placeholder="ex.: 20 notebooks, NF 1234" /></Campo>
      <Campo rotulo="Situação" htmlFor="en-status">
        <Select id="en-status" value={f.status} onChange={set('status')}>
          <option value="agendada">Agendada</option><option value="entregue">Entregue</option><option value="aceita">Aceita pelo órgão</option><option value="recusada">Recusada</option>
        </Select>
      </Campo>
      <Button type="submit" className="w-full" carregando={salvar.isPending}>Registrar entrega</Button>
    </form>
  )
}

export function FaturaForm({ contrato, empenhos, fatura, aoSalvar }: { contrato: Contrato; empenhos: Empenho[]; fatura?: Fatura; aoSalvar: () => void }) {
  const [f, setF] = useState({
    numero_nf: fatura?.numero_nf ?? '',
    empenho_id: fatura?.empenho_id ?? '',
    data_emissao: fatura?.data_emissao ?? hojeISO(),
    valor: fatura ? String(fatura.valor).replace('.', ',') : '',
    vencimento: fatura?.vencimento ?? '',
    data_pagamento: fatura?.data_pagamento ?? '',
    status: fatura?.status ?? 'emitida',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const { salvar } = useSalvar('faturas')
  async function enviar(e: FormEvent) {
    e.preventDefault()
    const paga = f.status === 'paga'
    await salvar.mutateAsync({
      id: fatura?.id,
      dados: { ...f, valor: num(f.valor) ?? 0, contrato_id: contrato.id, orgao_cnpj: contrato.orgao_cnpj, data_pagamento: paga ? f.data_pagamento || hojeISO() : f.data_pagamento },
    })
    toast.success(fatura ? 'Fatura atualizada.' : 'Fatura registrada.')
    aoSalvar()
  }
  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nota fiscal nº" htmlFor="nf-num"><Input id="nf-num" value={f.numero_nf} onChange={set('numero_nf')} /></Campo>
        <Campo rotulo="Valor (R$)" htmlFor="nf-valor"><Input id="nf-valor" required inputMode="decimal" value={f.valor} onChange={set('valor')} /></Campo>
        <Campo rotulo="Emissão" htmlFor="nf-emissao"><Input id="nf-emissao" type="date" value={f.data_emissao} onChange={set('data_emissao')} /></Campo>
        <Campo rotulo="Vencimento" htmlFor="nf-venc"><Input id="nf-venc" type="date" value={f.vencimento} onChange={set('vencimento')} /></Campo>
      </div>
      {empenhos.length > 0 && (
        <Campo rotulo="Empenho" htmlFor="nf-ne">
          <Select id="nf-ne" value={f.empenho_id} onChange={set('empenho_id')}>
            <option value="">—</option>
            {empenhos.map((e) => <option key={e.id} value={e.id}>{e.numero} · {formatarMoeda(e.valor)}</option>)}
          </Select>
        </Campo>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Situação" htmlFor="nf-status"><Select id="nf-status" value={f.status} onChange={set('status')}>{Object.entries(STATUS_FATURA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Campo>
        <Campo rotulo="Data do pagamento" htmlFor="nf-pag"><Input id="nf-pag" type="date" value={f.data_pagamento} onChange={set('data_pagamento')} /></Campo>
      </div>
      <Button type="submit" className="w-full" carregando={salvar.isPending}>{fatura ? 'Salvar fatura' : 'Registrar fatura'}</Button>
    </form>
  )
}

export function BadgeFatura({ f }: { f: Fatura }) {
  if (f.status === 'paga') return <Badge cor="verde">Paga</Badge>
  if (f.status === 'cancelada') return <Badge>Cancelada</Badge>
  if (f.vencimento && diasAte(f.vencimento) < 0) return <Badge cor="vermelho">Atrasada {Math.abs(diasAte(f.vencimento))}d</Badge>
  return <Badge cor="azul">{STATUS_FATURA[f.status]}</Badge>
}

export default function ContratoDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { podeEditar } = useOrg()
  const nomeEmpresa = useNomeEmpresa()
  const q = useRegistro<Contrato>('contratos', id)
  const emp = useLista<Empenho>('empenhos', { porEmpresa: false, chave: [id], filtro: (x) => x.eq('contrato_id', id), ordem: ['data_emissao', false] })
  const fat = useLista<Fatura>('faturas', { porEmpresa: false, chave: [id], filtro: (x) => x.eq('contrato_id', id), ordem: ['data_emissao', false] })
  const ids = (emp.data ?? []).map((e) => e.id)
  const ent = useLista<Entrega>('entregas', { porEmpresa: false, chave: [id, ids.join()], habilitado: ids.length > 0, filtro: (x) => x.in('empenho_id', ids), ordem: ['data_entrega', false] })
  const { excluir } = useSalvar('contratos')
  const exclEmp = useSalvar('empenhos').excluir
  const salvarFat = useSalvar('faturas').salvar
  const [aba, setAba] = useState<Aba>('empenhos')
  const [modal, setModal] = useState<null | { tipo: 'editar' } | { tipo: 'empenho'; e?: Empenho } | { tipo: 'entrega'; e: Empenho } | { tipo: 'fatura'; f?: Fatura }>(null)

  if (q.isLoading) return <Carregando />
  const c = q.data
  if (!c) return <NaoEncontrada embutida />

  const empenhos = emp.data ?? []
  const faturas = fat.data ?? []
  const empenhado = empenhos.filter((e) => e.status !== 'cancelado').reduce((a, e) => a + Number(e.valor), 0)
  const faturado = faturas.filter((f) => f.status !== 'cancelada').reduce((a, f) => a + Number(f.valor), 0)
  const recebido = faturas.filter((f) => f.status === 'paga').reduce((a, f) => a + Number(f.valor), 0)
  const saldo = (c.valor_total ?? 0) - empenhado

  const cards = [
    { r: 'Valor total', v: c.valor_total },
    { r: 'Empenhado', v: empenhado },
    { r: 'Saldo a empenhar', v: saldo, alerta: saldo < 0 },
    { r: 'Faturado', v: faturado },
    { r: 'Recebido', v: recebido },
  ]

  return (
    <>
      <Link to="/app/contratos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Contratos</Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <BadgeVigencia c={c} />
            <span>{TIPOS_CONTRATO[c.tipo]}{c.numero ? ` · ${c.numero}` : ''}</span>
          </div>
          <h1 className="mt-2 text-xl font-semibold sm:text-2xl">{c.objeto || 'Contrato'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {c.orgao_nome} · {nomeEmpresa(c.empresa_id)}
            {c.inicio_vigencia || c.fim_vigencia ? ` · vigência ${formatarData(c.inicio_vigencia)} a ${formatarData(c.fim_vigencia)}` : ''}
          </p>
          {c.processo_id && <Link to={`/app/processos/${c.processo_id}`} className="mt-1 inline-block text-sm text-primary hover:underline">Ver processo de origem</Link>}
        </div>
        {podeEditar && (
          <div className="flex gap-2">
            <Button variante="contorno" tamanho="sm" onClick={() => setModal({ tipo: 'editar' })}><Pencil className="h-4 w-4" /> Editar</Button>
            <Button
              variante="fantasma"
              tamanho="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={async () => {
                if (!confirm('Excluir este contrato? Empenhos e o prazo de vigência também serão apagados. Esta ação não pode ser desfeita.')) return
                await excluir.mutateAsync(c.id)
                toast.success('Contrato excluído.')
                navigate('/app/contratos')
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((k) => (
          <Card key={k.r} className="p-4">
            <div className="text-xs text-muted-foreground">{k.r}</div>
            <div className={`mt-1 font-semibold tabular-nums ${k.alerta ? 'text-destructive' : ''}`}>{formatarMoeda(k.v)}</div>
          </Card>
        ))}
      </div>

      <Abas<Aba> atual={aba} aoTrocar={setAba} abas={[{ id: 'empenhos', rotulo: 'Empenhos e entregas', contagem: empenhos.length }, { id: 'faturas', rotulo: 'Faturas', contagem: faturas.length }]} />

      {aba === 'empenhos' && (
        <>
          {podeEditar && <div className="mb-3 flex justify-end"><Button tamanho="sm" onClick={() => setModal({ tipo: 'empenho' })}><Plus className="h-4 w-4" /> Registrar empenho</Button></div>}
          {empenhos.length === 0 ? (
            <Vazio titulo="Nenhum empenho" texto="Registre cada nota de empenho recebida para controlar entregas e o saldo do contrato." />
          ) : (
            <div className="space-y-3">
              {empenhos.map((e) => {
                const entregas = (ent.data ?? []).filter((x) => x.empenho_id === e.id)
                const atrasado = e.prazo_entrega && !['entregue', 'cancelado'].includes(e.status) && diasAte(e.prazo_entrega) < 0
                return (
                  <Card key={e.id} className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">NE {e.numero}</div>
                        <div className="text-xs text-muted-foreground">Emitido {formatarData(e.data_emissao)}{e.prazo_entrega ? ` · entregar até ${formatarData(e.prazo_entrega)}` : ''}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{formatarMoeda(e.valor)}</span>
                        <Badge cor={e.status === 'entregue' ? 'verde' : e.status === 'cancelado' ? 'neutro' : atrasado ? 'vermelho' : 'azul'}>{atrasado ? 'Entrega atrasada' : STATUS_EMPENHO[e.status]}</Badge>
                        {podeEditar && (
                          <>
                            <Button tamanho="sm" variante="contorno" onClick={() => setModal({ tipo: 'entrega', e })}><Truck className="h-3.5 w-3.5" /> Entrega</Button>
                            <button onClick={() => setModal({ tipo: 'empenho', e })} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Editar empenho"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => confirm('Excluir este empenho e suas entregas?') && exclEmp.mutate(e.id)} className="rounded p-1.5 text-muted-foreground hover:text-destructive" aria-label="Excluir empenho"><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
                      </div>
                    </div>
                    {entregas.length > 0 && (
                      <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
                        {entregas.map((x) => (
                          <li key={x.id} className="flex items-center gap-2 text-muted-foreground">
                            <CheckCircle2 className={`h-4 w-4 ${x.status === 'recusada' ? 'text-destructive' : 'text-success'}`} />
                            {formatarData(x.data_entrega)} · {x.descricao || 'Entrega'} {x.valor != null && `· ${formatarMoeda(x.valor)}`} · {x.status}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {aba === 'faturas' && (
        <>
          {podeEditar && <div className="mb-3 flex justify-end"><Button tamanho="sm" onClick={() => setModal({ tipo: 'fatura' })}><Plus className="h-4 w-4" /> Registrar fatura</Button></div>}
          {faturas.length === 0 ? (
            <Vazio titulo="Nenhuma fatura" texto="Registre as notas fiscais emitidas para acompanhar o que já foi pago e o que está atrasado." />
          ) : (
            <Card className="divide-y">
              {faturas.map((f) => (
                <div key={f.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">NF {f.numero_nf || '—'}</div>
                    <div className="text-xs text-muted-foreground">Emitida {formatarData(f.data_emissao)}{f.vencimento ? ` · vence ${formatarData(f.vencimento)}` : ''}{f.data_pagamento ? ` · paga ${formatarData(f.data_pagamento)}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{formatarMoeda(f.valor)}</span>
                    <BadgeFatura f={f} />
                    {podeEditar && f.status !== 'paga' && (
                      <Button tamanho="sm" variante="contorno" onClick={() => salvarFat.mutate({ id: f.id, dados: { status: 'paga', data_pagamento: hojeISO() } })}>Marcar paga</Button>
                    )}
                    {podeEditar && <button onClick={() => setModal({ tipo: 'fatura', f })} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Editar fatura"><Pencil className="h-4 w-4" /></button>}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      <Modal aberto={!!modal} aoFechar={() => setModal(null)} titulo={modal?.tipo === 'editar' ? 'Editar contrato' : modal?.tipo === 'empenho' ? 'Empenho' : modal?.tipo === 'entrega' ? 'Registrar entrega' : 'Fatura'}>
        {modal?.tipo === 'editar' && <ContratoForm contrato={c} aoSalvar={() => setModal(null)} />}
        {modal?.tipo === 'empenho' && <EmpenhoForm contrato={c} empenho={modal.e} aoSalvar={() => setModal(null)} />}
        {modal?.tipo === 'entrega' && <EntregaForm empenho={modal.e} aoSalvar={() => setModal(null)} />}
        {modal?.tipo === 'fatura' && <FaturaForm contrato={c} empenhos={empenhos} fatura={modal.f} aoSalvar={() => setModal(null)} />}
      </Modal>
    </>
  )
}
