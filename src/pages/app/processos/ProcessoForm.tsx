import { PORTAIS, rotuloPortal } from '@/lib/portais'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button, Campo, Input, Select, Textarea } from '@/components/ui'
import { SeletorEmpresa, useEmpresaPadrao } from '@/components/Situacoes'
import { ETAPAS, MODALIDADES, PRIORIDADES, type Etapa, type Modalidade } from '@/lib/dominio'
import { useSalvar } from '@/hooks/useDados'
import type { Processo } from '@/types/db'

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

function local(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function ProcessoForm({ processo, aoSalvar }: { processo?: Processo; aoSalvar: (p: Processo) => void }) {
  const padrao = useEmpresaPadrao()
  const [f, setF] = useState({
    empresa_id: processo?.empresa_id ?? padrao,
    modalidade: (processo?.modalidade ?? 'pregao_eletronico') as Modalidade,
    etapa: (processo?.etapa ?? 'captacao') as Etapa,
    numero: processo?.numero ?? '',
    objeto: processo?.objeto ?? '',
    orgao_nome: processo?.orgao_nome ?? '',
    uasg: processo?.uasg ?? '',
    uf: processo?.uf ?? '',
    municipio: processo?.municipio ?? '',
    portal: rotuloPortal(processo?.portal) ?? '',
    link_edital: processo?.link_edital ?? '',
    valor_estimado: processo?.valor_estimado?.toString() ?? '',
    data_abertura: local(processo?.data_abertura),
    prioridade: processo?.prioridade ?? 'media',
    observacoes: processo?.observacoes ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const { salvar } = useSalvar('processos', ['processo_eventos', 'prazos'])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!f.empresa_id) return toast.error('Selecione a empresa.')
    const p = await salvar.mutateAsync({
      id: processo?.id,
      dados: {
        ...f,
        valor_estimado: f.valor_estimado ? Number(f.valor_estimado.replace(',', '.')) : null,
        data_abertura: f.data_abertura ? new Date(f.data_abertura).toISOString() : null,
      },
    })
    toast.success(processo ? 'Processo atualizado.' : 'Processo criado.')
    aoSalvar(p as Processo)
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {!processo && <SeletorEmpresa valor={f.empresa_id} aoMudar={(v) => setF((x) => ({ ...x, empresa_id: v }))} id="proc-empresa" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Modalidade" htmlFor="proc-mod">
          <Select id="proc-mod" value={f.modalidade} onChange={set('modalidade')}>
            {Object.entries(MODALIDADES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo rotulo="Número" htmlFor="proc-num">
          <Input id="proc-num" value={f.numero} onChange={set('numero')} placeholder="ex.: 90012/2026" />
        </Campo>
      </div>
      <Campo rotulo="Objeto" htmlFor="proc-obj">
        <Textarea id="proc-obj" required rows={2} value={f.objeto} onChange={set('objeto')} placeholder="ex.: Aquisição de notebooks para a Secretaria de Educação" />
      </Campo>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Campo rotulo="Órgão" htmlFor="proc-orgao">
            <Input id="proc-orgao" value={f.orgao_nome} onChange={set('orgao_nome')} />
          </Campo>
        </div>
        <Campo rotulo="UASG" htmlFor="proc-uasg">
          <Input id="proc-uasg" value={f.uasg} onChange={set('uasg')} />
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="UF" htmlFor="proc-uf">
          <Select id="proc-uf" value={f.uf} onChange={set('uf')}>
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Campo>
        <div className="sm:col-span-2">
          <Campo rotulo="Município" htmlFor="proc-mun">
            <Input id="proc-mun" value={f.municipio} onChange={set('municipio')} />
          </Campo>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Sessão / abertura" htmlFor="proc-abertura">
          <Input id="proc-abertura" type="datetime-local" value={f.data_abertura} onChange={set('data_abertura')} />
        </Campo>
        <Campo rotulo="Valor estimado (R$)" htmlFor="proc-valor">
          <Input id="proc-valor" inputMode="decimal" value={f.valor_estimado} onChange={set('valor_estimado')} placeholder="0,00" />
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Portal" htmlFor="proc-portal">
          <Input id="proc-portal" list="portais" value={f.portal} onChange={set('portal')} />
          <datalist id="portais">{PORTAIS.map(([,nome])=><option key={nome} value={nome} />)}</datalist>
        </Campo>
        <Campo rotulo="Etapa" htmlFor="proc-etapa">
          <Select id="proc-etapa" value={f.etapa} onChange={set('etapa')}>
            {Object.entries(ETAPAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo rotulo="Prioridade" htmlFor="proc-prio">
          <Select id="proc-prio" value={f.prioridade} onChange={set('prioridade')}>
            {Object.entries(PRIORIDADES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Campo>
      </div>
      <Campo rotulo="Link do edital" htmlFor="proc-link">
        <Input id="proc-link" type="url" value={f.link_edital} onChange={set('link_edital')} placeholder="https://" />
      </Campo>
      <Campo rotulo="Observações" htmlFor="proc-obs">
        <Textarea id="proc-obs" rows={2} value={f.observacoes} onChange={set('observacoes')} />
      </Campo>
      <Button type="submit" className="w-full" carregando={salvar.isPending}>
        {processo ? 'Salvar processo' : 'Criar processo'}
      </Button>
    </form>
  )
}
