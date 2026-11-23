import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, BellRing, Building2, CalendarClock, ExternalLink, Plus, Radar as IconeRadar, RefreshCw, Settings2, Sparkles, X } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { useSalvar } from '@/hooks/useDados'
import { formatarDataHora, formatarMoeda } from '@/lib/format'
import { textoLimite } from '@/lib/agentesIA'
import { haQuanto } from '@/lib/agentesProcesso'
import { dadosProcesso, rotaOportunidade, type CompraPNCP } from '@/lib/pncp'
import { MODALIDADES } from '@/lib/filtrosOportunidades'
import { UFS } from '@/lib/pecasJuridicas'
import { aderencia, faltam, lerPalavras, lerValor, type EmpresaRadar, type PerfilRadar, type ResumoRadar, type SugestaoRadar } from '@/lib/radar'
import { cn } from '@/lib/utils'
import { Abas, Aviso, Badge, Button, Campo, Card, Carregando, Input, Modal, Textarea, Vazio } from '@/components/ui'

const nomeModalidade = (id: number | null) => MODALIDADES.find(([m]) => Number(m) === id)?.[1] ?? 'Outra modalidade'

/** Compra completa do PNCP para criar o processo; se a fonte falhar, usa a cópia guardada pelo Radar. */
async function compraCompleta(s: SugestaoRadar): Promise<CompraPNCP | null> {
  const m = /^(\d{14})-1-0*(\d+)\/(\d{4})$/.exec(s.controle)
  if (m) {
    try {
      const r = await fetch(`https://pncp.gov.br/api/consulta/v1/orgaos/${m[1]}/compras/${m[3]}/${m[2]}`)
      if (r.ok) { const c = await r.json(); if (c?.numeroControlePNCP) return c as CompraPNCP }
    } catch { /* usa a cópia */ }
  }
  return s.compra?.orgaoEntidade ? s.compra : null
}

