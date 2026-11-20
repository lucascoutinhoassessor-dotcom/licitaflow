import type { Session } from '@supabase/supabase-js'

/** Sessão guardada pelo Supabase neste navegador (sem consultar o servidor). */
export function sessaoSalva(armazenamento: Pick<Storage, 'length' | 'key' | 'getItem'> = localStorage): Session | null {
  try {
    for (let i = 0; i < armazenamento.length; i++) {
      const chave = armazenamento.key(i)
      if (!chave || !/^sb-.+-auth-token$/.test(chave)) continue
      const s = JSON.parse(armazenamento.getItem(chave) ?? 'null')
      if (s?.access_token && s?.user?.id) return s as Session
    }
  } catch { /* armazenamento indisponível ou corrompido */ }
  return null
}
