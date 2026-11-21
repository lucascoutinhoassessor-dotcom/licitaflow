import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarPlus, Check, Copy, Download, RotateCcw, Scale } from 'lucide-react'
import { Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Input, Select, Textarea } from '@/components/ui'
import { useLista, useSalvar } from '@/hooks/useDados'
import { useOrg } from '@/providers/OrgProvider'
import { MODALIDADES } from '@/lib/dominio'
import { DADOS_VAZIOS, PECAS, htmlParaWord, montarPeca, pecaPorId, pedidosPadrao, prazoDaPeca, type DadosPeca, type TipoPeca } from '@/lib/juridico'
import { cn } from '@/lib/utils'
import type { Processo } from '@/types/db'

const hoje = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dataPorExtenso = () => new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })

const CHAVE_ASSINANTE = 'lf-juridico-assinante'
function lerAssinante(): { representante: string; cargo: string } | null {
  try { return JSON.parse(localStorage.getItem(CHAVE_ASSINANTE) ?? 'null') } catch { return null }
}
function guardarAssinante(representante: string, cargo: string) {
  try { localStorage.setItem(CHAVE_ASSINANTE, JSON.stringify({ representante, cargo })) } catch { /* armazenamento indisponível */ }
}

/** Rótulos dos campos que mudam conforme a peça. */
const ROTULOS: Record<TipoPeca, { itens?: string; concorrente?: string; ato?: string; fatos: string; argumentos: string }> = {
  impugnacao: { itens: 'Cláusulas ou itens impugnados', fatos: 'O que o edital exige e por que prejudica', argumentos: 'Fundamentos próprios (opcional)' },
  esclarecimento: { fatos: 'Contexto (opcional)', argumentos: '' },
  'intencao-recurso': { itens: 'Item, lote ou grupo', concorrente: 'Empresa concorrente (opcional)', ato: 'Decisão contestada', fatos: '', argumentos: 'Motivo resumido' },
  recurso: { itens: 'Item, lote ou grupo', concorrente: 'Empresa recorrida (opcional)', ato: 'Decisão recorrida', fatos: 'O que aconteceu na sessão', argumentos: 'Razões próprias (opcional)' },
  contrarrazoes: { itens: 'Item, lote ou grupo', concorrente: 'Empresa recorrente', fatos: 'O que a recorrente alega', argumentos: 'Argumentos próprios (opcional)' },
}

const ATOS_SUGERIDOS: Partial<Record<TipoPeca, string[]>> = {
  'intencao-recurso': ['a desclassificação da nossa proposta', 'a nossa inabilitação', 'a aceitação da proposta da concorrente', 'a habilitação da concorrente'],
  recurso: ['a decisão que desclassificou a proposta da recorrente', 'a decisão que inabilitou a recorrente', 'a decisão que aceitou a proposta da empresa declarada vencedora', 'a decisão que habilitou a empresa declarada vencedora'],
}

export default function Juridico() {
  const { tipo } = useParams()
  const def = pecaPorId(tipo)
  if (!def) return <Navigate to="/app/juridico/impugnacao" replace />
  return <Editor key={def.id} tipo={def.id} />
}

