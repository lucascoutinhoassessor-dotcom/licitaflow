import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, Copy, FlaskConical, KeyRound, Landmark } from 'lucide-react'
import { URL_SITE, masterSeparado } from '@/lib/pwa'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora, formatarMoeda } from '@/lib/format'
import { pagamentoAPI } from '@/lib/pagamentos'
import { cn } from '@/lib/utils'
import { Aviso, Badge, Button, Campo, Card, Input } from '@/components/ui'

type Ambiente = 'sandbox' | 'production'
interface Status {
  ativo: boolean; ambiente: Ambiente; tem_chave: boolean; tem_token: boolean; dias_tolerancia: number; bloquear_inadimplente: boolean
  conta_nome: string | null; testado_em: string | null
  ambientes?: Record<Ambiente, { tem_chave: boolean; tem_token: boolean }>
}
const EVENTOS = 'PAYMENT_CREATED, PAYMENT_UPDATED, PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED, PAYMENT_REFUNDED, PAYMENT_CHARGEBACK_REQUESTED, SUBSCRIPTION_DELETED, SUBSCRIPTION_INACTIVATED'
const INFO: Record<Ambiente, { nome: string; sub: string; painel: string; prefixo: string; Icone: typeof FlaskConical }> = {
  sandbox: { nome: 'Teste (sandbox)', sub: 'Pagamentos de mentira para testar o checkout', painel: 'sandbox.asaas.com', prefixo: '$aact_hmlg_…', Icone: FlaskConical },
  production: { nome: 'Produção', sub: 'Pagamentos reais dos clientes', painel: 'www.asaas.com', prefixo: '$aact_prod_…', Icone: Landmark },
}

