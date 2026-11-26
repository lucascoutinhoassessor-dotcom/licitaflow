import { supabase } from './supabase'

export const TIPOS_CHAMADO: Record<string, string> = { suporte: 'Suporte', sugestao: 'Sugestão', solicitacao: 'Solicitação', liberacao_conta: 'Liberação de conta' }

export async function suporteAPI(dados: Record<string, unknown>): Promise<{ aviso?: string }> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Entre na sua conta novamente.')
  const r = await fetch('/api/usuarios', { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({...dados, acao: 'suporte_' + dados.acao}) })
  if (!r.headers.get('content-type')?.includes('application/json')) throw new Error('API de suporte indisponível nesta publicação.')
  const json = await r.json()
  if (!r.ok) throw new Error(json.error || 'Falha no atendimento')
  return json
}
