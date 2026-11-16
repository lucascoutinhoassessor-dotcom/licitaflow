import { Download } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { useInstalacao } from '@/hooks/useInstalacao'

export function InstalarApp({ compacto = false }: { compacto?: boolean }) {
  const { ocultar, instalar, instalando, ajuda } = useInstalacao()
  if (ocultar) return null
  const conteudo = <>
    {!compacto && <><h2 className="font-semibold">LicitaFlow no seu celular</h2><p className="mt-2 text-sm text-muted-foreground">Instale e abra pelo ícone da tela inicial para usar em uma janela sem a barra de endereço do navegador.</p></>}
    <Button className={compacto ? '' : 'mt-4'} variante="contorno" carregando={instalando} onClick={instalar}><Download className="h-4 w-4"/>Instalar aplicativo</Button>
    {ajuda && <p role="status" className="mt-3 max-w-md text-sm">No Android, abra este site no Chrome e use o menu ⋮ → Instalar aplicativo ou Adicionar à tela inicial. No iPhone, abra no Safari → Compartilhar → Adicionar à Tela de Início. Depois abra pelo ícone criado. Navegadores internos de outros apps podem não oferecer a instalação.</p>}
  </>
  return compacto ? <div>{conteudo}</div> : <Card className="mt-6 p-5">{conteudo}</Card>
}
