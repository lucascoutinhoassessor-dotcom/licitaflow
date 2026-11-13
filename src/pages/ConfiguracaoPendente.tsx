import { Card, Logo } from '@/components/ui'

/** Exibida quando VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não estão configuradas. */
export function ConfiguracaoPendente() {
  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <Card className="max-w-lg p-8">
        <Logo />
        <h1 className="mt-6 text-lg font-semibold">Falta conectar o banco de dados</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Crie o arquivo <code className="rounded bg-muted px-1">.env.local</code> na raiz do projeto (veja <code className="rounded bg-muted px-1">.env.example</code>) com
          a URL e a chave pública (anon) do seu projeto Supabase. Na Vercel, configure as mesmas variáveis em Settings → Environment Variables.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md bg-muted p-3 text-xs">
          VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=sua-chave-anon
        </pre>
      </Card>
    </div>
  )
}
