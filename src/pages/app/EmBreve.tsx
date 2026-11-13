import { Link, useParams } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { NAV_PRINCIPAL } from '@/lib/navegacao'
import { Badge, Button, Card } from '@/components/ui'
import NaoEncontrada from '../NaoEncontrada'

export default function EmBreve() {
  const { modulo } = useParams()
  const item = NAV_PRINCIPAL.find((n) => n.rota === `/app/${modulo}`)
  if (!item) return <NaoEncontrada embutida />

  return (
    <Card className="mx-auto mt-6 max-w-xl p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <item.icone className="h-7 w-7 text-primary" />
      </div>
      <h1 className="text-xl font-semibold">{item.rotulo}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{item.descricao}</p>
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Hammer className="h-3.5 w-3.5" /> Em construção · <Badge cor="azul">Fase {item.fase}</Badge>
      </div>
      <Link to="/app">
        <Button variante="contorno" className="mt-6">
          Voltar ao painel
        </Button>
      </Link>
    </Card>
  )
}
