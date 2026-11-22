import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Input } from '@/components/ui'
import { pagamentoAPI } from '@/lib/pagamentos'
import { mensagemErro } from '@/lib/supabase'
import { formatarData } from '@/lib/format'

/** "Tenho um cupom": cupom de dias libera o acesso na hora e manda a confirmação para o e-mail cadastrado. */
export default function ResgatarCupom({ org }: { org: string }) {
  const qc = useQueryClient()
  const [codigo, setCodigo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [feito, setFeito] = useState<string | null>(null)
  async function usar(e: FormEvent) {
    e.preventDefault()
    setOcupado(true)
    try {
      const c = await pagamentoAPI({ acao: 'conferir_cupom', org, codigo })
      if (c.tipo !== 'dias') {
        toast.info('Este é um cupom de desconto: informe-o ao assinar um plano, no campo “Cupom de desconto”.')
        return
      }
      const r = await pagamentoAPI({ acao: 'resgatar_cupom', org, codigo })
      setFeito(`Cupom aplicado: ${r.valor} dias de acesso, até ${formatarData(r.ate)}.${r.emailEnviado ? ' A confirmação foi enviada para o seu e-mail.' : ''}`)
      setCodigo('')
      await Promise.all([qc.invalidateQueries({ queryKey: ['organizacoes'] }), qc.invalidateQueries({ queryKey: ['plano-cliente'] })])
      toast.success('Cupom aplicado.')
    } catch (err) { toast.error(mensagemErro(err)) } finally { setOcupado(false) }
  }
  return (
    <Card className="mt-6 p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Ticket className="h-4 w-4 text-primary" />Tenho um cupom</h2>
      <p className="mt-1 text-sm text-muted-foreground">Cupons de dias liberam o acesso na hora. Cupons de desconto são usados ao assinar um plano.</p>
      <form onSubmit={usar} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input aria-label="Código do cupom" placeholder="Ex.: LF-ABCD-1234" required minLength={3} maxLength={40} value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/\s/g, ''))} />
        <Button type="submit" carregando={ocupado}>Usar cupom</Button>
      </form>
      {feito && <p role="status" className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">{feito}</p>}
    </Card>
  )
}
