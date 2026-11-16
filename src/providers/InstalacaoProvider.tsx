import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, X } from 'lucide-react'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
import { CtxInstalacao } from '@/hooks/useInstalacao'

const emAplicativo = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export function InstalacaoProvider({ children }: { children: ReactNode }) {
  const [standalone, setStandalone] = useState(emAplicativo)
  const [instaladoNestaVisita, setInstaladoNestaVisita] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [descartado, setDescartado] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const [instalando, setInstalando] = useState(false)
  const evento = useRef<InstallEvent | null>(null)
  const emAndamento = useRef(false)
  const aviso = useRef<HTMLElement | null>(null)
  const ocultar = standalone || instaladoNestaVisita
  const mostrarAviso = mobile && !ocultar && !descartado

  useEffect(() => {
    const elemento = aviso.current
    const atualizar = () => document.documentElement.style.setProperty('--instalacao-espaco', elemento ? `${elemento.getBoundingClientRect().height + 24}px` : '0px')
    atualizar()
    const observer = elemento ? new ResizeObserver(atualizar) : null
    if (elemento) observer?.observe(elemento)
    return () => { observer?.disconnect(); document.documentElement.style.removeProperty('--instalacao-espaco') }
  }, [mostrarAviso])

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)')
    const atualizar = () => {
      setStandalone(emAplicativo())
      setMobile(navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
    }
    const receber = (e: Event) => {
      e.preventDefault()
      evento.current = e as InstallEvent
      // Elegibilidade nova permite oferecer novamente, inclusive após uma desinstalação.
      setInstaladoNestaVisita(false)
      setDescartado(false)
      setAjuda(false)
    }
    const concluir = () => {
      evento.current = null
      setInstaladoNestaVisita(true)
      setAjuda(false)
    }
    atualizar()
    window.addEventListener('beforeinstallprompt', receber)
    window.addEventListener('appinstalled', concluir)
    window.addEventListener('pageshow', atualizar)
    window.addEventListener('focus', atualizar)
    media.addEventListener('change', atualizar)
    return () => {
      window.removeEventListener('beforeinstallprompt', receber)
      window.removeEventListener('appinstalled', concluir)
      window.removeEventListener('pageshow', atualizar)
      window.removeEventListener('focus', atualizar)
      media.removeEventListener('change', atualizar)
    }
  }, [])

  async function instalar() {
    if (emAndamento.current) return
    const disponivel = evento.current
    if (!disponivel) { setAjuda(x => !x); setDescartado(false); return }
    // prompt() só é chamado por clique; o navegador mantém o controle da instalação.
    emAndamento.current = true
    setInstalando(true)
    evento.current = null
    try {
      await disponivel.prompt()
      const resposta = await disponivel.userChoice
      if (resposta.outcome === 'accepted') setInstaladoNestaVisita(true)
      else setDescartado(true)
    } catch { setAjuda(true) }
    finally { emAndamento.current = false; setInstalando(false) }
  }

  return <CtxInstalacao.Provider value={{ ocultar, instalando, ajuda, instalar }}>
    {children}
    {mostrarAviso && <section ref={aviso} aria-label="Instalação do LicitaFlow" className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-lg rounded-xl border border-slate-600 bg-slate-900 p-4 text-white shadow-2xl">
      <div className="flex items-start gap-3">
        <img src="/icons/app-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg"/>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Use o LicitaFlow como aplicativo</h2><p className="mt-1 text-xs leading-relaxed text-slate-300">Abra pelo ícone da tela inicial. Se ainda não estiver instalado, instale para usar sem a barra de endereço.</p></div>
        <button aria-label="Fechar aviso de instalação" onClick={() => { setDescartado(true); setAjuda(false) }} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><X className="h-5 w-5"/></button>
      </div>
      <button onClick={instalar} disabled={instalando} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"><Download className="h-4 w-4"/>{instalando ? 'Aguarde…' : 'Instalar aplicativo'}</button>
      {ajuda && <p role="status" className="mt-3 text-sm leading-relaxed text-slate-200">Android: abra no Chrome → menu ⋮ → Instalar aplicativo ou Adicionar à tela inicial. iPhone: Safari → Compartilhar → Adicionar à Tela de Início. Navegadores internos de outros apps podem não oferecer a instalação.</p>}
    </section>}
  </CtxInstalacao.Provider>
}

