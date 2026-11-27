import { CheckoutPagamento } from '@/components/CheckoutPagamento'
import CheckoutPremium from '@/pages/checkout/CheckoutPremium'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { OrgProvider, useOrg } from '@/providers/OrgProvider'
import { useCatalogoPlanos } from '@/hooks/useCatalogoPlanos'
import { supabase, mensagemErro } from '@/lib/supabase'
import { carregarAssinatura, pagamentoAPI } from '@/lib/pagamentos'
import { formatarMoeda } from '@/lib/format'
import { AssinaturaPainel } from '@/components/AssinaturaPainel'
import { Aviso, Button, Campo, Card, Carregando, Input, Logo, Select } from '@/components/ui'

function Pagamento({ org, obrigado }: { org: string; obrigado: boolean }) {
  const { user } = useAuth()
  const { recarregar } = useOrg()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['checkout-cliente', org], queryFn: () => pagamentoAPI({ acao: 'checkout_cliente', org }),
    refetchInterval: query => query.state.data?.pago && query.state.data?.email_enviado ? false : 30_000, retry: 1 })
  const d = q.data
  useEffect(() => {
    if (!d?.pago) return
    void recarregar()
    if (!obrigado) navigate(`/obrigado?org=${org}`, { replace: true })
  }, [d?.pago, obrigado, org, recarregar, navigate])
  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); toast.success('Código copiado.') } catch { toast.error('Selecione e copie o código abaixo.') }
  }
  if (q.isLoading) return <Carregando />
  if (q.isError) return <Aviso>{mensagemErro(q.error)} <button className="underline" onClick={() => q.refetch()}>Tentar novamente</button></Aviso>
  return <Card className="mx-auto max-w-xl space-y-5 p-6 sm:p-8">
    {obrigado ? <>
      <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
      <h1 className="text-center text-2xl font-semibold">Obrigado por escolher o LicitaForce!</h1>
      <p className="text-sm">{d?.pago ? 'Seu pagamento foi confirmado.' : 'Estamos aguardando a confirmação do seu pagamento. O acesso será liberado automaticamente após a confirmação.'}</p>
      <p className="text-sm">{d?.email_enviado ? 'Enviamos os dados de acesso para' : 'Você receberá os dados de acesso por e-mail em'} <strong>{user?.email}</strong>. Quem já tinha conta continua com a senha atual.</p>
      {d?.email_falhou && <Aviso>O acesso foi liberado, mas o envio do e-mail ainda está pendente. Tentaremos novamente automaticamente. Você também pode entrar com a sua sessão atual ou recuperar a senha.</Aviso>}
      {d?.pago && !d?.liberado && <Aviso>O pagamento foi confirmado, mas existe uma suspensão administrativa. Fale com o suporte para regularizar.</Aviso>}
      {d?.liberado && <Link to="/app" className="block rounded-md bg-primary px-4 py-3 text-center font-medium text-primary-foreground">Acessar minha conta</Link>}
      {!d?.pago && <Link to={`/checkout?org=${org}`} className="block text-primary underline">Voltar ao pagamento</Link>}
      <Link to="/recuperar-senha" className="block text-sm text-primary underline">Recuperar minha senha</Link>
    </> : <>
      <h1 className="text-2xl font-semibold">Checkout LicitaForce</h1>
      <p>Plano {d?.plano} · <strong>{formatarMoeda((d?.valor_centavos || 0) / 100)}</strong> por {d?.ciclo === 'anual' ? 'ano' : 'mês'}.</p>
      {d?.assinatura_id && <CheckoutPagamento assinatura={d.assinatura_id} embutido aoFechar={() => {}} />}
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />Pagamento processado pelo Asaas. A liberação é automática após a confirmação.</p>
      <Button variante="contorno" className="w-full" carregando={q.isFetching} onClick={() => q.refetch()}>Verificar pagamento</Button>
      <Link to={`/obrigado?org=${org}`} className="block text-center text-sm text-primary underline">Já paguei, acompanhar confirmação</Link>
    </>}
  </Card>
}

function CompraCliente({ obrigado }: { obrigado: boolean }) {
  const { org, organizacoes, trocarOrg, carregando, podeAdministrar } = useOrg()
  const [params] = useSearchParams()
  const pedido = params.get('org')
  const escolhida = organizacoes.find(o => o.id === pedido) || org
  useEffect(() => { if (escolhida && escolhida.id !== org?.id) trocarOrg(escolhida.id) }, [escolhida, org?.id, trocarOrg])
  const q = useQuery({ queryKey: ['assinatura', escolhida?.id], queryFn: () => carregarAssinatura(escolhida!.id), enabled: !!escolhida && podeAdministrar })
  if (carregando || q.isLoading && !!escolhida && podeAdministrar) return <Carregando />
  if (!escolhida) return <Card className="p-6">Configure sua organização para contratar. <Link to="/onboarding" className="text-primary underline">Continuar cadastro</Link></Card>
  if (!podeAdministrar) return <Aviso>Peça ao dono ou administrador da organização para contratar o plano.</Aviso>
  if (q.isError) return <Aviso>{mensagemErro(q.error)} <button onClick={() => q.refetch()}>Tentar novamente</button></Aviso>
  if (q.data?.assinatura) return <Pagamento org={escolhida.id} obrigado={obrigado} />
  return <AssinaturaPainel org={escolhida.id} planoInicial={params.get('plano') || undefined} />
}

export default function Checkout({ obrigado = false }: { obrigado?: boolean }) {
  if (!obrigado) return <CheckoutPremium />
  return <Obrigado />
}

function Obrigado() {
  const obrigado = true
  const { user, carregando, sair } = useAuth()
  if (carregando) return <Carregando telaCheia />
  return <div className="min-h-screen bg-muted/30 px-4 py-8"><div className="mx-auto max-w-3xl space-y-6">
    <div className="flex items-center justify-between"><Logo />{user && <button className="text-sm text-muted-foreground" onClick={sair}>Sair</button>}</div>
    {user ? <OrgProvider><CompraCliente obrigado={obrigado} /></OrgProvider> : <Card className="space-y-4 p-6"><h1 className="text-xl font-semibold">Obrigado por escolher o LicitaForce!</h1><p>Após a confirmação do pagamento, seu acesso será enviado por e-mail.</p><Link className="text-primary underline" to="/entrar?voltar=%2Fcheckout">Entrar para acompanhar</Link></Card>}
  </div></div>
}
