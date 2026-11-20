import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Building, ExternalLink, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, CabecalhoPagina, Card, Input, Select, Vazio } from '@/components/ui'
import { linkContratosPNCP, pesquisarFornecedores } from '@/lib/fornecedores'
import { formatarCnpj, formatarData, formatarMoeda } from '@/lib/format'

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

export default function AnaliseEmpresas() {
  const [termo, setTermo] = useState(''), [uf, setUf] = useState('')
  const [consulta, setConsulta] = useState<{ termo: string; uf: string } | null>(null), [pagina, setPagina] = useState(1)
  const q = useQuery({
    queryKey: ['fornecedores', consulta, pagina], enabled: !!consulta, retry: 1, staleTime: 60_000,
    queryFn: ({ signal }) => pesquisarFornecedores(consulta!.termo, consulta!.uf, pagina, signal),
  })
  const lista = q.data?.data ?? [], status = q.data?.status, totalPaginas = Math.max(1, q.data?.totalPaginas ?? 1)
  function pesquisar(e: FormEvent) {
    e.preventDefault()
    const nova = { termo: termo.trim(), uf }
    // Mesma pesquisa na primeira página: busca de novo em vez de mostrar o resultado guardado.
    if (consulta && pagina === 1 && consulta.termo === nova.termo && consulta.uf === nova.uf) { void q.refetch(); return }
    setPagina(1)
    setConsulta(nova)
  }
  return <>
    <CabecalhoPagina titulo="Análise de empresas" descricao="Veja quanto cada empresa já vendeu para o governo, segundo os contratos publicados no PNCP." />
    <Card className="mb-5 p-4">
      <form onSubmit={pesquisar} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" aria-label="Nome ou CNPJ da empresa" placeholder="Nome ou CNPJ. Ex.: papelaria, 11.222.333/0001-44" value={termo} onChange={e => setTermo(e.target.value)} maxLength={128} /></div>
        <Select aria-label="UF do órgão contratante" className="sm:w-48" value={uf} onChange={e => setUf(e.target.value)}><option value="">Brasil inteiro</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}</Select>
        <Button type="submit" carregando={q.isFetching}>Pesquisar</Button>
      </form>
    </Card>
    {!consulta ? <Vazio icone={Building} titulo="Conheça seus concorrentes" texto="Pesquise pelo nome ou CNPJ. Deixe em branco para ver as empresas que mais venderam." /> : <>
      {consulta.termo.replace(/\D/g, '').length === 14 && <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm">Ver vitórias, valores homologados e penalidades do CNPJ <strong>{consulta.termo}</strong> direto nas fontes oficiais.</p><Link to={`/app/analise-empresas/${consulta.termo.replace(/\D/g, '')}`} className="lf-degrade inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white hover:brightness-110"><BarChart3 className="h-4 w-4" />Analisar este CNPJ</Link></Card>}
      <div role="status" aria-live="polite" className="mb-4 space-y-1">
        {q.isFetching ? <p className="text-sm text-muted-foreground">Pesquisando...</p>
          : q.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{q.error.message}</p><Button tamanho="sm" variante="contorno" onClick={() => q.refetch()}>Tentar novamente</Button></div>
          : <p className="text-sm font-medium">{(q.data?.totalRegistros ?? 0).toLocaleString('pt-BR')} {q.data?.totalRegistros === 1 ? 'empresa encontrada' : 'empresas encontradas'}</p>}
        {status && <p className="text-xs text-muted-foreground">
          Considera contratos publicados nos últimos {status.dias_planejados} dias. {status.dias_coletados < status.dias_planejados && `A base ainda está sendo montada: ${status.dias_coletados} de ${status.dias_planejados} dias já incluídos.`}
          {status.ultima_coleta_em && ` Atualizada em ${new Date(status.ultima_coleta_em).toLocaleString('pt-BR')}.`}
        </p>}
      </div>
      {!q.isFetching && !q.isError && lista.length === 0 ? <Vazio titulo="Nenhuma empresa encontrada" texto="Confira o nome ou o CNPJ, ou tente sem filtro de UF." /> : <div className="space-y-3">{lista.map(f =>
        <Card key={f.cnpj} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><h2 className="break-words text-sm font-semibold sm:text-base"><Link to={`/app/analise-empresas/${f.cnpj}`} className="text-sky-700 hover:underline dark:text-sky-300">{f.nome}</Link></h2><p className="text-xs text-muted-foreground">CNPJ {formatarCnpj(f.cnpj)}</p></div>
            <div className="flex flex-wrap items-center gap-3"><Link to={`/app/analise-empresas/${f.cnpj}`} className="lf-degrade inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-white hover:brightness-110"><BarChart3 className="h-4 w-4" />Ver análise completa</Link><a className="inline-flex items-center gap-1 text-sm text-primary hover:underline" href={linkContratosPNCP(f.cnpj)} target="_blank" rel="noopener noreferrer">Contratos no PNCP <ExternalLink className="h-3.5 w-3.5" /></a></div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Contratos</dt><dd className="font-medium">{f.contratos.toLocaleString('pt-BR')}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Valor total</dt><dd className="font-medium">{formatarMoeda(f.valor_total)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Maior contrato</dt><dd>{formatarMoeda(f.maior_valor)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Período</dt><dd>{formatarData(f.primeiro)} a {formatarData(f.ultimo)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{f.ufs.length ? `Vendeu para órgãos de: ${f.ufs.join(', ')}` : 'UF dos órgãos não informada'}{f.orgao_ultimo && ` · Último órgão: ${f.orgao_ultimo}`}</p>
        </Card>)}</div>}
      {totalPaginas > 1 && <div className="mt-5 flex items-center justify-between gap-2"><Button variante="contorno" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button><span className="text-sm">{pagina} / {totalPaginas}</span><Button variante="contorno" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}>Próxima</Button></div>}
    </>}
  </>
}
