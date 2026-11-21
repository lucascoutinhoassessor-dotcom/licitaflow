import { categoriasDoObjeto } from '@/lib/categorias'
import { cn } from '@/lib/utils'

/** Etiquetas curtas que resumem do que se trata o edital. */
export default function CategoriasObjeto({ objeto, className }: { objeto: string | null | undefined; className?: string }) {
  const categorias = categoriasDoObjeto(objeto)
  if (!categorias.length) return null
  return <div className={cn('flex flex-wrap gap-1.5', className)} aria-label="Categorias">
    {categorias.map(nome => <span key={nome} className="inline-flex items-center rounded-full border border-emerald-600/50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-400/50 dark:text-emerald-300">{nome}</span>)}
  </div>
}
