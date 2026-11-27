import { useState } from 'react'
import { Button } from '@/components/ui'

export function FalhaAcesso({ aoTentar }: { aoTentar: () => unknown | Promise<unknown> }) {
  const [tentando, setTentando] = useState(false)
  async function tentar() {
    setTentando(true)
    try { await aoTentar() } finally { setTentando(false) }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div role="alert" className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">Não foi possível carregar seu acesso</h1>
        <p className="text-muted-foreground">A conexão demorou ou foi interrompida. Verifique sua internet e tente novamente.</p>
        <Button onClick={() => void tentar()} carregando={tentando}>Tentar novamente</Button>
      </div>
    </div>
  )
}
