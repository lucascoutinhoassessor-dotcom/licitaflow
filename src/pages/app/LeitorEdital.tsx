import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, ClipboardCopy, ExternalLink, FileSearch, FileText, Gavel, Lightbulb, ListChecks, ShieldAlert, Users,
} from 'lucide-react'
import { Aviso, Badge, Button, Card, Carregando, Vazio } from '@/components/ui'
import { useOrg } from '@/providers/OrgProvider'
import { CartaoTermometro } from '@/components/Termometro'
import { alvoPeloNome, alvoPeloPncp } from '@/lib/termometro'
import { formatarDataHora, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AVALIACAO, NOME_CATEGORIA, NOME_ME_EPP, NOME_SRP, NOME_TEMA, NOME_TIPO_DATA, buscarFicha, dataPncp, leituraGuardada, lerEditalIA, prazoImpugnacao, textoChecklist,
  type CategoriaHabilitacao, type DocumentoLido, type FichaCompra, type LeituraEdital, type RespostaLeitor, type TrechoEdital,
} from '@/lib/leitor'

/** Itens marcados como conferidos ficam guardados neste aparelho, por organização e edital. */
function useConferidos(chave: string) {
  const ler = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(chave) ?? '[]')) } catch { return new Set<string>() } }
  const [feitos, setFeitos] = useState<Set<string>>(ler)
  useEffect(() => { setFeitos(ler()) }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps
  const alternar = (id: string, v: boolean) => setFeitos((atual) => {
    const novo = new Set(atual)
    if (v) novo.add(id); else novo.delete(id)
    try { localStorage.setItem(chave, JSON.stringify([...novo])) } catch { /* sem armazenamento: só nesta tela */ }
    return novo
  })
  return { feitos, alternar }
}

