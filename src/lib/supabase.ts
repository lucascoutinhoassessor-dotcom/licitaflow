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
  if (/rate limit/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  if (/fetch|network/i.test(msg)) return 'Falha de conexão. Verifique sua internet.'
  return msg
}
