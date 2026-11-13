import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/AuthProvider'
import { useOrg } from '@/providers/OrgProvider'
import { NAV_PRINCIPAL } from '@/lib/navegacao'
import { Badge, CabecalhoPagina, Card } from '@/components/ui'

function useContagem(tabela: string, orgId: string | undefined, empresaId: string | null, filtro?: (q: any) => any) {
  return useQuery({
    queryKey: ['contagem', tabela, orgId, empresaId],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase.from(tabela).select('id', { count: 'exact', head: true }).eq('org_id', orgId!)
      if (empresaId && tabela !== 'memberships') q = q.eq('empresa_id', empresaId)
      if (filtro) q = filtro(q)
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    },
  })
}

export default function Painel() {
  const { user } = useAuth()
  const { org, empresas, empresa } = useOrg()
  const empresaId = empresa?.id ?? null
  const processos = useContagem('processos', org?.id, empresaId, (q) => q.not('etapa', 'in', '(homologado,perdido,desistencia)'))
  const documentos = useContagem('documentos', org?.id, empresaId)
  const contratos = useContagem('contratos', org?.id, empresaId, (q) => q.eq('status', 'ativo'))
  const membros = useQuery({
    queryKey: ['contagem-membros', org?.id],
    enabled: !!org,
    queryFn: async () => {
      const { count } = await supabase.from('memberships').select('user_id', { count: 'exact', head: true }).eq('org_id', org!.id)
      return count ?? 0
    },
  })

  const nome = (user?.user_metadata?.nome as string | undefined)?.split(' ')[0]
  const temPalavras = empresas.some((e) => e.palavras_chave.length > 0)

  const passos = [
    { feito: true, texto: 'Criar sua conta e organização' },
    { feito: empresas.length > 0, texto: 'Cadastrar a empresa licitante', link: '/app/empresas' },
    { feito: temPalavras, texto: 'Definir o que a empresa vende (palavras-chave do Radar)', link: '/app/empresas' },
    { feito: (membros.data ?? 1) > 1, texto: 'Convidar sua equipe', link: '/app/equipe' },
  ]

  const indicadores = [
    { rotulo: 'Processos em andamento', valor: processos.data },
    { rotulo: 'Documentos cadastrados', valor: documentos.data },
    { rotulo: 'Contratos ativos', valor: contratos.data },
    { rotulo: org?.tipo === 'assessoria' ? 'Empresas clientes' : 'Empresas', valor: empresas.length },
  ]

  return (
    <>
      <CabecalhoPagina titulo={`Olá${nome ? `, ${nome}` : ''}!`} descricao={empresa ? `Visão de ${empresa.nome_fantasia || empresa.razao_social}` : 'Visão geral da organização'} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {indicadores.map((i) => (
          <Card key={i.rotulo} className="p-5">
            <div className="text-sm text-muted-foreground">{i.rotulo}</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{i.valor ?? '–'}</div>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-2">
          <h2 className="font-semibold">Primeiros passos</h2>
          <ul className="mt-4 space-y-3">
            {passos.map((p) => (
              <li key={p.texto} className="flex items-start gap-3 text-sm">
                {p.feito ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                {p.link && !p.feito ? (
                  <Link to={p.link} className="text-primary hover:underline">
                    {p.texto}
                  </Link>
                ) : (
                  <span className={p.feito ? 'text-muted-foreground line-through' : ''}>{p.texto}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6 lg:col-span-3">
          <h2 className="font-semibold">O que vem por aí</h2>
          <p className="mt-1 text-sm text-muted-foreground">Os módulos são liberados por fases. A base (contas, empresas, equipe e banco seguro) já está pronta.</p>
          <ul className="mt-4 divide-y">
            {NAV_PRINCIPAL.filter((n) => n.fase).map((n) => (
              <li key={n.rota}>
                <Link to={n.rota} className="flex items-center gap-3 py-3 text-sm hover:text-primary">
                  <n.icone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{n.rotulo}</span>
                  <Badge>{n.fase}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
