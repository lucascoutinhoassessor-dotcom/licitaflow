import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { Abas, Button, CabecalhoPagina, Card, Carregando, Modal, Vazio } from '@/components/ui'
import { BadgePrazo } from '@/components/Situacoes'
import { PrazoForm } from '@/components/PrazoForm'
import { TIPOS_PRAZO, situacaoPrazo, type SituacaoPrazo } from '@/lib/dominio'
import { useLista, useNomeEmpresa, useSalvar } from '@/hooks/useDados'
import { useOrg } from '@/providers/OrgProvider'
import type { Prazo, Processo } from '@/types/db'

type Filtro = 'abertos' | 'concluidos' | 'todos'

const GRUPOS: { id: SituacaoPrazo; titulo: string; cor: string }[] = [
  { id: 'atrasado', titulo: 'Atrasados', cor: 'text-destructive' },
  { id: 'hoje', titulo: 'Hoje', cor: 'text-warning' },
  { id: 'semana', titulo: 'Próximos 7 dias', cor: 'text-primary' },
  { id: 'futuro', titulo: 'Mais adiante', cor: 'text-muted-foreground' },
  { id: 'concluido', titulo: 'Concluídos', cor: 'text-success' },
]

export default function Prazos() {
  const { podeEditar, empresa, empresas } = useOrg()
  const nomeEmpresa = useNomeEmpresa()
  const [filtro, setFiltro] = useState<Filtro>('abertos')
  const [editando, setEditando] = useState<Prazo | 'novo' | null>(null)
  const q = useLista<Prazo>('prazos', { ordem: ['data_hora', true] })
  const procs = useLista<Processo>('processos')
  const { salvar, excluir } = useSalvar('prazos')
  const mostrarEmpresa = !empresa && empresas.length > 1

  const nomeProcesso = (id: string | null) => {
    const p = procs.data?.find((x) => x.id === id)
    return p ? `${p.numero ? `${p.numero} · ` : ''}${p.objeto}` : null
  }

  const grupos = useMemo(() => {
    const lista = (q.data ?? []).filter((p) => (filtro === 'abertos' ? !p.concluido : filtro === 'concluidos' ? p.concluido : true))
    return GRUPOS.map((g) => ({ ...g, itens: lista.filter((p) => situacaoPrazo(p.data_hora, p.concluido) === g.id) })).filter((g) => g.itens.length > 0)
  }, [q.data, filtro])

  const abertos = (q.data ?? []).filter((p) => !p.concluido).length
  const concluidos = (q.data ?? []).length - abertos

  return (
    <>
      <CabecalhoPagina
        titulo="Prazos"
        descricao="Sessões, impugnações, esclarecimentos, recursos, entregas e vigências."
        acoes={podeEditar && <Button onClick={() => setEditando('novo')}><Plus className="h-4 w-4" /> Novo prazo</Button>}
      />
      <Abas<Filtro>
        atual={filtro}
        aoTrocar={setFiltro}
        abas={[
          { id: 'abertos', rotulo: 'Em aberto', contagem: abertos },
          { id: 'concluidos', rotulo: 'Concluídos', contagem: concluidos },
          { id: 'todos', rotulo: 'Todos' },
        ]}
      />
      {q.isLoading ? (
        <Carregando />
      ) : grupos.length === 0 ? (
        <Vazio
          icone={CalendarClock}
          titulo={filtro === 'abertos' ? 'Nenhum prazo em aberto' : 'Nada por aqui'}
          texto="Cadastre prazos avulsos aqui ou dentro de cada processo. Em breve você recebe alertas por e-mail e WhatsApp."
          acao={podeEditar && filtro === 'abertos' && <Button onClick={() => setEditando('novo')}><Plus className="h-4 w-4" /> Novo prazo</Button>}
        />
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <section key={g.id}>
              <h2 className={`mb-2 text-sm font-semibold ${g.cor}`}>{g.titulo} <span className="font-normal text-muted-foreground">({g.itens.length})</span></h2>
              <Card className="divide-y">
                {g.itens.map((p) => {
                  const d = new Date(p.data_hora)
                  const proc = nomeProcesso(p.processo_id)
                  return (
                    <div key={p.id} className="flex items-center gap-3 p-4">
                      <button
                        disabled={!podeEditar}
                        onClick={() => salvar.mutate({ id: p.id, dados: { concluido: !p.concluido, concluido_em: p.concluido ? null : new Date().toISOString() } })}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${p.concluido ? 'border-success bg-success text-white' : 'border-input hover:border-primary'}`}
                        aria-label={p.concluido ? 'Reabrir' : 'Concluir'}
                      >
                        {p.concluido && <Check className="h-3.5 w-3.5" />}
                      </button>
                      <div className="w-14 shrink-0 text-center">
                        <div className="text-lg font-semibold leading-none tabular-nums">{d.getDate().toString().padStart(2, '0')}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">{d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')} · {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-sm font-medium ${p.concluido ? 'text-muted-foreground line-through' : ''}`}>{p.titulo}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {TIPOS_PRAZO[p.tipo]}
                          {proc && <> · <Link to={`/app/processos/${p.processo_id}`} className="hover:text-primary hover:underline">{proc}</Link></>}
                          {mostrarEmpresa && p.empresa_id ? ` · ${nomeEmpresa(p.empresa_id)}` : ''}
                        </div>
                      </div>
                      <div className="hidden sm:block"><BadgePrazo dataHora={p.data_hora} concluido={p.concluido} /></div>
                      {podeEditar && (
                        <div className="flex">
                          <button onClick={() => setEditando(p)} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => confirm('Excluir este prazo?') && excluir.mutate(p.id)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
      <Modal aberto={!!editando} aoFechar={() => setEditando(null)} titulo={editando === 'novo' ? 'Novo prazo' : 'Editar prazo'}>
        {editando && <PrazoForm prazo={editando === 'novo' ? undefined : editando} aoSalvar={() => setEditando(null)} />}
      </Modal>
    </>
  )
}
