import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Gauge, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { classificar, nomeBusca, type CapagEnte } from '@/lib/termometro'
import { useTermometroLiberado } from '@/hooks/useTermometro'
import { CartaoTermometro } from '@/components/Termometro'
import { Aviso, Badge, Card, Carregando, Input } from '@/components/ui'

/** Consulta da nota CAPAG de qualquer município ou estado e do prazo de pagamento de qualquer unidade federal. */
export default function TermometroPagamento() {
  const liberado = useTermometroLiberado()
  const [termo, setTermo] = useState('')
  const [escolhido, setEscolhido] = useState<string | null>(null) // 'M:…'/'E:…' (CAPAG) ou 'F:<UG>' (federal)
  const busca = nomeBusca(termo)
  const lista = useQuery({ queryKey: ['capag-busca', busca], enabled: busca.length >= 3, staleTime: 600_000, queryFn: async () => {
    const { data, error } = await supabase.from('capag').select('chave, esfera, nome, uf, nota, posicao')
      .ilike('nome_busca', `%${busca.replace(/[%_]/g, '')}%`).order('esfera', { ascending: false }).order('nome').limit(30)
    if (error) throw error
    return data as Pick<CapagEnte, 'chave' | 'esfera' | 'nome' | 'uf' | 'nota' | 'posicao'>[]
  } })
  const federais = useQuery({ queryKey: ['federal-busca', busca], enabled: liberado && busca.length >= 3, staleTime: 600_000, queryFn: async () => {
    const { data, error } = await supabase.from('termometro_federal_ug').select('ug, nome, orgao')
      .ilike('nome_busca', `%${busca.replace(/[%_]/g, '')}%`).order('nome').limit(20)
    if (error) throw error
    return data as { ug: string; nome: string; orgao: string | null }[]
  } })
  const resumo = useQuery({ queryKey: ['capag-resumo'], staleTime: 3_600_000, queryFn: async () => {
    const { data, error } = await supabase.from('capag').select('posicao, esfera').order('atualizado_em', { ascending: false }).limit(1)
    if (error) throw error
    return data?.[0] ?? null
  } })

  return (
    <>
      <Link to="/app/agentes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Agentes de IA</Link>
      <Card className="mb-5 p-5 sm:p-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><Gauge className="h-6 w-6 text-primary" />Termômetro de Pagamento <Badge cor="azul">Beta</Badge></h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Mostra a saúde financeira do órgão comprador pela nota CAPAG (Capacidade de Pagamento) que o Tesouro Nacional dá a
          estados e municípios. Nos órgãos federais, mede quantos dias cada unidade leva para pagar o fornecedor, pelos dados do
          Portal da Transparência. Aparece sozinho na página do edital, no Leitor, no Radar e no processo. Aqui você consulta qualquer um.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />A+ e A: boa saúde financeira</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />B+ e B: regular</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />C e D: risco de atraso</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-500" />Federal: dias até o pagamento</span>
        </div>
        {resumo.data === null && <div className="mt-4"><Aviso tipo="info">As notas do Tesouro ainda estão sendo carregadas. Volte em alguns minutos.</Aviso></div>}
        {!liberado && <div className="mt-4"><Aviso tipo="info">O Termômetro não está liberado para a sua conta.</Aviso></div>}
      </Card>

      {liberado && (
        <>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" value={termo} onChange={(e) => { setTermo(e.target.value); setEscolhido(null) }} placeholder="Município, estado ou unidade federal (ex.: Carazinho, Minas Gerais, Instituto Federal Baiano)" />
          </div>
          {escolhido ? (
            <>
              <button type="button" className="mb-3 text-sm text-primary hover:underline" onClick={() => setEscolhido(null)}>← Voltar aos resultados</button>
              <CartaoTermometro alvo={escolhido.startsWith('F:') ? { tipo: 'federal', ug: escolhido.slice(2) } : { tipo: 'chave', chave: escolhido }} />
            </>
          ) : busca.length < 3 ? null : lista.isLoading || federais.isLoading ? <Carregando /> : !lista.data?.length && !federais.data?.length ? (
            <Card className="p-5 text-sm text-muted-foreground">Nenhum município, estado ou unidade federal encontrado com esse nome.</Card>
          ) : (
            <Card className="divide-y">
              {federais.data?.map((u) => (
                <button key={u.ug} type="button" onClick={() => setEscolhido(`F:${u.ug}`)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/40">
                  <span className="text-sm"><span className="font-medium">{u.nome}</span> <span className="text-muted-foreground">· UG {u.ug}{u.orgao ? ` · ${u.orgao}` : ''}</span></span>
                  <Badge cor="azul">Federal</Badge>
                </button>
              ))}
              {lista.data?.map((e) => {
                const c = classificar(e.nota)
                return (
                  <button key={e.chave} type="button" onClick={() => setEscolhido(e.chave)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/40">
                    <span className="text-sm"><span className="font-medium">{e.nome}</span> <span className="text-muted-foreground">· {e.esfera === 'E' ? 'Estado' : e.uf}</span></span>
                    <Badge cor={c.cor === 'azul' ? 'azul' : c.cor}>{e.nota ?? '—'} · {c.rotulo}</Badge>
                  </button>
                )
              })}
            </Card>
          )}
        </>
      )}
    </>
  )
}
