import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Download, MoreVertical, Share, SquarePlus, X } from 'lucide-react'
import { appJaInstalado, instalacaoLembrada, lembrarInstalacao } from '@/lib/instalacao'
import { emAppInstalado } from '@/lib/pwa'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
import { CtxInstalacao } from '@/hooks/useInstalacao'

const ehIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
/** Celular ou tablet. No computador o botão de instalar não aparece. */
const ehMovel = () => (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true
  || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || ehIOS()
/** Pedido de instalação guardado por public/pwa.js antes do React carregar (o Chrome pode disparar cedo). */
const pedidoAntecipado = () => ((window as Window & { __lfInstalar?: InstallEvent | null }).__lfInstalar ?? null)
const emAplicativo = emAppInstalado

export function InstalacaoProvider({ children }: { children: ReactNode }) {
  const [standalone, setStandalone] = useState(emAplicativo)
  const [instaladoNestaVisita, setInstaladoNestaVisita] = useState(false)
  const [mobile, setMobile] = useState(ehMovel)
  const [jaInstalado, setJaInstalado] = useState(instalacaoLembrada)
  const [conferindo, setConferindo] = useState(true)
  // O Chrome só oferece a instalação (beforeinstallprompt) quando o app NÃO está instalado neste aparelho.
  const [disponivel, setDisponivel] = useState(() => !!pedidoAntecipado())
  const [descartado, setDescartado] = useState(false)
  const [ajuda, setAjuda] = useState(false)
  const [instalando, setInstalando] = useState(false)
  const evento = useRef<InstallEvent | null>(pedidoAntecipado())
  const emAndamento = useRef(false)
  const aviso = useRef<HTMLElement | null>(null)
  const [ios] = useState(ehIOS)
  const [master, setMaster] = useState(false)
  // Some no computador, dentro do app e quando o app já está instalado. No Android só aparece quando o navegador
  // pode instalar na hora. No iPhone/iPad também aceita a confirmação manual do usuário.
  const instalado = standalone || instaladoNestaVisita || jaInstalado
  const ocultar = conferindo || instalado || !mobile || (!ios && !disponivel)
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
    let versao = 0
    let ativo = true
    const atualizar = () => {
      const consulta = ++versao
      setStandalone(emAplicativo())
      setMobile(ehMovel())
      void appJaInstalado().then(valor => {
        if (!ativo || consulta !== versao) return
        setJaInstalado(valor)
        setConferindo(false)
      })
    }
    const receber = (e: Event) => {
      ++versao
      e.preventDefault()
      lembrarInstalacao(false)
      evento.current = e as InstallEvent
      setDisponivel(true)
      setJaInstalado(false)
      setConferindo(false)
      // Elegibilidade nova permite oferecer novamente, inclusive após uma desinstalação.
      setInstaladoNestaVisita(false)
      setDescartado(false)
      setAjuda(false)
    }
    const concluir = () => {
      ++versao
      lembrarInstalacao(true)
      evento.current = null
      setDisponivel(false)
      setInstaladoNestaVisita(true)
      setJaInstalado(true)
      setConferindo(false)
      setAjuda(false)
    }
    if (pedidoAntecipado()) receber(pedidoAntecipado()!)
    else atualizar()
    const visivel = () => { if (document.visibilityState === 'visible') atualizar() }
    const armazenamento = () => atualizar()
    window.addEventListener('beforeinstallprompt', receber)
    window.addEventListener('appinstalled', concluir)
    window.addEventListener('pageshow', atualizar)
    window.addEventListener('focus', atualizar)
    window.addEventListener('storage', armazenamento)
    document.addEventListener('visibilitychange', visivel)
    media.addEventListener('change', atualizar)
    return () => {
      ativo = false
      window.removeEventListener('beforeinstallprompt', receber)
      window.removeEventListener('appinstalled', concluir)
      window.removeEventListener('pageshow', atualizar)
      window.removeEventListener('focus', atualizar)
      window.removeEventListener('storage', armazenamento)
      document.removeEventListener('visibilitychange', visivel)
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
    ;(window as Window & { __lfInstalar?: InstallEvent | null }).__lfInstalar = null
    setDisponivel(false)
    try {
      await disponivel.prompt()
      const resposta = await disponivel.userChoice
      if (resposta.outcome === 'accepted') { lembrarInstalacao(true); setInstaladoNestaVisita(true) }
      else setDescartado(true)
    } catch { setAjuda(true) }
    finally { emAndamento.current = false; setInstalando(false) }
  }

  return <CtxInstalacao.Provider value={{ ocultar, instalado, conferindo, instalando, ajuda, instalar }}>
    {children}
    {mostrarAviso && <section ref={aviso} aria-label="Instalação do LicitaForce" className="fixed inset-x-3 bottom-[calc(var(--barra-inferior,0px)+max(.75rem,env(safe-area-inset-bottom)))] z-30 mx-auto max-w-lg rounded-xl border border-slate-600 bg-slate-900 p-4 text-white shadow-2xl">
      <div className="flex items-start gap-3">
        <img src="/icons/icone-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg"/>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Use o LicitaForce como aplicativo</h2><p className="mt-1 text-xs leading-relaxed text-slate-300">Instale e abra pelo ícone da tela inicial, sem a barra de endereço do navegador.</p></div>
        <button aria-label="Fechar aviso de instalação" onClick={() => { setDescartado(true); setAjuda(false) }} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"><X className="h-5 w-5"/></button>
      </div>
      <button onClick={instalar} disabled={instalando} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"><Download className="h-4 w-4"/>{instalando ? 'Aguarde…' : 'Instalar aplicativo'}</button>
      {ios && <button onClick={() => { lembrarInstalacao(true); setJaInstalado(true); setAjuda(false) }} className="ml-2 inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium hover:bg-slate-800">Já instalei</button>}
    </section>}
    <Dialog.Root open={ajuda} onOpenChange={setAjuda}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-[60] mx-auto max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white shadow-2xl focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2">
          <div className="flex items-start gap-3">
            <img src={master ? '/icons/master-192.png' : '/icons/icone-192.png'} alt="" className="h-11 w-11 shrink-0 rounded-xl"/>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-semibold">Instalar {master ? 'LicitaForce Master' : 'LicitaForce'}</Dialog.Title>
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

