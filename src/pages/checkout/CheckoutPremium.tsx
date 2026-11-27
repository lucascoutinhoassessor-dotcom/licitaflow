import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, CheckCircle2, Copy, CreditCard, Loader2, Lock, QrCode, ShieldCheck, Sparkles, Ticket, Zap } from 'lucide-react'
import { descontoCupom, guardarCupomPendente, lerCupomPendente, normalizarCupom, previaCupom, rotuloCupomCliente } from '@/lib/cupom'
import { useAuth } from '@/providers/AuthProvider'
import { useCatalogoPlanos, type PlanoCatalogo } from '@/hooks/useCatalogoPlanos'
import { supabase, mensagemErro } from '@/lib/supabase'
import { carregarAssinatura, pagamentoAPI } from '@/lib/pagamentos'
import { formatarData, formatarMoeda, apenasDigitos } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/ui'
import {
  bandeira, cartaoValido, documentoValido, lerValidade, mascaraCartao, mascaraCep, mascaraDocumento,
  mascaraTelefone, mascaraValidade, precoCiclo, type Ciclo,
} from '@/lib/checkout'

interface PagamentoAsaas {
  id: string; pago: boolean; status: string; forma: string; valor_centavos: number; vencimento: string
  pix: { imagem: string; codigo: string; expira_em: string } | null
  aviso: string | null
}
type Metodo = 'pix' | 'cartao'
const CHAVE_PEDIDO = (email: string) => `lf-pedido:${email.trim().toLowerCase()}`
const brl = (c: number) => formatarMoeda(c / 100)
const lim = (n: number | null, um: string, varios: string) => n == null ? `${varios} ilimitados` : `${n} ${n === 1 ? um : varios}`

