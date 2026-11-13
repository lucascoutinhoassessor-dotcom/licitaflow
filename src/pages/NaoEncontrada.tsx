import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'

export default function NaoEncontrada({ embutida }: { embutida?: boolean }) {
  return (
    <div className={embutida ? 'py-16 text-center' : 'flex min-h-full flex-col items-center justify-center px-4 text-center'}>
      <div className="text-5xl font-bold text-muted-foreground">404</div>
      <p className="mt-2 text-muted-foreground">Página não encontrada.</p>
      <Link to="/app">
        <Button className="mt-6">Ir para o painel</Button>
      </Link>
    </div>
  )
}
