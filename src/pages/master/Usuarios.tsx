import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarData, formatarDataHora } from '@/lib/format'
import { useAuth } from '@/providers/AuthProvider'
import { Aviso, Badge, Button, CabecalhoPagina, Card, Carregando, Input } from '@/components/ui'

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

export default function Usuarios() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
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

  return (
    <>
      <CabecalhoPagina titulo="Usuários" descricao="Todas as pessoas cadastradas, último acesso e organizações." />
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
                    {o.nome} · {o.papel}
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
              <Button tamanho="sm" variante="contorno" onClick={() => alternarAdmin(u)}>
                {u.is_admin ? 'Remover master' : 'Tornar master'}
              </Button>
            )}
          </div>
        ))}
      </Card>
    </>
  )
}
