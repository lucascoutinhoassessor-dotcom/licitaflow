import type { ReactNode } from 'react'
import { useFiltrosLiberados } from '@/hooks/useModulos'
import { Badge } from '@/components/ui'

/** Mostra um filtro conforme o master liberou: liberado normal, em breve desativado com selo, oculto não aparece. */
export function FiltroLiberado({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { estado } = useFiltrosLiberados()
  const e = estado(id)
  if (e === 'oculto') return null
  if (e === 'em_breve') return <fieldset disabled className={`relative opacity-60 ${className ?? ''}`} title="Em breve">
    <Badge cor="azul" className="absolute -top-2 right-0 z-10">Em breve</Badge>{children}
  </fieldset>
  return className ? <div className={className}>{children}</div> : <>{children}</>
}

/** Seção de filtros que some quando nenhum dos filtros dela está visível. */
export function useAlgumFiltroVisivel() {
  const { estado } = useFiltrosLiberados()
  return (...ids: string[]) => ids.some((id) => estado(id) !== 'oculto')
}
