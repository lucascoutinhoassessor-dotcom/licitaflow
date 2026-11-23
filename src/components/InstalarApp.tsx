import { Download } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { useInstalacao } from '@/hooks/useInstalacao'

export function InstalarApp({ compacto = false }: { compacto?: boolean }) {
  const { ocultar, instalar, instalando } = useInstalacao()
  if (ocultar) return null
  const conteudo = <>
    {!compacto && <><h2 className="font-semibold">LicitaForce no seu celular</h2><p className="mt-2 text-sm text-muted-foreground">Instale e abra pelo ícone da tela inicial para usar em uma janela sem a barra de endereço do navegador.</p></>}
    <Button className={compacto ? '' : 'mt-4'} variante="contorno" carregando={instalando} onClick={instalar}><Download className="h-4 w-4"/>Instalar aplicativo</Button>
  </>
  return compacto ? <div>{conteudo}</div> : <Card className="mt-6 p-5">{conteudo}</Card>
}