function Editor({ tipo }: { tipo: TipoPeca }) {
  const def = pecaPorId(tipo)!
  const navigate = useNavigate()
  const { empresa: empresaAtual, empresas, podeEditar } = useOrg()
  const processos = useLista<Processo>('processos', { ordem: ['updated_at', false] })
  const { salvar } = useSalvar('prazos', ['processo_eventos'])

  const assinante = useMemo(lerAssinante, [])
  const [processoId, setProcessoId] = useState('')
  const [empresaId, setEmpresaId] = useState(empresaAtual?.id ?? empresas[0]?.id ?? '')
  const [d, setD] = useState<DadosPeca>(() => ({
    ...DADOS_VAZIOS,
    representante: assinante?.representante ?? '',
    cargo: assinante?.cargo || DADOS_VAZIOS.cargo,
    data: dataPorExtenso(),
  }))
  const [base, setBase] = useState(def.baseData === 'abertura' ? '' : hoje())
  const [texto, setTexto] = useState('')
  const [editado, setEditado] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [agendado, setAgendado] = useState(false)

  useEffect(() => { if (!empresaId && empresas[0]) setEmpresaId(empresaAtual?.id ?? empresas[0].id) }, [empresas, empresaAtual, empresaId])

  const empresa = empresas.find((e) => e.id === empresaId) ?? null
  const dados: DadosPeca = useMemo(() => ({
    ...d,
    empresa: empresa ? { razao_social: empresa.razao_social, cnpj: empresa.cnpj, endereco: empresa.endereco, municipio: empresa.municipio, uf: empresa.uf } : null,
    cidade: d.cidade || (empresa?.municipio ? `${empresa.municipio}${empresa.uf ? `/${empresa.uf}` : ''}` : ''),
  }), [d, empresa])
  const gerado = useMemo(() => montarPeca(tipo, dados), [tipo, dados])
  useEffect(() => { if (!editado) setTexto(gerado) }, [gerado, editado])

  const prazo = prazoDaPeca(tipo, base)
  const vencido = prazo && def.baseData !== 'sessao' ? prazo < new Date(new Date().toDateString()) : false
  const set = <K extends keyof DadosPeca>(k: K) => (v: DadosPeca[K]) => { setD((x) => ({ ...x, [k]: v })); setAgendado(false) }
  const r = ROTULOS[tipo]

  function escolherProcesso(id: string) {
    setProcessoId(id)
    setAgendado(false)
    const p = processos.data?.find((x) => x.id === id)
    if (!p) return
    setEmpresaId(p.empresa_id)
    setD((x) => ({
      ...x,
      orgao: p.orgao_nome ?? x.orgao,
      numero: p.numero ?? x.numero,
      modalidade: MODALIDADES[p.modalidade] ?? x.modalidade,
      objeto: p.objeto ?? x.objeto,
    }))
    if (def.baseData === 'abertura' && p.data_abertura) setBase(p.data_abertura.slice(0, 10))
  }

  function alternarTese(id: string) {
    set('teses')(d.teses.includes(id) ? d.teses.filter((t) => t !== id) : [...d.teses, id])
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }

  function baixar() {
    guardarAssinante(d.representante, d.cargo)
    const nome = `${def.titulo}${d.numero ? ` ${d.numero}` : ''}`.replace(/[\\/:*?"<>|]+/g, '-')
    const blob = new Blob(['﻿', htmlParaWord(texto, nome)], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${nome}.doc`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function lancarPrazo() {
    if (!prazo) return
    const limite = new Date(prazo.getFullYear(), prazo.getMonth(), prazo.getDate(), 18, 0)
    await salvar.mutateAsync({
      dados: {
        tipo: def.tipoPrazo,
        titulo: `${def.titulo}${d.numero ? ` · ${d.numero}` : d.objeto ? ` · ${d.objeto.slice(0, 60)}` : ''}`,
        data_hora: limite.toISOString(),
        processo_id: processoId || null,
        empresa_id: empresaId || null,
        concluido: false,
      },
    })
    setAgendado(true)
    toast.success('Prazo lançado na agenda.')
  }

  const limiteIntencao = 1000

  return (
    <>
      <CabecalhoPagina
        titulo="Jurídico"
        descricao="Monte a peça com os dados do processo, revise o texto e baixe em Word para protocolar no portal."
      />

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Tipo de peça">
        {PECAS.map((p) => (
          <Link key={p.id} to={`/app/juridico/${p.id}`} role="tab" aria-selected={p.id === tipo}
            className={cn('flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors',
              p.id === tipo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
            {p.rotulo}
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-w-0 space-y-5">
          <Card className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10"><Scale className="h-5 w-5 text-primary" /></div>
              <div className="min-w-0">
                <h2 className="font-semibold">{def.titulo}</h2>
                <p className="text-sm text-muted-foreground">{def.descricao}</p>
                <p className="mt-1 text-xs text-muted-foreground">{def.fundamento}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo rotulo="Processo" htmlFor="j-processo" ajuda="Preenche órgão, número, objeto e empresa.">
                  <Select id="j-processo" value={processoId} onChange={(e) => escolherProcesso(e.target.value)}>
                    <option value="">Sem processo (preencher à mão)</option>
                    {(processos.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{[p.numero, p.orgao_nome, p.objeto].filter(Boolean).join(' · ').slice(0, 110)}</option>
                    ))}
                  </Select>
                </Campo>
              </div>
              <Campo rotulo={def.rotuloBaseData} htmlFor="j-base">
                <Input id="j-base" type="date" value={base} onChange={(e) => { setBase(e.target.value); setAgendado(false) }} />
              </Campo>
              <div className="min-w-0 space-y-1.5">
                <span className="text-sm font-medium">Prazo para protocolar</span>
                <div className={cn('flex h-10 items-center rounded-xl border px-3 text-sm font-semibold tabular-nums',
                  !prazo ? 'text-muted-foreground' : vencido ? 'border-destructive/50 text-destructive' : 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300')}>
                  {tipo === 'intencao-recurso' ? 'Na sessão, logo após a decisão' : prazo ? prazo.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Informe a data'}
                </div>
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {def.regraPrazo} Considera fins de semana e feriados nacionais; confira feriados locais e o horário fixado no edital.
              </p>
              {prazo && tipo !== 'intencao-recurso' && podeEditar && (
                <div className="sm:col-span-2">
                  <Button variante="contorno" tamanho="sm" onClick={lancarPrazo} carregando={salvar.isPending} disabled={agendado}>
                    {agendado ? <><Check className="h-4 w-4" /> Lançado na agenda</> : <><CalendarPlus className="h-4 w-4" /> Lançar prazo na agenda</>}
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card className="space-y-3 p-4 sm:p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Partes e licitação</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo rotulo="Empresa" htmlFor="j-empresa">
                  <Select id="j-empresa" value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
                    {empresas.length === 0 && <option value="">Cadastre uma empresa em Minhas empresas</option>}
                    {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</option>)}
                  </Select>
                </Campo>
              </div>
              <Campo rotulo="Representante" htmlFor="j-rep"><Input id="j-rep" value={d.representante} onChange={(e) => set('representante')(e.target.value)} placeholder="Nome de quem assina" /></Campo>
              <Campo rotulo="Cargo" htmlFor="j-cargo"><Input id="j-cargo" value={d.cargo} onChange={(e) => set('cargo')(e.target.value)} /></Campo>
              {tipo !== 'intencao-recurso' && <>
                <div className="sm:col-span-2">
                  <Campo rotulo="Destinatário" htmlFor="j-dest"><Input id="j-dest" value={d.destinatario} onChange={(e) => set('destinatario')(e.target.value)} placeholder="Agente de Contratação / Pregoeiro(a)" /></Campo>
                </div>
                <div className="sm:col-span-2">
                  <Campo rotulo="Órgão" htmlFor="j-orgao"><Input id="j-orgao" value={d.orgao} onChange={(e) => set('orgao')(e.target.value)} /></Campo>
                </div>
                <Campo rotulo="Modalidade" htmlFor="j-mod"><Input id="j-mod" value={d.modalidade} onChange={(e) => set('modalidade')(e.target.value)} placeholder="Pregão eletrônico" /></Campo>
                <Campo rotulo="Número" htmlFor="j-num"><Input id="j-num" value={d.numero} onChange={(e) => set('numero')(e.target.value)} placeholder="90012/2026" /></Campo>
                <div className="sm:col-span-2">
                  <Campo rotulo="Objeto" htmlFor="j-obj"><Textarea id="j-obj" rows={2} value={d.objeto} onChange={(e) => set('objeto')(e.target.value)} /></Campo>
                </div>
                <Campo rotulo="Cidade" htmlFor="j-cid"><Input id="j-cid" value={d.cidade} onChange={(e) => set('cidade')(e.target.value)} placeholder={dados.cidade || 'Cidade/UF'} /></Campo>
                <Campo rotulo="Data" htmlFor="j-data"><Input id="j-data" value={d.data} onChange={(e) => set('data')(e.target.value)} /></Campo>
              </>}
            </div>
          </Card>

          <Card className="space-y-3 p-4 sm:p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conteúdo</h3>
            {r.ato && (
              <Campo rotulo={r.ato} htmlFor="j-ato">
                <Input id="j-ato" value={d.atoRecorrido} onChange={(e) => set('atoRecorrido')(e.target.value)} placeholder="a decisão que…" />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(ATOS_SUGERIDOS[tipo] ?? []).map((a) => (
                    <button key={a} type="button" onClick={() => set('atoRecorrido')(a)} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground">{a}</button>
                  ))}
                </div>
              </Campo>
            )}
            {(r.itens || r.concorrente) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {r.itens && (
                  <div className={cn(tipo === 'impugnacao' && 'sm:col-span-2')}>
                    <Campo rotulo={r.itens} htmlFor="j-itens">
                      {tipo === 'impugnacao'
                        ? <Textarea id="j-itens" rows={3} value={d.itens} onChange={(e) => set('itens')(e.target.value)} placeholder="Ex.: item 9.11.2 do edital (atestado de 100% do quantitativo)" />
                        : <Input id="j-itens" value={d.itens} onChange={(e) => set('itens')(e.target.value)} placeholder="Item 3" />}
                    </Campo>
                  </div>
                )}
                {r.concorrente && <Campo rotulo={r.concorrente} htmlFor="j-conc"><Input id="j-conc" value={d.concorrente} onChange={(e) => set('concorrente')(e.target.value)} placeholder="Razão social" /></Campo>}
              </div>
            )}
            {tipo === 'esclarecimento' && (
              <Campo rotulo="Perguntas (uma por linha)" htmlFor="j-perg">
                <Textarea id="j-perg" rows={6} value={d.perguntas} onChange={(e) => set('perguntas')(e.target.value)} placeholder={'O item 4 aceita produto equivalente de outra marca?\nO prazo de entrega conta da assinatura do contrato ou da nota de empenho?'} />
              </Campo>
            )}
            {r.fatos && (
              <Campo rotulo={r.fatos} htmlFor="j-fatos"><Textarea id="j-fatos" rows={5} value={d.fatos} onChange={(e) => set('fatos')(e.target.value)} /></Campo>
            )}
            {def.teses.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Teses prontas</span>
                <p className="text-xs text-muted-foreground">Marque as que se aplicam; o texto entra nos fundamentos com o artigo da lei.</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {def.teses.map((t) => {
                    const ativa = d.teses.includes(t.id)
                    return (
                      <button key={t.id} type="button" aria-pressed={ativa} onClick={() => alternarTese(t.id)} title={t.texto}
                        className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                          ativa ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-card text-muted-foreground hover:text-foreground')}>
                        {ativa && <Check className="-ml-0.5 mr-1 inline h-3 w-3" />}{t.rotulo}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {r.argumentos && (
              <Campo rotulo={r.argumentos} htmlFor="j-arg" ajuda={tipo === 'intencao-recurso' ? 'Seja objetivo: indique o motivo concreto. O recurso só poderá tratar do que constar aqui.' : undefined}>
                <Textarea id="j-arg" rows={tipo === 'intencao-recurso' ? 3 : 5} value={d.argumentos} onChange={(e) => set('argumentos')(e.target.value)} />
              </Campo>
            )}
            {['impugnacao', 'recurso', 'contrarrazoes'].includes(tipo) && (
              <Campo rotulo="Pedidos" htmlFor="j-ped" ajuda="Em branco, usa os pedidos padrão desta peça.">
                <Textarea id="j-ped" rows={4} value={d.pedidos} onChange={(e) => set('pedidos')(e.target.value)} placeholder={pedidosPadrao(tipo)} />
              </Campo>
            )}
          </Card>
        </div>

        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-semibold">Minuta</h2>
              {editado && <Badge cor="amarelo">editada à mão</Badge>}
              {tipo === 'intencao-recurso' && <Badge cor={texto.length > limiteIntencao ? 'vermelho' : 'neutro'}>{texto.length} caracteres</Badge>}
            </div>
            <Textarea
              aria-label="Texto da peça"
              value={texto}
              onChange={(e) => { setTexto(e.target.value); setEditado(true) }}
              rows={tipo === 'intencao-recurso' ? 8 : 28}
              className="font-serif text-[13px] leading-relaxed"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={copiar}>{copiado ? <><Check className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar texto</>}</Button>
              {tipo !== 'intencao-recurso' && <Button variante="secundario" onClick={baixar}><Download className="h-4 w-4" /> Baixar Word</Button>}
              {editado && <Button variante="fantasma" onClick={() => { setEditado(false); setTexto(gerado) }}><RotateCcw className="h-4 w-4" /> Refazer pelo formulário</Button>}
            </div>
            {tipo === 'intencao-recurso' && texto.length > limiteIntencao && (
              <div className="mt-3"><Aviso tipo="info">Alguns portais limitam o campo da intenção de recurso. Encurte o motivo se o sistema não aceitar.</Aviso></div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Minuta de apoio com base na Lei nº 14.133/2021. Os trechos [entre colchetes] precisam ser preenchidos. Revise com o seu jurídico antes de protocolar.
            </p>
          </Card>
          {tipo === 'intencao-recurso' && (
            <Card className="mt-4 p-4 text-sm text-muted-foreground">
              Depois de registrar a intenção, as razões vão no{' '}
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => navigate('/app/juridico/recurso')}>Recurso</button>, em até 3 dias úteis.
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
