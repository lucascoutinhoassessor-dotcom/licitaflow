import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { codigoComprasnet } from '@/lib/portais'
import type { CompraPNCP } from '@/lib/pncp'
import { useRecursos } from '@/hooks/useModulos'

/** UASG e número da compra no ComprasNet, com cópia em um toque (o cliente cola no portal ao cadastrar a proposta). */
export default function CodigoComprasnet({ compra, className = '' }: { compra: CompraPNCP; className?: string }) {
  const codigo = codigoComprasnet(compra)
  // Controlado pelo master em Funcionalidades (recurso-codigo-comprasnet).
  const liberado = useRecursos().estado('recurso-codigo-comprasnet') === 'liberado'
  if (!codigo || !liberado) return null
  const copiar = async (rotulo: string, valor: string) => {
    try { await navigator.clipboard.writeText(valor); toast.success(`${rotulo} ${valor} copiado.`) } catch { toast.error('Não foi possível copiar.') }
  }
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {([['UASG', codigo.uasg], ['Compra', codigo.numero]] as const).map(([rotulo, valor]) => (
        <button key={rotulo} type="button" onClick={() => copiar(rotulo, valor)} title={`Copiar ${rotulo.toLowerCase()}`}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-500/20 dark:text-sky-300">
          <span className="font-medium text-muted-foreground">{rotulo}</span><span className="tabular-nums">{valor}</span><Copy className="h-3 w-3" />
        </button>
      ))}
    </div>
  )
}
