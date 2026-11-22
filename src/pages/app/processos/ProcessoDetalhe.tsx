import ArquivosEdital from '@/components/ArquivosEdital'
import { rotuloPortal } from '@/lib/portais'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useModulos } from '@/hooks/useModulos'
import { rotaLeitor } from '@/lib/leitor'
import { ArrowLeft, Check, ExternalLink, FileSearch, FileSignature, FileText, MessageSquarePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Abas, Badge, Button, Campo, Card, Carregando, Input, Modal, Select, Textarea, Vazio } from '@/components/ui'
import { BadgeEtapa, BadgePrazo, BadgeValidade } from '@/components/Situacoes'
import { PrazoForm } from '@/components/PrazoForm'
import { DocumentoForm, abrirArquivo } from '@/components/DocumentoForm'
import { CATEGORIAS_DOC, ETAPAS, MODALIDADES, TIPOS_PRAZO, descontoSobreReferencia, margemSobrePreco, precoLimite, totalItens, type Etapa } from '@/lib/dominio'
import { formatarData, formatarDataHora, formatarMoeda } from '@/lib/format'
import { useLista, useNomeEmpresa, useRegistro, useSalvar } from '@/hooks/useDados'
import { useOrg } from '@/providers/OrgProvider'
import type { Documento, Prazo, Processo, ProcessoEvento, ProcessoItem } from '@/types/db'
import NaoEncontrada from '@/pages/NaoEncontrada'
import { ProcessoForm } from './ProcessoForm'

type Aba = 'resumo' | 'itens' | 'prazos' | 'documentos' | 'historico'

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\./g, '').replace(',', '.')))
const str = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

