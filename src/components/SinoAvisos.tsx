import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Popover from '@radix-ui/react-popover'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { avisoVisivel, type AvisoAlvo } from '@/lib/avisosVisiveis'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'

interface AvisoSino extends AvisoAlvo { id: string; titulo: string; texto: string }

/** Avisos visíveis para a organização atual que o usuário ainda não marcou como lidos.
 *  A chave começa com 'aviso-leituras': o "Marcar como lido" da tela de Avisos também atualiza o sino. */
function useAvisosNaoLidos() {
  const { user } = useAuth()
  const { org } = useOrg()
  return useQuery({
    queryKey: ['aviso-leituras', 'sino', user?.id, org?.id],
    enabled: !!user,
    refetchInterval: 120_000,
    queryFn: async (): Promise<AvisoSino[]> => {
      const { data, error } = await supabase.from('plataforma_avisos')
        .select('id,titulo,texto,ativo,publicar_em,expira_em,org_id,org_ids')
        .order('publicar_em', { ascending: false }).limit(100)
      if (error) throw error
      const avisos = ((data ?? []) as AvisoSino[]).filter((a) => avisoVisivel(a, org?.id))
      if (!avisos.length) return []
      const { data: lidos, error: e2 } = await supabase.from('aviso_leituras').select('aviso_id').eq('user_id', user!.id).in('aviso_id', avisos.map((a) => a.id))
      if (e2) throw e2
      const jaLidos = new Set((lidos ?? []).map((r) => r.aviso_id as string))
      return avisos.filter((a) => !jaLidos.has(a.id))
    },
  })
}

/** Número no ícone do app instalado e, quando tudo foi lido, limpa os avisos da bandeja do aparelho. */
function sincronizarAparelho(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (n > 0) void nav.setAppBadge?.(n).catch(() => undefined)
    else void nav.clearAppBadge?.().catch(() => undefined)
  } catch { /* sem suporte */ }
  if (n === 0 && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then((reg) => reg?.getNotifications({ tag: 'licitaforce-aviso' }))
      .then((lista) => lista?.forEach((x) => x.close())).catch(() => undefined)
  }
}

const botaoIcone = 'relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground/85 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 data-[state=open]:bg-white/10'

/** Sino da barra superior: mostra quantos avisos faltam ler e abre a lista para marcar como lido. */
export default function SinoAvisos() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const q = useAvisosNaoLidos()
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const avisos = q.data ?? []
  const n = avisos.length

  useEffect(() => { if (q.isSuccess) sincronizarAparelho(n) }, [n, q.isSuccess])

  async function marcar(ids: string[]) {
    if (!ids.length || !user) return
    setOcupado(true)
    try {
      const { error } = await supabase.from('aviso_leituras').upsert(ids.map((id) => ({ aviso_id: id, user_id: user.id })), { onConflict: 'aviso_id,user_id', ignoreDuplicates: true })
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['aviso-leituras'] })
    } catch (e) {
      toast.error(mensagemErro(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger className={botaoIcone} aria-label={n ? `Avisos: ${n} não ${n === 1 ? 'lido' : 'lidos'}` : 'Avisos'}>
        <Bell className="h-5 w-5" />
        {n > 0 && <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-black" aria-hidden>{n > 9 ? '9+' : n}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={10} collisionPadding={12}
          className="z-50 flex max-h-[min(32rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-white/10 bg-sidebar text-sidebar-foreground shadow-2xl outline-none">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm font-semibold text-white">Avisos {n > 0 && <span className="font-normal text-sidebar-muted">· {n} não {n === 1 ? 'lido' : 'lidos'}</span>}</p>
            {n > 1 && <button type="button" disabled={ocupado} onClick={() => void marcar(avisos.map((a) => a.id))}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-accent outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50">
              <CheckCheck className="h-4 w-4" />Marcar todos
            </button>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {q.isLoading && <p className="px-4 py-6 text-center text-sm text-sidebar-muted">Carregando…</p>}
            {q.isError && <p className="px-4 py-6 text-center text-sm text-sidebar-muted">Não foi possível consultar os avisos.</p>}
            {q.isSuccess && n === 0 && <p className="px-4 py-8 text-center text-sm text-sidebar-muted">Nenhum aviso novo. Tudo lido.</p>}
            {avisos.map((a) => (
              <div key={a.id} className="border-b border-white/5 px-4 py-3 last:border-b-0">
                <p className="text-sm font-medium text-white">{a.titulo}</p>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-sidebar-foreground/85">{a.texto}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-xs text-sidebar-muted">{formatarDataHora(a.publicar_em)}</span>
                  <button type="button" disabled={ocupado} onClick={() => void marcar([a.id])}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-xs font-medium text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50">
                    <Check className="h-3.5 w-3.5" />Marcar como lido
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Link to="/app/avisos" onClick={() => setAberto(false)} className={cn('block border-t border-white/10 px-4 py-3 text-center text-sm font-medium text-accent outline-none hover:bg-white/5 focus-visible:bg-white/10')}>
            Ver todos os avisos
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
