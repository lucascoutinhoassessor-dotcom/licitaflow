import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui'
import { useAuth } from '@/providers/AuthProvider'
import { supabase, mensagemErro } from '@/lib/supabase'

type Pref = { lembretes: boolean; canal_reserva: boolean }
const OPCOES: { id: keyof Pref; titulo: string; texto: string }[] = [
  { id: 'lembretes', titulo: 'Lembretes de pendências', texto: 'Prazos chegando, documentos vencendo, tarefas atrasadas e passos que faltam na sua conta.' },
  { id: 'canal_reserva', titulo: 'E-mail e WhatsApp', texto: 'Quando nenhum aparelho seu estiver com as notificações ativas, os avisos chegam pelo e-mail ou celular do seu cadastro.' },
]

/** Preferências da conta (valem em todos os aparelhos) para lembretes e para o canal de reserva. */
export default function PreferenciasLembretes() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const chave = ['preferencias-lembretes', user?.id]
  const [salvando, setSalvando] = useState(false)
  const q = useQuery({ queryKey: chave, enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.from('push_agentes_preferencias').select('lembretes,canal_reserva').eq('user_id', user!.id).maybeSingle()
    if (error) throw error
    return (data ?? { lembretes: true, canal_reserva: true }) as Pref
  } })
  async function salvar(id: keyof Pref, valor: boolean) {
    if (!user || !q.data) return
    setSalvando(true)
    try {
      const { error } = await supabase.from('push_agentes_preferencias').upsert({ user_id: user.id, [id]: valor })
      if (error) throw error
      qc.setQueryData(chave, { ...q.data, [id]: valor })
      toast.success('Preferência salva.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setSalvando(false) }
  }
  return <Card className="mt-6 p-6">
    <h2 className="font-semibold">Lembretes e avisos</h2>
    {q.isError ? <p role="alert" className="mt-3 text-sm">Não foi possível carregar suas preferências. <button className="font-medium text-primary underline" onClick={() => void q.refetch()}>Tentar novamente</button></p>
      : <div className="mt-2 divide-y">{OPCOES.map(o => <label key={o.id} className="flex cursor-pointer items-start gap-3 py-3">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={q.data?.[o.id] ?? true} disabled={!q.data || salvando} onChange={e => void salvar(o.id, e.target.checked)} />
        <span><span className="text-sm font-medium">{o.titulo}</span><span className="mt-0.5 block text-sm text-muted-foreground">{o.texto}</span></span>
      </label>)}</div>}
  </Card>
}
