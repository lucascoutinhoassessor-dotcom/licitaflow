import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, EyeOff, FlaskConical, Gavel, Hourglass, MousePointerClick, SlidersHorizontal } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { CATALOGO_MODULOS, type EstadoModulo, type ModuloCatalogo } from '@/lib/modulos'
import { CATALOGO_FILTROS, CATALOGO_MODALIDADES } from '@/lib/filtrosLiberacao'
import { CATALOGO_RECURSOS } from '@/lib/recursos'
import { cn } from '@/lib/utils'
import { Aviso, Badge, Button, CabecalhoPagina, Card, Carregando, Input, Modal } from '@/components/ui'

interface Registro { estado: EstadoModulo; orgs_teste: string[]; updated_at: string }
const ESTADOS: { id: EstadoModulo; rotulo: string; ajuda: string; icone: typeof Eye; cor: string }[] = [
  { id: 'liberado', rotulo: 'Liberado', ajuda: 'Todos os clientes veem e usam', icone: Eye, cor: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  { id: 'teste', rotulo: 'Em teste', ajuda: 'Só as organizações escolhidas', icone: FlaskConical, cor: 'border-sky-500/60 bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  { id: 'em_breve', rotulo: 'Em breve', ajuda: 'Aparece no menu, sem abrir', icone: Hourglass, cor: 'border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-300' },
  { id: 'oculto', rotulo: 'Oculto', ajuda: 'Ninguém vê no menu', icone: EyeOff, cor: 'border-zinc-500/60 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300' },
]

/** Módulos do menu, botões de cada tela, filtros da tela Oportunidades e modalidades. */
const ITENS: ModuloCatalogo[] = [
  ...CATALOGO_MODULOS,
  ...CATALOGO_RECURSOS.map((r) => ({ id: r.id, rotulo: r.rotulo, descricao: r.descricao, grupo: `Botões · ${r.tela}`, icone: MousePointerClick })),
  ...CATALOGO_FILTROS.map((f) => ({ id: f.id, rotulo: f.rotulo, descricao: f.descricao, grupo: 'Filtros de Oportunidades', icone: SlidersHorizontal })),
  ...CATALOGO_MODALIDADES.map((m) => ({ id: m.id, rotulo: m.rotulo, descricao: 'Editais desta modalidade em Oportunidades. "Em teste" libera só para os clientes escolhidos (pacotes).', grupo: 'Modalidades de licitação', icone: Gavel })),
]

export default function Modulos() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin-modulos'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_modulos'); if (error) throw error; return (data ?? {}) as Record<string, Registro>
  }, retry: false })
  const orgs = useQuery({ queryKey: ['admin-orgs'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_organizacoes'); if (error) throw error; return data as { id: string; nome: string; dono_email: string | null }[]
  } })
  const [ocupado, setOcupado] = useState('')
  const [teste, setTeste] = useState<{ modulo: ModuloCatalogo; orgs: string[] } | null>(null)
  const [busca, setBusca] = useState('')

  const grupos = useMemo(() => {
    const m = new Map<string, ModuloCatalogo[]>()
    for (const mod of ITENS) m.set(mod.grupo, [...(m.get(mod.grupo) ?? []), mod])
    return [...m.entries()]
  }, [])
  const estado = (id: string): EstadoModulo => q.data?.[id]?.estado ?? 'oculto'
  const contagem = (e: EstadoModulo) => ITENS.filter((m) => estado(m.id) === e).length

  async function salvar(mod: ModuloCatalogo, novo: EstadoModulo, orgsTeste?: string[]) {
    const atual = estado(mod.id)
    if (novo === 'teste' && !orgsTeste) { setTeste({ modulo: mod, orgs: q.data?.[mod.id]?.orgs_teste ?? [] }); return }
    if (novo === 'liberado' && atual !== 'liberado' && !confirm(`Liberar "${mod.rotulo}" para todos os clientes agora?`)) return
    if (novo === 'oculto' && atual === 'liberado' && !confirm(`Ocultar "${mod.rotulo}"? Os clientes deixam de ver e de abrir este módulo (os dados continuam guardados).`)) return
    setOcupado(mod.id)
    try {
      const { error } = await supabase.rpc('admin_salvar_modulo', { p_id: mod.id, p_estado: novo, p_orgs: orgsTeste ?? q.data?.[mod.id]?.orgs_teste ?? [] })
      if (error) throw error
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-modulos'] }), qc.invalidateQueries({ queryKey: ['modulos-org'] })])
      toast.success(`${mod.rotulo}: ${ESTADOS.find((e) => e.id === novo)!.rotulo.toLowerCase()}.`)
      setTeste(null)
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }

  const nomeOrg = (id: string) => orgs.data?.find((o) => o.id === id)?.nome ?? 'Organização removida'
  const orgsFiltradas = (orgs.data ?? []).filter((o) => !busca.trim() || `${o.nome} ${o.dono_email ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase()))

  return <>
    <CabecalhoPagina titulo="Funcionalidades" descricao="Escolha o que cada cliente vê no LicitaForce. Libere um módulo, um botão ou um filtro para todos quando estiver pronto, ou teste antes com organizações escolhidas (inclusive a sua)." />
    {q.isLoading && <Carregando />}
    {q.isError && <Aviso>{mensagemErro(q.error)} — aplique a migração de funcionalidades.</Aviso>}
    {q.data && <>
      <div className="mb-5 flex flex-wrap gap-2">{ESTADOS.map((e) => <Badge key={e.id} cor={e.id === 'liberado' ? 'verde' : e.id === 'teste' ? 'azul' : e.id === 'em_breve' ? 'amarelo' : 'neutro'}>{e.rotulo}: {contagem(e.id)}</Badge>)}</div>
      <div className="space-y-6">{grupos.map(([grupo, mods]) => <section key={grupo}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{grupo}</h2>
        <Card className="divide-y">{mods.map((mod) => {
          const atual = estado(mod.id)
          const orgsTeste = q.data?.[mod.id]?.orgs_teste ?? []
          return <div key={mod.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><mod.icone className="h-4 w-4" /></div>
              <div className="min-w-0">
                <p className="font-medium">{mod.rotulo}{!q.data?.[mod.id] && <Badge cor="azul" className="ml-2">Novo</Badge>}</p>
                {mod.descricao && <p className="line-clamp-2 text-sm text-muted-foreground">{mod.descricao}</p>}
                {atual === 'teste' && <button className="mt-1 text-left text-xs text-sky-600 hover:underline dark:text-sky-300" onClick={() => setTeste({ modulo: mod, orgs: orgsTeste })}>
                  Em teste com {orgsTeste.length ? orgsTeste.map(nomeOrg).join(', ') : 'nenhuma organização'} · alterar</button>}
              </div>
            </div>
            <div role="radiogroup" aria-label={`Estado de ${mod.rotulo}`} className="grid shrink-0 grid-cols-2 gap-1.5 sm:grid-cols-4">
              {ESTADOS.map((e) => <button key={e.id} type="button" role="radio" aria-checked={atual === e.id} title={e.ajuda} disabled={ocupado === mod.id}
                onClick={() => (e.id !== atual || e.id === 'teste') && salvar(mod, e.id)}
                className={cn('inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors disabled:opacity-50',
                  atual === e.id ? e.cor : 'border-border text-muted-foreground hover:bg-muted')}>
                <e.icone className="h-3.5 w-3.5" />{e.rotulo}
              </button>)}
            </div>
          </div>
        })}</Card>
      </section>)}</div>
      <p className="mt-6 text-xs text-muted-foreground">Módulos novos chegam ocultos: só aparecem para os clientes quando você liberar aqui. Painel, empresas, equipe, plano, cobranças, avisos, suporte e configurações ficam sempre disponíveis. Ocultar um módulo esconde o menu e bloqueia a abertura pelo endereço; os dados do cliente não são apagados. Botão oculto some da tela (em breve aparece desativado). Filtro oculto some da busca e não é aplicado; em breve aparece desativado. Modalidade oculta some da escolha e os editais dela não aparecem para o cliente.</p>
    </>}

    <Modal aberto={!!teste} aoFechar={() => { if (!ocupado) setTeste(null) }} titulo={`Testar "${teste?.modulo.rotulo ?? ''}" com quem?`}>
      {teste && <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Só as organizações marcadas verão o módulo. Para testar você mesmo, marque a organização da sua conta de cliente.</p>
        <Input placeholder="Buscar organização ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar organização" />
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
          {orgs.isLoading && <Carregando />}
          {orgsFiltradas.map((o) => <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 hover:bg-muted">
            <input type="checkbox" checked={teste.orgs.includes(o.id)} onChange={(e) => setTeste({ ...teste, orgs: e.target.checked ? [...teste.orgs, o.id] : teste.orgs.filter((x) => x !== o.id) })} />
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{o.nome}</span><span className="block truncate text-xs text-muted-foreground">{o.dono_email}</span></span>
          </label>)}
          {!orgs.isLoading && !orgsFiltradas.length && <p className="p-2 text-sm text-muted-foreground">Nenhuma organização encontrada.</p>}
        </div>
        <Button carregando={ocupado === teste.modulo.id} disabled={!teste.orgs.length} onClick={() => salvar(teste.modulo, 'teste', teste.orgs)}>Colocar em teste com {teste.orgs.length} organização(ões)</Button>
      </div>}
    </Modal>
  </>
}
