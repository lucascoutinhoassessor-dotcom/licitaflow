import { Link, useSearchParams } from 'react-router-dom'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, Circle, Copy, MessageCircle, Search, ShieldCheck, Smartphone, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensagemErro, fetchComSessao } from '@/lib/supabase'
import { diasAte, formatarData, formatarDataHora, formatarMoeda } from '@/lib/format'
import { formatarWhatsapp, linkWhatsapp, normalizarWhatsapp } from '@/lib/telefone'
import { useAuth } from '@/providers/AuthProvider'
import { acaoUsuarioMaster } from '@/components/EdicaoClienteMaster'
import { useCatalogoPlanos } from '@/hooks/useCatalogoPlanos'
import { cn } from '@/lib/utils'
import { Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Modal, Select } from '@/components/ui'
import { EditarOrg, progresso, statusOrg, type OrgAdmin } from './Organizacoes'

export interface PessoaCliente {
  id: string; nome: string | null; email: string; telefone: string | null; created_at: string
  ultimo_acesso: string | null; email_confirmado: boolean; is_admin: boolean
}
export interface MembroCliente extends PessoaCliente {
  papel: string; outras_orgs: number; aparelhos: number; app_instalado: boolean; push_ativo: boolean
}
export interface ContaCliente {
  id: string; nome: string; tipo: string; plano: string; trial_ate: string; suspensa: boolean; motivo_suspensao: string | null
  created_at: string; notas_admin: string | null; membros: MembroCliente[]
  empresas: number; empresas_nomes: string[]; processos: number; processos_monitorados: number; documentos: number
  contratos: number; prazos_pendentes: number; tem_palavras_chave: boolean; radar_ativo: number; radar_sugestoes: number
  agentes_liberados: boolean; modulos_teste: string[]; ia_30d: { usos: number; custo_usd: number; agentes: string[] }
  assinatura: { plano: string; ciclo: string; status: string; valor_centavos: number; forma: string; pago_ate: string | null; proximo_vencimento: string | null } | null
  cupons: string[]; ultima_atividade: string | null
}
interface Clientes { organizacoes: ContaCliente[]; sem_organizacao: PessoaCliente[] }

/** Todos os clientes numa chamada só. A chave começa por 'admin-orgs' para atualizar junto com as edições da ficha. */
export function useClientes() {
  return useQuery({
    queryKey: ['admin-orgs', 'clientes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_clientes')
      if (error) throw error
      return data as Clientes
    },
  })
}

export const donoDe = (c: ContaCliente) => c.membros.find((m) => m.papel === 'owner') ?? c.membros[0] ?? null

/** Formato usado pelo editor de plano/teste/suspensão. */
export function paraOrgAdmin(c: ContaCliente): OrgAdmin {
  const dono = donoDe(c)
  return { ...c, dono_email: dono?.email ?? null, dono_nome: dono?.nome ?? null, membros: c.membros.length }
}

