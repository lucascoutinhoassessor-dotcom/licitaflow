import { Link } from 'react-router-dom'
import { Lock, Sparkles } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { AssinaturaPainel } from '@/components/AssinaturaPainel'
import ResgatarCupom from '@/components/ResgatarCupom'
import { Button, Card, Logo, Select } from '@/components/ui'

const TESTE_VENCIDO = 'Teste grátis encerrado (automático)'
const ATRASO = 'Pagamento em atraso (automático)'

export function ContaSuspensa() {
  const { sair } = useAuth()
  const { org, organizacoes, trocarOrg, podeAdministrar } = useOrg()
  const outras = organizacoes.filter((o) => o.id !== org?.id && !o.suspensa)
  const teste = org?.motivo_suspensao === TESTE_VENCIDO
  const atraso = org?.motivo_suspensao === ATRASO
  // Teste vencido ou atraso: quem administra a conta regulariza aqui mesmo e o acesso volta ao pagar.
  const regularizar = (teste || atraso) && podeAdministrar && !!org

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className={regularizar ? 'w-full max-w-3xl space-y-5' : 'w-full max-w-md'}>
        <Card className="p-8 text-center">
          <Logo className="justify-center" />
          <div className={`mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full ${teste ? 'bg-primary/10' : 'bg-destructive/10'}`}>
            {teste ? <Sparkles className="h-6 w-6 text-primary" /> : <Lock className="h-6 w-6 text-destructive" />}
          </div>
          <h1 className="mt-4 text-lg font-semibold">{teste ? 'Seu teste grátis terminou' : 'Acesso suspenso'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {teste
              ? <>Esperamos que o LicitaForce tenha ajudado <strong className="text-foreground">{org?.nome}</strong>. Contrate um plano para continuar: seus processos, documentos e dados estão guardados e voltam assim que o pagamento for confirmado.</>
              : atraso
                ? <>Há uma fatura vencida de <strong className="text-foreground">{org?.nome}</strong>. Pague para liberar o acesso na hora. Seus dados estão preservados.</>
                : <>O acesso de <strong className="text-foreground">{org?.nome}</strong> está temporariamente suspenso{org?.motivo_suspensao ? `: ${org.motivo_suspensao}.` : '.'} Seus dados estão preservados. Fale com o suporte do LicitaForce para reativar.</>}
          </p>
          {(teste || atraso) && !podeAdministrar && <p className="mt-3 text-sm">Peça ao dono ou a um administrador da organização para regularizar o plano.</p>}
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
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            <Link className="font-medium text-primary hover:underline" to="/suporte">Falar com o suporte</Link>
            {!regularizar && <Link className="text-primary hover:underline" to="/cobrancas">Consultar cobranças</Link>}
          </div>
          <Button variante="contorno" className="mx-auto mt-4 w-full max-w-xs" onClick={sair}>
            Sair
          </Button>
        </Card>
        {regularizar && <AssinaturaPainel org={org.id} />}
        {regularizar && teste && <ResgatarCupom org={org.id} />}
      </div>
    </div>
  )
}
