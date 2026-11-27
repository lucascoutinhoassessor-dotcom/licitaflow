import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOrg } from '@/providers/OrgProvider'
import { pagamentoAPI } from '@/lib/pagamentos'
import { mensagemErro } from '@/lib/supabase'
import { formatarData } from '@/lib/format'
import { guardarCupomPendente, useCupomPendente, type CupomInfo } from '@/lib/cupom'

/**
 * Cupom vindo de um link (guardado no navegador) é usado assim que a pessoa tem uma organização que administra:
 * cupom de dias entra na hora (e libera a conta bloqueada); cupom de desconto fica guardado para o checkout.
 * Devolve 'aplicando' enquanto um cupom de dias pode estar entrando, para a tela não redirecionar antes.
 */
export function useAplicarCupomPendente(): 'livre' | 'aplicando' {
  const codigo = useCupomPendente()
  const { org, podeAdministrar } = useOrg()
  const qc = useQueryClient()
  const vistos = useRef(new Set<string>())
  const [ocupado, setOcupado] = useState(false)
  const chave = codigo && org ? `${org.id}:${codigo}` : null
  const pendente = !!chave && podeAdministrar && !vistos.current.has(chave)

  useEffect(() => {
    if (!pendente || !chave || !org || !codigo) return
    vistos.current.add(chave)
    setOcupado(true)
    void (async () => {
      try {
        const c = await pagamentoAPI({ acao: 'conferir_cupom', org: org.id, codigo }) as CupomInfo
        if (c.tipo !== 'dias') return // desconto: o checkout usa
        const r = await pagamentoAPI({ acao: 'resgatar_cupom', org: org.id, codigo })
        guardarCupomPendente(null)
        toast.success(`Cupom ${codigo} aplicado: ${r.valor} dias de acesso, até ${formatarData(r.ate)}.`)
        await qc.invalidateQueries({ queryKey: ['organizacoes'] })
      } catch (e) {
        guardarCupomPendente(null)
        toast.error(`Cupom ${codigo}: ${mensagemErro(e)}`)
      } finally { setOcupado(false) }
    })()
  }, [pendente, chave]) // eslint-disable-line react-hooks/exhaustive-deps

  return pendente || ocupado ? 'aplicando' : 'livre'
}

/** Para as telas do app com acesso liberado (teste em andamento): só aplica, sem mostrar nada. */
export function AplicarCupomPendente() {
  useAplicarCupomPendente()
  return null
}