const FORMA: Record<string, string> = { PIX: 'Pix', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão', UNDEFINED: 'a escolher' }
const STATUS_ASS: Record<string, [string, 'verde' | 'amarelo' | 'vermelho' | undefined]> = {
  ativa: ['ativa', 'verde'], atrasada: ['atrasada', 'vermelho'], pendente: ['aguardando pagamento', 'amarelo'], cancelada: ['cancelada', undefined],
}

export function WhatsApp({ numero, className }: { numero: string | null; className?: string }) {
  const link = linkWhatsapp(numero)
  if (!numero) return <span className={cn('text-warning', className)}>Sem WhatsApp</span>
  if (!link) return <span className={className}>{numero}</span>
  return (
    <a href={link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={cn('inline-flex items-center gap-1 text-success hover:underline', className)}>
      <MessageCircle className="h-3.5 w-3.5" /> {formatarWhatsapp(numero)}
    </a>
  )
}

function Item({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className={ok ? '' : 'text-muted-foreground'}>{children}</span>
    </li>
  )
}

/** Tudo o que a conta já ativou na plataforma. Usado na lista e na ficha do cliente. */
export function AtivacoesCliente({ c }: { c: ContaCliente }) {
  const { passos, pct } = progresso(paraOrgAdmin(c))
  const a = c.assinatura
  const st = a ? STATUS_ASS[a.status] ?? [a.status, undefined] : null
  const comApp = c.membros.filter((m) => m.app_instalado).length
  const comPush = c.membros.filter((m) => m.push_ativo).length
  const comWhats = c.membros.filter((m) => normalizarWhatsapp(m.telefone)).length
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Implantação da conta</span>
          <span className="tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
        <ul className="mt-3 space-y-1.5 text-sm">
          {passos.map((p) => <Item key={p.rotulo} ok={p.ok}>{p.rotulo}</Item>)}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">O que já ativou</p>
        <ul className="space-y-1.5 text-sm">
          <Item ok={!!a && a.status !== 'cancelada'}>
            {a ? <>Assinatura {a.plano} {a.ciclo} · {formatarMoeda(a.valor_centavos / 100)} · {FORMA[a.forma] ?? a.forma} · <Badge cor={st?.[1]}>{st?.[0]}</Badge>{a.pago_ate && <> · pago até {formatarData(a.pago_ate)}</>}</> : 'Nenhuma assinatura contratada'}
          </Item>
          <Item ok={c.radar_ativo > 0}>Radar de oportunidades: {c.radar_ativo ? `${c.radar_ativo} perfil(is) ativo(s) · ${c.radar_sugestoes} sugestão(ões) recebidas` : 'não configurado'}</Item>
          <Item ok={c.agentes_liberados}>Agentes de IA: {c.agentes_liberados ? 'liberados' : 'não liberados'}{c.processos_monitorados > 0 && ` · Sentinela vigiando ${c.processos_monitorados} processo(s)`}</Item>
          <Item ok={c.ia_30d.usos > 0}>
            IA nos últimos 30 dias: {c.ia_30d.usos ? `${c.ia_30d.usos} uso(s) · US$ ${Number(c.ia_30d.custo_usd).toFixed(2)} · ${c.ia_30d.agentes.join(', ')}` : 'nenhum uso'}
          </Item>
          <Item ok={comApp > 0}>App instalado: {comApp} de {c.membros.length} pessoa(s)</Item>
          <Item ok={comPush > 0}>Notificações no celular/computador: {comPush} de {c.membros.length}</Item>
          <Item ok={comWhats === c.membros.length && comWhats > 0}>WhatsApp cadastrado: {comWhats} de {c.membros.length}</Item>
          {c.modulos_teste.length > 0 && <Item ok>Recursos em teste liberados: {c.modulos_teste.join(', ')}</Item>}
          {c.cupons.length > 0 && <Item ok>Cupom usado: {c.cupons.join(', ')}</Item>}
        </ul>
      </div>
    </div>
  )
}

function gerarSenha() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const v = crypto.getRandomValues(new Uint32Array(12))
  return Array.from(v, (n) => c[n % c.length]).join('')
}

function emDias(d: number) {
  const x = new Date()
  x.setDate(x.getDate() + d)
  return x.toISOString().slice(0, 10)
}

