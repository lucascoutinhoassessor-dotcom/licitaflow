import { useEffect } from 'react'

/**
 * Operações que não podem ser interrompidas por uma recarga da página (disputa ao vivo da máquina de lances,
 * envio de proposta, pagamento). Enquanto houver alguma ativa, o app nunca recarrega sozinho: se uma página
 * não abrir, mostra o aviso e deixa o usuário decidir.
 */
const ativas = new Set<symbol>()

export function iniciarOperacaoCritica(nome: string): () => void {
  const id = Symbol(nome)
  ativas.add(id)
  return () => { ativas.delete(id) }
}

export function emOperacaoCritica(): boolean {
  return ativas.size > 0
}

/** Use na tela da disputa: `useOperacaoCritica('disputa', disputaAoVivo)`. */
export function useOperacaoCritica(nome: string, ativa = true) {
  useEffect(() => (ativa ? iniciarOperacaoCritica(nome) : undefined), [nome, ativa])
}
