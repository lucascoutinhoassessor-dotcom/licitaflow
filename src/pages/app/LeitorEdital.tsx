import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, ExternalLink, FileSearch, FileText, ListChecks, ShieldAlert, Users } from 'lucide-react'
import { Aviso, Badge, Button, Card, Carregando, Vazio } from '@/components/ui'
import { useOrg } from '@/providers/OrgProvider'
import { formatarDataHora } from '@/lib/format'
import {
  NOME_CATEGORIA, NOME_TEMA, leituraGuardada, lerEditalIA,
  type CategoriaHabilitacao, type DocumentoLido, type LeituraEdital, type RespostaLeitor, type TrechoEdital,
} from '@/lib/leitor'

function Trecho({ t, documentos }: { t: TrechoEdital; documentos: DocumentoLido[] }) {
  const doc = documentos.find((d) => d.id === t.documento)
  return (
    <div className="mt-2 rounded-md border-l-4 border-primary/40 bg-muted/40 px-3 py-2 text-xs">
      <p className="italic text-muted-foreground">“{t.texto}”</p>
      <p className="mt-1 flex flex-wrap items-center gap-2">
        {doc ? <a href={doc.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">{doc.titulo}</a> : <span>{t.documento}</span>}
        {t.pagina != null && <span className="text-muted-foreground">página {t.pagina}</span>}
        {t.conferido === true && <Badge cor="verde">Conferido no edital</Badge>}
        {t.conferido === false && <Badge cor="amarelo" title="O trecho citado não foi encontrado igual no texto do documento. Confira no edital.">Confira no edital</Badge>}
        {t.conferido === null && <Badge title="PDF escaneado: o trecho foi lido da imagem e não pôde ser conferido automaticamente.">Lido da imagem</Badge>}
      </p>
    </div>
  )
}

function Secao({ icone: Icone, titulo, vazio, children, contagem }: { icone: typeof ListChecks; titulo: string; vazio: string; contagem: number; children: ReactNode }) {
  return (
    <Card className="mb-4 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold"><Icone className="h-5 w-5 text-primary" />{titulo} <Badge>{contagem}</Badge></h2>
      {contagem ? children : <p className="text-sm text-muted-foreground">{vazio}</p>}
    </Card>
  )
}

function Item({ titulo, detalhe, extra, trecho, documentos }: { titulo: string; detalhe?: string; extra?: ReactNode; trecho: TrechoEdital; documentos: DocumentoLido[] }) {
  const [feito, setFeito] = useState(false)
  return (
    <li className="py-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={feito} onChange={(e) => setFeito(e.target.checked)} />
        <span className="min-w-0 flex-1">
          <span className={`font-medium ${feito ? 'text-muted-foreground line-through' : ''}`}>{titulo}</span> {extra}
          {detalhe && <span className="mt-0.5 block text-sm text-muted-foreground">{detalhe}</span>}
        </span>
      </label>
      <div className="pl-7"><Trecho t={trecho} documentos={documentos} /></div>
    </li>
  )
}

const COR_RISCO = { alto: 'vermelho', medio: 'amarelo', baixo: 'neutro' } as const
const NOME_RISCO = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' }

function Resultado({ leitura }: { leitura: LeituraEdital }) {
  const r = leitura.resultado
  const docs = leitura.documentos
  const categorias = Object.keys(NOME_CATEGORIA) as CategoriaHabilitacao[]
  return (
    <>
      <Card className="mb-4 p-5">
        <h2 className="mb-2 text-base font-semibold">Resumo</h2>
        <p className="whitespace-pre-wrap text-sm">{r.resumo}</p>
        <div className="mt-4 border-t pt-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Documentos lidos</p>
          <ul className="space-y-1 text-sm">
            {docs.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{d.titulo}</a>
                {d.lido ? <Badge cor="verde">{d.escaneado ? 'Lido da imagem' : 'Lido'}{d.paginas ? ` · ${d.paginas} pág.` : ''}</Badge> : <Badge cor="amarelo">Não lido</Badge>}
                {d.aviso && <span className="text-xs text-muted-foreground">{d.aviso}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Leitura feita por IA em {formatarDataHora(leitura.created_at)}. Confira sempre no edital antes de enviar a proposta.</p>
        </div>
      </Card>

      <Secao icone={ShieldAlert} titulo="Riscos e pontos de atenção" contagem={r.riscos.length} vazio="Nenhum risco destacado.">
        <ul className="divide-y">
          {[...r.riscos].sort((a, b) => ['alto', 'medio', 'baixo'].indexOf(a.nivel) - ['alto', 'medio', 'baixo'].indexOf(b.nivel)).map((x, i) => (
            <Item key={i} titulo={x.titulo} detalhe={x.detalhe} extra={<Badge cor={COR_RISCO[x.nivel]}>{NOME_RISCO[x.nivel]}</Badge>} trecho={x.trecho} documentos={docs} />
          ))}
        </ul>
      </Secao>

      <Secao icone={CalendarClock} titulo="Datas e prazos" contagem={r.datas.length} vazio="Nenhuma data encontrada nos documentos.">
        <ul className="divide-y">{r.datas.map((x, i) => <Item key={i} titulo={x.evento} extra={<Badge cor="azul">{x.data}</Badge>} trecho={x.trecho} documentos={docs} />)}</ul>
      </Secao>

      <Secao icone={ListChecks} titulo="Documentos de habilitação" contagem={r.habilitacao.length} vazio="Nenhuma exigência de habilitação encontrada.">
        {categorias.filter((c) => r.habilitacao.some((h) => h.categoria === c)).map((c) => (
          <div key={c} className="mb-2">
            <p className="mt-2 text-xs font-semibold uppercase text-muted-foreground">{NOME_CATEGORIA[c]}</p>
            <ul className="divide-y">{r.habilitacao.filter((h) => h.categoria === c).map((x, i) => <Item key={i} titulo={x.exigencia} detalhe={x.detalhe} trecho={x.trecho} documentos={docs} />)}</ul>
          </div>
        ))}
      </Secao>

      <Secao icone={FileSearch} titulo="Proposta" contagem={r.proposta.length} vazio="Nenhuma exigência específica para a proposta.">
        <ul className="divide-y">{r.proposta.map((x, i) => <Item key={i} titulo={x.exigencia} detalhe={x.detalhe} trecho={x.trecho} documentos={docs} />)}</ul>
      </Secao>

      <Secao icone={Users} titulo="Condições de participação" contagem={r.participacao.length} vazio="Nenhuma condição encontrada.">
        <ul className="divide-y">{r.participacao.map((x, i) => <Item key={i} titulo={NOME_TEMA[x.tema] ?? x.tema} detalhe={x.situacao} trecho={x.trecho} documentos={docs} />)}</ul>
      </Secao>
    </>
  )
}

export default function LeitorEdital() {
  const { cnpj = '', ano = '', seq = '' } = useParams()
  const { org } = useOrg()
  const qc = useQueryClient()
  const valido = /^\d{14}$/.test(cnpj) && /^\d{4}$/.test(ano) && /^\d{1,9}$/.test(seq)
  const controle = `${cnpj}-1-${seq.padStart(6, '0')}/${ano}`
  const chave = ['leitor-edital', org?.id, controle]
  const q = useQuery({ queryKey: chave, enabled: valido && !!org, queryFn: ({ signal }) => leituraGuardada(org!.id, controle, signal), retry: 1, staleTime: 60_000 })
  const ler = useMutation({
    mutationFn: () => lerEditalIA(org!.id, controle),
    onSuccess: (r) => qc.setQueryData<RespostaLeitor>(chave, r),
  })

  const voltar = <Link to="/app/agentes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Agentes de IA</Link>
  if (!valido) return <Vazio titulo="Edital não encontrado" texto="O endereço deste edital está incompleto." acao={<Link to="/app/agentes"><Button variante="contorno">Voltar</Button></Link>} />
  if (q.isLoading) return <Carregando />
  if (q.isError) return <>{voltar}<Vazio titulo="Leitor indisponível" texto={(q.error as Error).message} acao={<Button variante="contorno" onClick={() => q.refetch()}>Tentar novamente</Button>} /></>

  const leitura = q.data?.leitura
  const uso = q.data?.uso
  const erroDocs = (ler.error as (Error & { documentos?: DocumentoLido[] }) | null)?.documentos
  return (
    <>
      {voltar}
      <Card className="mb-5 p-5 text-center sm:p-6">
        <p className="flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground"><FileSearch className="h-4 w-4" />Leitor de editais <Badge cor="azul">Beta</Badge></p>
        <h1 className="mt-1 text-lg font-bold sm:text-xl">Compra {controle}</h1>
        {leitura?.objeto && <p className="mx-auto mt-2 max-w-3xl text-sm">{leitura.objeto}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link to={`/app/oportunidades/${cnpj}/${ano}/${seq}`}><Button variante="contorno" tamanho="sm">Ver edital</Button></Link>
          <a href={`https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`} target="_blank" rel="noopener noreferrer"><Button variante="contorno" tamanho="sm"><ExternalLink className="h-4 w-4" />Arquivos no PNCP</Button></a>
        </div>
      </Card>

      {!leitura && (
        <Card className="mb-5 flex flex-col items-center gap-3 p-6 text-center">
          {ler.isPending ? (
            <>
              <Carregando texto="Lendo o edital e os anexos…" />
              <p className="max-w-md text-sm text-muted-foreground">Isso costuma levar de 1 a 3 minutos. Pode deixar esta página aberta.</p>
            </>
          ) : (
            <>
              <p className="max-w-lg text-sm text-muted-foreground">
                A IA vai abrir o edital, o termo de referência e os anexos publicados no PNCP e montar o checklist com o trecho de origem de cada item.
              </p>
              {uso?.limite === 0 ? (
                <Aviso tipo="info">O seu plano não inclui leituras de editais com IA. <Link to="/app/plano" className="font-semibold underline">Ver planos</Link> ou fale com o atendimento.</Aviso>
              ) : uso && uso.limite !== null && uso.usadas >= uso.limite ? (
                <Aviso tipo="info">Você já usou as {uso.limite} leituras novas deste mês. O limite renova no dia 1º. Para ler mais agora, <Link to="/app/plano" className="font-semibold underline">mude de plano</Link> ou fale com o atendimento.</Aviso>
              ) : (
                <>
                  <Button onClick={() => ler.mutate()}><FileSearch className="h-4 w-4" />Ler edital com IA</Button>
                  {uso && <p className="text-xs text-muted-foreground">{uso.limite === null ? `Leituras novas neste mês: ${uso.usadas}.` : `Leituras novas neste mês: ${uso.usadas} de ${uso.limite}.`} Editais que já foram lidos abrem sem contar.</p>}
                </>
              )}
            </>
          )}
          {ler.isError && (
            <div className="w-full max-w-lg text-left">
              <Aviso><span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{(ler.error as Error).message}</span></Aviso>
              {erroDocs?.length ? <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{erroDocs.map((d, i) => <li key={i}>{d.titulo}: {d.aviso ?? (d.lido ? 'lido' : 'não lido')}</li>)}</ul> : null}
            </div>
          )}
        </Card>
      )}

      {ler.data?.reaproveitada && <div className="mb-4"><Aviso tipo="info"><span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Este edital já tinha sido lido. A leitura abriu sem contar no seu limite.</span></Aviso></div>}
      {leitura && <Resultado leitura={leitura} />}
    </>
  )
}
