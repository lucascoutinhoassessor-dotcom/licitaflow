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

function NovaCompra() {
  const catalogo = useCatalogoPlanos(true)
  const [params] = useSearchParams()
  const [f, setF] = useState({ nome: '', email: '', empresa: '', tipo: 'fornecedor', plano: params.get('plano') || '' })
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const navigate = useNavigate()
  const planos = (catalogo.data || []).filter(p => !['trial', 'cancelado'].includes(p.id) && p.mensal_centavos >= 100)
  async function iniciar(e: FormEvent) {
    e.preventDefault(); setOcupado(true); setErro('')
    try {
      const r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'iniciar_compra', ...f, plano: f.plano || planos[0]?.id }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Não foi possível iniciar a compra.')
      const { error } = await supabase.auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token })
      if (error) throw error
      navigate(`/checkout?org=${d.org}&plano=${encodeURIComponent(f.plano || planos[0]?.id || '')}`, { replace: true })
    } catch (e) { setErro(mensagemErro(e)) } finally { setOcupado(false) }
  }
  return <Card className="mx-auto max-w-xl space-y-5 p-6 sm:p-8">
    <h1 className="text-2xl font-semibold">Contrate o LicitaForce</h1>
    <p className="text-sm text-muted-foreground">Escolha seu plano e informe os dados da conta. Após a confirmação do pagamento, você receberá seu login e senha por e-mail.</p>
    {erro && <Aviso>{erro}</Aviso>}
    {catalogo.isLoading ? <Carregando /> : catalogo.isError ? <Aviso>Não foi possível carregar os planos. <button onClick={() => catalogo.refetch()}>Tentar novamente</button></Aviso> : <form onSubmit={iniciar} className="space-y-4">
      <Campo rotulo="Plano" htmlFor="compra-plano"><Select id="compra-plano" required value={f.plano || planos[0]?.id || ''} onChange={e => setF({ ...f, plano: e.target.value })}>{planos.map(p => <option key={p.id} value={p.id}>{p.nome} · {formatarMoeda(p.mensal_centavos / 100)}/mês</option>)}</Select></Campo>
      <Campo rotulo="Seu nome" htmlFor="compra-nome"><Input id="compra-nome" required minLength={2} maxLength={120} autoComplete="name" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Campo>
      <Campo rotulo="E-mail para receber seu acesso" htmlFor="compra-email"><Input id="compra-email" type="email" required autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Campo>
      <Campo rotulo="Nome da empresa ou assessoria" htmlFor="compra-empresa"><Input id="compra-empresa" required minLength={2} maxLength={120} value={f.empresa} onChange={e => setF({ ...f, empresa: e.target.value })} /></Campo>
      <Campo rotulo="Tipo de conta" htmlFor="compra-tipo"><Select id="compra-tipo" value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option value="fornecedor">Fornecedor</option><option value="assessoria">Assessoria</option></Select></Campo>
      <Button type="submit" className="w-full" carregando={ocupado} disabled={!planos.length}>Continuar para pagamento</Button>
    </form>}
    <p className="text-center text-sm">Já tem cadastro? <Link className="text-primary underline" to="/entrar?voltar=%2Fcheckout">Entre na sua conta</Link>.</p>
  </Card>
}

function Pagamento({ org, obrigado }: { org: string; obrigado: boolean }) {
  const { user } = useAuth()
  const { recarregar } = useOrg()
  const navigate = useNavigate()
  const q = useQuery({ queryKey: ['checkout-cliente', org], queryFn: () => pagamentoAPI({ acao: 'checkout_cliente', org }),
    refetchInterval: query => query.state.data?.pago && query.state.data?.email_enviado ? false : 10_000, retry: 1 })
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
      {d?.pix?.encodedImage && <img className="mx-auto h-56 w-56" alt="QR Code Pix para pagamento do plano" src={`data:image/png;base64,${d.pix.encodedImage}`} />}
      {d?.pix?.payload && <div className="space-y-2"><p className="font-medium">Pix copia e cola</p><textarea aria-label="Código Pix" className="w-full rounded-md border bg-background p-2 text-xs" readOnly value={d.pix.payload} /><Button onClick={() => copiar(d.pix.payload)}>Copiar código Pix</Button></div>}
      {d?.boleto?.identificationField && <div className="space-y-2"><p className="break-all text-sm">{d.boleto.identificationField}</p><Button variante="contorno" onClick={() => copiar(d.boleto.identificationField)}>Copiar linha digitável</Button></div>}
      {d?.boleto_url?.startsWith('https://') && <a className="block text-primary underline" href={d.boleto_url} target="_blank" rel="noopener noreferrer">Abrir boleto</a>}
      {d?.url?.startsWith('https://') && <a className="block rounded-md bg-primary px-4 py-3 text-center font-medium text-primary-foreground" href={d.url}>Pagar com cartão ou outras opções</a>}
      {!d?.pix && !d?.url && <Aviso>A cobrança está sendo preparada. Aguarde a atualização ou clique em verificar pagamento.</Aviso>}
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
  const { user, carregando, sair } = useAuth()
  if (carregando) return <Carregando telaCheia />
  return <div className="min-h-screen bg-muted/30 px-4 py-8"><div className="mx-auto max-w-3xl space-y-6">
    <div className="flex items-center justify-between"><Logo />{user && <button className="text-sm text-muted-foreground" onClick={sair}>Sair</button>}</div>
    {user ? <OrgProvider><CompraCliente obrigado={obrigado} /></OrgProvider> : obrigado ? <Card className="space-y-4 p-6"><h1 className="text-xl font-semibold">Obrigado por escolher o LicitaForce!</h1><p>Após a confirmação do pagamento, seu acesso será enviado por e-mail.</p><Link className="text-primary underline" to="/entrar?voltar=%2Fcheckout">Entrar para acompanhar</Link></Card> : <NovaCompra />}
  </div></div>
}
