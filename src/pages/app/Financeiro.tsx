import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { CabecalhoPagina, Card, Carregando, Select, Vazio } from '@/components/ui'
import { diasAte, formatarData, formatarMoeda } from '@/lib/format'
import { useLista, useSalvar } from '@/hooks/useDados'
import { useOrg } from '@/providers/OrgProvider'
import type { Contrato, Fatura } from '@/types/db'
import { BadgeFatura } from './contratos/ContratoDetalhe'

export default function Financeiro() {
  const { podeEditar } = useOrg()
  const [filtro, setFiltro] = useState('abertas')
  const contratos = useLista<Contrato>('contratos')
  const fat = useLista<Fatura>('faturas', { porEmpresa: false, ordem: ['vencimento', true] })
  const { salvar } = useSalvar('faturas')

  // Faturas só dos contratos visíveis (respeita a empresa selecionada)
  const mapa = useMemo(() => new Map((contratos.data ?? []).map((c) => [c.id, c])), [contratos.data])
  const faturas = useMemo(() => (fat.data ?? []).filter((f) => f.contrato_id && mapa.has(f.contrato_id)), [fat.data, mapa])

  const validas = faturas.filter((f) => f.status !== 'cancelada')
  const aReceber = validas.filter((f) => f.status !== 'paga')
  const atrasadas = aReceber.filter((f) => f.vencimento && diasAte(f.vencimento) < 0)
  const pagas = validas.filter((f) => f.status === 'paga')
  const soma = (l: Fatura[]) => l.reduce((a, f) => a + Number(f.valor), 0)

  // Prazo médio de pagamento por órgão (dias entre emissão e pagamento)
  const porOrgao = useMemo(() => {
    const m = new Map<string, { dias: number[]; aberto: number }>()
    for (const f of validas) {
      const nome = mapa.get(f.contrato_id!)?.orgao_nome || 'Órgão não informado'
      const r = m.get(nome) ?? { dias: [], aberto: 0 }
      if (f.status === 'paga' && f.data_emissao && f.data_pagamento) {
        r.dias.push(Math.round((new Date(f.data_pagamento).getTime() - new Date(f.data_emissao).getTime()) / 86_400_000))
      } else if (f.status !== 'paga') r.aberto += Number(f.valor)
      m.set(nome, r)
    }
    return [...m.entries()].map(([orgao, r]) => ({ orgao, media: r.dias.length ? Math.round(r.dias.reduce((a, b) => a + b, 0) / r.dias.length) : null, n: r.dias.length, aberto: r.aberto }))
      .sort((a, b) => b.aberto - a.aberto)
  }, [validas, mapa])

  const lista = filtro === 'abertas' ? aReceber : filtro === 'atrasadas' ? atrasadas : filtro === 'pagas' ? pagas : faturas
  const cards = [
    { r: 'A receber', v: soma(aReceber), sub: `${aReceber.length} fatura(s)` },
    { r: 'Atrasado', v: soma(atrasadas), sub: `${atrasadas.length} fatura(s)`, alerta: atrasadas.length > 0 },
    { r: 'Recebido', v: soma(pagas), sub: `${pagas.length} fatura(s)` },
  ]

  if (contratos.isLoading || fat.isLoading) return <Carregando />

  return (
    <>
      <CabecalhoPagina titulo="Financeiro" descricao="Faturamento dos contratos: o que já foi pago, o que está para receber e quem atrasa." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {cards.map((k) => (
          <Card key={k.r} className="p-5">
            <div className="text-sm text-muted-foreground">{k.r}</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${k.alerta ? 'text-destructive' : ''}`}>{formatarMoeda(k.v)}</div>
            <div className="text-xs text-muted-foreground">{k.sub}</div>
          </Card>
        ))}
      </div>

      {faturas.length === 0 ? (
        <Vazio icone={Wallet} titulo="Nenhuma fatura registrada" texto="Registre as notas fiscais dentro de cada contrato (aba Faturas). Aqui você acompanha tudo consolidado." acao={<Link to="/app/contratos" className="text-sm text-primary hover:underline">Ir para contratos</Link>} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Faturas</h2>
              <Select className="h-9 w-44" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtro">
                <option value="abertas">A receber</option>
                <option value="atrasadas">Atrasadas</option>
                <option value="pagas">Pagas</option>
                <option value="todas">Todas</option>
              </Select>
            </div>
            <Card className="divide-y">
              {lista.map((f) => {
                const c = mapa.get(f.contrato_id!)
                return (
                  <div key={f.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">NF {f.numero_nf || '—'} · {c?.orgao_nome}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        <Link to={`/app/contratos/${c?.id}`} className="hover:text-primary hover:underline">Contrato {c?.numero ?? ''}</Link>
                        {f.vencimento ? ` · vence ${formatarData(f.vencimento)}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatarMoeda(f.valor)}</span>
                      <BadgeFatura f={f} />
                      {podeEditar && f.status !== 'paga' && f.status !== 'cancelada' && (
                        <button onClick={() => salvar.mutate({ id: f.id, dados: { status: 'paga', data_pagamento: new Date().toISOString().slice(0, 10) } })} className="text-xs text-primary hover:underline">Marcar paga</button>
                      )}
                    </div>
                  </div>
                )
              })}
              {lista.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nada aqui.</div>}
            </Card>
          </div>
          <div>
            <h2 className="mb-3 font-semibold">Pagamento por órgão</h2>
            <Card className="divide-y">
              {porOrgao.map((o) => (
                <div key={o.orgao} className="p-4">
                  <div className="truncate text-sm font-medium">{o.orgao}</div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>{o.media != null ? `Paga em média em ${o.media} dias (${o.n} NF)` : 'Sem pagamentos ainda'}</span>
                    {o.aberto > 0 && <span className="tabular-nums">{formatarMoeda(o.aberto)} em aberto</span>}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
