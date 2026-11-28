import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Sparkles } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { previaMensagensIA, type PreviaMensagemIA } from '@/lib/push'
import { Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Select, Textarea } from '@/components/ui'

interface Config { ativo: boolean; dias: number[]; horarios: number[]; oportunidades: boolean; prazos: boolean; documentos: boolean; dicas: boolean; reserva: boolean }
interface Excecao { org_id: string; fora: boolean; horarios: number[] | null }
interface Org { id: string; nome: string }
interface Envio { id: string; org_id: string | null; titulo: string; texto: string; canal: string; status: string; chaves: string[]; created_at: string }
interface Mensagem { titulo: string; texto: string; link: string }

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const HORAS = Array.from({ length: 15 }, (_, i) => i + 7)
const ASSUNTOS: { campo: keyof Config; rotulo: string; texto: string }[] = [
  { campo: 'oportunidades', rotulo: 'Oportunidades novas', texto: 'Sugestões do Radar que surgiram desde a última mensagem, com o destaque de maior pontuação.' },
  { campo: 'prazos', rotulo: 'Disputas e prazos do dia', texto: 'Sessões dos processos e prazos em aberto de hoje.' },
  { campo: 'documentos', rotulo: 'Documentos vencendo', texto: 'Certidões que vencem em até 15 dias ou venceram no último mês (uma vez por dia).' },
  { campo: 'dicas', rotulo: 'Dicas e engajamento', texto: 'Só quando não há novidade e o cliente ainda não recebeu nada no dia, conforme o que ele não configurou.' },
]
const STATUS: Record<string, [string, 'verde' | 'vermelho' | 'amarelo' | 'neutro' | 'azul']> = {
  pendente: ['Na fila', 'azul'], enviado: ['Enviado', 'verde'], parcial: ['Parcial', 'amarelo'], falhou: ['Falhou', 'vermelho'], sem_contato: ['Só no sino', 'neutro'],
}
const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v])
const horasTexto = (h: number[] | null | undefined) => (h ?? []).slice().sort((a, b) => a - b).map((x) => `${x}h`).join(', ')
function lerHoras(t: string): number[] | null | undefined {
  const s = t.trim(); if (!s) return null
  const v = [...new Set(s.split(/[\s,;]+/).map((x) => Number(x.replace(/h$/i, ''))))]
  return v.every((x) => Number.isInteger(x) && x >= 7 && x <= 21) && v.length <= 8 ? v.sort((a, b) => a - b) : undefined
}

/** Escolha de clientes com busca: null = todos. */
function EscolherClientes({ orgs, valor, aoMudar }: { orgs: Org[]; valor: string[] | null; aoMudar: (v: string[] | null) => void }) {
  const [busca, setBusca] = useState('')
  const lista = orgs.filter((o) => o.nome.toLowerCase().includes(busca.trim().toLowerCase()))
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">Clientes</legend>
      <label className="flex items-center gap-2 text-sm"><input type="radio" checked={valor === null} onChange={() => aoMudar(null)} />Todos os clientes ativos (até 40 por vez)</label>
      <label className="flex items-center gap-2 text-sm"><input type="radio" checked={valor !== null} onChange={() => aoMudar([])} />Escolher clientes</label>
      {valor !== null && <div className="space-y-2 rounded-lg border p-3">
        <Input placeholder="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {lista.map((o) => <label key={o.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={valor.includes(o.id)} onChange={() => aoMudar(alternar(valor, o.id))} />{o.nome}</label>)}
          {!lista.length && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
        </div>
        <p className="text-xs text-muted-foreground">{valor.length} {valor.length === 1 ? 'cliente escolhido' : 'clientes escolhidos'}</p>
      </div>}
    </fieldset>
  )
}

