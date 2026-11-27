import { Link } from 'react-router-dom'
import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Search, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { acaoUsuarioMaster } from '@/components/EdicaoClienteMaster'
import { toast } from 'sonner'
import { supabase, mensagemErro, fetchComSessao } from '@/lib/supabase'
import { formatarData, formatarDataHora } from '@/lib/format'
import { useAuth } from '@/providers/AuthProvider'
import { Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Modal, Select } from '@/components/ui'
import { useCatalogoPlanos } from '@/hooks/useCatalogoPlanos'

interface UsuarioAdmin {
  id: string
  email: string
  nome: string | null
  created_at: string
  last_sign_in_at: string | null
  email_confirmado: boolean
  is_admin: boolean
  organizacoes: { id: string; nome: string; papel: string }[]
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
function NovoUsuario({ aoFechar }: { aoFechar: () => void }) {
  const qc = useQueryClient()
  const catalogo = useCatalogoPlanos()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
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
    setSalvando(true)
    try {
      const r = await fetchComSessao('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, senha, org: criarOrg ? { nome: orgNome, tipo, plano, trial_ate: plano === 'trial' ? trialAte : null } : null }),
      })
      if (!r.headers.get('content-type')?.includes('application/json')) throw new Error('API indisponível nesta publicação (só funciona na Vercel).')
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Falha ao criar o usuário')
      toast.success('Usuário criado.')
      qc.invalidateQueries({ queryKey: ['admin-usuarios'] })
      qc.invalidateQueries({ queryKey: ['admin-orgs'] })
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
        <p className="text-sm">Usuário criado com o e-mail já confirmado. Envie os dados de acesso e peça para trocar a senha no primeiro acesso.</p>
        <pre className="whitespace-pre-wrap break-all rounded-md bg-muted/60 p-3 text-sm">{texto}</pre>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variante="contorno" onClick={() => navigator.clipboard.writeText(texto).then(() => toast.success('Copiado.'))}>
            <Copy className="mr-2 h-4 w-4" /> Copiar dados de acesso
          </Button>
          {pronto.org && (
            <Link to={`/master/organizacoes/${pronto.org}`} onClick={aoFechar}>
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
        <Campo rotulo="Nome" htmlFor="nu-nome">
          <Input id="nu-nome" required minLength={2} maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="E-mail" htmlFor="nu-email">
          <Input id="nu-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
      </div>
      <Campo rotulo="Senha inicial" htmlFor="nu-senha">
        <div className="flex gap-2">
          <Input id="nu-senha" required minLength={8} maxLength={72} value={senha} onChange={(e) => setSenha(e.target.value)} />
          <Button type="button" variante="contorno" className="shrink-0" onClick={() => setSenha(gerarSenha())}>Gerar</Button>
        </div>
      </Campo>

      <label className="flex items-start gap-3 rounded-md border p-3">
        <input type="checkbox" className="mt-1" checked={criarOrg} onChange={(e) => setCriarOrg(e.target.checked)} />
        <span>
          <span className="block text-sm font-medium">Criar a organização do cliente</span>
          <span className="block text-xs text-muted-foreground">O usuário vira dono e entra direto, sem configuração inicial nem pagamento. Desmarque para que ele mesmo crie no primeiro acesso.</span>
        </span>
      </label>
      {criarOrg && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome da organização" htmlFor="nu-org">
              <Input id="nu-org" required minLength={2} maxLength={120} value={orgNome} onChange={(e) => setOrgNome(e.target.value)} />
            </Campo>
            <Campo rotulo="Tipo" htmlFor="nu-tipo">
              <Select id="nu-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="fornecedor">Fornecedor</option>
                <option value="assessoria">Assessoria</option>
              </Select>
            </Campo>
            <Campo rotulo="Plano" htmlFor="nu-plano">
              <Select id="nu-plano" value={plano} onChange={(e) => setPlano(e.target.value)}>
                {planos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </Select>
            </Campo>
            {plano === 'trial' && (
              <Campo rotulo="Teste grátis até" htmlFor="nu-trial">
                <Input id="nu-trial" type="date" required value={trialAte} onChange={(e) => setTrialAte(e.target.value)} />
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
      <Button type="submit" className="w-full" carregando={salvando}>Criar usuário</Button>
    </form>
  )
}

export default function Usuarios() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState(false)
  const q = useQuery({
    queryKey: ['admin-usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_usuarios')
      if (error) throw error
      return data as UsuarioAdmin[]
    },
  })

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (q.data ?? []).filter((u) => !t || `${u.email} ${u.nome} ${u.organizacoes.map((o) => o.nome).join(' ')}`.toLowerCase().includes(t))
  }, [q.data, busca])

  async function alternarAdmin(u: UsuarioAdmin) {
    const acao = u.is_admin ? 'remover o acesso master de' : 'dar acesso master (controle total da plataforma) para'
    if (!confirm(`Deseja ${acao} ${u.email}?`)) return
    const { error } = await supabase.rpc('admin_definir_admin', { p_user: u.id, p_admin: !u.is_admin })
    if (error) return toast.error(mensagemErro(error))
    toast.success('Permissão atualizada.')
    qc.invalidateQueries({ queryKey: ['admin-usuarios'] })
  }

  async function excluir(u: UsuarioAdmin) {
    const tipo = u.is_admin ? 'o usuário MASTER' : 'o usuário'
    // Organização sem mais ninguém é excluída junto pelo banco (ou suspensa, se tiver histórico de pagamento).
    const membros = new Map<string, number>()
    for (const x of q.data ?? []) for (const o of x.organizacoes) membros.set(o.id, (membros.get(o.id) ?? 0) + 1)
    const sozinho = u.organizacoes.filter((o) => (membros.get(o.id) ?? 0) <= 1).map((o) => o.nome)
    const orgs = sozinho.length
      ? `\n\nEle é o único usuário de: ${sozinho.join(', ')}. Essa(s) organização(ões) e os dados delas também serão excluídos (as que tiverem histórico de pagamento ficam suspensas, para preservar o financeiro).`
      : '\n\nAs organizações dele têm outros usuários e continuam no sistema.'
    if (!confirm(`Excluir ${tipo} ${u.email}? O login é apagado de vez e não pode ser desfeito.${orgs}`)) return
    if (u.is_admin && prompt(`Para confirmar a exclusão de um master, digite o e-mail dele:`)?.trim().toLowerCase() !== u.email.toLowerCase()) return toast.error('E-mail não confere. Nada foi excluído.')
    try {
      await acaoUsuarioMaster({ acao: 'excluir_usuario', usuario: u.id })
      toast.success('Usuário excluído e registrado na auditoria.')
      for (const k of ['admin-usuarios', 'admin-orgs', 'admin-resumo', 'admin-financeiro']) qc.invalidateQueries({ queryKey: [k] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários"
        descricao="Todas as pessoas cadastradas, último acesso e organizações."
        acoes={<Button onClick={() => setNovo(true)}><UserPlus className="mr-2 h-4 w-4" /> Novo usuário</Button>}
      />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por e-mail, nome ou organização" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {q.isLoading && <Carregando />}
      {q.error && <Aviso>{(q.error as Error).message}</Aviso>}
      <Card className="divide-y">
        {lista.map((u) => (
          <div key={u.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{u.nome || u.email}</span>
                {u.is_admin && (
                  <Badge cor="amarelo">
                    <ShieldCheck className="mr-1 h-3 w-3" /> master
                  </Badge>
                )}
                {!u.email_confirmado && <Badge cor="vermelho">e-mail não confirmado</Badge>}
              </div>
              <div className="truncate text-sm text-muted-foreground">{u.email}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {u.organizacoes.map((o) => (
                  <Badge key={o.id}>
                    <Link to={`/master/organizacoes/${o.id}`} className="hover:underline">{o.nome} · {o.papel}</Link>
                  </Badge>
                ))}
                {u.organizacoes.length === 0 && <span className="text-xs text-warning">Sem organização (não concluiu a configuração)</span>}
              </div>
            </div>
            <div className="text-xs text-muted-foreground lg:w-56 lg:text-right">
              <div>Cadastro: {formatarData(u.created_at)}</div>
              <div>Último acesso: {formatarDataHora(u.last_sign_in_at)}</div>
            </div>
            {u.id !== user?.id && (
              <div className="flex gap-2">
                <Button tamanho="sm" variante="contorno" onClick={() => alternarAdmin(u)}>
                  {u.is_admin ? 'Remover master' : 'Tornar master'}
                </Button>
                <Button tamanho="sm" variante="perigo" onClick={() => excluir(u)}>
                  <Trash2 className="mr-1 h-4 w-4" /> Excluir
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>
      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Novo usuário">
        {novo && <NovoUsuario aoFechar={() => setNovo(false)} />}
      </Modal>
    </>
  )
}
