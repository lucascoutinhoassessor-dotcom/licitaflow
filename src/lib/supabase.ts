import { createClient } from '@supabase/supabase-js'
import { consultarComLimite } from './conexao'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** true quando as variáveis do Supabase não foram configuradas (mostra tela de configuração). */
export const supabaseNaoConfigurado = !url || !anonKey

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'sem-chave', {
  global: {
    // Uma renovação pendurada bloqueia também as demais consultas que aguardam o token.
    fetch: (input, init) => String(input).includes('/auth/v1/')
      ? consultarComLimite(signal => fetch(input, { ...init, signal }), init?.signal ?? undefined)
      : fetch(input, init),
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** Login encerrado no servidor (saiu em outro aparelho, sessão revogada ou expirada) com o token ainda guardado no navegador. */
export const SESSAO_ENCERRADA = /session_id claim in JWT does not exist|session[ _]not[ _]found|invalid JWT|JWT expired|refresh token|sess[aã]o (expirou|encerrada)|Entre na sua conta/i
const MSG_SESSAO = 'Sua sessão foi encerrada. Entre novamente para continuar.'

/**
 * fetch para as funções /api com o token do usuário. Se o servidor recusar a sessão (401/403 de sessão),
 * renova o token uma vez e repete; se nem a renovação funcionar, encerra o login local e pede para entrar de novo.
 */
export async function fetchComSessao(url: string, init: RequestInit = {}): Promise<Response> {
  const enviar = (token: string) => fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } })
  const { data } = await supabase.auth.getSession()
  if (data.session) {
    const r = await enviar(data.session.access_token)
    if (r.status !== 401 && r.status !== 403) return r
    const corpo = await r.clone().json().catch(() => ({})) as { error?: string }
    if (r.status === 403 && !SESSAO_ENCERRADA.test(corpo.error ?? '')) return r
  }
  const { data: novo, error } = await supabase.auth.refreshSession()
  if (error || !novo.session) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    throw new Error(MSG_SESSAO)
  }
  return enviar(novo.session.access_token)
}

/** Converte erros do Supabase/Postgres em mensagens legíveis em português. */
export function mensagemErro(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  const mapa: Record<string, string> = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'Email not confirmed': 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.',
    'User already registered': 'Já existe uma conta com este e-mail.',
    'Password should be at least 6 characters': 'A senha precisa ter pelo menos 8 caracteres.',
    'duplicate key value violates unique constraint "empresas_org_id_cnpj_key"': 'Esta empresa (CNPJ) já está cadastrada.',
    'new row violates row-level security policy': 'Você não tem permissão para esta ação.',
  }
  for (const [k, v] of Object.entries(mapa)) if (msg.includes(k)) return v
  if (/session_id claim in JWT does not exist|session[ _]not[ _]found|JWT expired|invalid JWT/i.test(msg)) return MSG_SESSAO
  if (/rate limit/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  if (/fetch|network/i.test(msg)) return 'Falha de conexão. Verifique sua internet.'
  // Supabase lento ou fora do ar (504/AuthRetryableFetchError): o corpo vem vazio e a mensagem vira "{}".
  const erro = e as { name?: string; status?: number }
  if (!msg.trim() || /^\s*(\{\s*\}|\[object Object\]|undefined|null)\s*$/.test(msg) || erro?.name === 'AuthRetryableFetchError' || (erro?.status ?? 0) >= 500) {
    return 'O servidor está demorando para responder. Tente de novo em instantes.'
  }
  return msg
}
