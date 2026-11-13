import { Lock } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { Button, Card, Logo, Select } from '@/components/ui'

export function ContaSuspensa() {
  const { sair } = useAuth()
  const { org, organizacoes, trocarOrg } = useOrg()
  const outras = organizacoes.filter((o) => o.id !== org?.id && !o.suspensa)

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <Logo className="justify-center" />
        <div className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <Lock className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Acesso suspenso</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O acesso de <strong className="text-foreground">{org?.nome}</strong> está temporariamente suspenso
          {org?.motivo_suspensao ? `: ${org.motivo_suspensao}.` : '.'} Seus dados estão preservados. Fale com o suporte do LicitaFlow para reativar.
        </p>
        {outras.length > 0 && (
          <Select className="mt-6" value="" onChange={(e) => e.target.value && trocarOrg(e.target.value)}>
            <option value="">Entrar em outra organização…</option>
            {outras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Select>
        )}
        <Button variante="contorno" className="mt-4 w-full" onClick={sair}>
          Sair
        </Button>
      </Card>
    </div>
  )
}
