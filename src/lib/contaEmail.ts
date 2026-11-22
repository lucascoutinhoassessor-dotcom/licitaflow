/**
 * Cadastro e "esqueci minha senha" pelo e-mail da plataforma (nome e logo do LicitaFlow).
 * Devolve false quando o servidor ainda não tem e-mail configurado: aí a tela usa o envio padrão do Supabase.
 */
export async function contaEmailAPI(dados: Record<string, unknown>): Promise<boolean> {
  let r: Response
  try {
    r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) })
  } catch {
    return false
  }
  if (!r.headers.get('content-type')?.includes('application/json')) return false
  const json = await r.json().catch(() => ({}))
  if (r.status === 503 && json.codigo === 'sem_smtp') return false
  if (!r.ok) throw new Error(json.error ?? 'Não foi possível enviar o e-mail agora.')
  return true
}

/** Destino interno seguro depois de confirmar o e-mail. */
export function destinoSeguro(voltar: string | null, padrao = '/onboarding') {
  return voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : padrao
}