function gerarToken() {
  const b = new Uint8Array(24); crypto.getRandomValues(b)
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

/** Configuração do Asaas pelo master: uma conta de teste e uma de produção; o master escolhe qual está em uso. */
export function AsaasConfig() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['asaas-status'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_gateway_status'); if (error) throw error; return data as Status
  }, retry: false })
  const [chaves, setChaves] = useState<Record<Ambiente, string>>({ sandbox: '', production: '' })
  const [tokens, setTokens] = useState<Record<Ambiente, string>>({ sandbox: '', production: '' })
  const [tokenSalvo, setTokenSalvo] = useState<Partial<Record<Ambiente, string>>>({})
  const [regras, setRegras] = useState({ dias: '5', bloquear: true })
  const [ocupado, setOcupado] = useState('')
  const [teste, setTeste] = useState<Partial<Record<Ambiente, { saldo: number | null; conta: string | null }>>>({})
  const urlWebhook = `${masterSeparado() ? URL_SITE : window.location.origin}/api/asaas-webhook`
  useEffect(() => { if (q.data) setRegras({ dias: String(q.data.dias_tolerancia), bloquear: q.data.bloquear_inadimplente }) }, [q.data])
  const recarregar = () => Promise.all([qc.invalidateQueries({ queryKey: ['asaas-status'] }), qc.invalidateQueries({ queryKey: ['admin-financeiro'] }), qc.invalidateQueries({ queryKey: ['gateways-config'] })])

  const s = q.data
  const emUso: Ambiente = s?.ambiente === 'production' ? 'production' : 'sandbox'
  // Antes da migração nova, só existe a chave única (do ambiente marcado).
  const amb = (a: Ambiente) => s?.ambientes?.[a] ?? { tem_chave: a === emUso && !!s?.tem_chave, tem_token: a === emUso && !!s?.tem_token }

  async function salvarConta(a: Ambiente) {
    if (!chaves[a] && !tokens[a]) return toast.error('Informe a chave ou o token para salvar.')
    setOcupado('salvar-' + a)
    try {
      await pagamentoAPI({ acao: 'asaas_salvar', chaves: { [a]: chaves[a] || undefined }, tokens: { [a]: tokens[a] || undefined } })
      if (tokens[a]) setTokenSalvo(t => ({ ...t, [a]: tokens[a] }))
      setChaves(c => ({ ...c, [a]: '' })); setTokens(t => ({ ...t, [a]: '' }))
      await recarregar(); toast.success(`Conta de ${a === 'production' ? 'produção' : 'teste'} salva.`)
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }
  async function usar(a: Ambiente) {
    if (a === emUso) return
    if (!amb(a).tem_chave) return toast.error(`Cadastre a chave de ${a === 'production' ? 'produção' : 'teste'} primeiro.`)
    const msg = a === 'production'
      ? 'Usar o Asaas de PRODUÇÃO? A partir de agora os clientes pagam de verdade. Pedidos de teste ainda não pagos serão cancelados.'
      : 'Usar o Asaas de TESTE? Novos pagamentos serão de mentira (sandbox). Pedidos ainda não pagos serão cancelados. Assinantes reais continuam com as renovações processadas normalmente.'
    if (!confirm(msg)) return
    setOcupado('usar')
    try {
      const r = await pagamentoAPI({ acao: 'asaas_salvar', ambiente: a })
      await recarregar()
      toast.success(`Asaas de ${a === 'production' ? 'produção' : 'teste'} em uso.${r.pedidos_cancelados ? ` ${r.pedidos_cancelados} pedido(s) não pago(s) cancelado(s).` : ''}`)
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }
  async function ligar(ativo: boolean) {
    if (ativo && emUso === 'production' && !confirm('Ativar cobranças REAIS no Asaas de produção? Clientes passam a pagar de verdade.')) return
    setOcupado('ativar')
    try { await pagamentoAPI({ acao: 'asaas_salvar', ativo }); await recarregar(); toast.success(ativo ? 'Cobranças ativadas.' : 'Cobranças desativadas.') }
    catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }
  async function testar(a: Ambiente) {
    setOcupado('testar-' + a)
    try { const r = await pagamentoAPI({ acao: 'asaas_testar', ambiente: a }); setTeste(t => ({ ...t, [a]: r })); await recarregar(); toast.success('Conexão com o Asaas funcionando.') }
    catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }
  async function salvarRegras() {
    setOcupado('regras')
    try {
      const dias = Number(regras.dias)
      if (!Number.isInteger(dias) || dias < 0 || dias > 60) throw new Error('Tolerância deve ser de 0 a 60 dias.')
      const { error } = await supabase.rpc('admin_regras_cobranca', { p_dias: dias, p_bloquear: regras.bloquear }); if (error) throw error
      await recarregar(); toast.success('Regras de cobrança salvas.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }
  async function rotina() {
    setOcupado('rotina')
    try { const { data, error } = await supabase.rpc('admin_rotina_cobranca'); if (error) throw error; toast.success(`${data} conta(s) suspensa(s) por atraso.`); await recarregar() }
    catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success('Copiado.'), () => toast.error('Não foi possível copiar.'))

  return <Card className="space-y-5 p-5">
    <div className="flex flex-wrap items-center gap-2">
      <KeyRound className="h-5 w-5 text-primary" /><h2 className="flex-1 font-semibold">Asaas · assinaturas recorrentes</h2>
      {s && <Badge cor={!s.ativo ? 'amarelo' : emUso === 'production' ? 'verde' : 'azul'}>{!s.ativo ? 'Cobranças desativadas' : emUso === 'production' ? 'Produção em uso · pagamentos reais' : 'Teste em uso · sandbox'}</Badge>}
    </div>
    {q.isError && <Aviso>{mensagemErro(q.error)} — aplique a migração de assinaturas.</Aviso>}
    {s && <>
      {/* escolha do ambiente */}
      <div>
        <p className="mb-2 text-sm font-medium">Qual Asaas está em uso</p>
        <div role="radiogroup" aria-label="Ambiente do Asaas em uso" className="grid gap-3 sm:grid-cols-2">
          {(['sandbox', 'production'] as const).map(a => {
            const i = INFO[a], ativo = emUso === a
            return <button key={a} type="button" role="radio" aria-checked={ativo} disabled={!!ocupado} onClick={() => usar(a)}
              className={cn('flex items-start gap-3 rounded-lg border p-4 text-left transition disabled:opacity-60',
                ativo ? (a === 'production' ? 'border-success bg-success/5 ring-1 ring-success' : 'border-primary bg-primary/5 ring-1 ring-primary') : 'hover:bg-muted')}>
              <i.Icone className={cn('mt-0.5 h-5 w-5', ativo ? (a === 'production' ? 'text-success' : 'text-primary') : 'text-muted-foreground')} />
              <span className="flex-1">
                <span className="flex items-center gap-2 font-medium">{i.nome}{ativo && <CheckCircle2 className="h-4 w-4" />}</span>
                <span className="block text-sm text-muted-foreground">{i.sub}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{amb(a).tem_chave ? 'Chave cadastrada' : 'Sem chave'} · {amb(a).tem_token ? 'webhook configurado' : 'sem token do webhook'}</span>
              </span>
              <span className={cn('mt-0.5 h-4 w-4 rounded-full border-2', ativo ? 'border-[5px] border-current' : 'border-muted-foreground/40')} />
            </button>
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Pagamentos feitos no teste nunca liberam acesso com a produção em uso. Pagamentos reais são sempre processados, mesmo enquanto você testa.</p>
      </div>

      {/* as duas contas */}
      <div className="grid gap-4 lg:grid-cols-2">
        {(['sandbox', 'production'] as const).map(a => {
          const i = INFO[a], t = teste[a]
          return <div key={a} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-2"><i.Icone className="h-4 w-4 text-muted-foreground" /><h3 className="flex-1 text-sm font-semibold">Conta {i.nome}</h3>
              {emUso === a && <Badge cor={a === 'production' ? 'verde' : 'azul'}>em uso</Badge>}</div>
            <Campo rotulo={amb(a).tem_chave ? 'Nova chave de API (deixe vazio para manter)' : 'Chave de API'} htmlFor={`asaas-chave-${a}`} ajuda={`${i.painel} → Integrações → Chave de API (começa com ${i.prefixo}). Fica cifrada no servidor.`}>
              <Input id={`asaas-chave-${a}`} type="password" autoComplete="off" value={chaves[a]} onChange={e => setChaves({ ...chaves, [a]: e.target.value })} placeholder={i.prefixo} /></Campo>
            <div className="flex items-end gap-2">
              <div className="flex-1"><Campo rotulo={amb(a).tem_token ? 'Novo token do webhook (opcional)' : 'Token do webhook'} htmlFor={`asaas-token-${a}`}>
                <Input id={`asaas-token-${a}`} autoComplete="off" value={tokens[a]} onChange={e => setTokens({ ...tokens, [a]: e.target.value })} /></Campo></div>
              <Button type="button" variante="contorno" onClick={() => setTokens({ ...tokens, [a]: gerarToken() })}>Gerar</Button>
            </div>
            {tokenSalvo[a] && <p className="text-xs">Token salvo. Cole no webhook de {i.painel} (não será mostrado de novo): <button type="button" className="break-all font-mono underline" onClick={() => copiar(tokenSalvo[a]!)}>{tokenSalvo[a]}</button></p>}
            {t && <Aviso tipo="sucesso">Conta {t.conta ?? 'Asaas'} respondeu. Saldo: {t.saldo == null ? '—' : formatarMoeda(t.saldo)}.</Aviso>}
            <div className="flex flex-wrap gap-2">
              <Button tamanho="sm" carregando={ocupado === 'salvar-' + a} disabled={!!ocupado || (!chaves[a] && !tokens[a])} onClick={() => salvarConta(a)}>Salvar</Button>
              <Button tamanho="sm" variante="contorno" carregando={ocupado === 'testar-' + a} disabled={!!ocupado || !amb(a).tem_chave} onClick={() => testar(a)}>Testar conexão</Button>
            </div>
          </div>
        })}
      </div>
      {s.testado_em && <p className="text-xs text-muted-foreground">Último teste da conta em uso: {formatarDataHora(s.testado_em)}{s.conta_nome ? ` · ${s.conta_nome}` : ''}</p>}

      <div className="space-y-2 rounded-md border p-4">
        <h3 className="text-sm font-medium">Webhook (o Asaas avisa os pagamentos)</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Em <strong>cada</strong> conta (sandbox.asaas.com e www.asaas.com): Integrações → Webhooks → Adicionar.</li>
          <li>URL (a mesma nas duas): <button type="button" onClick={() => copiar(urlWebhook)} className="inline-flex items-center gap-1 break-all font-mono text-xs text-foreground hover:underline">{urlWebhook}<Copy className="h-3 w-3 shrink-0" /></button></li>
          <li>Token de autenticação: o token salvo na conta correspondente acima. Versão da API v3, envio sequencial.</li>
          <li>Eventos: <span className="font-mono text-xs">{EVENTOS}</span></li>
        </ol>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Campo rotulo="Tolerância após o vencimento (dias)" htmlFor="asaas-dias"><Input id="asaas-dias" type="number" min={0} max={60} value={regras.dias} onChange={e => setRegras({ ...regras, dias: e.target.value })} /></Campo>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={regras.bloquear} onChange={e => setRegras({ ...regras, bloquear: e.target.checked })} />Suspender automaticamente quem passar da tolerância</label>
      </div>
      <p className="text-xs text-muted-foreground">A rotina roda todo dia às 8h. O pagamento confirmado libera o acesso na hora. Suspensões manuais feitas pelo master nunca são desfeitas por pagamento.</p>

      <div className="flex flex-wrap gap-2">
        <Button variante={s.ativo ? 'contorno' : 'primario'} carregando={ocupado === 'ativar'} disabled={!!ocupado || !amb(emUso).tem_chave} onClick={() => ligar(!s.ativo)}>{s.ativo ? 'Desativar cobranças' : 'Ativar cobranças'}</Button>
        <Button variante="contorno" carregando={ocupado === 'regras'} disabled={!!ocupado} onClick={salvarRegras}>Salvar regras de atraso</Button>
        <Button variante="contorno" carregando={ocupado === 'rotina'} disabled={!!ocupado} onClick={rotina}>Aplicar regra de atraso agora</Button>
      </div>
    </>}
  </Card>
}
