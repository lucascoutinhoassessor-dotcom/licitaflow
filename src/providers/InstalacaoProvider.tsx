import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Download, MoreVertical, Share, SquarePlus, X } from 'lucide-react'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
import { CtxInstalacao } from '@/hooks/useInstalacao'

const ehIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
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
  const [ios] = useState(ehIOS)
  const [master, setMaster] = useState(false)
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
    setMaster(location.pathname.startsWith('/master'))
    const disponivel = evento.current
    if (!disponivel) { setAjuda(true); return }
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
    {mostrarAviso && <section ref={aviso} aria-label="Instalação do LicitaFlow" className="fixed inset-x-3 bottom-[calc(var(--barra-inferior,0px)+max(.75rem,env(safe-area-inset-bottom)))] z-30 mx-auto max-w-lg rounded-xl border border-slate-600 bg-slate-900 p-4 text-white shadow-2xl">
      <div className="flex items-start gap-3">
        <img src="/icons/app-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg"/>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Use o LicitaFlow como aplicativo</h2><p className="mt-1 text-xs leading-relaxed text-slate-300">Abra pelo ícone da tela inicial. Se ainda não estiver instalado, instale para usar sem a barra de endereço.</p></div>
        <button aria-label="Fechar aviso de instalação" onClick={() => { setDescartado(true); setAjuda(false) }} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><X className="h-5 w-5"/></button>
      </div>
      <button onClick={instalar} disabled={instalando} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"><Download className="h-4 w-4"/>{instalando ? 'Aguarde…' : 'Instalar aplicativo'}</button>
    </section>}
    <Dialog.Root open={ajuda} onOpenChange={setAjuda}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-[60] mx-auto max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2">
          <div className="flex items-start gap-3">
            <img src={master ? '/icons/master-192.png' : '/icons/app-192.png'} alt="" className="h-11 w-11 shrink-0 rounded-xl"/>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-semibold">Instalar {master ? 'LicitaFlow Master' : 'LicitaFlow'}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-300">{master ? 'O app abre direto no painel master.' : 'O app abre direto no seu painel.'}</Dialog.Description>
            </div>
            <Dialog.Close aria-label="Fechar" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><X className="h-5 w-5"/></Dialog.Close>
          </div>
          {ios
            ? <ol className="mt-4 space-y-3 text-sm">
                <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold">1</span><span>Abra esta página no <b>Safari</b>.</span></li>
                <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold">2</span><span>Toque em <b>Compartilhar</b> <Share className="inline h-4 w-4 align-[-2px]"/> na barra do Safari.</span></li>
                <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold">3</span><span>Escolha <b>Adicionar à Tela de Início</b> <SquarePlus className="inline h-4 w-4 align-[-2px]"/> e confirme.</span></li>
              </ol>
            : <ol className="mt-4 space-y-3 text-sm">
                <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold">1</span><span>Abra esta página no <b>Chrome</b> (ou Edge).</span></li>
                <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold">2</span><span>Toque no menu <MoreVertical className="inline h-4 w-4 align-[-2px]"/> do navegador.</span></li>
                <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold">3</span><span>Escolha <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</span></li>
              </ol>}
          <p className="mt-4 text-xs leading-relaxed text-slate-400">Depois, abra pelo ícone criado na tela inicial. Navegadores internos de outros apps (Instagram, WhatsApp) não oferecem a instalação. Se o app já estiver instalado, abra-o pelo ícone.</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </CtxInstalacao.Provider>
}

