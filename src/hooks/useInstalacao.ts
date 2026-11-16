import { createContext, useContext } from 'react'
interface Instalacao {
  ocultar: boolean
  instalando: boolean
  ajuda: boolean
  instalar: () => Promise<void>
}
export const CtxInstalacao = createContext<Instalacao | null>(null)
export function useInstalacao() {
  const ctx = useContext(CtxInstalacao)
  if (!ctx) throw new Error('Instalação exige InstalacaoProvider')
  return ctx
}
