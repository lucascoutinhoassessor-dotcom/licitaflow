import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, KeyRound } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora, formatarMoeda } from '@/lib/format'
import { pagamentoAPI } from '@/lib/pagamentos'
import { Aviso, Badge, Button, Campo, Card, Input, Select } from '@/components/ui'

interface Status { ativo: boolean; ambiente: 'sandbox' | 'production'; tem_chave: boolean; tem_token: boolean; dias_tolerancia: number; bloquear_inadimplente: boolean; conta_nome: string | null; testado_em: string | null }
const EVENTOS = 'PAYMENT_CREATED, PAYMENT_UPDATED, PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED, PAYMENT_REFUNDED, PAYMENT_CHARGEBACK_REQUESTED, SUBSCRIPTION_DELETED, SUBSCRIPTION_INACTIVATED'

function gerarToken() {
  const b = new Uint8Array(24); crypto.getRandomValues(b)
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

/** Configuração do Asaas pelo master: chave e token vão só para o servidor, que guarda cifrado. */
export function AsaasConfig() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['asaas-status'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_gateway_status'); if (error) throw error; return data as Status
  }, retry: false })
  const [f, setF] = useState({ ambiente: 'sandbox', chave: '', token: '', dias: '5', bloquear: true })
  const [ocupado, setOcupado] = useState('')
  const [teste, setTeste] = useState<{ saldo: number | null; conta: string | null; ambiente: string } | null>(null)
  const [tokenNovo, setTokenNovo] = useState('')
  const urlWebhook = `${window.location.origin}/api/asaas-webhook`
  useEffect(() => { if (q.data) setF(x => ({ ...x, ambiente: q.data.ambiente, dias: String(q.data.dias_tolerancia), bloquear: q.data.bloquear_inadimplente })) }, [q.data])
  const recarregar = () => Promise.all([qc.invalidateQueries({ queryKey: ['asaas-status'] }), qc.invalidateQueries({ queryKey: ['admin-financeiro'] }), qc.invalidateQueries({ queryKey: ['gateways-config'] })])

  async function salvar(ativo?: boolean) {
    setOcupado(ativo === undefined ? 'salvar' : 'ativar')
    try {
      if (ativo && f.ambiente === 'production' && !confirm('Ativar cobranças REAIS no Asaas de produção? Clientes passam a pagar de verdade.')) return
      await pagamentoAPI({ acao: 'asaas_salvar', ambiente: f.ambiente, api_key: f.chave || undefined, webhook_token: f.token || undefined, ...(ativo === undefined ? {} : { ativo }) })
      const dias = Number(f.dias)
      if (!Number.isInteger(dias) || dias < 0 || dias > 60) throw new Error('Tolerância deve ser de 0 a 60 dias.')
      const { error } = await supabase.rpc('admin_regras_cobranca', { p_dias: dias, p_bloquear: f.bloquear }); if (error) throw error
      if (f.token) setTokenNovo(f.token)
      setF(x => ({ ...x, chave: '', token: '' }))
      await recarregar(); toast.success(ativo === undefined ? 'Configuração salva.' : ativo ? 'Asaas ativado.' : 'Asaas desativado.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }
  async function testar() {
    setOcupado('testar')
    try { const r = await pagamentoAPI({ acao: 'asaas_testar' }); setTeste(r); await recarregar(); toast.success('Conexão com o Asaas funcionando.') }
    catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }
  async function rotina() {
    setOcupado('rotina')
    try { const { data, error } = await supabase.rpc('admin_rotina_cobranca'); if (error) throw error; toast.success(`${data} conta(s) suspensa(s) por atraso.`); await recarregar() }
    catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }
  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success('Copiado.'), () => toast.error('Não foi possível copiar.'))

  const s = q.data
  return <Card className="space-y-5 p-5">
    <div className="flex flex-wrap items-center gap-2">
      <KeyRound className="h-5 w-5 text-primary" /><h2 className="flex-1 font-semibold">Asaas · assinaturas recorrentes</h2>
      {s && <Badge cor={s.ativo ? 'verde' : 'amarelo'}>{s.ativo ? `Ativo · ${s.ambiente === 'production' ? 'produção' : 'sandbox'}` : 'Desativado'}</Badge>}
    </div>
    {q.isError && <Aviso>{mensagemErro(q.error)} — aplique a migração de assinaturas.</Aviso>}
    {s && <>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <p>Chave de API: <strong>{s.tem_chave ? 'cadastrada' : 'ausente'}</strong></p>
        <p>Token do webhook: <strong>{s.tem_token ? 'cadastrado' : 'ausente'}</strong></p>
        <p>Último teste: <strong>{s.testado_em ? formatarDataHora(s.testado_em) : 'nunca'}</strong>{s.conta_nome ? ` · ${s.conta_nome}` : ''}</p>
      </div>
      {teste && <Aviso tipo="sucesso">Conta {teste.conta ?? 'Asaas'} ({teste.ambiente}) respondeu. Saldo disponível: {teste.saldo == null ? '—' : formatarMoeda(teste.saldo)}.</Aviso>}

      <div className="grid gap-4 md:grid-cols-2">
        <Campo rotulo="Ambiente" htmlFor="asaas-amb"><Select id="asaas-amb" value={f.ambiente} onChange={e => setF({ ...f, ambiente: e.target.value })}><option value="sandbox">Sandbox (testes)</option><option value="production">Produção (cobranças reais)</option></Select></Campo>
        <Campo rotulo={s.tem_chave ? 'Nova chave de API (deixe vazio para manter)' : 'Chave de API do Asaas'} htmlFor="asaas-chave" ajuda="Asaas → Integrações → Chave de API. Fica cifrada no servidor e nunca volta para a tela.">
          <Input id="asaas-chave" type="password" autoComplete="off" value={f.chave} onChange={e => setF({ ...f, chave: e.target.value })} placeholder="$aact_..." /></Campo>
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <h3 className="text-sm font-medium">Webhook (o Asaas avisa os pagamentos)</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>No Asaas: Integrações → Webhooks → Adicionar.</li>
          <li>URL: <button type="button" onClick={() => copiar(urlWebhook)} className="inline-flex items-center gap-1 break-all font-mono text-xs text-foreground hover:underline">{urlWebhook}<Copy className="h-3 w-3 shrink-0" /></button></li>
          <li>Token de autenticação: o mesmo informado abaixo. Versão da API v3, envio sequencial.</li>
          <li>Eventos: <span className="font-mono text-xs">{EVENTOS}</span></li>
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1"><Campo rotulo={s.tem_token ? 'Novo token (deixe vazio para manter)' : 'Token do webhook'} htmlFor="asaas-token"><Input id="asaas-token" autoComplete="off" value={f.token} onChange={e => setF({ ...f, token: e.target.value })} /></Campo></div>
          <Button type="button" variante="contorno" onClick={() => setF({ ...f, token: gerarToken() })}>Gerar token</Button>
        </div>
        {tokenNovo && <p className="text-sm">Token salvo. Copie agora para o Asaas (ele não será mostrado de novo): <button type="button" className="break-all font-mono text-xs underline" onClick={() => copiar(tokenNovo)}>{tokenNovo}</button></p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Campo rotulo="Tolerância após o vencimento (dias)" htmlFor="asaas-dias"><Input id="asaas-dias" type="number" min={0} max={60} value={f.dias} onChange={e => setF({ ...f, dias: e.target.value })} /></Campo>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.bloquear} onChange={e => setF({ ...f, bloquear: e.target.checked })} />Suspender automaticamente quem passar da tolerância</label>
      </div>
      <p className="text-xs text-muted-foreground">A rotina roda todo dia às 8h. O pagamento confirmado libera o acesso na hora. Suspensões manuais feitas pelo master nunca são desfeitas por pagamento.</p>

      <div className="flex flex-wrap gap-2">
        <Button carregando={ocupado === 'salvar'} disabled={!!ocupado} onClick={() => salvar()}>Salvar configuração</Button>
        <Button variante="contorno" carregando={ocupado === 'testar'} disabled={!!ocupado || (!s.tem_chave && !f.chave)} onClick={testar}>Testar conexão</Button>
        <Button variante={s.ativo ? 'contorno' : 'primario'} carregando={ocupado === 'ativar'} disabled={!!ocupado || (!s.tem_chave && !f.chave)} onClick={() => salvar(!s.ativo)}>{s.ativo ? 'Desativar cobranças' : 'Ativar cobranças'}</Button>
        <Button variante="contorno" carregando={ocupado === 'rotina'} disabled={!!ocupado} onClick={rotina}>Aplicar regra de atraso agora</Button>
      </div>
    </>}
  </Card>
}
