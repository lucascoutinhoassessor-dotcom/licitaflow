import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, Logo } from '@/components/ui'

export function AuthShell({ titulo, subtitulo, children, rodape }: { titulo: string; subtitulo?: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex justify-center">
          <Logo />
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
