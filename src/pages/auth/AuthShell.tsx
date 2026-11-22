import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, IconeAnimado } from '@/components/ui'

export function AuthShell({ titulo, subtitulo, children, rodape }: { titulo: string; subtitulo?: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md">
        {/* Marca em destaque: ícone grande com brilho e anel pulsando, nome e frase logo abaixo. */}
        <Link to="/" className="mb-8 flex flex-col items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="LicitaFlow – página inicial">
          <span className="lf-icone-destaque mb-4"><IconeAnimado className="h-14 w-14" /></span>
          <span className="text-2xl font-bold tracking-tight">Licita<span className="text-accent">Flow</span></span>
          <span className="mt-1 text-sm text-muted-foreground">Gestão completa de licitações</span>
        </Link>
        <Card className="p-6 sm:p-8">
          <h1 className="text-xl font-semibold">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        {rodape && <div className="mt-6 text-center text-sm text-muted-foreground">{rodape}</div>}
      </div>
    </div>
  )
}
