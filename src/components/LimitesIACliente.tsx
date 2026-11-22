import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { AGENTES_IA, lerLimite, limiteDoPlano, textoLimite, type AgenteIA } from '@/lib/agentesIA'
import { Aviso, Badge, Button, Campo, Card, Input, Modal } from '@/components/ui'

interface FichaIA {
  plano: { id: string; nome: string; limites_ia: Record<string, number | null> } | null
  excecoes: Record<string, number | null>
  uso: Record<string, { novas: number; reaproveitadas: number; custo_usd: number }>
}
const dolar = (v: number) => `US$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`

/** Ficha de IA do cliente no master: limite do plano, exceção do cliente e consumo do mês por agente. */
export function LimitesIACliente({ org }: { org: string }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin-ia-cliente', org], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_ia_cliente', { p_org: org })
    if (error) throw error
    return data as FichaIA
  } })
  const [agente, setAgente] = useState<AgenteIA | null>(null)
  const [valor, setValor] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function gravar(usarPlano: boolean) {
    if (!agente) return
    const limite = usarPlano ? null : lerLimite(valor)
    if (limite === undefined) { toast.error('Use um número inteiro ou deixe em branco para sem limite.'); return }
    setOcupado(true)
    try {
      const { error } = await supabase.rpc('admin_salvar_limite_ia_org', { p_org: org, p_agente: agente.id, p_limite: limite, p_usar_plano: usarPlano })
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['admin-ia-cliente', org] })
      toast.success(usarPlano ? 'O cliente voltou a seguir o limite do plano.' : 'Exceção salva e registrada na auditoria.')
      setAgente(null)
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado(false) }
  }

  return (
    <Card className="mb-6 p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold"><Bot className="h-5 w-5 text-primary" />Agentes de IA</h2>
      <p className="mb-4 text-xs text-muted-foreground">Limite de usos novos por mês. A exceção do cliente vale no lugar do plano. O custo é o estimado da IA neste mês.</p>
      {q.isError ? <Aviso>Ficha de IA indisponível. Verifique se a migração de limites de IA foi aplicada.</Aviso> : (
        <div className="divide-y">
          {AGENTES_IA.map((a) => {
            const plano = limiteDoPlano(q.data?.plano?.limites_ia, a.id)
            const temExcecao = !!q.data && a.id in q.data.excecoes
            const efetivo = temExcecao ? q.data!.excecoes[a.id] : plano
            const uso = q.data?.uso[a.id]
            return (
              <div key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{a.nome} {temExcecao && <Badge cor="amarelo">Exceção</Badge>}</p>
                  <p className="text-sm text-muted-foreground">
                    Plano {q.data?.plano?.nome ?? '—'}: {textoLimite(plano)}{temExcecao && <> · Cliente: {textoLimite(efetivo)}</>}
                  </p>
                  <p className="text-sm">
                    Neste mês: <strong>{uso?.novas ?? 0}</strong>{efetivo !== null && efetivo > 0 ? ` de ${efetivo}` : ''} {a.unidade} novas
                    {uso?.reaproveitadas ? ` · ${uso.reaproveitadas} reaproveitadas` : ''} · {dolar(uso?.custo_usd ?? 0)}
                  </p>
                </div>
                <Button tamanho="sm" variante="contorno" disabled={!q.data} onClick={() => { setAgente(a); setValor(efetivo === null ? '' : String(efetivo)) }}>Ajustar limite</Button>
              </div>
            )
          })}
        </div>
      )}
      <Modal aberto={!!agente} aoFechar={() => { if (!ocupado) setAgente(null) }} titulo={`Limite do ${agente?.nome ?? ''} para este cliente`}>
        <div className="space-y-4">
          <Campo rotulo={`${agente?.unidade ?? 'Usos'} novos por mês`} htmlFor="ia-limite-cliente" ajuda="Em branco = sem limite; 0 = bloqueado para este cliente.">
            <Input id="ia-limite-cliente" type="number" min={0} step={1} value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
          <div className="flex flex-wrap gap-2">
            <Button carregando={ocupado} onClick={() => gravar(false)}>Salvar exceção</Button>
            <Button variante="contorno" disabled={ocupado} onClick={() => gravar(true)}>Usar o limite do plano</Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