function ItemForm({ processoId, item, aoSalvar }: { processoId: string; item?: ProcessoItem; aoSalvar: () => void }) {
  const [f, setF] = useState({
    numero_item: item?.numero_item?.toString() ?? '',
    lote: item?.lote ?? '',
    descricao: item?.descricao ?? '',
    unidade: item?.unidade ?? 'UN',
    quantidade: str(item?.quantidade ?? 1),
    valor_ref_unit: str(item?.valor_ref_unit),
    custo_unit: str(item?.custo_unit),
    margem_min_pct: str(item?.margem_min_pct),
    lance_final_unit: str(item?.lance_final_unit),
    marca_modelo: item?.marca_modelo ?? '',
    fornecedor_nome: item?.fornecedor_nome ?? '',
    resultado: item?.resultado ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const { salvar } = useSalvar('processo_itens')
  const limite = precoLimite(num(f.custo_unit), num(f.margem_min_pct))

  async function enviar(e: FormEvent) {
    e.preventDefault()
    await salvar.mutateAsync({
      id: item?.id,
      dados: {
        processo_id: processoId,
        numero_item: f.numero_item ? Number(f.numero_item) : null,
        lote: f.lote,
        descricao: f.descricao.trim(),
        unidade: f.unidade,
        quantidade: num(f.quantidade) ?? 1,
        valor_ref_unit: num(f.valor_ref_unit),
        custo_unit: num(f.custo_unit),
        margem_min_pct: num(f.margem_min_pct),
        preco_limite_unit: limite,
        lance_final_unit: num(f.lance_final_unit),
        marca_modelo: f.marca_modelo,
        fornecedor_nome: f.fornecedor_nome,
        resultado: f.resultado || null,
      },
    })
    toast.success(item ? 'Item atualizado.' : 'Item adicionado.')
    aoSalvar()
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Campo rotulo="Item nº" htmlFor="it-num">
          <Input id="it-num" inputMode="numeric" value={f.numero_item} onChange={set('numero_item')} />
        </Campo>
        <Campo rotulo="Lote" htmlFor="it-lote">
          <Input id="it-lote" value={f.lote} onChange={set('lote')} />
        </Campo>
        <Campo rotulo="Unidade" htmlFor="it-un">
          <Input id="it-un" value={f.unidade} onChange={set('unidade')} />
        </Campo>
      </div>
      <Campo rotulo="Descrição" htmlFor="it-desc">
        <Textarea id="it-desc" required rows={2} value={f.descricao} onChange={set('descricao')} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Quantidade" htmlFor="it-qtd">
          <Input id="it-qtd" inputMode="decimal" required value={f.quantidade} onChange={set('quantidade')} />
        </Campo>
        <Campo rotulo="Valor de referência (unit.)" htmlFor="it-ref">
          <Input id="it-ref" inputMode="decimal" value={f.valor_ref_unit} onChange={set('valor_ref_unit')} placeholder="0,00" />
        </Campo>
        <Campo rotulo="Seu custo (unit.)" htmlFor="it-custo">
          <Input id="it-custo" inputMode="decimal" value={f.custo_unit} onChange={set('custo_unit')} placeholder="0,00" />
        </Campo>
        <Campo rotulo="Margem mínima (%)" htmlFor="it-margem">
          <Input id="it-margem" inputMode="decimal" value={f.margem_min_pct} onChange={set('margem_min_pct')} placeholder="ex.: 15" />
        </Campo>
      </div>
      <div className="rounded-md bg-primary/5 px-3 py-2 text-sm">
        Preço-limite (menor lance aceitável): <strong className="tabular-nums">{limite != null ? formatarMoeda(limite) : '—'}</strong>
        {limite != null && num(f.valor_ref_unit) != null && limite > (num(f.valor_ref_unit) ?? 0) && (
          <span className="ml-2 text-warning">acima do valor de referência</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Lance final (unit.)" htmlFor="it-lance">
          <Input id="it-lance" inputMode="decimal" value={f.lance_final_unit} onChange={set('lance_final_unit')} />
        </Campo>
        <Campo rotulo="Resultado" htmlFor="it-res">
          <Select id="it-res" value={f.resultado} onChange={set('resultado')}>
            <option value="">—</option>
            <option value="ganho">Ganho</option>
            <option value="perdido">Perdido</option>
            <option value="fracassado">Fracassado</option>
            <option value="deserto">Deserto</option>
            <option value="cancelado">Cancelado</option>
          </Select>
        </Campo>
        <Campo rotulo="Marca / modelo" htmlFor="it-marca">
          <Input id="it-marca" value={f.marca_modelo} onChange={set('marca_modelo')} />
        </Campo>
        <Campo rotulo="Fornecedor" htmlFor="it-forn">
          <Input id="it-forn" value={f.fornecedor_nome} onChange={set('fornecedor_nome')} />
        </Campo>
      </div>
      <Button type="submit" className="w-full" carregando={salvar.isPending}>
        {item ? 'Salvar item' : 'Adicionar item'}
      </Button>
    </form>
  )
}

function Itens({ processoId, podeEditar }: { processoId: string; podeEditar: boolean }) {
  const q = useLista<ProcessoItem>('processo_itens', { porEmpresa: false, chave: [processoId], filtro: (x) => x.eq('processo_id', processoId), ordem: ['numero_item', true] })
  const { excluir } = useSalvar('processo_itens')
  const [editando, setEditando] = useState<ProcessoItem | 'novo' | null>(null)
  const itens = q.data ?? []

  const resumo = [
    { r: 'Referência do órgão', v: totalItens(itens, (i) => i.valor_ref_unit) },
    { r: 'Seu custo', v: totalItens(itens, (i) => i.custo_unit) },
    { r: 'Preço-limite total', v: totalItens(itens, (i) => i.preco_limite_unit) },
    { r: 'Lances finais', v: totalItens(itens, (i) => i.lance_final_unit) },
  ]

  if (q.isLoading) return <Carregando />
  return (
    <>
      {itens.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {resumo.map((x) => (
            <Card key={x.r} className="p-4">
              <div className="text-xs text-muted-foreground">{x.r}</div>
              <div className="mt-1 font-semibold tabular-nums">{formatarMoeda(x.v)}</div>
            </Card>
          ))}
        </div>
      )}
      {podeEditar && (
        <div className="mb-3 flex justify-end">
          <Button tamanho="sm" onClick={() => setEditando('novo')}>
            <Plus className="h-4 w-4" /> Adicionar item
          </Button>
        </div>
      )}
      {itens.length === 0 ? (
        <Vazio titulo="Nenhum item cadastrado" texto="Cadastre os itens ou lotes do edital com seu custo e margem: o LicitaFlow calcula o preço-limite de cada lance." />
      ) : (
        <Card className="divide-y">
          {itens.map((i) => {
            const desc = descontoSobreReferencia(i.lance_final_unit, i.valor_ref_unit)
            const margem = margemSobrePreco(i.lance_final_unit, i.custo_unit)
            return (
              <div key={i.id} className="flex flex-col gap-2 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">
                    Item {i.numero_item ?? '—'}
                    {i.lote ? ` · Lote ${i.lote}` : ''} · {Number(i.quantidade).toLocaleString('pt-BR')} {i.unidade}
                    {i.marca_modelo ? ` · ${i.marca_modelo}` : ''}
                  </div>
                  <div className="line-clamp-2 text-sm font-medium">{i.descricao}</div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4 lg:w-[30rem]">
                  <div><div className="text-muted-foreground">Referência</div><div className="tabular-nums">{formatarMoeda(i.valor_ref_unit)}</div></div>
                  <div><div className="text-muted-foreground">Custo</div><div className="tabular-nums">{formatarMoeda(i.custo_unit)}</div></div>
                  <div><div className="text-muted-foreground">Preço-limite</div><div className="font-semibold tabular-nums text-primary">{formatarMoeda(i.preco_limite_unit)}</div></div>
                  <div>
                    <div className="text-muted-foreground">Lance final</div>
                    <div className="tabular-nums">{formatarMoeda(i.lance_final_unit)}</div>
                    {(desc != null || margem != null) && <div className="text-[10px] text-muted-foreground">{desc != null ? `-${desc}% ref.` : ''} {margem != null ? `· margem ${margem}%` : ''}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {i.resultado && <Badge cor={i.resultado === 'ganho' ? 'verde' : i.resultado === 'perdido' ? 'vermelho' : 'neutro'}>{i.resultado}</Badge>}
                  {podeEditar && (
                    <>
                      <button onClick={() => setEditando(i)} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Editar item"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => confirm('Excluir este item?') && excluir.mutate(i.id)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Excluir item"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </Card>
      )}
      <Modal aberto={!!editando} aoFechar={() => setEditando(null)} titulo={editando === 'novo' ? 'Novo item' : 'Editar item'}>
        {editando && <ItemForm processoId={processoId} item={editando === 'novo' ? undefined : editando} aoSalvar={() => setEditando(null)} />}
      </Modal>
    </>
  )
}

function Prazos({ processo, podeEditar }: { processo: Processo; podeEditar: boolean }) {
  const q = useLista<Prazo>('prazos', { porEmpresa: false, chave: ['proc', processo.id], filtro: (x) => x.eq('processo_id', processo.id), ordem: ['data_hora', true] })
  const { salvar, excluir } = useSalvar('prazos')
  const [novo, setNovo] = useState(false)
  if (q.isLoading) return <Carregando />
  return (
    <>
      {podeEditar && (
        <div className="mb-3 flex justify-end">
          <Button tamanho="sm" onClick={() => setNovo(true)}><Plus className="h-4 w-4" /> Novo prazo</Button>
        </div>
      )}
      {(q.data?.length ?? 0) === 0 ? (
        <Vazio titulo="Nenhum prazo" texto="Cadastre sessão, impugnação, esclarecimento, recurso e entrega para receber alertas." />
      ) : (
        <Card className="divide-y">
          {q.data!.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-4">
              <button
                disabled={!podeEditar}
                onClick={() => salvar.mutate({ id: p.id, dados: { concluido: !p.concluido, concluido_em: p.concluido ? null : new Date().toISOString() } })}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${p.concluido ? 'border-success bg-success text-white' : 'border-input'}`}
                aria-label={p.concluido ? 'Reabrir prazo' : 'Concluir prazo'}
              >
                {p.concluido && <Check className="h-3.5 w-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-medium ${p.concluido ? 'text-muted-foreground line-through' : ''}`}>{p.titulo}</div>
                <div className="text-xs text-muted-foreground">{TIPOS_PRAZO[p.tipo]} · {formatarDataHora(p.data_hora)}</div>
              </div>
              <BadgePrazo dataHora={p.data_hora} concluido={p.concluido} />
              {podeEditar && <button onClick={() => confirm('Excluir este prazo?') && excluir.mutate(p.id)} className="rounded p-1.5 text-muted-foreground hover:text-destructive" aria-label="Excluir prazo"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </Card>
      )}
      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo prazo">
        <PrazoForm processoId={processo.id} empresaId={processo.empresa_id} aoSalvar={() => setNovo(false)} />
      </Modal>
    </>
  )
}

function Documentos({ processo, podeEditar }: { processo: Processo; podeEditar: boolean }) {
  const q = useLista<Documento>('documentos', { porEmpresa: false, chave: ['proc', processo.id], filtro: (x) => x.eq('processo_id', processo.id), ordem: ['created_at', false] })
  const [novo, setNovo] = useState(false)
  if (q.isLoading) return <Carregando />
  return (
    <>
      {podeEditar && (
        <div className="mb-3 flex justify-end">
          <Button tamanho="sm" onClick={() => setNovo(true)}><Plus className="h-4 w-4" /> Anexar documento</Button>
        </div>
      )}
      {(q.data?.length ?? 0) === 0 ? (
        <Vazio titulo="Nenhum documento anexado" texto="Anexe o edital, anexos, proposta e documentos específicos deste processo. Certidões gerais da empresa ficam em Documentos." />
      ) : (
        <Card className="divide-y">
          {q.data!.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-4">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.nome}</div>
                <div className="text-xs text-muted-foreground">{CATEGORIAS_DOC[d.categoria]}{d.validade ? ` · validade ${formatarData(d.validade)}` : ''}</div>
              </div>
              {d.validade && <BadgeValidade validade={d.validade} />}
              {d.storage_path && <Button tamanho="sm" variante="contorno" onClick={() => abrirArquivo(d.storage_path!)}>Abrir</Button>}
            </div>
          ))}
        </Card>
      )}
      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Anexar documento">
        <DocumentoForm processoId={processo.id} categoriaInicial="edital" aoSalvar={() => setNovo(false)} />
      </Modal>
    </>
  )
}

function Historico({ processoId, podeEditar }: { processoId: string; podeEditar: boolean }) {
  const q = useLista<ProcessoEvento>('processo_eventos', { porEmpresa: false, chave: [processoId], filtro: (x) => x.eq('processo_id', processoId), ordem: ['created_at', false] })
  const { salvar } = useSalvar('processo_eventos')
  const [nota, setNota] = useState('')

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    if (!nota.trim()) return
    await salvar.mutateAsync({ dados: { processo_id: processoId, tipo: 'nota', titulo: 'Anotação', descricao: nota.trim() } })
    setNota('')
  }

  return (
    <>
      {podeEditar && (
        <form onSubmit={adicionar} className="mb-4 flex gap-2">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escreva uma anotação (ex.: pregoeiro pediu amostra até sexta)" />
          <Button type="submit" carregando={salvar.isPending}><MessageSquarePlus className="h-4 w-4" /> Anotar</Button>
        </form>
      )}
      {q.isLoading ? (
        <Carregando />
      ) : (q.data?.length ?? 0) === 0 ? (
        <Vazio titulo="Sem histórico ainda" texto="Mudanças de etapa e anotações da equipe aparecem aqui." />
      ) : (
        <ol className="relative space-y-4 border-l pl-6">
          {q.data!.map((ev) => (
            <li key={ev.id} className="relative">
              <span className={`absolute -left-[1.85rem] top-1 h-3 w-3 rounded-full border-2 border-background ${ev.tipo === 'etapa' ? 'bg-primary' : ev.tipo === 'sentinela' ? ((ev.dados as { nivel?: string })?.nivel === 'alto' ? 'bg-red-500' : 'bg-amber-500') : 'bg-muted-foreground'}`} />
              <div className="text-xs text-muted-foreground">{formatarDataHora(ev.created_at)}</div>
              <div className="text-sm font-medium">
                {ev.tipo === 'etapa'
                  ? `Etapa: ${ETAPAS[(ev.dados as { de: Etapa }).de] ?? '—'} → ${ETAPAS[(ev.dados as { para: Etapa }).para] ?? '—'}`
                  : ev.titulo}
              </div>
              {ev.descricao && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{ev.descricao}</p>}
              {ev.tipo === 'sentinela' && typeof (ev.dados as { url?: unknown })?.url === 'string' && /^https:\/\/pncp\.gov\.br\//.test((ev.dados as { url: string }).url) && (
                <a href={(ev.dados as { url: string }).url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline">Abrir documento <ExternalLink className="h-3 w-3" /></a>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

export default function ProcessoDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { podeEditar } = useOrg()
  const { estado: estadoModulo } = useModulos()
  const nomeEmpresa = useNomeEmpresa()
  const q = useRegistro<Processo>('processos', id)
  const { salvar, excluir } = useSalvar('processos', ['processo_eventos'])
  const [aba, setAba] = useState<Aba>('resumo')
  const [editando, setEditando] = useState(false)

  if (q.isLoading) return <Carregando />
  const p = q.data
  if (!p) return <NaoEncontrada embutida />

  const mudarEtapa = async (etapa: Etapa) => {
    await salvar.mutateAsync({ id: p.id, dados: { etapa } })
    toast.success(`Etapa: ${ETAPAS[etapa]}`)
  }

  const campos: [string, string | null][] = [
    ['Modalidade', MODALIDADES[p.modalidade]],
    ['Número', p.numero],
    ['Órgão', p.orgao_nome],
    ['UASG', p.uasg],
    ['Local', [p.municipio, p.uf].filter(Boolean).join('/') || null],
    ['Portal', rotuloPortal(p.portal)],
    ['Sessão / abertura', p.data_abertura ? formatarDataHora(p.data_abertura) : null],
    ['Valor estimado', p.valor_estimado != null ? formatarMoeda(p.valor_estimado) : null],
    ['Empresa', nomeEmpresa(p.empresa_id)],
    ['Cadastrado em', formatarData(p.created_at)],
  ]

  return (
    <>
      <Link to="/app/processos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Processos
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <BadgeEtapa etapa={p.etapa} />
            <span>{MODALIDADES[p.modalidade]}{p.numero ? ` · ${p.numero}` : ''}</span>
            {p.prioridade === 'alta' && <Badge cor="vermelho">Prioridade alta</Badge>}
          </div>
          <h1 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">{p.objeto}</h1>
          {p.orgao_nome && <p className="mt-1 text-sm text-muted-foreground">{p.orgao_nome}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {podeEditar && (
            <Select value={p.etapa} onChange={(e) => mudarEtapa(e.target.value as Etapa)} className="h-9 w-44" aria-label="Mudar etapa">
              {Object.entries(ETAPAS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          )}
          {p.link_edital && (
            <a href={p.link_edital} target="_blank" rel="noopener noreferrer">
              <Button variante="contorno" tamanho="sm" className="h-9"><ExternalLink className="h-4 w-4" /> Edital</Button>
            </a>
          )}
          {p.pncp_controle && estadoModulo('/app/agentes') === 'liberado' && (
            <Link to={rotaLeitor(p.pncp_controle)}><Button variante="contorno" tamanho="sm" className="h-9"><FileSearch className="h-4 w-4" /> Ler com IA</Button></Link>
          )}
          {podeEditar && <Button variante="contorno" tamanho="sm" className="h-9" onClick={() => setEditando(true)}><Pencil className="h-4 w-4" /> Editar</Button>}
        </div>
      </div>

      {(() => {
        // Edital vindo do PNCP: arquivos (edital, TR, ETP, anexos) abertos aqui dentro.
        const m = /^(\d{14})-1-0*(\d+)\/(\d{4})$/.exec(p.pncp_controle ?? '')
        return m && <ArquivosEdital cnpj={m[1]} ano={m[3]} seq={m[2]} linkFonte={p.link_edital ?? undefined} />
      })()}

      {p.etapa === 'homologado' && (
        <Card className="mb-6 flex flex-col gap-3 border-success/30 bg-success/5 p-4 sm:flex-row sm:items-center">
          <FileSignature className="h-5 w-5 text-success" />
          <div className="flex-1 text-sm"><strong>Processo ganho!</strong> Cadastre o contrato ou a ata para controlar empenhos, entregas e faturamento.</div>
          <Link to={`/app/contratos?processo=${p.id}`}><Button tamanho="sm">Cadastrar contrato</Button></Link>
        </Card>
      )}

      <Abas<Aba>
        atual={aba}
        aoTrocar={setAba}
        abas={[
          { id: 'resumo', rotulo: 'Resumo' },
          { id: 'itens', rotulo: 'Itens e preços' },
          { id: 'prazos', rotulo: 'Prazos' },
          { id: 'documentos', rotulo: 'Documentos' },
          { id: 'historico', rotulo: 'Histórico' },
        ]}
      />

      {aba === 'resumo' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <dl className="grid gap-4 sm:grid-cols-2">
              {campos.map(([r, v]) => (
                <div key={r}>
                  <dt className="text-xs text-muted-foreground">{r}</dt>
                  <dd className="mt-0.5 text-sm">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            {p.observacoes && (
              <div className="mt-6 border-t pt-4">
                <div className="text-xs text-muted-foreground">Observações</div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{p.observacoes}</p>
              </div>
            )}
          </Card>
          <Card className="p-6">
            <h2 className="font-semibold">Próximos passos</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>1. Cadastre os <button className="text-primary hover:underline" onClick={() => setAba('itens')}>itens com custo e margem</button> para saber seu preço-limite.</li>
              <li>2. Lance os <button className="text-primary hover:underline" onClick={() => setAba('prazos')}>prazos</button> (sessão, impugnação, recurso).</li>
              <li>3. Anexe o <button className="text-primary hover:underline" onClick={() => setAba('documentos')}>edital e documentos</button>.</li>
              <li>4. Mova a etapa conforme a disputa avança.</li>
            </ul>
            {podeEditar && (
              <Button
                variante="fantasma"
                tamanho="sm"
                className="mt-6 text-destructive hover:bg-destructive/10"
                onClick={async () => {
                  if (!confirm('Excluir este processo? Itens, prazos, documentos anexados e histórico serão apagados. Esta ação não pode ser desfeita.')) return
                  await excluir.mutateAsync(p.id)
                  toast.success('Processo excluído.')
                  navigate('/app/processos')
                }}
              >
                <Trash2 className="h-4 w-4" /> Excluir processo
              </Button>
            )}
          </Card>
        </div>
      )}
      {aba === 'itens' && <Itens processoId={p.id} podeEditar={podeEditar} />}
      {aba === 'prazos' && <Prazos processo={p} podeEditar={podeEditar} />}
      {aba === 'documentos' && <Documentos processo={p} podeEditar={podeEditar} />}
      {aba === 'historico' && <Historico processoId={p.id} podeEditar={podeEditar} />}

      <Modal aberto={editando} aoFechar={() => setEditando(false)} titulo="Editar processo">
        <ProcessoForm processo={p} aoSalvar={() => setEditando(false)} />
      </Modal>
    </>
  )
}
