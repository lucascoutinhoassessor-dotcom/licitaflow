import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { itensDaTela, notificacoesDosItens } from '@/lib/sinoSincronia'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Popover from '@radix-ui/react-popover'
import { Bell, Check, CheckCheck, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { avisoVisivel, type AvisoAlvo } from '@/lib/avisosVisiveis'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'

/** Item do sino: aviso do master (plataforma_avisos) ou mensagem do próprio usuário (notificacoes: IA e lembretes). */
interface ItemSino { tipo: 'aviso' | 'mensagem'; id: string; titulo: string; texto: string; data: string; link: string | null; ia: boolean }

/** Não lidos do usuário na organização atual, mais recentes primeiro.
 *  A chave começa com 'aviso-leituras': o "Marcar como lido" da tela de Avisos também atualiza o sino. */
function useNaoLidos() {
  const { user } = useAuth()
  const { org } = useOrg()
  return useQuery({
    queryKey: ['aviso-leituras', 'sino', user?.id, org?.id],
    enabled: !!user,
    refetchInterval: 120_000,
    // O app desliga isso globalmente; no sino, voltar para o app (ou desbloquear o celular) já traz o número certo.
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    queryFn: async (): Promise<ItemSino[]> => {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString()
      let consultaMsg = supabase.from('notificacoes').select('id,titulo,mensagem,link,tipo,created_at')
        .is('lida_em', null).eq('user_id', user!.id).gte('created_at', desde).order('created_at', { ascending: false }).limit(50)
      if (org?.id) consultaMsg = consultaMsg.eq('org_id', org.id)
      const [av, msg] = await Promise.all([
        supabase.from('plataforma_avisos').select('id,titulo,texto,ativo,publicar_em,expira_em,org_id,org_ids').order('publicar_em', { ascending: false }).limit(100),
        consultaMsg,
      ])
      if (av.error) throw av.error
      if (msg.error) throw msg.error
      const avisos = ((av.data ?? []) as (AvisoAlvo & { id: string; titulo: string; texto: string })[]).filter((a) => avisoVisivel(a, org?.id))
      let naoLidos = avisos
      if (avisos.length) {
        const { data: lidos, error } = await supabase.from('aviso_leituras').select('aviso_id').eq('user_id', user!.id).in('aviso_id', avisos.map((a) => a.id))
        if (error) throw error
        const jaLidos = new Set((lidos ?? []).map((r) => r.aviso_id as string))
        naoLidos = avisos.filter((a) => !jaLidos.has(a.id))
      }
      return [
        ...naoLidos.map((a): ItemSino => ({ tipo: 'aviso', id: a.id, titulo: a.titulo, texto: a.texto, data: a.publicar_em, link: null, ia: false })),
        ...(msg.data ?? []).map((m): ItemSino => ({ tipo: 'mensagem', id: m.id, titulo: m.titulo, texto: m.mensagem ?? '', data: m.created_at, link: m.link, ia: m.tipo === 'ia' })),
      ].sort((a, b) => b.data.localeCompare(a.data))
    },
  })
}

/** Número no ícone do app instalado e, quando tudo foi lido, limpa as notificações da bandeja do aparelho. */
function sincronizarAparelho(n: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (n > 0) void nav.setAppBadge?.(n).catch(() => undefined)
    else void nav.clearAppBadge?.().catch(() => undefined)
  } catch { /* sem suporte */ }
  if (n === 0 && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then((reg) => reg?.getNotifications())
      .then((lista) => lista?.forEach((x) => x.close())).catch(() => undefined)
  }
}

/** Fecha na barra do celular as notificações que levam às telas dos itens lidos: o número do ícone desce junto. */
function fecharNaBarra(lista: ItemSino[]) {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.getRegistration().then((reg) => reg?.getNotifications())
    .then((abertas) => notificacoesDosItens(abertas ?? [], lista, location.origin).forEach((x) => x.close())).catch(() => undefined)
}

const linkInterno =(l: string | null) => (l && /^\/app(\/[a-z0-9/_-]*)?$/.test(l) ? l : null)
const botaoIcone = 'relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground/85 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 data-[state=open]:bg-white/10'
const botaoAcao = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-xs font-medium text-white outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50'

