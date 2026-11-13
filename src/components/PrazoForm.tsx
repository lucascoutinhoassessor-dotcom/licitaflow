import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button, Campo, Input, Select } from '@/components/ui'
import { SeletorEmpresa, useEmpresaPadrao } from '@/components/Situacoes'
import { TIPOS_PRAZO, type TipoPrazo } from '@/lib/dominio'
import { useSalvar } from '@/hooks/useDados'
import type { Prazo } from '@/types/db'

function paraInputLocal(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function PrazoForm({
  prazo,
  processoId,
  contratoId,
  empresaId,
  aoSalvar,
}: {
  prazo?: Prazo
  processoId?: string
  contratoId?: string
  empresaId?: string
  aoSalvar: () => void
}) {
  const padrao = useEmpresaPadrao()
  const [empresa, setEmpresa] = useState(prazo?.empresa_id ?? empresaId ?? padrao)
  const [tipo, setTipo] = useState<TipoPrazo>(prazo?.tipo ?? 'sessao')
  const [titulo, setTitulo] = useState(prazo?.titulo ?? '')
  const [dataHora, setDataHora] = useState(paraInputLocal(prazo?.data_hora))
  const { salvar } = useSalvar('prazos', ['processo_eventos'])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await salvar.mutateAsync({
      id: prazo?.id,
      dados: {
        empresa_id: empresa || null,
        processo_id: prazo?.processo_id ?? processoId ?? null,
        contrato_id: prazo?.contrato_id ?? contratoId ?? null,
        tipo,
        titulo: titulo.trim() || TIPOS_PRAZO[tipo],
        data_hora: new Date(dataHora).toISOString(),
      },
    })
    toast.success(prazo ? 'Prazo atualizado.' : 'Prazo criado.')
    aoSalvar()
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {!processoId && !contratoId && !prazo && <SeletorEmpresa valor={empresa} aoMudar={setEmpresa} id="prazo-empresa" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Tipo" htmlFor="prazo-tipo">
          <Select id="prazo-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoPrazo)}>
            {Object.entries(TIPOS_PRAZO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo rotulo="Data e hora" htmlFor="prazo-data">
          <Input id="prazo-data" type="datetime-local" required value={dataHora} onChange={(e) => setDataHora(e.target.value)} />
        </Campo>
      </div>
      <Campo rotulo="Descrição" htmlFor="prazo-titulo" ajuda="Opcional. Se ficar vazio, usamos o tipo do prazo.">
        <Input id="prazo-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ex.: Sessão do Pregão 90012/2026" />
      </Campo>
      <Button type="submit" className="w-full" carregando={salvar.isPending}>
        {prazo ? 'Salvar prazo' : 'Criar prazo'}
      </Button>
    </form>
  )
}