function Trecho({ t, documentos }: { t: TrechoEdital; documentos: DocumentoLido[] }) {
  const doc = documentos.find((d) => d.id === t.documento)
  return (
    <details className="group mt-1.5 text-xs">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground">
        <FileText className="h-3.5 w-3.5" />
        Ver no edital{doc ? ` · ${doc.titulo.slice(0, 50)}` : ''}{t.pagina != null ? ` · pág. ${t.pagina}` : ''}
        {t.conferido === true && <Badge cor="verde">Conferido</Badge>}
        {t.conferido === false && <Badge cor="amarelo" title="O trecho não foi encontrado igual no texto do documento.">Confira</Badge>}
        {t.conferido === null && <Badge title="PDF escaneado: lido da imagem, sem conferência automática.">Da imagem</Badge>}
      </summary>
      <div className="mt-1.5 rounded-md border-l-4 border-primary/40 bg-muted/40 px-3 py-2">
        <p className="italic text-muted-foreground">“{t.texto}”</p>
        {doc && <a href={doc.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline">Abrir documento <ExternalLink className="h-3 w-3" /></a>}
      </div>
    </details>
  )
}

function Secao({ icone: Icone, titulo, descricao, vazio, children, ids, feitos }: { icone: typeof ListChecks; titulo: string; descricao?: string; vazio: string; children: ReactNode; ids: string[]; feitos: Set<string> }) {
  const ok = ids.filter((i) => feitos.has(i)).length
  return (
    <Card className="mb-4 p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Icone className="h-5 w-5 text-primary" />{titulo}</h2>
        {ids.length > 0 && <span className={cn('text-xs font-medium', ok === ids.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>{ok} de {ids.length} conferidos</span>}
      </div>
      {descricao && <p className="mb-2 text-xs text-muted-foreground">{descricao}</p>}
      {ids.length ? children : <p className="text-sm text-muted-foreground">{vazio}</p>}
    </Card>
  )
}

function Item({ id, titulo, detalhe, extra, orientacao, fundamento, trecho, documentos, feitos, alternar }: {
  id: string; titulo: string; detalhe?: string; extra?: ReactNode; orientacao?: string; fundamento?: string; trecho: TrechoEdital
  documentos: DocumentoLido[]; feitos: Set<string>; alternar: (id: string, v: boolean) => void
}) {
  const feito = feitos.has(id)
  return (
    <li className="py-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={feito} onChange={(e) => alternar(id, e.target.checked)} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><span className={cn('font-medium', feito && 'text-muted-foreground line-through')}>{titulo}</span>{extra}</span>
          {detalhe && <span className="mt-0.5 block text-sm text-muted-foreground">{detalhe}</span>}
        </span>
      </label>
      <div className="pl-7">
        {orientacao && (
          <div className="mt-2 flex gap-2 rounded-md bg-muted/50 p-2.5 text-sm">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p><span className="font-medium">O que fazer: </span>{orientacao}{fundamento && <span className="block text-xs text-muted-foreground">Fundamento: {fundamento}</span>}</p>
          </div>
        )}
        <Trecho t={trecho} documentos={documentos} />
      </div>
    </li>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor?: ReactNode }) {
  if (valor === null || valor === undefined || valor === '' || valor === 'Não informado') return null
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className="mt-0.5 text-sm font-medium">{valor}</dd></div>
}

/** Cabeçalho do relatório: dados oficiais do PNCP + características lidas no edital. */
function Ficha({ f, controle, leitura }: { f: FichaCompra | null; controle: string; leitura?: LeituraEdital | null }) {
  const c = leitura?.resultado.caracteristicas
  const prazo = prazoImpugnacao(f?.encerramento)
  const vencido = prazo ? prazo.getTime() < new Date(new Date().toDateString()).getTime() : false
  const [cnpj, resto] = controle.split('-1-')
  const [seq, ano] = (resto ?? '').split('/')
  return (
    <Card className="mb-5 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><FileSearch className="h-4 w-4" />Leitor de editais · relatório <Badge cor="azul">Beta</Badge></p>
      <h1 className="mt-2 text-xl font-bold leading-tight sm:text-2xl">{f ? [f.modalidade?.replace(/\s*-\s*/, ' '), f.numero && `nº ${f.numero}`].filter(Boolean).join(' ') : `Compra ${controle}`}</h1>
      {f?.orgao && <p className="mt-1 text-sm font-medium text-muted-foreground">{f.orgao}{f.municipio ? ` · ${f.municipio}` : ''}{f.uf ? `/${f.uf}` : ''}</p>}
      {(f?.objeto ?? leitura?.objeto) && <p className="mt-3 text-sm">{f?.objeto ?? leitura?.objeto}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 sm:grid-cols-3 lg:grid-cols-4">
        <Dado rotulo="Valor estimado" valor={f?.valor_estimado ? formatarMoeda(f.valor_estimado) : f ? 'Sigiloso ou não divulgado' : null} />
        <Dado rotulo="Prazo final das propostas" valor={dataPncp(f?.encerramento)} />
        <Dado rotulo="Critério de julgamento" valor={c?.criterio_julgamento} />
        <Dado rotulo="Modo de disputa" valor={c?.modo_disputa && c.modo_disputa !== 'Não informado' ? c.modo_disputa : f?.modo_disputa} />
        <Dado rotulo="Participação" valor={c ? NOME_ME_EPP[c.me_epp] : null} />
        <Dado rotulo="Registro de preços" valor={c ? NOME_SRP[c.registro_precos] : f?.srp != null ? (f.srp ? 'Sim' : 'Não') : null} />
        <Dado rotulo="Entrega / execução" valor={c?.prazo_entrega} />
        <Dado rotulo="Local" valor={c?.local_entrega} />
        <Dado rotulo="Pagamento" valor={c?.pagamento} />
        <Dado rotulo="Vigência" valor={c?.vigencia} />
        <Dado rotulo="Garantia contratual" valor={c?.garantia_contratual} />
        <Dado rotulo="Situação no PNCP" valor={f?.situacao} />
      </dl>
      {prazo && (
        <div className={cn('mt-4 flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between', vencido ? 'border-muted' : 'border-amber-500/40 bg-amber-500/5')}>
          <p className="flex items-start gap-2"><Gavel className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span><span className="font-medium">Esclarecimentos e impugnações {vencido ? 'eram aceitos' : 'até'} {prazo.toLocaleDateString('pt-BR')}</span>
              <span className="block text-xs text-muted-foreground">3 dias úteis antes da abertura (Lei 14.133, art. 164), contando feriados nacionais. Confira o horário no edital.</span></span>
          </p>
          {!vencido && <Link to="/app/juridico/impugnacao" className="shrink-0"><Button tamanho="sm" variante="contorno"><Gavel className="h-4 w-4" />Preparar minuta</Button></Link>}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {cnpj && seq && ano && <Link to={`/app/oportunidades/${cnpj}/${ano}/${Number(seq)}`}><Button variante="contorno" tamanho="sm">Ver edital no app</Button></Link>}
        {cnpj && seq && ano && <a href={`https://pncp.gov.br/app/editais/${cnpj}/${ano}/${Number(seq)}`} target="_blank" rel="noopener noreferrer"><Button variante="contorno" tamanho="sm"><ExternalLink className="h-4 w-4" />Arquivos no PNCP</Button></a>}
        {f?.link_origem && <a href={f.link_origem} target="_blank" rel="noopener noreferrer"><Button variante="contorno" tamanho="sm"><ExternalLink className="h-4 w-4" />Portal de origem</Button></a>}
      </div>
    </Card>
  )
}

const COR_RISCO = { alto: 'vermelho', medio: 'amarelo', baixo: 'neutro' } as const
const NOME_RISCO = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo' }
const COR_AVALIACAO = {
  favoravel: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
  atencao: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300',
  critico: 'border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300',
}

function Resultado({ leitura, chaveConferidos }: { leitura: LeituraEdital; chaveConferidos: string }) {
  const r = leitura.resultado
  const docs = leitura.documentos
  const { feitos, alternar } = useConferidos(chaveConferidos)
  const categorias = Object.keys(NOME_CATEGORIA) as CategoriaHabilitacao[]
  const riscos = useMemo(() => r.riscos.map((x, i) => ({ ...x, id: `riscos-${i}` })).sort((a, b) => ['alto', 'medio', 'baixo'].indexOf(a.nivel) - ['alto', 'medio', 'baixo'].indexOf(b.nivel)), [r.riscos])
  const ids = (k: 'datas' | 'habilitacao' | 'proposta' | 'participacao' | 'riscos') => r[k].map((_, i) => `${k}-${i}`)
  const total = ['datas', 'habilitacao', 'proposta', 'riscos'].flatMap((k) => ids(k as 'datas')).length
  const conferidos = ['datas', 'habilitacao', 'proposta', 'riscos'].flatMap((k) => ids(k as 'datas')).filter((i) => feitos.has(i)).length
  const props = { documentos: docs, feitos, alternar }
  const altos = r.riscos.filter((x) => x.nivel === 'alto').length

  async function copiar() {
    try { await navigator.clipboard.writeText(textoChecklist(r, feitos)); toast.success('Checklist copiado. Cole no WhatsApp ou no e-mail da equipe.') }
    catch { toast.error('Não foi possível copiar neste navegador.') }
  }

  return (
    <>
      <Card className="mb-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Resumo</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm">{r.resumo}</p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <span className={cn('text-sm font-semibold', conferidos === total && total > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>{conferidos} de {total} itens conferidos</span>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${total ? (conferidos / total) * 100 : 0}%` }} /></div>
            <Button tamanho="sm" variante="contorno" onClick={copiar}><ClipboardCopy className="h-4 w-4" />Copiar checklist</Button>
          </div>
        </div>
        {r.avaliacao && (
          <div className={cn('mt-4 rounded-lg border p-4', COR_AVALIACAO[r.avaliacao.nivel])}>
            <p className="flex items-center gap-2 font-semibold">{r.avaliacao.nivel === 'favoravel' ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}Avaliação do Leitor: {AVALIACAO[r.avaliacao.nivel].rotulo}</p>
            <p className="mt-1 text-sm text-foreground">{r.avaliacao.resumo}</p>
            {r.avaliacao.pontos_decisivos.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-foreground">{r.avaliacao.pontos_decisivos.slice(0, 5).map((p, i) => <li key={i}>{p}</li>)}</ul>}
          </div>
        )}
      </Card>

      <Secao icone={ShieldAlert} titulo={`Riscos e pontos de atenção${altos ? ` · ${altos} alto${altos > 1 ? 's' : ''}` : ''}`} descricao="Cláusulas que podem tirar a empresa da disputa ou trazer prejuízo, com o que fazer em cada caso." vazio="Nenhum risco destacado." ids={ids('riscos')} feitos={feitos}>
        <ul className="divide-y">{riscos.map((x) => <Item key={x.id} id={x.id} titulo={x.titulo} detalhe={x.detalhe} orientacao={x.orientacao} fundamento={x.fundamento} extra={<Badge cor={COR_RISCO[x.nivel]}>Risco {NOME_RISCO[x.nivel].toLowerCase()}</Badge>} trecho={x.trecho} {...props} />)}</ul>
      </Secao>

      <Secao icone={CalendarClock} titulo="Datas e prazos" vazio="Nenhuma data encontrada nos documentos." ids={ids('datas')} feitos={feitos}>
        <ul className="divide-y">{r.datas.map((x, i) => <Item key={i} id={`datas-${i}`} titulo={x.evento} extra={<><Badge cor="azul">{x.data}</Badge>{x.tipo && x.tipo !== 'outro' && <Badge>{NOME_TIPO_DATA[x.tipo]}</Badge>}</>} trecho={x.trecho} {...props} />)}</ul>
      </Secao>

      <Secao icone={ListChecks} titulo="Documentos de habilitação" descricao="Separe cada documento e confira validade, emissor e os índices pedidos." vazio="Nenhuma exigência de habilitação encontrada." ids={ids('habilitacao')} feitos={feitos}>
        {categorias.filter((c) => r.habilitacao.some((h) => h.categoria === c)).map((c) => (
          <div key={c} className="mb-2">
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{NOME_CATEGORIA[c]}</p>
            <ul className="divide-y">{r.habilitacao.map((x, i) => ({ x, i })).filter(({ x }) => x.categoria === c).map(({ x, i }) => <Item key={i} id={`habilitacao-${i}`} titulo={x.exigencia} detalhe={x.detalhe} trecho={x.trecho} {...props} />)}</ul>
          </div>
        ))}
      </Secao>

      <Secao icone={FileSearch} titulo="Proposta" descricao="O que precisa constar ou acompanhar a proposta." vazio="Nenhuma exigência específica para a proposta." ids={ids('proposta')} feitos={feitos}>
        <ul className="divide-y">{r.proposta.map((x, i) => <Item key={i} id={`proposta-${i}`} titulo={x.exigencia} detalhe={x.detalhe} trecho={x.trecho} {...props} />)}</ul>
      </Secao>

      <Secao icone={Users} titulo="Condições de participação" vazio="Nenhuma condição encontrada." ids={ids('participacao')} feitos={feitos}>
        <ul className="divide-y">{r.participacao.map((x, i) => <Item key={i} id={`participacao-${i}`} titulo={NOME_TEMA[x.tema] ?? x.tema} detalhe={x.situacao} trecho={x.trecho} {...props} />)}</ul>
      </Secao>

      <Card className="mb-4 p-5">
        <h2 className="mb-2 text-sm font-semibold">Fontes lidas</h2>
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
        <p className="mt-3 text-xs text-muted-foreground">Leitura feita por IA em {formatarDataHora(leitura.created_at)} a partir dos documentos publicados no PNCP. Confira sempre no edital antes de enviar a proposta; os itens marcados como conferidos ficam salvos neste aparelho.</p>
      </Card>
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
  const ficha = useQuery({ queryKey: ['ficha-pncp', controle], enabled: valido, queryFn: ({ signal }) => buscarFicha(cnpj, ano, seq, signal), staleTime: 600_000, retry: 1 })
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
      <Ficha f={leitura?.resultado.ficha ?? ficha.data ?? null} controle={controle} leitura={leitura} />
      {(() => {
        const f = ficha.data ?? leitura?.resultado.ficha ?? null
        if (!f) return null
        const alvoPncp = alvoPeloPncp(f.esfera, f.codigo_ibge, f.uf)
        return <CartaoTermometro alvo={alvoPncp ?? alvoPeloNome(f.orgao, f.uf, f.municipio)} peloNome={!alvoPncp} className="mb-5" />
      })()}

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
                A IA abre o edital, o termo de referência e os anexos publicados no PNCP e monta o relatório: avaliação geral, riscos com o que fazer,
                datas, documentos de habilitação e exigências da proposta, cada item com o trecho do edital de onde saiu.
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
      {leitura && <Resultado leitura={leitura} chaveConferidos={`lf-leitor:${org?.id ?? ''}:${controle}`} />}
    </>
  )
}
