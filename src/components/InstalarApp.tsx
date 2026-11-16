import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Card } from '@/components/ui'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
export function InstalarApp({ compacto = false }: { compacto?: boolean }) {
  const [evento, setEvento] = useState<InstallEvent | null>(null)
  const [instalado, setInstalado] = useState(() => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
  const [ajuda, setAjuda] = useState(false)
  useEffect(() => {
    const receber = (e: Event) => { e.preventDefault(); setEvento(e as InstallEvent) }
    const concluir = () => { setInstalado(true); setEvento(null) }
    window.addEventListener('beforeinstallprompt', receber)
    window.addEventListener('appinstalled', concluir)
    return () => { window.removeEventListener('beforeinstallprompt', receber); window.removeEventListener('appinstalled', concluir) }
  }, [])
  if (instalado) return null
  async function instalar() {
    if (!evento) return setAjuda(x => !x)
    await evento.prompt()
    const resultado = await evento.userChoice
    if (resultado.outcome === 'accepted') setInstalado(true)
    setEvento(null)
  }
  const conteudo = <>
    {!compacto && <><h2 className="font-semibold">LicitaFlow no seu celular</h2><p className="mt-2 text-sm text-muted-foreground">Instale e abra pelo ícone da tela inicial para usar em uma janela sem a barra de endereço do navegador.</p></>}
    <Button className={compacto ? '' : 'mt-4'} variante="contorno" onClick={instalar}><Download className="h-4 w-4"/>Instalar aplicativo</Button>
    {ajuda && <p role="status" className="mt-3 max-w-md text-sm">No Android, abra este site no Chrome e use o menu ⋮ → Instalar aplicativo ou Adicionar à tela inicial. No iPhone, abra no Safari → Compartilhar → Adicionar à Tela de Início. Depois abra pelo ícone criado. Navegadores internos de outros apps podem não oferecer a instalação.</p>}
  </>
  return compacto ? <div>{conteudo}</div> : <Card className="mt-6 p-5">{conteudo}</Card>
}