/** Cria login + organização direto pelo master, sem cadastro público nem pagamento. */
function NovoCliente({ aoFechar }: { aoFechar: () => void }) {
  const qc = useQueryClient()
  const catalogo = useCatalogoPlanos()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [senha, setSenha] = useState(gerarSenha)
  const [criarOrg, setCriarOrg] = useState(true)
  const [orgNome, setOrgNome] = useState('')
  const [tipo, setTipo] = useState('fornecedor')
  const [plano, setPlano] = useState('trial')
  const [trialAte, setTrialAte] = useState(emDias(30))
  const [salvando, setSalvando] = useState(false)
  const [pronto, setPronto] = useState<{ email: string; senha: string; org: string | null } | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const telefone = normalizarWhatsapp(whatsapp)
    if (!telefone) return toast.error('Informe um WhatsApp válido com DDD.')
    setSalvando(true)
    try {
      const r = await fetchComSessao('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, telefone, senha, org: criarOrg ? { nome: orgNome, tipo, plano, trial_ate: plano === 'trial' ? trialAte : null } : null }),
      })
      if (!r.headers.get('content-type')?.includes('application/json')) throw new Error('API indisponível nesta publicação (só funciona na Vercel).')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Falha ao criar o usuário')
      toast.success('Cliente criado.')
      qc.invalidateQueries({ queryKey: ['admin-orgs'] })
      qc.invalidateQueries({ queryKey: ['admin-resumo'] })
      setPronto({ email: email.trim().toLowerCase(), senha, org: j.org })
    } catch (e) {
      toast.error(mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }

  if (pronto) {
    const texto = `Acesso ao LicitaForce\nEndereço: ${location.origin}/entrar\nE-mail: ${pronto.email}\nSenha: ${pronto.senha}`
    return (
      <div className="space-y-4">
        <p className="text-sm">Login criado com o e-mail já confirmado. Envie os dados de acesso e peça para trocar a senha no primeiro acesso.</p>
        <pre className="whitespace-pre-wrap break-all rounded-md bg-muted/60 p-3 text-sm">{texto}</pre>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variante="contorno" onClick={() => navigator.clipboard.writeText(texto).then(() => toast.success('Copiado.'))}>
            <Copy className="mr-2 h-4 w-4" /> Copiar dados de acesso
          </Button>
          {pronto.org && (
            <Link to={`/master/clientes/${pronto.org}`} onClick={aoFechar}>
              <Button type="button" variante="contorno">Abrir ficha do cliente</Button>
            </Link>
          )}
          <Button type="button" onClick={aoFechar}>Concluir</Button>
        </div>
      </div>
    )
  }

  const planos = catalogo.data?.length ? catalogo.data.filter((p) => p.id !== 'cancelado') : [{ id: 'trial', nome: 'Teste grátis' }]
  return (
    <form onSubmit={salvar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome" htmlFor="nc-nome">
          <Input id="nc-nome" required minLength={2} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="E-mail" htmlFor="nc-email">
          <Input id="nc-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        <Campo rotulo="WhatsApp" htmlFor="nc-whats">
          <Input id="nc-whats" type="tel" inputMode="tel" required placeholder="(11) 91234-5678" maxLength={20} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        </Campo>
        <Campo rotulo="Senha inicial" htmlFor="nc-senha">
          <div className="flex gap-2">
            <Input id="nc-senha" required minLength={8} maxLength={72} value={senha} onChange={(e) => setSenha(e.target.value)} />
            <Button type="button" variante="contorno" className="shrink-0" onClick={() => setSenha(gerarSenha())}>Gerar</Button>
          </div>
        </Campo>
      </div>

      <label className="flex items-start gap-3 rounded-md border p-3">
        <input type="checkbox" className="mt-1" checked={criarOrg} onChange={(e) => setCriarOrg(e.target.checked)} />
        <span>
          <span className="block text-sm font-medium">Criar a organização do cliente</span>
          <span className="block text-xs text-muted-foreground">A pessoa vira dona e entra direto, sem configuração inicial nem pagamento. Desmarque para que ela mesma crie no primeiro acesso.</span>
        </span>
      </label>
      {criarOrg && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome da organização" htmlFor="nc-org">
              <Input id="nc-org" required minLength={2} maxLength={120} value={orgNome} onChange={(e) => setOrgNome(e.target.value)} />
            </Campo>
            <Campo rotulo="Tipo" htmlFor="nc-tipo">
              <Select id="nc-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="fornecedor">Fornecedor</option>
                <option value="assessoria">Assessoria</option>
              </Select>
            </Campo>
            <Campo rotulo="Plano" htmlFor="nc-plano">
              <Select id="nc-plano" value={plano} onChange={(e) => setPlano(e.target.value)}>
                {planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </Select>
            </Campo>
            {plano === 'trial' && (
              <Campo rotulo="Teste grátis até" htmlFor="nc-trial">
                <Input id="nc-trial" type="date" required value={trialAte} onChange={(e) => setTrialAte(e.target.value)} />
              </Campo>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {plano === 'trial'
              ? 'Ao vencer o teste sem assinatura, o acesso é bloqueado automaticamente.'
              : 'Plano comercial definido pelo master: fica liberado sem cobrança, até você trocar o plano ou suspender.'}
          </p>
        </>
      )}
      <Button type="submit" className="w-full" carregando={salvando}>Criar cliente</Button>
    </form>
  )
}

/** Ações do master sobre o login de uma pessoa: dar/remover master e excluir. */
function useAcoesPessoa(dados: Clientes | undefined) {
  const qc = useQueryClient()
  const recarregar = () => { for (const k of ['admin-orgs', 'admin-usuarios', 'admin-resumo', 'admin-financeiro']) qc.invalidateQueries({ queryKey: [k] }) }

  async function alternarAdmin(u: PessoaCliente) {
    const acao = u.is_admin ? 'remover o acesso master de' : 'dar acesso master (controle total da plataforma) para'
    if (!confirm(`Deseja ${acao} ${u.email}?`)) return
    const { error } = await supabase.rpc('admin_definir_admin', { p_user: u.id, p_admin: !u.is_admin })
    if (error) return toast.error(mensagemErro(error))
    toast.success('Permissão atualizada.')
    recarregar()
  }

  async function excluir(u: PessoaCliente) {
    const tipo = u.is_admin ? 'o usuário MASTER' : 'o usuário'
    // Organização sem mais ninguém é excluída junto pelo banco (ou suspensa, se tiver histórico de pagamento).
    const sozinho = (dados?.organizacoes ?? []).filter((o) => o.membros.length === 1 && o.membros[0].id === u.id).map((o) => o.nome)
    const orgs = sozinho.length
      ? `\n\nEle é o único usuário de: ${sozinho.join(', ')}. Essa(s) organização(ões) e os dados delas também serão excluídos (as que tiverem histórico de pagamento ficam suspensas, para preservar o financeiro).`
      : ''
    if (!confirm(`Excluir ${tipo} ${u.email}? O login é apagado de vez e não pode ser desfeito.${orgs}`)) return
    if (u.is_admin && prompt('Para confirmar a exclusão de um master, digite o e-mail dele:')?.trim().toLowerCase() !== u.email.toLowerCase()) return toast.error('E-mail não confere. Nada foi excluído.')
    try {
      await acaoUsuarioMaster({ acao: 'excluir_usuario', usuario: u.id })
      toast.success('Usuário excluído e registrado na auditoria.')
      recarregar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return { alternarAdmin, excluir }
}

function Pessoa({ p, papel, extra, acoes }: { p: PessoaCliente; papel?: string; extra?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{p.nome || p.email}</span>
          {papel && <Badge>{papel === 'owner' ? 'dono' : papel}</Badge>}
          {p.is_admin && <Badge cor="amarelo"><ShieldCheck className="mr-1 h-3 w-3" /> master</Badge>}
          {!p.email_confirmado && <Badge cor="vermelho">e-mail não confirmado</Badge>}
        </div>
        <div className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
          <span className="break-all">{p.email}</span>
          <WhatsApp numero={p.telefone} />
        </div>
        {extra}
      </div>
      <div className="text-xs text-muted-foreground lg:w-56 lg:text-right">
        <div>Cadastro: {formatarData(p.created_at)}</div>
        <div>Último acesso: {formatarDataHora(p.ultimo_acesso)}</div>
      </div>
      {acoes}
    </div>
  )
}

function CartaoCliente({ c, aberto, alternar, editar, acoes, euId }: {
  c: ContaCliente; aberto: boolean; alternar: () => void; editar: () => void
  acoes: ReturnType<typeof useAcoesPessoa>; euId?: string
}) {
  const dono = donoDe(c)
  const { pct } = progresso(paraOrgAdmin(c))
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={alternar} aria-expanded={aberto} className="flex w-full flex-col gap-3 p-4 text-left hover:bg-muted/40 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{c.nome}</span>
            {statusOrg(paraOrgAdmin(c))}
            <span className="text-xs text-muted-foreground">{c.tipo === 'assessoria' ? 'Assessoria' : 'Fornecedor'} · desde {formatarData(c.created_at)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
            {dono ? <><span>{dono.nome || dono.email}</span><span className="break-all">{dono.email}</span><WhatsApp numero={dono.telefone} /></> : <span className="text-warning">Sem usuários</span>}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <span className="hidden tabular-nums lg:inline">{c.membros.length} pessoa(s) · {c.empresas} emp. · {c.processos} proc.</span>
          <span className="hidden md:inline">{formatarDataHora(c.ultima_atividade)}</span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')} />
        </div>
      </button>
      {aberto && (
        <div className="space-y-5 border-t p-4">
          <div className="flex flex-wrap gap-2">
            <Link to={`/master/clientes/${c.id}`}><Button tamanho="sm">Abrir ficha completa</Button></Link>
            <Button tamanho="sm" variante="contorno" onClick={editar}>Plano, teste e suspensão</Button>
            {c.suspensa && c.motivo_suspensao && <Badge cor="vermelho">Motivo: {c.motivo_suspensao}</Badge>}
          </div>

          <AtivacoesCliente c={c} />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {([['Empresas', c.empresas], ['Processos', c.processos], ['Documentos', c.documentos], ['Contratos', c.contratos], ['Prazos pendentes', c.prazos_pendentes], ['Pessoas', c.membros.length]] as const).map(([r, v]) => (
              <div key={r} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{r}</p><p className="text-lg font-semibold tabular-nums">{v}</p></div>
            ))}
          </div>
          {c.empresas_nomes.length > 0 && <p className="text-sm"><span className="text-muted-foreground">Empresas: </span>{c.empresas_nomes.join(' · ')}</p>}

          <div>
            <p className="text-sm font-medium">Equipe</p>
            <div className="divide-y">
              {c.membros.map((m) => (
                <Pessoa key={m.id} p={m} papel={m.papel}
                  extra={<p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Smartphone className="h-3 w-3" /> {m.aparelhos} aparelho(s){m.app_instalado ? ' · app instalado' : ''}{m.push_ativo ? ' · notificações ligadas' : ''}</span>
                    {m.outras_orgs > 0 && <span>também em mais {m.outras_orgs} organização(ões)</span>}
                  </p>}
                  acoes={m.id !== euId && <div className="flex gap-2">
                    <Button tamanho="sm" variante="contorno" onClick={() => acoes.alternarAdmin(m)}>{m.is_admin ? 'Remover master' : 'Tornar master'}</Button>
                    <Button tamanho="sm" variante="perigo" onClick={() => acoes.excluir(m)}><Trash2 className="mr-1 h-4 w-4" /> Excluir</Button>
                  </div>} />
              ))}
            </div>
          </div>
          {c.notas_admin && <p className="rounded-md bg-muted/60 p-3 text-sm"><span className="font-medium">Notas internas: </span>{c.notas_admin}</p>}
        </div>
      )}
    </Card>
  )
}

const FILTROS: [string, string][] = [
  ['todas', 'Todos'], ['trial', 'Em teste'], ['vencidos', 'Teste vencido'], ['pagantes', 'Planos comerciais'],
  ['suspensas', 'Suspensos'], ['sem_whatsapp', 'Sem WhatsApp'], ['sem_org', 'Cadastro sem organização'],
]

export default function Clientes() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const filtro = params.get('filtro') ?? 'todas'
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<ContaCliente | null>(null)
  const [novo, setNovo] = useState(false)
  const q = useClientes()
  const acoes = useAcoesPessoa(q.data)

  const contas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const td = t.replace(/\D/g, '')
    return (q.data?.organizacoes ?? []).filter((o) => {
      if (t) {
        const texto = `${o.nome} ${o.empresas_nomes.join(' ')} ${o.membros.map((m) => `${m.nome} ${m.email}`).join(' ')}`.toLowerCase()
        const fones = o.membros.map((m) => m.telefone ?? '').join(' ')
        if (!texto.includes(t) && !(td.length >= 4 && fones.includes(td))) return false
      }
      if (filtro === 'suspensas') return o.suspensa
      if (filtro === 'trial') return o.plano === 'trial' && !o.suspensa
      if (filtro === 'vencidos') return o.plano === 'trial' && diasAte(o.trial_ate) < 0
      if (filtro === 'pagantes') return !['trial', 'cancelado'].includes(o.plano)
      if (filtro === 'sem_whatsapp') return o.membros.some((m) => !normalizarWhatsapp(m.telefone))
      if (filtro === 'sem_org') return false
      return true
    })
  }, [q.data, busca, filtro])

  const semOrg = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!['todas', 'sem_org', 'sem_whatsapp'].includes(filtro)) return []
    return (q.data?.sem_organizacao ?? []).filter((u) =>
      (!t || `${u.nome} ${u.email} ${u.telefone ?? ''}`.toLowerCase().includes(t)) && (filtro !== 'sem_whatsapp' || !normalizarWhatsapp(u.telefone)))
  }, [q.data, busca, filtro])

  const todas = q.data?.organizacoes ?? []
  const pessoas = [...todas.flatMap((o) => o.membros), ...(q.data?.sem_organizacao ?? [])]
  const resumo: [string, number, string][] = [
    ['Clientes', todas.length, 'todas'],
    ['Em teste', todas.filter((o) => o.plano === 'trial' && !o.suspensa).length, 'trial'],
    ['Planos comerciais', todas.filter((o) => !['trial', 'cancelado'].includes(o.plano)).length, 'pagantes'],
    ['Suspensos', todas.filter((o) => o.suspensa).length, 'suspensas'],
    ['Sem WhatsApp', new Set(pessoas.filter((p) => !normalizarWhatsapp(p.telefone)).map((p) => p.id)).size, 'sem_whatsapp'],
    ['Sem organização', q.data?.sem_organizacao.length ?? 0, 'sem_org'],
  ]
  const mudarFiltro = (f: string) => setParams(f === 'todas' ? {} : { filtro: f }, { replace: true })
  const alternar = (id: string) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <>
      <CabecalhoPagina
        titulo="Clientes"
        descricao="Cada conta cliente com dono, equipe, WhatsApp, acessos, plano, assinatura e tudo o que já ativou na plataforma."
        acoes={<Button onClick={() => setNovo(true)}><UserPlus className="mr-2 h-4 w-4" /> Novo cliente</Button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {resumo.map(([r, v, f]) => (
          <button key={f} type="button" onClick={() => mudarFiltro(f)} className={cn('rounded-lg border bg-card p-3 text-left hover:bg-muted/40', filtro === f && 'border-primary ring-1 ring-primary')}>
            <p className="text-xs text-muted-foreground">{r}</p>
            <p className="text-xl font-semibold tabular-nums">{v}</p>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por organização, empresa, nome, e-mail ou WhatsApp" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select className="sm:w-56" value={filtro} onChange={(e) => mudarFiltro(e.target.value)} aria-label="Filtro">
          {FILTROS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </Select>
        {contas.length > 0 && (
          <Button variante="contorno" onClick={() => setAbertos(abertos.size ? new Set() : new Set(contas.map((c) => c.id)))}>
            {abertos.size ? 'Recolher todos' : 'Expandir todos'}
          </Button>
        )}
      </div>

      {q.isLoading && <Carregando />}
      {q.error && <Aviso>{mensagemErro(q.error)} <button className="underline" onClick={() => q.refetch()}>Tentar novamente</button></Aviso>}

      <div className="space-y-3">
        {contas.map((c) => (
          <CartaoCliente key={c.id} c={c} aberto={abertos.has(c.id)} alternar={() => alternar(c.id)} editar={() => setEditando(c)} acoes={acoes} euId={user?.id} />
        ))}
      </div>

      {semOrg.length > 0 && (
        <Card className="mt-6 p-4">
          <h2 className="font-semibold">Cadastros sem organização ({semOrg.length})</h2>
          <p className="text-sm text-muted-foreground">Criaram o login mas não concluíram a configuração inicial da conta.</p>
          <div className="divide-y">
            {semOrg.map((u) => (
              <Pessoa key={u.id} p={u} acoes={u.id !== user?.id && <div className="flex gap-2">
                <Button tamanho="sm" variante="contorno" onClick={() => acoes.alternarAdmin(u)}>{u.is_admin ? 'Remover master' : 'Tornar master'}</Button>
                <Button tamanho="sm" variante="perigo" onClick={() => acoes.excluir(u)}><Trash2 className="mr-1 h-4 w-4" /> Excluir</Button>
              </div>} />
            ))}
          </div>
        </Card>
      )}

      {!q.isLoading && !q.error && contas.length === 0 && semOrg.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</Card>
      )}

      <Modal aberto={!!editando} aoFechar={() => setEditando(null)} titulo={editando?.nome ?? ''}>
        {editando && <EditarOrg org={paraOrgAdmin(editando)} aoFechar={() => setEditando(null)} />}
      </Modal>
      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo cliente">
        {novo && <NovoCliente aoFechar={() => setNovo(false)} />}
      </Modal>
    </>
  )
}