/** Sino da barra superior: avisos do LicitaForce e mensagens das IAs, com "Marcar como lido". */
export default function SinoAvisos() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const q = useNaoLidos()
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const itens = q.data ?? []
  const n = itens.length

  useEffect(() => { if (q.isSuccess) sincronizarAparelho(n) }, [n, q.isSuccess])

  // Push chegou (public/sw.js avisa as janelas abertas com 'push-ping'): o sino muda na hora, sem recarregar.
  // Ao voltar para a tela (app em segundo plano, celular desbloqueado) também consulta de novo.
  const refetch = q.refetch
  useEffect(() => {
    const aoPush = (e: MessageEvent) => { if (e.data?.tipo === 'push-ping') void refetch() }
    const aoVoltar = () => { if (document.visibilityState === 'visible') void refetch() }
    const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null
    sw?.addEventListener('message', aoPush)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      sw?.removeEventListener('message', aoPush)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [refetch])

  // Veio de um push (public/sw.js abre a tela com ?de=push): os itens do sino desta tela viram lidos
  // e o parâmetro sai do endereço.
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const tratado = useRef<string | null>(null)
  useEffect(() => {
    const p = new URLSearchParams(search)
    if (p.get('de') !== 'push' || !q.isSuccess) return
    const chave = pathname + search
    if (tratado.current === chave) return
    tratado.current = chave
    p.delete('de')
    navigate({ pathname, search: p.toString() ? `?${p}` : '' }, { replace: true })
    // Consulta de novo antes de marcar: com o app já aberto, a lista pode ser de antes do push.
    void q.refetch().then((r) => marcar(itensDaTela(r.data ?? [], pathname)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search, q.isSuccess])

  async function marcar(lista: ItemSino[]) {
    if (!lista.length || !user) return
    setOcupado(true)
    try {
      const avisos = lista.filter((x) => x.tipo === 'aviso').map((x) => x.id)
      const mensagens = lista.filter((x) => x.tipo === 'mensagem').map((x) => x.id)
      const [a, m] = await Promise.all([
        avisos.length ? supabase.from('aviso_leituras').upsert(avisos.map((id) => ({ aviso_id: id, user_id: user.id })), { onConflict: 'aviso_id,user_id', ignoreDuplicates: true }) : null,
        mensagens.length ? supabase.from('notificacoes').update({ lida_em: new Date().toISOString() }).in('id', mensagens) : null,
      ])
      if (a?.error) throw a.error
      if (m?.error) throw m.error
      fecharNaBarra(lista)
      await qc.invalidateQueries({ queryKey: ['aviso-leituras'] })
    } catch (e) {
      toast.error(mensagemErro(e))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger className={botaoIcone} aria-label={n ? `Notificações: ${n} não ${n === 1 ? 'lida' : 'lidas'}` : 'Notificações'}>
        <Bell className="h-5 w-5" />
        {n > 0 && <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-black" aria-hidden>{n > 9 ? '9+' : n}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={10} collisionPadding={12}
          className="z-50 flex max-h-[min(32rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-white/10 bg-sidebar text-sidebar-foreground shadow-2xl outline-none">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm font-semibold text-white">Notificações {n > 0 && <span className="font-normal text-sidebar-muted">· {n} não {n === 1 ? 'lida' : 'lidas'}</span>}</p>
            {n > 1 && <button type="button" disabled={ocupado} onClick={() => void marcar(itens)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-accent outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50">
              <CheckCheck className="h-4 w-4" />Marcar todas
            </button>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {q.isLoading && <p className="px-4 py-6 text-center text-sm text-sidebar-muted">Carregando…</p>}
            {q.isError && <p className="px-4 py-6 text-center text-sm text-sidebar-muted">Não foi possível consultar as notificações.</p>}
            {q.isSuccess && n === 0 && <p className="px-4 py-8 text-center text-sm text-sidebar-muted">Nenhuma notificação nova. Tudo lido.</p>}
            {itens.map((x) => {
              const destino = linkInterno(x.link)
              return (
                <div key={`${x.tipo}-${x.id}`} className="border-b border-white/5 px-4 py-3 last:border-b-0">
                  <p className="flex items-start gap-1.5 text-sm font-medium text-white">
                    {x.ia && <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-label="Mensagem da IA" />}
                    <span>{x.titulo}</span>
                  </p>
                  <p className="mt-1 line-clamp-5 whitespace-pre-wrap text-sm text-sidebar-foreground/85">{x.texto}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-xs text-sidebar-muted">{formatarDataHora(x.data)}</span>
                    {destino && <Link to={destino} onClick={() => { setAberto(false); void marcar([x]) }} className={botaoAcao}>Abrir</Link>}
                    <button type="button" disabled={ocupado} onClick={() => void marcar([x])} className={botaoAcao}>
                      <Check className="h-3.5 w-3.5" />Marcar como lida
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <Link to="/app/avisos" onClick={() => setAberto(false)} className={cn('block border-t border-white/10 px-4 py-3 text-center text-sm font-medium text-accent outline-none hover:bg-white/5 focus-visible:bg-white/10')}>
            Ver todos os avisos
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
