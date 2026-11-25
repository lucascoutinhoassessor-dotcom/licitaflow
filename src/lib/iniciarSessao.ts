import type { Session, SupabaseClient } from '@supabase/supabase-js'

/** Uma falha de rede nunca equivale a um logout nem autoriza usar um token vencido. */
export function iniciarSessao(auth: SupabaseClient['auth'], aplicar: (sessao: Session | null, evento?: string) => void, falhar: () => void) {
  let ativo = true
  let resolvido = false
  const limite = setTimeout(() => { if (ativo && !resolvido) falhar() }, 15_000)
  const { data } = auth.onAuthStateChange((evento, sessao) => {
    if (!ativo) return
    // O SDK também emite INITIAL_SESSION nula quando a renovação falha por rede.
    // getSession informa o erro e distingue essa situação de uma ausência real de login.
    if (evento === 'INITIAL_SESSION' && !sessao) return
    resolvido = true
    clearTimeout(limite)
    aplicar(sessao, evento)
  })
  void auth.getSession().then(({ data, error }) => {
    if (!ativo || resolvido) return
    clearTimeout(limite)
    if (error) { falhar(); return }
    resolvido = true
    aplicar(data.session)
  }).catch(() => {
    if (ativo && !resolvido) { clearTimeout(limite); falhar() }
  })
  return () => { ativo = false; clearTimeout(limite); data.subscription.unsubscribe() }
}