export default function MensagensIA() {
  const qc = useQueryClient()
  const cfgQ = useQuery({ queryKey: ['mensagens-ia-config'], queryFn: async () => {
    const { data, error } = await supabase.from('mensagens_ia_config').select('ativo,dias,horarios,oportunidades,prazos,documentos,dicas,reserva').eq('id', true).single()
    if (error) throw error; return data as Config
  } })
  const orgsQ = useQuery({ queryKey: ['admin-orgs'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_organizacoes'); if (error) throw error
    return ((data ?? []) as Org[]).map((o) => ({ id: o.id, nome: o.nome })).sort((a, b) => a.nome.localeCompare(b.nome))
  } })
  const excQ = useQuery({ queryKey: ['mensagens-ia-clientes'], queryFn: async () => {
    const { data, error } = await supabase.from('mensagens_ia_clientes').select('org_id,fora,horarios'); if (error) throw error; return data as Excecao[]
  } })
  const histQ = useQuery({ queryKey: ['mensagens-ia-historico'], queryFn: async () => {
    const { data, error } = await supabase.from('notificacoes_envios').select('id,org_id,titulo,texto,canal,status,chaves,created_at')
      .eq('origem', 'ia').order('created_at', { ascending: false }).limit(60)
    if (error) throw error; return data as Envio[]
  } })
  const orgs = orgsQ.data ?? []
  const nomeOrg = (id: string | null) => orgs.find((o) => o.id === id)?.nome ?? 'Cliente'

  // ---------- rotina automática ----------
  const [cfg, setCfg] = useState<Config | null>(null)
  useEffect(() => { if (cfgQ.data) setCfg(cfgQ.data) }, [cfgQ.data])
  const [salvando, setSalvando] = useState(false)
  async function salvarCfg() {
    if (!cfg) return
    if (!cfg.dias.length || !cfg.horarios.length) { toast.error('Escolha pelo menos um dia e um horário.'); return }
    if (cfg.horarios.length > 8) { toast.error('No máximo 8 horários por dia.'); return }
    setSalvando(true)
    try {
      const { error } = await supabase.from('mensagens_ia_config').update({ ...cfg, dias: [...cfg.dias].sort(), horarios: [...cfg.horarios].sort((a, b) => a - b) }).eq('id', true)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['mensagens-ia-config'] })
      toast.success(cfg.ativo ? 'Rotina salva. As mensagens saem nos horários escolhidos.' : 'Configuração salva. A rotina está desligada.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setSalvando(false) }
  }
  const [rodando, setRodando] = useState(false)
  async function rodarAgora() {
    if (!confirm('Rodar a rotina agora? Recebem os clientes cujo horário inclui a hora atual e que têm alguma novidade.')) return
    setRodando(true)
    try {
      const { data, error } = await supabase.rpc('admin_mensagens_ia_executar'); if (error) throw error
      await qc.invalidateQueries({ queryKey: ['mensagens-ia-historico'] })
      toast.success(data ? `${data} ${data === 1 ? 'cliente recebeu' : 'clientes receberam'} mensagem. O push sai em até 5 minutos.` : 'Nenhum cliente com novidade neste horário (ou a rotina está desligada, ou hoje/agora não está nos dias e horários).')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setRodando(false) }
  }

  // ---------- prévia automática ----------
  const [orgPrevia, setOrgPrevia] = useState('')
  const previaQ = useQuery({ queryKey: ['mensagens-ia-previa', orgPrevia], enabled: !!orgPrevia, queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_mensagens_ia_previa', { p_org: orgPrevia }); if (error) throw error
    return data as { mensagem: Mensagem | null }
  } })

  // ---------- pedir à IA / avulsa ----------
  const [instrucao, setInstrucao] = useState('')
  const [destIA, setDestIA] = useState<string[] | null>(null)
  const [gerando, setGerando] = useState(false)
  const [rascunhos, setRascunhos] = useState<(PreviaMensagemIA & { incluir: boolean })[]>([])
  const [semIA, setSemIA] = useState<string | null>(null)
  async function gerar() {
    if (instrucao.trim().length < 5) { toast.error('Escreva o que a IA deve dizer.'); return }
    if (destIA && !destIA.length) { toast.error('Escolha pelo menos um cliente.'); return }
    setGerando(true); setSemIA(null)
    try {
      const r = await previaMensagensIA(instrucao.trim(), destIA)
      setRascunhos(r.itens.map((x) => ({ ...x, incluir: x.enviar })))
      const n = r.itens.filter((x) => x.enviar).length
      toast.success(`${n} ${n === 1 ? 'mensagem redigida' : 'mensagens redigidas'}; ${r.itens.length - n} sem aplicação. Custo da IA: US$ ${r.custo_usd.toFixed(4)}.`)
    } catch (e) {
      const m = mensagemErro(e)
      if (/chave|ativada/i.test(m)) setSemIA(m); else toast.error(m)
    } finally { setGerando(false) }
  }
  const [avulsa, setAvulsa] = useState({ titulo: '', texto: '' })
  const [destAvulsa, setDestAvulsa] = useState<string[] | null>([])
  const [enviando, setEnviando] = useState(false)
  async function enviar(itens: { org_id: string; titulo: string; texto: string; link?: string }[], depois: () => void) {
    if (!itens.length) { toast.error('Nenhuma mensagem para enviar.'); return }
    if (!confirm(`Enviar ${itens.length} ${itens.length === 1 ? 'mensagem' : 'mensagens'} agora? Vai para o sino, por push e, para quem não tem push, por e-mail/WhatsApp.`)) return
    setEnviando(true)
    try {
      const { data, error } = await supabase.rpc('admin_mensagens_ia_enviar', { p_itens: itens }); if (error) throw error
      await qc.invalidateQueries({ queryKey: ['mensagens-ia-historico'] })
      toast.success(`Enviado. ${data} ${data === 1 ? 'envio entrou' : 'envios entraram'} na fila (sai em até 5 minutos).`)
      depois()
    } catch (e) { toast.error(mensagemErro(e)) } finally { setEnviando(false) }
  }
  function enviarAvulsa() {
    if (avulsa.titulo.trim().length < 3 || avulsa.texto.trim().length < 3) { toast.error('Preencha título e texto.'); return }
    const alvo = destAvulsa ?? orgs.map((o) => o.id)
    if (!alvo.length) { toast.error('Escolha pelo menos um cliente.'); return }
    void enviar(alvo.map((org_id) => ({ org_id, titulo: avulsa.titulo.trim(), texto: avulsa.texto.trim() })), () => setAvulsa({ titulo: '', texto: '' }))
  }

  // ---------- exceções ----------
  const [buscaExc, setBuscaExc] = useState('')
  const [horasEdit, setHorasEdit] = useState<Record<string, string>>({})
  const excPorOrg = useMemo(() => new Map((excQ.data ?? []).map((x) => [x.org_id, x])), [excQ.data])
  async function salvarExcecao(org_id: string, fora: boolean, horarios: number[] | null) {
    try {
      const r = !fora && !horarios
        ? await supabase.from('mensagens_ia_clientes').delete().eq('org_id', org_id)
        : await supabase.from('mensagens_ia_clientes').upsert({ org_id, fora, horarios })
      if (r.error) throw r.error
      await qc.invalidateQueries({ queryKey: ['mensagens-ia-clientes'] })
      toast.success('Exceção salva.')
    } catch (e) { toast.error(mensagemErro(e)) }
  }

  if (cfgQ.isLoading) return <Carregando />
  return (
    <>
      <CabecalhoPagina titulo="Mensagens da IA" descricao="Durante o dia, cada cliente recebe no sino e por push o que mudou na análise dele: oportunidades novas, disputas e prazos do dia, documentos vencendo e dicas. Você escolhe dias, horários e assuntos, tira clientes da rotina e manda mensagens avulsas." />
      {cfgQ.isError && <Aviso>Não foi possível carregar a configuração. A migração das mensagens da IA foi aplicada no banco?</Aviso>}

      {cfg && <Card className="mb-6 space-y-5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-semibold">Rotina automática</h2>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={cfg.ativo} onChange={(e) => setCfg({ ...cfg, ativo: e.target.checked })} />Ligada</label>
        </div>
        <fieldset><legend className="mb-2 text-sm font-medium">Dias</legend>
          <div className="flex flex-wrap gap-2">{DIAS.map((d, i) => <button key={d} type="button" onClick={() => setCfg({ ...cfg, dias: alternar(cfg.dias, i) })}
            className={`h-9 min-w-12 rounded-lg border px-3 text-sm font-medium ${cfg.dias.includes(i) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'}`} aria-pressed={cfg.dias.includes(i)}>{d}</button>)}</div>
        </fieldset>
        <fieldset><legend className="mb-2 text-sm font-medium">Horários (Brasília, até 8 por dia)</legend>
          <div className="flex flex-wrap gap-2">{HORAS.map((h) => <button key={h} type="button" onClick={() => setCfg({ ...cfg, horarios: alternar(cfg.horarios, h) })}
            className={`h-9 min-w-12 rounded-lg border px-3 text-sm font-medium ${cfg.horarios.includes(h) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground'}`} aria-pressed={cfg.horarios.includes(h)}>{h}h</button>)}</div>
          <p className="mt-2 text-xs text-muted-foreground">Em cada horário, só recebe quem tem novidade. Nada se repete no mesmo dia.</p>
        </fieldset>
        <fieldset className="space-y-2"><legend className="mb-1 text-sm font-medium">Assuntos</legend>
          {ASSUNTOS.map((a) => <label key={a.campo} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={!!cfg[a.campo]} onChange={(e) => setCfg({ ...cfg, [a.campo]: e.target.checked })} />
            <span><span className="font-medium">{a.rotulo}</span><span className="block text-xs text-muted-foreground">{a.texto}</span></span></label>)}
        </fieldset>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5" checked={cfg.reserva} onChange={(e) => setCfg({ ...cfg, reserva: e.target.checked })} />
          <span><span className="font-medium">E-mail ou WhatsApp para quem não tem push</span><span className="block text-xs text-muted-foreground">Desligado, quem não ativou as notificações vê as mensagens só no sino. Ligado, recebe pelo canal de reserva de <Link to="/master/notificacoes" className="text-primary hover:underline">Notificações e lembretes</Link> a cada horário.</span></span></label>
        <div className="flex flex-wrap gap-2">
          <Button carregando={salvando} onClick={salvarCfg}>Salvar rotina</Button>
          <Button variante="contorno" carregando={rodando} onClick={rodarAgora}>Rodar agora</Button>
        </div>
        <p className="text-xs text-muted-foreground">Os textos usam os dados de cada cliente, sem custo de IA. Quando a chave da IA for cadastrada, ela também redige as mensagens pedidas abaixo.</p>
      </Card>}

      <Card className="mb-6 space-y-3 p-5">
        <h2 className="text-lg font-semibold">Prévia por cliente</h2>
        <p className="text-sm text-muted-foreground">O que a rotina diria agora para um cliente, com as novidades das últimas 24 horas. Nada é enviado.</p>
        <Select value={orgPrevia} onChange={(e) => setOrgPrevia(e.target.value)} aria-label="Cliente da prévia">
          <option value="">Escolha um cliente</option>
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </Select>
        {previaQ.isLoading && <Carregando />}
        {previaQ.isError && <Aviso>{mensagemErro(previaQ.error)}</Aviso>}
        {previaQ.data && (previaQ.data.mensagem
          ? <div className="rounded-lg border bg-muted/40 p-4"><p className="font-medium">{previaQ.data.mensagem.titulo}</p><p className="mt-1 whitespace-pre-wrap text-sm">{previaQ.data.mensagem.texto}</p><p className="mt-2 text-xs text-muted-foreground">Abre em {previaQ.data.mensagem.link}</p></div>
          : <p className="text-sm text-muted-foreground">Sem novidade para este cliente agora; ele não receberia mensagem.</p>)}
      </Card>

      <Card className="mb-6 space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-primary" />Pedir à IA na hora</h2>
        <p className="text-sm text-muted-foreground">Escreva o que quer dizer. A IA lê a análise de cada cliente, redige a mensagem dele e pula quem não se encaixa. Você revisa antes de enviar.</p>
        <Campo rotulo="Instrução para a IA" htmlFor="ia-instrucao">
          <Textarea id="ia-instrucao" rows={3} maxLength={1000} placeholder='Ex.: "Lembre quem tem disputa amanhã de conferir a proposta e os documentos."' value={instrucao} onChange={(e) => setInstrucao(e.target.value)} />
        </Campo>
        <EscolherClientes orgs={orgs} valor={destIA} aoMudar={setDestIA} />
        <Button carregando={gerando} onClick={gerar}>Gerar prévia</Button>
        {semIA && <Aviso tipo="info">{semIA}</Aviso>}
        {rascunhos.length > 0 && <div className="space-y-3">
          {rascunhos.map((r, i) => (
            <div key={r.org_id} className={`space-y-2 rounded-lg border p-3 ${r.enviar ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium"><input type="checkbox" disabled={!r.enviar} checked={r.incluir} onChange={(e) => setRascunhos(rascunhos.map((x, j) => j === i ? { ...x, incluir: e.target.checked } : x))} />{r.nome}</label>
                {!r.enviar && <Badge>{r.motivo ?? 'Não se aplica'}</Badge>}
              </div>
              {r.enviar && <>
                <Input value={r.titulo ?? ''} maxLength={80} onChange={(e) => setRascunhos(rascunhos.map((x, j) => j === i ? { ...x, titulo: e.target.value } : x))} aria-label={`Título para ${r.nome}`} />
                <Textarea rows={3} maxLength={600} value={r.texto ?? ''} onChange={(e) => setRascunhos(rascunhos.map((x, j) => j === i ? { ...x, texto: e.target.value } : x))} aria-label={`Texto para ${r.nome}`} />
              </>}
            </div>
          ))}
          <Button carregando={enviando} onClick={() => void enviar(rascunhos.filter((r) => r.enviar && r.incluir).map((r) => ({ org_id: r.org_id, titulo: r.titulo ?? '', texto: r.texto ?? '', link: r.link })), () => setRascunhos([]))}>
            Enviar {rascunhos.filter((r) => r.enviar && r.incluir).length} selecionadas
          </Button>
        </div>}
      </Card>

      <Card className="mb-6 space-y-4 p-5">
        <h2 className="text-lg font-semibold">Mensagem avulsa</h2>
        <p className="text-sm text-muted-foreground">Você escreve, sem IA, e manda agora para os clientes escolhidos. Para agendar data e hora, use <Link to="/master/avisos" className="text-primary hover:underline">Avisos aos clientes</Link>.</p>
        <Campo rotulo="Título" htmlFor="av-titulo"><Input id="av-titulo" maxLength={80} value={avulsa.titulo} onChange={(e) => setAvulsa({ ...avulsa, titulo: e.target.value })} /></Campo>
        <Campo rotulo="Texto" htmlFor="av-texto"><Textarea id="av-texto" rows={3} maxLength={600} value={avulsa.texto} onChange={(e) => setAvulsa({ ...avulsa, texto: e.target.value })} /></Campo>
        <EscolherClientes orgs={orgs} valor={destAvulsa} aoMudar={setDestAvulsa} />
        <Button carregando={enviando} onClick={enviarAvulsa}>Enviar agora</Button>
      </Card>

      <Card className="mb-6 space-y-3 p-5">
        <h2 className="text-lg font-semibold">Exceções por cliente</h2>
        <p className="text-sm text-muted-foreground">Tire um cliente da rotina ou dê a ele horários próprios (ex.: 10, 15). Em branco, vale o horário padrão.</p>
        <Input placeholder="Buscar cliente" value={buscaExc} onChange={(e) => setBuscaExc(e.target.value)} />
        <div className="divide-y rounded-lg border">
          {orgs.filter((o) => o.nome.toLowerCase().includes(buscaExc.trim().toLowerCase())).slice(0, 50).map((o) => {
            const x = excPorOrg.get(o.id)
            const texto = horasEdit[o.id] ?? (x?.horarios ? x.horarios.join(', ') : '')
            return (
              <div key={o.id} className="flex flex-wrap items-center gap-2 p-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{o.nome}{x?.fora && <Badge className="ml-2" cor="amarelo">Fora da rotina</Badge>}{!x?.fora && x?.horarios && <Badge className="ml-2" cor="azul">{horasTexto(x.horarios)}</Badge>}</span>
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={!!x?.fora} onChange={(e) => void salvarExcecao(o.id, e.target.checked, x?.horarios ?? null)} />Fora</label>
                <Input className="w-32" placeholder="Horários" value={texto} disabled={!!x?.fora} onChange={(e) => setHorasEdit({ ...horasEdit, [o.id]: e.target.value })} aria-label={`Horários próprios de ${o.nome}`} />
                <Button tamanho="sm" variante="contorno" disabled={!!x?.fora || texto === (x?.horarios ? x.horarios.join(', ') : '')} onClick={() => {
                  const h = lerHoras(texto)
                  if (h === undefined) { toast.error('Use horas inteiras de 7 a 21, separadas por vírgula (até 8).'); return }
                  void salvarExcecao(o.id, false, h).then(() => setHorasEdit(({ [o.id]: _, ...resto }) => resto))
                }}>Salvar</Button>
              </div>
            )
          })}
          {!orgs.length && <p className="p-3 text-sm text-muted-foreground">Nenhum cliente.</p>}
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center gap-2"><h2 className="min-w-0 flex-1 text-lg font-semibold">Últimos envios</h2><Button tamanho="sm" variante="contorno" onClick={() => void histQ.refetch()}>Atualizar</Button></div>
        {histQ.isLoading && <Carregando />}
        {histQ.data && !histQ.data.length && <p className="text-sm text-muted-foreground">Nenhuma mensagem enviada ainda.</p>}
        <div className="divide-y">
          {histQ.data?.map((e) => (
            <div key={e.id} className="space-y-1 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-sm font-medium">{nomeOrg(e.org_id)} · {e.titulo}</span>
                <Badge cor={e.chaves.includes('manual') ? 'azul' : 'neutro'}>{e.chaves.includes('manual') ? 'Avulsa' : 'Automática'}</Badge>
                <Badge cor={STATUS[e.status]?.[1] ?? 'neutro'}>{STATUS[e.status]?.[0] ?? e.status}</Badge>
              </div>
              <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{e.texto}</p>
              <p className="text-xs text-muted-foreground">{formatarDataHora(e.created_at)} · {e.canal === 'push' ? 'Push' : e.canal === 'email' ? 'E-mail' : e.canal === 'whatsapp' ? 'WhatsApp' : 'E-mail + WhatsApp'}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
