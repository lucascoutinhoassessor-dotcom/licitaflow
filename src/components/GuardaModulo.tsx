import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { useModulos } from '@/hooks/useModulos'
import { NAV_PRINCIPAL } from '@/lib/navegacao'
import { idModulo } from '@/lib/modulos'
import { Badge, Button, Card, Carregando } from '@/components/ui'
import NaoEncontrada from '@/pages/NaoEncontrada'

/** Bloqueia a abertura direta (pelo endereço) de módulos que o master não liberou para esta organização. */
export function GuardaModulo({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { estado, carregando } = useModulos()
  const rota = '/app/' + (pathname.split('/')[2] ?? '')
  const e = estado(rota)
  if (e === 'liberado' || !idModulo(rota)) return <>{children}</>
  if (carregando) return <Carregando />
  if (e === 'oculto') return <NaoEncontrada embutida />
  const item = NAV_PRINCIPAL.find((n) => n.rota === rota)
  return (
    <Card className="mx-auto mt-6 max-w-xl p-8 text-center">
      {item && <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10"><item.icone className="h-7 w-7 text-primary" /></div>}
      <h1 className="text-xl font-semibold">{item?.rotulo ?? 'Em breve'}</h1>
      {item?.descricao && <p className="mt-2 text-sm text-muted-foreground">{item.descricao}</p>}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Hammer className="h-3.5 w-3.5" /> <Badge cor="azul">Em breve</Badge> Estamos finalizando esta funcionalidade.
      </div>
      <Link to="/app"><Button variante="contorno" className="mt-6">Voltar ao painel</Button></Link>
    </Card>
  )
}
