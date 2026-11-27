import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card } from '@/components/ui'
import { useAuth } from '@/providers/AuthProvider'
import { supabase, mensagemErro } from '@/lib/supabase'
import { ativarPush, sincronizarPush, observarPermissao, precisaInstalar, testarPush, type EstadoPush } from '@/lib/push'

type Preferencias = { radar: boolean; sentinela: boolean; resumo_diario: boolean }
const PADRAO: Preferencias = { radar: true, sentinela: true, resumo_diario: true }
const OPCOES: { id: keyof Preferencias; titulo: string; texto: string }[] = [
  { id: 'radar', titulo: 'Oportunidades do Radar', texto: 'Quando a busca diária encontrar novas oportunidades para suas empresas.' },
  { id: 'sentinela', titulo: 'Mudanças da Sentinela', texto: 'Alterações de prazo, documentos, situação e resultado dos processos acompanhados.' },
  { id: 'resumo_diario', titulo: 'Resumo diário das IAs', texto: 'Às 8h de Brasília, o trabalho registrado nas últimas 24 horas pelo Radar, Sentinela, Leitor e Cotador. Enviado quando houver atividade.' },
]

export default function PushAgentes() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [estado, setEstado] = useState<EstadoPush | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const chave = ['push-agentes-preferencias', user?.id]
  const preferencias = useQuery({ queryKey: chave, enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.from('push_agentes_preferencias').select('radar,sentinela,resumo_diario').eq('user_id', user!.id).maybeSingle()
    if (error) throw error
    return (data ?? PADRAO) as Preferencias
  } })

  useEffect(() => {
    let ativo = true
    const atualizar = () => { void sincronizarPush().then(e => { if (ativo) setEstado(e) }).catch(() => { if (ativo) setEstado('inativo') }) }
    atualizar()
    const parar = observarPermissao(atualizar)
    return () => { ativo = false; parar() }
  }, [user?.id])

  async function ativar() {
    setOcupado(true)
    try {
      const e = await ativarPush(); setEstado(e)
      if (e === 'ativo') toast.success('Avisos das IAs ativados neste aparelho.')
      else if (e === 'negado') toast.error('Permita as notificações nas configurações deste site no navegador.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado(false) }
  }
  async function salvar(id: keyof Preferencias, valor: boolean) {
    if (!user || !preferencias.data) return
    setSalvando(true)
    const proxima = { ...preferencias.data, [id]: valor }
    try {
      const { error } = await supabase.from('push_agentes_preferencias').upsert({ user_id: user.id, ...proxima })
      if (error) throw error
      qc.setQueryData(chave, proxima)
      toast.success('Preferência salva em todos os seus aparelhos.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setSalvando(false) }
  }
  async function testar() {
    setOcupado(true)
    try {
      const r = await testarPush()
      if (r.enviados) toast.success(`Teste aceito pelo serviço de push em ${r.enviados} aparelho(s).`)
      else toast.error('Nenhum aparelho recebeu o teste. Ative novamente as notificações em Avisos.')
      if (r.falhas) toast.warning(`${r.falhas} aparelho(s) recusaram o teste. Confira os detalhes na tela de Avisos.`)
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado(false) }
  }
  return <Card className="mb-6 space-y-4 p-5 sm:p-6">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><BellRing className="h-5 w-5 text-primary" />Notificações das IAs</h2>
    <p className="text-sm text-muted-foreground">Saiba o que seus agentes fizeram, mesmo com o app fechado. Escolha os avisos da sua conta e ative cada aparelho que deve recebê-los.</p>
    {estado === 'ativo' ? <div className="flex flex-wrap items-center gap-3"><p className="text-sm">Notificações ativas neste aparelho.</p><Button variante="contorno" tamanho="sm" carregando={ocupado} onClick={testar}>Testar push</Button></div>
      : estado === 'negado' ? <p className="text-sm">Notificações bloqueadas. Libere a permissão deste site nas configurações do navegador.</p>
        : estado === 'sem-suporte' ? <p className="text-sm">{precisaInstalar() ? 'No iPhone, adicione o LicitaForce à Tela de Início e abra o app por lá para ativar.' : 'Este navegador não oferece suporte a notificações push.'}</p>
          : <Button carregando={ocupado || estado === null} onClick={ativar}>Ativar notificações neste aparelho</Button>}
    {preferencias.isError ? <div role="alert" className="text-sm">Não foi possível carregar suas preferências. <button className="font-medium text-primary underline" onClick={() => void preferencias.refetch()}>Tentar novamente</button></div>
      : <div className="divide-y">{OPCOES.map(o => <label key={o.id} className="flex cursor-pointer items-start gap-3 py-3">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={preferencias.data?.[o.id] ?? true} disabled={!preferencias.data || salvando} onChange={e => void salvar(o.id, e.target.checked)} />
        <span><span className="text-sm font-medium">{o.titulo}</span><span className="mt-0.5 block text-sm text-muted-foreground">{o.texto}</span></span>
      </label>)}</div>}
  </Card>
}
