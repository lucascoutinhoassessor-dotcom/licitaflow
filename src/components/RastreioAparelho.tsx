import { useEffect } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import { observarPermissao } from '@/lib/push'
import { registrarAparelho } from '@/lib/engajamento'

/** Sem interface: informa ao master se este aparelho instalou o app e permitiu as notificações. */
export default function RastreioAparelho() {
  const { user } = useAuth()
  useEffect(() => {
    if (!user) return
    let ultimo = 0
    const registrar = (instalado = false) => {
      // Trocas de aba disparam várias vezes: no máximo um registro a cada 30 s, exceto mudanças reais.
      if (!instalado && Date.now() - ultimo < 30_000) return
      ultimo = Date.now()
      void registrarAparelho(instalado).catch(() => undefined)
    }
    const t = window.setTimeout(() => registrar(), 2500)
    const parar = observarPermissao(() => registrar())
    const instalou = () => registrar(true)
    const mudou = () => { ultimo = 0; registrar() }
    window.addEventListener('appinstalled', instalou)
    window.addEventListener('lf-push-mudou', mudou)
    return () => { window.clearTimeout(t); parar(); window.removeEventListener('appinstalled', instalou); window.removeEventListener('lf-push-mudou', mudou) }
  }, [user?.id])
  return null
}