function EditarPerfil({ empresa, perfil, aoFechar }: { empresa: EmpresaRadar; perfil?: PerfilRadar; aoFechar: () => void }) {
  const { org } = useOrg()
  const qc = useQueryClient()
  const [palavras, setPalavras] = useState(empresa.palavras_chave.join(', '))
  const [excluir, setExcluir] = useState((perfil?.excluir ?? []).join(', '))
  const [ufs, setUfs] = useState<string[]>(perfil?.ufs ?? [])
  const [mods, setMods] = useState<number[]>(perfil?.modalidades ?? [])
  const [min, setMin] = useState(perfil?.valor_min != null ? String(perfil.valor_min) : '')
  const [max, setMax] = useState(perfil?.valor_max != null ? String(perfil.valor_max) : '')
  const [horas, setHoras] = useState(String(perfil?.antecedencia_horas ?? 24))
  const [ativo, setAtivo] = useState(perfil?.ativo ?? true)
  const [salvando, setSalvando] = useState(false)
  const alternar = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v])

  async function salvar() {
    const kw = lerPalavras(palavras)
    const vmin = lerValor(min), vmax = lerValor(max)
    if (vmin === undefined || vmax === undefined) return toast.error('Valor inválido. Use números, ex.: 50.000,00')
    if (vmin != null && vmax != null && vmin > vmax) return toast.error('O valor mínimo é maior que o máximo.')
    setSalvando(true)
    try {
      const e1 = await supabase.from('empresas').update({ palavras_chave: kw }).eq('id', empresa.empresa_id)
      if (e1.error) throw e1.error
      const e2 = await supabase.from('radar_perfis').upsert({
        empresa_id: empresa.empresa_id, org_id: org!.id, ativo, excluir: lerPalavras(excluir), ufs, modalidades: mods,
        valor_min: vmin, valor_max: vmax, antecedencia_horas: Math.min(720, Math.max(0, Number(horas) || 0)), updated_at: new Date().toISOString(),
      })
      if (e2.error) throw e2.error
      await Promise.all([qc.invalidateQueries({ queryKey: ['radar-resumo'] }), qc.invalidateQueries({ queryKey: ['radar-perfis'] }), qc.invalidateQueries({ queryKey: ['empresas'] })])
      toast.success('Perfil do Radar salvo. A próxima busca já usa os novos filtros.')
      aoFechar()
    } catch (e) { toast.error(mensagemErro(e)) } finally { setSalvando(false) }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />Radar ligado nesta empresa</label>
      <Campo rotulo="O que a empresa vende (palavras-chave)" htmlFor="rd-kw" ajuda="Separe por vírgula. Ex.: papel A4, toner, material de escritório. O Radar acha variações (papel → papéis).">
        <Textarea id="rd-kw" rows={3} value={palavras} onChange={(e) => setPalavras(e.target.value)} />
      </Campo>
      <Campo rotulo="Ignorar editais que citem" htmlFor="rd-ex" ajuda="Ex.: obra, locação, serviço de engenharia.">
        <Input id="rd-ex" value={excluir} onChange={(e) => setExcluir(e.target.value)} />
      </Campo>
      <div>
        <p className="mb-1.5 text-sm font-medium">Estados <span className="font-normal text-muted-foreground">(nenhum marcado = todos)</span></p>
        <div className="flex flex-wrap gap-1.5">{UFS.map((u) => (
          <button key={u} type="button" onClick={() => setUfs(alternar(ufs, u))} className={cn('rounded-md border px-2 py-1 text-xs font-medium', ufs.includes(u) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>{u}</button>
        ))}</div>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium">Modalidades <span className="font-normal text-muted-foreground">(nenhuma marcada = todas)</span></p>
        <div className="flex flex-wrap gap-1.5">{MODALIDADES.map(([id, nome]) => (
          <button key={id} type="button" onClick={() => setMods(alternar(mods, Number(id)))} className={cn('rounded-md border px-2 py-1 text-xs font-medium', mods.includes(Number(id)) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>{nome}</button>
        ))}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Valor mínimo (R$)" htmlFor="rd-min"><Input id="rd-min" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="sem mínimo" /></Campo>
        <Campo rotulo="Valor máximo (R$)" htmlFor="rd-max"><Input id="rd-max" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="sem máximo" /></Campo>
        <Campo rotulo="Antecedência mínima (horas)" htmlFor="rd-h" ajuda="Ignora editais que encerram antes disso."><Input id="rd-h" type="number" min={0} max={720} value={horas} onChange={(e) => setHoras(e.target.value)} /></Campo>
      </div>
      <Button carregando={salvando} onClick={salvar}>Salvar perfil</Button>
    </div>
  )
}

export default function Radar() {
  const { org, podeEditar } = useOrg()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { salvar } = useSalvar('processos', ['processo_eventos', 'prazos'])
  const [aba, setAba] = useState<'nova' | 'adicionada' | 'descartada'>('nova')
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [editando, setEditando] = useState<EmpresaRadar | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const resumo = useQuery({ queryKey: ['radar-resumo', org?.id], enabled: !!org, queryFn: async () => {
    const { data, error } = await supabase.rpc('radar_resumo', { p_org: org!.id }); if (error) throw error; return data as ResumoRadar
  } })
  const perfis = useQuery({ queryKey: ['radar-perfis', org?.id], enabled: !!org, queryFn: async () => {
    const { data, error } = await supabase.from('radar_perfis').select('*').eq('org_id', org!.id); if (error) throw error; return data as PerfilRadar[]
  } })
  const sugestoes = useQuery({ queryKey: ['radar-sugestoes', org?.id, aba], enabled: !!org, queryFn: async () => {
    const q = supabase.from('radar_sugestoes').select('*').eq('org_id', org!.id).eq('status', aba)
    const { data, error } = await (aba === 'nova' ? q.order('pontuacao', { ascending: false }).order('encerramento') : q.order('decidido_em', { ascending: false })).limit(100)
    if (error) throw error
    return data as SugestaoRadar[]
  } })
  useEffect(() => { if (filtroEmpresa && !resumo.data?.empresas.some((e) => e.empresa_id === filtroEmpresa)) setFiltroEmpresa('') }, [resumo.data, filtroEmpresa])
  const lista = useMemo(() => (sugestoes.data ?? []).filter((s) => !filtroEmpresa || s.empresa_id === filtroEmpresa)
    .filter((s) => aba !== 'nova' || !s.encerramento || Date.parse(s.encerramento) > Date.now()), [sugestoes.data, filtroEmpresa, aba])
  const nomeEmpresa = (id: string) => { const e = resumo.data?.empresas.find((x) => x.empresa_id === id); return e ? (e.nome_fantasia || e.razao_social) : '' }
  const atualizar = () => Promise.all([qc.invalidateQueries({ queryKey: ['radar-sugestoes'] }), qc.invalidateQueries({ queryKey: ['radar-resumo'] })])

  async function buscarAgora(e: EmpresaRadar) {
    setOcupado(`b-${e.empresa_id}`)
    try {
      const { data, error } = await supabase.rpc('radar_buscar_agora', { p_empresa: e.empresa_id })
      if (error) throw error
      const n = (data as { novas: number }).novas
      toast.success(n ? `${n} ${n === 1 ? 'oportunidade nova encontrada' : 'oportunidades novas encontradas'}.` : 'Nenhuma oportunidade nova agora. O Radar procura de novo amanhã às 7h.')
      await atualizar()
    } catch (err) { toast.error(mensagemErro(err)) } finally { setOcupado(null) }
  }

  async function adicionar(s: SugestaoRadar) {
    setOcupado(`a-${s.id}`)
    try {
      const compra = await compraCompleta(s)
      if (!compra) throw new Error('Não foi possível abrir este edital no PNCP agora. Tente de novo em instantes.')
      const p = await salvar.mutateAsync({ dados: dadosProcesso(compra, s.empresa_id) })
      const { error } = await supabase.rpc('radar_decidir', { p_id: s.id, p_status: 'adicionada', p_processo: p.id })
      if (error) throw error
      toast.success('Adicionado ao funil, na coluna Captação.', { action: { label: 'Abrir', onClick: () => navigate(`/app/processos/${p.id}`) } })
      await atualizar()
    } catch (err) { toast.error(mensagemErro(err)) } finally { setOcupado(null) }
  }

  async function decidir(s: SugestaoRadar, status: 'nova' | 'descartada') {
    setOcupado(`d-${s.id}`)
    try {
      const { error } = await supabase.rpc('radar_decidir', { p_id: s.id, p_status: status })
      if (error) throw error
      await atualizar()
    } catch (err) { toast.error(mensagemErro(err)) } finally { setOcupado(null) }
  }

  const voltar = <Link to="/app/agentes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Agentes de IA</Link>
  if (resumo.isLoading) return <Carregando />
  if (resumo.isError) return <>{voltar}<Aviso>Não foi possível abrir o Radar agora.</Aviso></>
  const r = resumo.data!
  const monitoradas = r.empresas.filter((e) => e.monitorada).length
  const pendentes = r.empresas.reduce((s, e) => s + e.pendentes, 0)

  return (
    <>
      {voltar}
      <Card className="mb-5 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold"><IconeRadar className="h-6 w-6 text-primary" />Radar <Badge cor="azul">Beta</Badge></h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Todo dia às 7h o Radar cruza os editais abertos com o perfil de cada empresa e sugere os que combinam, com o motivo.
              Você decide o que vai para o funil.
            </p>
          </div>
          <Badge cor="azul">Seu plano: {textoLimite(r.limite.limite, 'simultaneo')}</Badge>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Empresas monitoradas</p><p className="mt-1 text-2xl font-semibold">{monitoradas}<span className="text-sm font-normal text-muted-foreground"> / {r.empresas.length}</span></p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Oportunidades para avaliar</p><p className={cn('mt-1 text-2xl font-semibold', pendentes > 0 && 'text-primary')}>{pendentes}</p></div>
          <div className="col-span-2 rounded-lg border p-3 lg:col-span-1"><p className="text-xs text-muted-foreground">Próxima busca automática</p><p className="mt-1 text-lg font-semibold">Amanhã às 7h</p></div>
        </div>
        {r.limite.limite === 0 && <div className="mt-4"><Aviso tipo="info">O seu plano não inclui o Radar. <Link to="/app/plano" className="font-semibold underline">Ver planos</Link>.</Aviso></div>}
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"><BellRing className="h-3.5 w-3.5" />Para saber das oportunidades no celular, toque em "Ativar notificações" na tela de <Link to="/app/avisos" className="font-medium text-primary hover:underline">Avisos</Link>.</p>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Perfil de cada empresa</h2>
      {!r.empresas.length ? (
        <Vazio icone={Building2} titulo="Nenhuma empresa cadastrada" texto="Cadastre a empresa e diga o que ela vende para o Radar começar." acao={<Link to="/app/empresas"><Button>Cadastrar empresa</Button></Link>} />
      ) : (
        <div className="mb-6 grid gap-3 lg:grid-cols-2">
          {r.empresas.map((e) => {
            const p = perfis.data?.find((x) => x.empresa_id === e.empresa_id)
            return (
              <Card key={e.empresa_id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{e.nome_fantasia || e.razao_social}</p>
                    <p className={cn('text-xs font-medium', e.monitorada ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                      {e.monitorada ? `Monitorada${e.ultima_busca ? ` · última busca ${haQuanto(e.ultima_busca)}` : ' · primeira busca amanhã às 7h'}` : e.motivo}
                    </p>
                  </div>
                  {e.pendentes > 0 && <Badge cor="azul">{e.pendentes} para avaliar</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {e.palavras_chave.length ? e.palavras_chave.map((k) => <Badge key={k}>{k}</Badge>) : <span className="text-xs text-muted-foreground">Sem palavras-chave</span>}
                </div>
                {p && (p.ufs.length > 0 || p.modalidades.length > 0 || p.valor_min != null || p.valor_max != null || p.excluir.length > 0) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[p.ufs.length ? p.ufs.join(', ') : null, p.modalidades.length ? p.modalidades.map(nomeModalidade).join(', ') : null,
                      p.valor_min != null ? `a partir de ${formatarMoeda(p.valor_min)}` : null, p.valor_max != null ? `até ${formatarMoeda(p.valor_max)}` : null,
                      p.excluir.length ? `ignora: ${p.excluir.join(', ')}` : null].filter(Boolean).join(' · ')}
                  </p>
                )}
                {podeEditar && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button tamanho="sm" variante="contorno" onClick={() => setEditando(e)}><Settings2 className="h-4 w-4" />Ajustar perfil</Button>
                    {e.monitorada && <Button tamanho="sm" variante="contorno" carregando={ocupado === `b-${e.empresa_id}`} onClick={() => buscarAgora(e)}><RefreshCw className="h-4 w-4" />Buscar agora</Button>}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Oportunidades encontradas</h2>
        <div className="flex flex-wrap items-center gap-2">
          {r.empresas.length > 1 && (
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)} aria-label="Filtrar por empresa">
              <option value="">Todas as empresas</option>
              {r.empresas.map((e) => <option key={e.empresa_id} value={e.empresa_id}>{e.nome_fantasia || e.razao_social}</option>)}
            </select>
          )}
          <Abas abas={[{ id: 'nova', rotulo: 'Para avaliar' }, { id: 'adicionada', rotulo: 'No funil' }, { id: 'descartada', rotulo: 'Descartadas' }]} atual={aba} aoTrocar={(id) => setAba(id === 'adicionada' ? 'adicionada' : id === 'descartada' ? 'descartada' : 'nova')} />
        </div>
      </div>
      {sugestoes.isLoading ? <Carregando /> : !lista.length ? (
        <Card className="p-5 text-sm text-muted-foreground">
          {aba === 'nova' ? (monitoradas ? 'Nenhuma oportunidade para avaliar agora. O Radar procura todo dia às 7h; use "Buscar agora" no perfil da empresa para procurar já.' : 'Cadastre as palavras-chave de uma empresa para o Radar começar a procurar.')
            : aba === 'adicionada' ? 'Nenhuma oportunidade levada ao funil ainda.' : 'Nenhuma oportunidade descartada.'}
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((s) => {
            const a = aderencia(s.pontuacao)
            const compraLink = s.compra?.orgaoEntidade ? rotaOportunidade(s.compra) : null
            return (
              <Card key={s.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge cor={a.cor}><Sparkles className="mr-1 inline h-3 w-3" />{a.rotulo}</Badge>
                  <span>{nomeModalidade(s.modalidade)}</span>
                  {s.uf && <span>· {s.uf}</span>}
                  {r.empresas.length > 1 && <span>· para {nomeEmpresa(s.empresa_id)}</span>}
                </div>
                <p className="mt-1.5 font-medium leading-snug">{s.objeto}</p>
                {s.orgao && <p className="mt-0.5 text-sm text-muted-foreground">{s.orgao}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-medium">{s.valor ? formatarMoeda(s.valor) : 'Valor não divulgado'}</span>
                  {s.encerramento && <span className="flex items-center gap-1"><CalendarClock className="h-4 w-4 text-muted-foreground" />{formatarDataHora(s.encerramento)} <span className="text-xs text-muted-foreground">({faltam(s.encerramento)})</span></span>}
                </div>
                {s.motivos.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">{s.motivos.filter((m) => !m.startsWith('Prazo final')).map((m, i) => <li key={i} className="rounded-md bg-muted px-2 py-0.5 text-xs">{m}</li>)}</ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.status === 'nova' && podeEditar && <Button tamanho="sm" carregando={ocupado === `a-${s.id}`} onClick={() => adicionar(s)}><Plus className="h-4 w-4" />Adicionar ao funil</Button>}
                  {s.status === 'adicionada' && s.processo_id && <Link to={`/app/processos/${s.processo_id}`}><Button tamanho="sm">Abrir processo</Button></Link>}
                  {compraLink && <Link to={compraLink}><Button tamanho="sm" variante="contorno"><ExternalLink className="h-4 w-4" />Ver edital</Button></Link>}
                  {s.status === 'nova' && podeEditar && <Button tamanho="sm" variante="contorno" carregando={ocupado === `d-${s.id}`} onClick={() => decidir(s, 'descartada')}><X className="h-4 w-4" />Descartar</Button>}
                  {s.status === 'descartada' && podeEditar && <Button tamanho="sm" variante="contorno" carregando={ocupado === `d-${s.id}`} onClick={() => decidir(s, 'nova')}>Voltar para avaliar</Button>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal aberto={!!editando} aoFechar={() => setEditando(null)} titulo={`Perfil do Radar · ${editando ? (editando.nome_fantasia || editando.razao_social) : ''}`} largo>
        {editando && <EditarPerfil empresa={editando} perfil={perfis.data?.find((x) => x.empresa_id === editando.empresa_id)} aoFechar={() => setEditando(null)} />}
      </Modal>
    </>
  )
}
