import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarData } from '@/lib/format'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { Aviso, Badge, Button, CabecalhoPagina, Campo, Card, Carregando, Input, Modal, Select } from '@/components/ui'
import { NOME_PAPEL, type Convite, type Membro, type Papel } from '@/types/db'

function linkConvite(token: string) {
  return `${window.location.origin}/convite/${token}`
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto)
    toast.success('Link copiado.')
  } catch {
    toast.message(texto)
  }
}

export default function Equipe() {
  const { user } = useAuth()
  const { org, podeAdministrar } = useOrg()
  const qc = useQueryClient()
  const [convidar, setConvidar] = useState(false)
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<Exclude<Papel, 'owner'>>('membro')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [gerado, setGerado] = useState<string | null>(null)

  const membros = useQuery({
    queryKey: ['membros', org?.id],
    enabled: !!org,
    queryFn: async () => {
      const { data, error } = await supabase.from('memberships').select('org_id, user_id, papel, created_at').eq('org_id', org!.id).order('created_at')
      if (error) throw error
      const ids = data.map((m) => m.user_id)
      const { data: perfis } = await supabase.from('profiles').select('id, nome, email').in('id', ids)
      return data.map((m) => ({ ...m, profiles: perfis?.find((p) => p.id === m.user_id) ?? null })) as Membro[]
    },
  })

  const convites = useQuery({
    queryKey: ['convites', org?.id],
    enabled: !!org && podeAdministrar,
    queryFn: async () => {
      const { data, error } = await supabase.from('convites').select('*').eq('org_id', org!.id).is('aceito_em', null).order('created_at', { ascending: false })
      if (error) throw error
      return data as Convite[]
    },
  })

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['membros', org?.id] })
    qc.invalidateQueries({ queryKey: ['convites', org?.id] })
  }

  async function criarConvite(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    const { data, error } = await supabase
      .from('convites')
      .insert({ org_id: org!.id, email: email.trim().toLowerCase(), papel, criado_por: user!.id })
      .select('token')
      .single()
    setSalvando(false)
    if (error) return setErro(mensagemErro(error))
    setGerado(linkConvite(data.token))
    recarregar()
  }

  async function mudarPapel(m: Membro, novo: Papel) {
    const { error } = await supabase.from('memberships').update({ papel: novo }).eq('org_id', m.org_id).eq('user_id', m.user_id)
    if (error) return toast.error(mensagemErro(error))
    toast.success('Permissão atualizada.')
    recarregar()
  }

  async function remover(m: Membro) {
    if (!confirm(`Remover ${m.profiles?.nome || m.profiles?.email} da organização?`)) return
    const { error } = await supabase.from('memberships').delete().eq('org_id', m.org_id).eq('user_id', m.user_id)
    if (error) return toast.error(mensagemErro(error))
    recarregar()
  }

  async function cancelarConvite(c: Convite) {
    const { error } = await supabase.from('convites').delete().eq('id', c.id)
    if (error) return toast.error(mensagemErro(error))
    recarregar()
  }

  const fecharModal = () => {
    setConvidar(false)
    setGerado(null)
    setEmail('')
    setErro('')
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Equipe"
        descricao="Quem tem acesso a esta organização e o que cada pessoa pode fazer."
        acoes={
          podeAdministrar && (
            <Button onClick={() => setConvidar(true)}>
              <UserPlus className="h-4 w-4" /> Convidar
            </Button>
          )
        }
      />

      <Card className="divide-y">
        {membros.isLoading && <Carregando />}
        {membros.data?.map((m) => (
          <div key={m.user_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {m.profiles?.nome || m.profiles?.email}
                {m.user_id === user?.id && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
              </div>
              <div className="truncate text-sm text-muted-foreground">{m.profiles?.email}</div>
            </div>
            {podeAdministrar && m.papel !== 'owner' && m.user_id !== user?.id ? (
              <div className="flex items-center gap-2">
                <Select value={m.papel} onChange={(e) => mudarPapel(m, e.target.value as Papel)} className="h-9 w-44">
                  {(['admin', 'membro', 'leitor'] as Papel[]).map((p) => (
                    <option key={p} value={p}>
                      {NOME_PAPEL[p]}
                    </option>
                  ))}
                </Select>
                <button onClick={() => remover(m)} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remover">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Badge cor={m.papel === 'owner' ? 'azul' : 'neutro'}>{NOME_PAPEL[m.papel]}</Badge>
            )}
          </div>
        ))}
      </Card>

      {podeAdministrar && (convites.data?.length ?? 0) > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-semibold">Convites pendentes</h2>
          <Card className="divide-y">
            {convites.data!.map((c) => (
              <div key={c.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {NOME_PAPEL[c.papel]} · {new Date(c.expira_em) < new Date() ? 'expirado' : `expira em ${formatarData(c.expira_em)}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button tamanho="sm" variante="contorno" onClick={() => copiar(linkConvite(c.token))}>
                    <Copy className="h-3.5 w-3.5" /> Copiar link
                  </Button>
                  <Button tamanho="sm" variante="fantasma" onClick={() => cancelarConvite(c)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}

      <div className="mt-8 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
        <p><strong className="text-foreground">Administrador:</strong> gerencia empresas, equipe e agentes.</p>
        <p><strong className="text-foreground">Membro:</strong> cria e edita processos, documentos e contratos.</p>
        <p><strong className="text-foreground">Somente leitura:</strong> vê tudo, mas não altera nada.</p>
        <p><strong className="text-foreground">Proprietário:</strong> tudo, inclusive excluir a organização.</p>
      </div>

      <Modal aberto={convidar} aoFechar={fecharModal} titulo="Convidar pessoa">
        {gerado ? (
          <div className="space-y-4">
            <Aviso tipo="sucesso">Convite criado. Envie este link para {email} (por e-mail ou WhatsApp). Ele vale por 7 dias.</Aviso>
            <div className="flex gap-2">
              <Input readOnly value={gerado} onFocus={(e) => e.target.select()} />
              <Button variante="contorno" onClick={() => copiar(gerado)} aria-label="Copiar link">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button className="w-full" onClick={fecharModal}>
              Concluir
            </Button>
          </div>
        ) : (
          <form onSubmit={criarConvite} className="space-y-4">
            {erro && <Aviso>{erro}</Aviso>}
            <Campo rotulo="E-mail" htmlFor="email-convite" ajuda="A pessoa precisa entrar ou criar conta com este mesmo e-mail.">
              <Input id="email-convite" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Campo>
            <Campo rotulo="Permissão" htmlFor="papel-convite">
              <Select id="papel-convite" value={papel} onChange={(e) => setPapel(e.target.value as Exclude<Papel, 'owner'>)}>
                <option value="admin">{NOME_PAPEL.admin}</option>
                <option value="membro">{NOME_PAPEL.membro}</option>
                <option value="leitor">{NOME_PAPEL.leitor}</option>
              </Select>
            </Campo>
            <Button type="submit" className="w-full" carregando={salvando}>
              Gerar convite
            </Button>
          </form>
        )}
      </Modal>
    </>
  )
}
