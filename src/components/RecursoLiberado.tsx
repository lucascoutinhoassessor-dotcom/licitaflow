import type { ReactNode } from 'react'
import { useRecursos } from '@/hooks/useModulos'
import { Badge } from '@/components/ui'

/**
 * Mostra um botão/ação conforme o master liberou em Funcionalidades:
 * liberado normal, em breve desativado com selo, oculto (ou em teste com outras organizações) não aparece.
 */
export function RecursoLiberado({ id, children, className }: { id: `recurso-${string}`; children: ReactNode; className?: string }) {
  const { estado } = useRecursos()
  const e = estado(id)
  if (e === 'oculto') return null
  if (e === 'em_breve') return <fieldset disabled className={`relative inline-block opacity-60 ${className ?? ''}`} title="Em breve">
    <Badge cor="azul" className="absolute -top-2 right-0 z-10">Em breve</Badge>{children}
  </fieldset>
  return className ? <div className={className}>{children}</div> : <>{children}</>
}
