import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Gift } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { Aviso, Badge, Button, Campo, Card, Input } from '@/components/ui'

interface Status { dias: number; bloquear: boolean; em_teste: number; bloqueadas: number }

/** Prazo do teste grátis (vale para novos cadastros e aparece na landing) e bloqueio ao vencer. */
export function TesteGratisConfig() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin-teste-status'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_teste_status'); if (error) throw error; return data as Status
  }, retry: false })
  const [dias, setDias] = useState('14')
  const [bloquear, setBloquear] = useState(true)
  const [ajustar, setAjustar] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { if (q.data) { setDias(String(q.data.dias)); setBloquear(q.data.bloquear) } }, [q.data])

  async function salvar() {
    const n = Number(dias)
    if (!Number.isInteger(n) || n < 1 || n > 90) return toast.error('Informe de 1 a 90 dias.')
    if (ajustar && !confirm(`Recalcular todos os testes em andamento para ${n} dias a partir da data de cadastro de cada conta? Quem ficar com o teste vencido será bloqueado na próxima rotina${bloquear ? '' : ' (bloqueio desligado)'}.`)) return
    setOcupado(true)
    try {
      const { data, error } = await supabase.rpc('admin_teste_gratis', { p_dias: n, p_bloquear: bloquear, p_ajustar_atuais: ajustar })
      if (error) throw error
      await Promise.all(['admin-teste-status', 'dias-teste-gratis', 'admin-orgs', 'admin-resumo', 'admin-financeiro'].map(k => qc.invalidateQueries({ queryKey: [k] })))
      setAjustar(false)
      toast.success(ajustar ? `Prazo salvo e ${data} teste(s) recalculado(s).` : 'Prazo salvo. A landing page já mostra o novo prazo.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado(false) }
  }

  return <Card className="mb-5 space-y-4 p-5">
    <div className="flex flex-wrap items-center gap-2">
      <Gift className="h-5 w-5 text-primary" /><h2 className="flex-1 font-semibold">Teste grátis</h2>
      {q.data && <Badge cor="azul">{q.data.dias} dias</Badge>}
    </div>
    {q.isError && <Aviso>{mensagemErro(q.error)} — aplique a migração do teste grátis.</Aviso>}
    {q.data && <>
      <p className="text-sm text-muted-foreground">{q.data.em_teste} conta(s) em teste agora · {q.data.bloqueadas} bloqueada(s) por teste vencido.</p>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-end">
        <Campo rotulo="Duração (dias)" htmlFor="teste-dias"><Input id="teste-dias" type="number" min={1} max={90} value={dias} onChange={e => setDias(e.target.value)} /></Campo>
        <p className="pb-2 text-sm text-muted-foreground">Vale para novos cadastros e aparece na landing page e no cadastro ("{dias || '—'} dias grátis").</p>
      </div>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={bloquear} onChange={e => setBloquear(e.target.checked)} />
        <span>Bloquear o acesso quando o teste vencer sem plano contratado. <span className="text-muted-foreground">O cliente vê a tela para contratar e volta na hora ao pagar. Estender o teste na ficha do cliente também libera.</span></span></label>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={ajustar} onChange={e => setAjustar(e.target.checked)} />
        <span>Aplicar o novo prazo também aos testes em andamento <span className="text-muted-foreground">(recalcula a partir da data de cadastro de cada conta).</span></span></label>
      <Button carregando={ocupado} onClick={salvar}>Salvar teste grátis</Button>
    </>}
  </Card>
}