// ---------------------------------------------------------------- peças visuais
function Rotulo({ htmlFor, children, extra }: { htmlFor: string; children: ReactNode; extra?: ReactNode }) {
  return <label htmlFor={htmlFor} className="mb-1.5 flex items-center justify-between text-[13px] font-medium text-foreground/80">{children}{extra}</label>
}
function Entrada(props: React.InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }) {
  const { invalido, className, ...resto } = props
  return <input {...resto} aria-invalid={invalido || undefined} className={cn(
    'h-11 w-full rounded-lg border bg-background/60 px-3.5 text-[15px] outline-none transition placeholder:text-muted-foreground/60',
    'focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60',
    invalido ? 'border-destructive/70' : 'border-border', className)} />
}
function Bloco({ numero, titulo, children, acao, apagado }: { numero: number; titulo: string; children: ReactNode; acao?: ReactNode; apagado?: boolean }) {
  return <section className={cn('rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm backdrop-blur sm:p-7', apagado && 'opacity-60')}>
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{numero}</span>
      <h2 className="flex-1 whitespace-nowrap text-[17px] font-semibold tracking-tight">{titulo}</h2>
      {acao}
    </div>
    {children}
  </section>
}
function Erro({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{children}</div>
}

// ---------------------------------------------------------------- página
export default function CheckoutPremium() {
  const { user, carregando: carregandoAuth } = useAuth()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const catalogo = useCatalogoPlanos(true)
  const planos = useMemo(() => (catalogo.data ?? []).filter(p => !['trial', 'cancelado'].includes(p.id) && p.ativo && p.mensal_centavos >= 100), [catalogo.data])

  const [planoId, setPlanoId] = useState(params.get('plano') || '')
  const [ciclo, setCiclo] = useState<Ciclo>(params.get('ciclo') === 'mensal' ? 'mensal' : 'anual')
  const plano = planos.find(p => p.id === planoId) ?? planos.find(p => p.id === 'profissional') ?? planos[0]
  const preco = plano ? precoCiclo(plano, ciclo) : null
  const melhorPct = Math.max(0, ...planos.map(p => precoCiclo(p, 'anual').economiaPct))

  const [dados, setDados] = useState({ nome: '', email: '', empresa: '', documento: '', telefone: '', tipo: 'fornecedor' })
  const [erroDados, setErroDados] = useState<ReactNode>('')
  const [enviando, setEnviando] = useState(false)
  const [tentouEnviar, setTentouEnviar] = useState(false)
  const [org, setOrg] = useState(params.get('org') || '')
  const [pedido, setPedido] = useState<{ id: string; plano: string; ciclo: Ciclo; cupom: string | null } | null>(null)
  const [metodo, setMetodo] = useState<Metodo>('pix')

  // ------------------------------------------------ cupom (digitado ou vindo do link ?cupom=)
  const [cupomCodigo, setCupomCodigo] = useState<string | null>(() => normalizarCupom(params.get('cupom')) ?? lerCupomPendente())
  const [cupomCampo, setCupomCampo] = useState(cupomCodigo ?? '')
  useEffect(() => { if (cupomCodigo) guardarCupomPendente(cupomCodigo) }, [cupomCodigo])
  const previa = useQuery({ queryKey: ['previa-cupom', cupomCodigo], enabled: !!cupomCodigo, retry: false, staleTime: 300_000, queryFn: () => previaCupom(cupomCodigo!) })
  const cupomInfo = cupomCodigo ? previa.data ?? null : null
  const cupomOutroPlano = !!cupomInfo && cupomInfo.tipo !== 'dias' && !!cupomInfo.plano && !!plano && cupomInfo.plano !== plano.id
  const cupomNoPedido = cupomInfo && cupomInfo.tipo !== 'dias' && !cupomOutroPlano ? cupomInfo.codigo : null
  function aplicarCupom(e?: FormEvent) {
    e?.preventDefault()
    const c = normalizarCupom(cupomCampo)
    if (!c) { toast.error('Digite um código de cupom válido.'); return }
    setCupomCodigo(c)
  }
  function removerCupom() { setCupomCodigo(null); setCupomCampo(''); guardarCupomPendente(null) }

  // Conta logada: descobre a organização administrada e um pedido em aberto, para continuar de onde parou.
  const conta = useQuery({
    queryKey: ['checkout-conta', user?.id, org],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('memberships').select('org_id,papel,organizations(nome,tipo)').eq('user_id', user!.id)
      if (error) throw error
      const admins = (data ?? []).filter(m => ['owner', 'admin'].includes(m.papel))
      const escolhida = admins.find(m => m.org_id === org) ?? admins[0]
      if (!escolhida) return { org: null, assinatura: null, nome: '' }
      const { assinatura } = await carregarAssinatura(escolhida.org_id)
      const o = escolhida.organizations as unknown as { nome: string } | null
      return { org: escolhida.org_id as string, assinatura, nome: o?.nome ?? '' }
    },
  })
  useEffect(() => {
    const c = conta.data
    if (!c?.org) return
    if (c.org !== org) setOrg(c.org)
    const a = c.assinatura
    if (a && a.status === 'pendente' && a.gateway_assinatura_id && !pedido) {
      setPedido({ id: a.id, plano: a.plano_id, ciclo: a.ciclo, cupom: null })
      if (!params.get('plano')) { setPlanoId(a.plano_id); setCiclo(a.ciclo) }
    }
  }, [conta.data]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (user?.email && !dados.email) setDados(d => ({ ...d, email: user.email!, nome: d.nome || String(user.user_metadata?.nome ?? '') }))
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // mantém plano e ciclo no endereço (voltar/atualizar a página não perde a escolha)
    if (!plano) return
    const p = new URLSearchParams(params)
    p.set('plano', plano.id); p.set('ciclo', ciclo); if (org) p.set('org', org)
    if (p.toString() !== params.toString()) setParams(p, { replace: true })
  }, [plano?.id, ciclo, org]) // eslint-disable-line react-hooks/exhaustive-deps

  const assinaturaAtiva = conta.data?.assinatura && ['ativa', 'atrasada'].includes(conta.data.assinatura.status)
  const cupomMudou = !!pedido && pedido.cupom !== cupomNoPedido && !(previa.isFetching && !!cupomCodigo)
  const desatualizado = !!pedido && !!plano && (pedido.plano !== plano.id || pedido.ciclo !== ciclo || cupomMudou)
  const desconto = plano && preco ? descontoCupom(cupomInfo, preco.cobrado, plano.id) : 0

  // ------------------------------------------------ cobrança (Asaas)
  const cobranca = useQuery<PagamentoAsaas>({
    queryKey: ['checkout-premium', pedido?.id],
    enabled: !!pedido && !desatualizado,
    queryFn: () => pagamentoAPI({ acao: 'checkout_assinatura', id: pedido!.id }),
    retry: (n, e) => n < 4 && /emitida|processamento/i.test(String((e as Error)?.message)),
    retryDelay: 2500, staleTime: 60_000, refetchOnWindowFocus: false,
  })
  // Confirmação do Pix: consulta leve a cada 5 s, sem gerar o QR de novo.
  const situacao = useQuery<PagamentoAsaas>({
    queryKey: ['checkout-premium-status', pedido?.id],
    enabled: !!pedido && !desatualizado && !!cobranca.data && !cobranca.data.pago,
    queryFn: () => pagamentoAPI({ acao: 'checkout_assinatura', id: pedido!.id, codigos: false }),
    refetchInterval: 5000, refetchIntervalInBackground: true, retry: false,
  })
  const pago = !!(cobranca.data?.pago || situacao.data?.pago)
  const concluiu = useRef(false)
  useEffect(() => {
    if (!pago || concluiu.current) return
    concluiu.current = true
    for (const k of ['assinatura', 'organizacoes', 'plano-cliente', 'checkout-cliente']) void qc.invalidateQueries({ queryKey: [k] })
    guardarCupomPendente(null)
    toast.success('Pagamento confirmado!')
    setTimeout(() => navigate(`/obrigado?org=${org}`, { replace: true }), 900)
  }, [pago, org, navigate, qc])

  // ------------------------------------------------ dados → pedido
  const docOk = documentoValido(dados.documento)
  const telOk = apenasDigitos(dados.telefone).length >= 10
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email.trim())
  const dadosOk = docOk && telOk && (!!user || (dados.nome.trim().length >= 2 && emailOk && dados.empresa.trim().length >= 2))

  async function gerarPedido(orgId: string) {
    const r = await pagamentoAPI({ acao: 'assinar', org: orgId, plano: plano!.id, ciclo, forma: 'UNDEFINED', documento: apenasDigitos(dados.documento), telefone: apenasDigitos(dados.telefone), cupom: cupomNoPedido ?? undefined })
    setPedido({ id: r.id, plano: plano!.id, ciclo, cupom: cupomNoPedido })
    void qc.invalidateQueries({ queryKey: ['checkout-conta'] })
  }
  async function continuar(e?: FormEvent) {
    e?.preventDefault()
    setTentouEnviar(true)
    if (!plano || !dadosOk || enviando) return
    setEnviando(true); setErroDados('')
    try {
      let orgId = org && user ? org : conta.data?.org || ''
      if (!user) {
        const chave = localStorage.getItem(CHAVE_PEDIDO(dados.email)) || undefined
        const r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          acao: 'iniciar_compra', nome: dados.nome, email: dados.email, empresa: dados.empresa, tipo: dados.tipo, telefone: apenasDigitos(dados.telefone), plano: plano.id, chave_pedido: chave }) })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) {
          if (d.entrar) { setErroDados(<>{d.error} <Link className="font-medium underline" to={`/entrar?voltar=${encodeURIComponent(`/checkout?plano=${plano.id}&ciclo=${ciclo}`)}`}>Entrar agora</Link></>); return }
          throw new Error(d.error || 'Não foi possível iniciar a compra.')
        }
        if (d.chave_pedido) localStorage.setItem(CHAVE_PEDIDO(dados.email), d.chave_pedido)
        const { error } = await supabase.auth.setSession({ access_token: d.access_token, refresh_token: d.refresh_token })
        if (error) throw error
        orgId = d.org; setOrg(d.org)
      }
      if (!orgId) throw new Error('Não encontramos uma organização que você administre nesta conta.')
      await gerarPedido(orgId)
      setTimeout(() => document.getElementById('pagamento')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    } catch (err) {
      setErroDados(mensagemErro(err))
    } finally { setEnviando(false) }
  }
  // Cupom de dias: quem já tem conta ativa os dias aqui mesmo e entra no sistema; quem não tem cria a conta pelo cadastro.
  const [ativandoDias, setAtivandoDias] = useState(false)
  async function ativarDias() {
    const destino = conta.data?.org || org
    if (!cupomInfo || !destino) return
    setAtivandoDias(true)
    try {
      const r = await pagamentoAPI({ acao: 'resgatar_cupom', org: destino, codigo: cupomInfo.codigo })
      guardarCupomPendente(null)
      await qc.invalidateQueries({ queryKey: ['organizacoes'] })
      toast.success(`Cupom aplicado: ${r.valor} dias de acesso, até ${formatarData(r.ate)}.`)
      navigate('/app', { replace: true })
    } catch (err) { toast.error(mensagemErro(err)) } finally { setAtivandoDias(false) }
  }
  // Troca de plano ou ciclo depois do pedido criado: refaz a cobrança com o valor novo.
  const [atualizando, setAtualizando] = useState(false)
  async function atualizarPedido() {
    if (!org || !plano) return
    setAtualizando(true)
    try { await gerarPedido(org) } catch (err) { toast.error(mensagemErro(err)) } finally { setAtualizando(false) }
  }

  if (carregandoAuth || catalogo.isLoading || (user && conta.isLoading)) return <Moldura><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></Moldura>
  if (catalogo.isError || !planos.length) return <Moldura><div className="mx-auto max-w-md py-24 text-center"><p className="text-muted-foreground">Não foi possível carregar os planos agora.</p><button className="mt-4 text-primary underline" onClick={() => catalogo.refetch()}>Tentar novamente</button></div></Moldura>
  if (assinaturaAtiva) return <Moldura><div className="mx-auto max-w-md space-y-4 py-24 text-center">
    <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
    <h1 className="text-2xl font-semibold">Seu plano já está ativo</h1>
    <p className="text-muted-foreground">Para trocar de plano ou ciclo, use “Meu plano” dentro do sistema.</p>
    <Link to="/app" className="inline-block rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground">Ir para o LicitaForce</Link>
  </div></Moldura>

  const marcarInvalido = (ok: boolean) => tentouEnviar && !ok

  return <Moldura>
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
      <div className="space-y-5">
        <header className="pb-1">
          <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Finalize sua assinatura</h1>
          <p className="mt-1.5 text-muted-foreground">Acesso liberado automaticamente assim que o pagamento é confirmado.</p>
        </header>

        {/* 1 · plano */}
        <Bloco numero={1} titulo="Escolha o plano" acao={<SeletorCiclo ciclo={ciclo} aoTrocar={setCiclo} pct={melhorPct} />}>
          <div role="radiogroup" aria-label="Plano" className="grid gap-3 sm:grid-cols-3">
            {planos.map(p => {
              const pc = precoCiclo(p, ciclo), ativo = p.id === plano?.id
              return <button key={p.id} type="button" role="radio" aria-checked={ativo} onClick={() => setPlanoId(p.id)}
                className={cn('group relative rounded-xl border p-4 text-left transition',
                  ativo ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'border-border hover:border-foreground/25')}>
                {p.id === 'profissional' && <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">Mais escolhido</span>}
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{p.nome}</span>
                  <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border', ativo ? 'border-primary bg-primary' : 'border-muted-foreground/40')}>{ativo && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}</span>
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tabular-nums tracking-tight">{brl(pc.porMes)}</span><span className="text-sm text-muted-foreground">/mês</span>
                </div>
                <p className="mt-0.5 h-4 text-xs text-muted-foreground">{ciclo === 'anual' ? `${brl(pc.cobrado)} por ano` : 'cobrado todo mês'}</p>
                <p className="mt-3 text-xs text-muted-foreground">{lim(p.limite_empresas, 'empresa', 'empresas')} · {lim(p.limite_usuarios, 'usuário', 'usuários')}</p>
              </button>
            })}
          </div>
        </Bloco>

        {/* 2 · dados */}
        <Bloco numero={2} titulo={user ? 'Dados para a cobrança' : 'Seus dados'} acao={pedido && !desatualizado ? <span className="flex items-center gap-1 text-xs font-medium text-success"><CheckCircle2 className="h-4 w-4" />Confirmado</span> : undefined}>
          <form onSubmit={continuar} noValidate className="space-y-4">
            {!user && <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Rotulo htmlFor="ck-nome">Nome completo</Rotulo><Entrada id="ck-nome" autoComplete="name" value={dados.nome} invalido={marcarInvalido(dados.nome.trim().length >= 2)} onChange={e => setDados({ ...dados, nome: e.target.value })} /></div>
                <div><Rotulo htmlFor="ck-email">E-mail</Rotulo><Entrada id="ck-email" type="email" autoComplete="email" value={dados.email} invalido={marcarInvalido(emailOk)} onChange={e => setDados({ ...dados, email: e.target.value })} /></div>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div><Rotulo htmlFor="ck-empresa">Empresa ou assessoria</Rotulo><Entrada id="ck-empresa" autoComplete="organization" value={dados.empresa} invalido={marcarInvalido(dados.empresa.trim().length >= 2)} onChange={e => setDados({ ...dados, empresa: e.target.value })} /></div>
                <div><span className="mb-1.5 block text-[13px] font-medium text-foreground/80">Tipo de conta</span>
                  <div className="flex h-11 rounded-lg border border-border bg-background/60 p-1">
                    {(['fornecedor', 'assessoria'] as const).map(t => <button key={t} type="button" onClick={() => setDados({ ...dados, tipo: t })}
                      className={cn('rounded-md px-3.5 text-sm capitalize transition', dados.tipo === t ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>{t}</button>)}
                  </div>
                </div>
              </div>
            </>}
            {user && <p className="text-sm text-muted-foreground">Conta <strong className="text-foreground">{user.email}</strong>{conta.data?.nome && <> · {conta.data.nome}</>}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Rotulo htmlFor="ck-doc" extra={<span className="text-xs font-normal text-muted-foreground">de quem paga</span>}>CPF ou CNPJ</Rotulo><Entrada id="ck-doc" inputMode="numeric" value={dados.documento} invalido={marcarInvalido(docOk)} onChange={e => setDados({ ...dados, documento: mascaraDocumento(e.target.value) })} placeholder="000.000.000-00" /></div>
              <div><Rotulo htmlFor="ck-tel">WhatsApp</Rotulo><Entrada id="ck-tel" inputMode="tel" autoComplete="tel" value={dados.telefone} invalido={marcarInvalido(telOk)} onChange={e => setDados({ ...dados, telefone: mascaraTelefone(e.target.value) })} placeholder="(00) 00000-0000" /></div>
            </div>
            {tentouEnviar && !dadosOk && <p className="text-sm text-destructive">Confira os campos destacados{!docOk && dados.documento ? ' (CPF/CNPJ inválido)' : ''}.</p>}
            {erroDados && <Erro>{erroDados}</Erro>}
            {(!pedido || desatualizado) && preco && <div className="flex items-baseline justify-between rounded-lg bg-muted/40 px-4 py-2.5 text-sm lg:hidden"><span className="text-muted-foreground">Total hoje · {plano?.nome} {ciclo}</span><strong className="tabular-nums">{brl(preco.cobrado - desconto)}</strong></div>}
            {(!pedido || desatualizado) && <BotaoPrincipal carregando={enviando || atualizando} onClick={pedido ? atualizarPedido : undefined} type={pedido ? 'button' : 'submit'}>
              {!pedido ? 'Continuar para o pagamento' : cupomMudou && pedido.plano === plano?.id && pedido.ciclo === ciclo ? (cupomNoPedido ? 'Atualizar o pedido com o cupom' : 'Atualizar o pedido sem cupom') : `Atualizar para ${plano?.nome} ${ciclo}`}
            </BotaoPrincipal>}
            {!user && !pedido && <p className="text-center text-xs text-muted-foreground">Já tem conta? <Link className="text-primary hover:underline" to={`/entrar?voltar=${encodeURIComponent(`/checkout?plano=${plano?.id ?? ''}&ciclo=${ciclo}`)}`}>Entre para assinar</Link></p>}
          </form>
        </Bloco>

        {/* 3 · pagamento */}
        <div id="pagamento" className="scroll-mt-6">
          <Bloco numero={3} titulo="Pagamento" apagado={!pedido || desatualizado}>
            {!pedido ? <p className="text-sm text-muted-foreground">Preencha seus dados para liberar Pix e cartão de crédito.</p>
              : desatualizado ? <p className="text-sm text-muted-foreground">Você mudou o plano, o ciclo ou o cupom. Atualize o pedido acima para gerar a cobrança com o novo valor.</p>
              : <>
                <div role="tablist" className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-1">
                  {([['pix', 'Pix', QrCode, 'Aprovação imediata'], ['cartao', 'Cartão de crédito', CreditCard, ciclo === 'anual' ? 'Cobrança anual' : 'Cobrança mensal']] as const).map(([id, t, I, sub]) =>
                    <button key={id} role="tab" aria-selected={metodo === id} onClick={() => setMetodo(id)}
                      className={cn('flex items-center justify-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition', metodo === id ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                      <I className="h-4 w-4" /><span className="text-left leading-tight">{t}<span className="hidden text-[11px] font-normal text-muted-foreground sm:block">{sub}</span></span>
                    </button>)}
                </div>
                {cobranca.isLoading && <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Gerando sua cobrança com segurança…</div>}
                {cobranca.isError && <Erro>{mensagemErro(cobranca.error)} <button className="font-medium underline" onClick={() => cobranca.refetch()}>Tentar novamente</button></Erro>}
                {pago && <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-success"><CheckCircle2 className="h-6 w-6" /><span className="font-medium">Pagamento confirmado! Liberando seu acesso…</span></div>}
                {cobranca.data && !pago && (metodo === 'pix'
                  ? <PainelPix p={cobranca.data} recarregar={() => cobranca.refetch()} recarregando={cobranca.isFetching} />
                  : <PainelCartao pedido={pedido.id} valor={cobranca.data.valor_centavos} ciclo={ciclo} dados={dados}
                      aoPagar={r => { qc.setQueryData(['checkout-premium', pedido.id], r) }} />)}
              </>}
          </Bloco>
        </div>
      </div>

      {/* resumo */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Resumo plano={plano!} ciclo={ciclo} preco={preco!} desconto={desconto} cupom={cupomNoPedido}>
          <div className="space-y-2 border-t border-border/70 p-6">
            {!cupomCodigo || previa.isError ? <form onSubmit={aplicarCupom} className="space-y-1.5">
              <Rotulo htmlFor="ck-cupom">Cupom</Rotulo>
              <div className="flex gap-2">
                <Entrada id="ck-cupom" className="h-10 font-mono uppercase" maxLength={40} placeholder="Tem um cupom?" value={cupomCampo} onChange={e => setCupomCampo(e.target.value.toUpperCase().replace(/\s/g, ''))} />
                <button type="submit" className="h-10 shrink-0 rounded-lg border border-border px-4 text-sm font-medium transition hover:bg-muted">Aplicar</button>
              </div>
              {previa.isError && <p className="text-xs text-destructive">{mensagemErro(previa.error)}</p>}
            </form>
            : previa.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Conferindo o cupom {cupomCodigo}…</p>
            : cupomInfo && <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2"><Ticket className="h-4 w-4 shrink-0 text-success" /><span className="truncate"><strong className="font-mono">{cupomInfo.codigo}</strong> · {rotuloCupomCliente(cupomInfo)}</span></span>
                <button type="button" onClick={removerCupom} className="shrink-0 text-xs text-muted-foreground underline hover:text-foreground">Remover</button>
              </div>
              {cupomOutroPlano && <p className="text-xs text-warning">Este cupom vale só para o plano {planos.find(p => p.id === cupomInfo.plano)?.nome ?? cupomInfo.plano}. <button type="button" className="underline" onClick={() => setPlanoId(cupomInfo.plano!)}>Trocar para ele</button></p>}
              {cupomInfo.tipo === 'dias' && (user && (conta.data?.org || org)
                ? <BotaoPrincipal type="button" carregando={ativandoDias} onClick={ativarDias}>Ativar {cupomInfo.valor} dias grátis</BotaoPrincipal>
                : <p className="text-xs text-muted-foreground">Este cupom libera dias de acesso grátis. <Link className="font-medium text-primary underline" to={`/cadastro?cupom=${encodeURIComponent(cupomInfo.codigo)}`}>Crie sua conta</Link> ou <Link className="font-medium text-primary underline" to={`/entrar?voltar=${encodeURIComponent(`/checkout?cupom=${cupomInfo.codigo}`)}`}>entre</Link> para usar.</p>)}
            </div>}
          </div>
        </Resumo>
      </aside>
    </div>
  </Moldura>
}

// ---------------------------------------------------------------- moldura e resumo
function Moldura({ children }: { children: ReactNode }) {
  return <div className="relative min-h-screen overflow-hidden bg-background">
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.10),transparent)]" />
    <div className="relative px-4 pb-16 pt-6 sm:px-6">
      <div className="mx-auto mb-8 flex max-w-6xl items-center justify-between">
        <Link to="/" aria-label="Voltar ao site"><Logo /></Link>
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Lock className="h-3.5 w-3.5" />Checkout seguro</span>
      </div>
      {children}
    </div>
  </div>
}

function SeletorCiclo({ ciclo, aoTrocar, pct }: { ciclo: Ciclo; aoTrocar: (c: Ciclo) => void; pct: number }) {
  return <div role="radiogroup" aria-label="Ciclo de cobrança" className="flex rounded-full border border-border bg-background/60 p-0.5 text-[13px]">
    {(['mensal', 'anual'] as const).map(c => <button key={c} type="button" role="radio" aria-checked={ciclo === c} onClick={() => aoTrocar(c)}
      className={cn('flex items-center gap-1.5 rounded-full px-3.5 py-1.5 capitalize transition', ciclo === c ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
      {c}{c === 'anual' && pct > 0 && <span className={cn('rounded-full px-1.5 text-[10px] font-semibold', ciclo === c ? 'bg-success text-success-foreground' : 'bg-success/15 text-success')}>-{pct}%</span>}
    </button>)}
  </div>
}

function Resumo({ plano, ciclo, preco, desconto, cupom, children }: { plano: PlanoCatalogo; ciclo: Ciclo; preco: ReturnType<typeof precoCiclo>; desconto: number; cupom: string | null; children?: ReactNode }) {
  const itens = [
    lim(plano.limite_empresas, 'empresa (CNPJ)', 'empresas (CNPJs)'),
    lim(plano.limite_usuarios, 'usuário', 'usuários'),
    plano.limite_processos == null ? 'Processos ilimitados' : `Até ${plano.limite_processos} processos`,
    'Radar de oportunidades em todos os portais', 'Alertas de prazos, certidões e disputas',
  ]
  return <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
    <div className="space-y-4 p-6">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Resumo do pedido</p>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-lg font-semibold">Plano {plano.nome}</p><p className="text-sm text-muted-foreground">Assinatura {ciclo}</p></div>
        <Sparkles className="h-5 w-5 text-accent" />
      </div>
      <ul className="space-y-2">{itens.map(i => <li key={i} className="flex gap-2.5 text-sm text-foreground/85"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{i}</li>)}</ul>
    </div>
    <div className="space-y-2.5 border-t border-border/70 bg-muted/30 p-6 text-sm">
      {ciclo === 'anual' && preco.economia > 0 && <>
        <div className="flex justify-between text-muted-foreground"><span>12 × {brl(plano.mensal_centavos)}</span><span className="tabular-nums line-through">{brl(plano.mensal_centavos * 12)}</span></div>
        <div className="flex justify-between text-success"><span>Desconto do plano anual</span><span className="tabular-nums">−{brl(preco.economia)}</span></div>
      </>}
      {desconto > 0 && <div className="flex justify-between text-success"><span>Cupom {cupom}</span><span className="tabular-nums">−{brl(desconto)}</span></div>}
      <div className="flex items-baseline justify-between pt-1">
        <span className="font-medium">Total hoje</span>
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{brl(preco.cobrado - desconto)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{ciclo === 'anual' ? `Equivale a ${brl(Math.round((preco.cobrado - desconto) / 12))}/mês. Renova a cada 12 meses.` : 'Renova todo mês.'}{desconto > 0 && ' O desconto do cupom vale em todas as renovações.'} Cancele quando quiser, sem multa.</p>
    </div>
    {children}
    <div className="grid gap-3 border-t border-border/70 p-6 text-xs text-muted-foreground">
      <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-accent" />Acesso liberado na hora após a confirmação</span>
      <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" />Pagamento processado pelo Asaas, instituição autorizada pelo Banco Central</span>
      <span className="flex items-center gap-2"><Lock className="h-4 w-4 text-accent" />Dados do cartão criptografados e nunca armazenados por nós</span>
    </div>
  </div>
}

function BotaoPrincipal({ carregando, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { carregando?: boolean }) {
  return <button {...props} disabled={carregando || props.disabled}
    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110 active:scale-[0.99] disabled:opacity-70">
    {carregando && <Loader2 className="h-4 w-4 animate-spin" />}{children}
  </button>
}

// ---------------------------------------------------------------- Pix
function PainelPix({ p, recarregar, recarregando }: { p: PagamentoAsaas; recarregar: () => void; recarregando: boolean }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try { await navigator.clipboard.writeText(p.pix!.codigo); setCopiado(true); toast.success('Código Pix copiado'); setTimeout(() => setCopiado(false), 2500) }
    catch { toast.error('Selecione e copie o código manualmente.') }
  }
  if (!p.pix) return <div className="space-y-3 text-sm"><p className="text-muted-foreground">{p.aviso || 'O QR Code ainda está sendo gerado pelo banco.'}</p>
    <button onClick={recarregar} className="font-medium text-primary hover:underline" disabled={recarregando}>{recarregando ? 'Gerando…' : 'Gerar QR Code'}</button></div>
  return <div className="grid items-center gap-6 sm:grid-cols-[200px_1fr]">
    <div className="mx-auto rounded-2xl border border-border bg-white p-3 shadow-sm">
      <img src={`data:image/png;base64,${p.pix.imagem}`} alt="QR Code do Pix" className="h-44 w-44" />
    </div>
    <div className="min-w-0 space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Valor</p>
        <p className="text-2xl font-semibold tabular-nums">{brl(p.valor_centavos)}</p>
      </div>
      <ol className="space-y-1.5 text-sm text-muted-foreground">
        <li>1. Abra o app do seu banco e escolha <strong className="text-foreground">Pix</strong></li>
        <li>2. Escaneie o QR Code ou use o <strong className="text-foreground">copia e cola</strong></li>
        <li>3. Confirme — o acesso é liberado em segundos</li>
      </ol>
      <div className="flex gap-2">
        <input readOnly value={p.pix.codigo} onFocus={e => e.target.select()} aria-label="Código Pix copia e cola" className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-3 font-mono text-xs text-muted-foreground" />
        <button onClick={copiar} className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90">
          {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-accent" /></span>Aguardando pagamento — esta página atualiza sozinha</p>
    </div>
  </div>
}

// ---------------------------------------------------------------- Cartão
function PainelCartao({ pedido, valor, ciclo, dados, aoPagar }: {
  pedido: string; valor: number; ciclo: Ciclo; dados: { nome: string; email: string; documento: string; telefone: string }
  aoPagar: (r: PagamentoAsaas) => void
}) {
  const [c, setC] = useState({ numero: '', nome: '', validade: '', cvv: '', cep: '', endereco: '' })
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [tentou, setTentou] = useState(false)
  const b = bandeira(c.numero)
  const validade = lerValidade(c.validade)
  const ok = {
    numero: cartaoValido(c.numero), nome: c.nome.trim().length >= 3, validade: !!validade,
    cvv: (b === 'amex' ? /^\d{4}$/ : /^\d{3}$/).test(c.cvv), cep: apenasDigitos(c.cep).length === 8, endereco: c.endereco.trim().length > 0,
  }
  const tudoOk = Object.values(ok).every(Boolean)
  const inv = (k: keyof typeof ok) => tentou && !ok[k]

  async function pagar(e: FormEvent) {
    e.preventDefault(); setTentou(true)
    if (!tudoOk || ocupado) return
    setOcupado(true); setErro('')
    try {
      const r = await pagamentoAPI({
        acao: 'pagar_cartao', id: pedido,
        cartao: { nome: c.nome, numero: apenasDigitos(c.numero), mes: validade!.mes, ano: validade!.ano, cvv: c.cvv },
        titular: { nome: dados.nome || c.nome, email: dados.email, documento: apenasDigitos(dados.documento), cep: apenasDigitos(c.cep), numero: c.endereco, telefone: apenasDigitos(dados.telefone) },
      }) as PagamentoAsaas
      aoPagar(r)
      if (!r.pago) setErro('Pagamento em análise pela operadora. Avisaremos assim que for aprovado.')
      setC(v => ({ ...v, numero: '', cvv: '' }))
    } catch (err) {
      setErro(mensagemErro(err).replace(/^Asaas:\s*/, ''))
    } finally { setOcupado(false) }
  }

  return <form onSubmit={pagar} noValidate className="space-y-5">
    <CartaoVisual numero={c.numero} nome={c.nome} validade={c.validade} bandeira={b} />
    <div className="space-y-4">
      <div><Rotulo htmlFor="cc-num" extra={b && <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{b}</span>}>Número do cartão</Rotulo>
        <Entrada id="cc-num" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={c.numero} invalido={inv('numero')} onChange={e => setC({ ...c, numero: mascaraCartao(e.target.value) })} /></div>
      <div><Rotulo htmlFor="cc-nome">Nome impresso no cartão</Rotulo>
        <Entrada id="cc-nome" autoComplete="cc-name" value={c.nome} invalido={inv('nome')} onChange={e => setC({ ...c, nome: e.target.value.toUpperCase() })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Rotulo htmlFor="cc-val">Validade</Rotulo><Entrada id="cc-val" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" value={c.validade} invalido={inv('validade')} onChange={e => setC({ ...c, validade: mascaraValidade(e.target.value) })} /></div>
        <div><Rotulo htmlFor="cc-cvv">CVV</Rotulo><Entrada id="cc-cvv" inputMode="numeric" autoComplete="cc-csc" type="password" placeholder={b === 'amex' ? '4 dígitos' : '3 dígitos'} maxLength={4} value={c.cvv} invalido={inv('cvv')} onChange={e => setC({ ...c, cvv: apenasDigitos(e.target.value) })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Rotulo htmlFor="cc-cep">CEP do titular</Rotulo><Entrada id="cc-cep" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={c.cep} invalido={inv('cep')} onChange={e => setC({ ...c, cep: mascaraCep(e.target.value) })} /></div>
        <div><Rotulo htmlFor="cc-end">Nº do endereço</Rotulo><Entrada id="cc-end" maxLength={30} value={c.endereco} invalido={inv('endereco')} onChange={e => setC({ ...c, endereco: e.target.value })} /></div>
      </div>
    </div>
    {tentou && !tudoOk && <p className="text-sm text-destructive">Confira os campos destacados.</p>}
    {erro && <Erro>{erro}</Erro>}
    <BotaoPrincipal type="submit" carregando={ocupado}>{ocupado ? 'Processando…' : <><Lock className="h-4 w-4" />Pagar {brl(valor)}</>}</BotaoPrincipal>
    <p className="text-center text-xs text-muted-foreground">À vista no cartão. {ciclo === 'anual' ? 'Renovação anual' : 'Renovação mensal'} automática no mesmo cartão — cancele quando quiser.</p>
  </form>
}

function CartaoVisual({ numero, nome, validade, bandeira: b }: { numero: string; nome: string; validade: string; bandeira: string | null }) {
  const n = (numero || '•••• •••• •••• ••••').padEnd(19, '•')
  return <div className="relative mx-auto aspect-[1.586] w-full max-w-[340px] overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-black p-5 text-white shadow-xl">
    <div aria-hidden className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-primary/30 blur-3xl" />
    <div aria-hidden className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
    <div className="relative flex h-full flex-col justify-between">
      <div className="flex items-center justify-between">
        <div className="h-7 w-10 rounded-md bg-gradient-to-br from-amber-200 to-amber-500 opacity-90" />
        <span className="text-sm font-semibold uppercase italic tracking-wider opacity-90">{b ?? ''}</span>
      </div>
      <p className="font-mono text-[19px] tracking-[0.14em] tabular-nums">{n}</p>
      <div className="flex items-end justify-between text-[11px] uppercase">
        <div className="min-w-0"><p className="opacity-50">Titular</p><p className="truncate text-sm tracking-wide">{nome || 'NOME NO CARTÃO'}</p></div>
        <div className="text-right"><p className="opacity-50">Validade</p><p className="text-sm">{validade || 'MM/AA'}</p></div>
      </div>
    </div>
  </div>
}
