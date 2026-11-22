import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Download, ExternalLink, FileArchive, FileImage, FileSpreadsheet, FileText, FolderOpen, Maximize2, X } from 'lucide-react'
import { Badge, Button, Card, Carregando } from '@/components/ui'
import { abrirZip, baixarArquivo, listarArquivos, mimeDe, nomeParaSalvar, type ArquivoEdital, type Formato } from '@/lib/arquivosEdital'
import { formatarData } from '@/lib/format'
import { cn } from '@/lib/utils'

const mostraPdf = () => typeof navigator !== 'undefined' && (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false
const ICONE = { pdf: FileText, zip: FileArchive, rar: FileArchive, word: FileText, planilha: FileSpreadsheet, imagem: FileImage, texto: FileText, outro: FileText }

/**
 * Todos os arquivos do edital (edital, termo de referência, ETP, anexos, esclarecimentos, atas...) abertos dentro do
 * aplicativo: PDF e imagem na própria página, ZIP aberto no navegador, e "Tela cheia" para ler numa aba do navegador.
 */
export default function ArquivosEdital({ cnpj, ano, seq, linkFonte }: { cnpj: string; ano: number | string; seq: number | string; linkFonte?: string }) {
  const q = useQuery({ queryKey: ['arquivos-edital', cnpj, ano, seq], staleTime: 10 * 60_000, retry: 1, queryFn: ({ signal }) => listarArquivos(cnpj, ano, seq, signal) })
  const [aberto, setAberto] = useState<string | null>(null)
  const grupos = useMemo(() => {
    const m = new Map<string, ArquivoEdital[]>()
    for (const a of q.data ?? []) m.set(a.tipo, [...(m.get(a.tipo) ?? []), a])
    return [...m]
  }, [q.data])
  // Abre sozinho o edital quando ele é o primeiro arquivo.
  useEffect(() => { if (q.data?.length && aberto === null && /edital/i.test(q.data[0].tipo)) setAberto(q.data[0].url) }, [q.data, aberto])

  return (
    <Card className="mb-5 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><FolderOpen className="h-4 w-4 text-sky-400" />Edital e arquivos</h2>
        {linkFonte && <a href={linkFonte} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><ExternalLink className="h-4 w-4" />Abrir na fonte oficial</a>}
      </div>
      {q.isLoading ? <Carregando texto="Buscando os arquivos publicados…" />
        : q.isError ? <p className="text-sm">{(q.error as Error).message} <button className="font-semibold text-primary underline" onClick={() => q.refetch()}>Tentar novamente</button></p>
        : !q.data?.length ? <p className="text-sm text-muted-foreground">O órgão ainda não publicou arquivos deste edital na fonte oficial.</p>
        : <div className="space-y-4">
          {grupos.map(([tipo, lista]) => (
            <section key={tipo}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tipo} <span className="font-normal">({lista.length})</span></h3>
              <ul className="space-y-2">
                {lista.map((a) => (
                  <li key={a.url} className={cn('overflow-hidden rounded-xl border', aberto === a.url && 'border-primary/40')}>
                    <button type="button" onClick={() => setAberto((v) => (v === a.url ? null : a.url))} aria-expanded={aberto === a.url}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/40">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.titulo}</span>{a.publicadoEm && <span className="block text-xs text-muted-foreground">Publicado em {formatarData(a.publicadoEm)}</span>}</span>
                      <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', aberto === a.url && 'rotate-180')} />
                    </button>
                    {aberto === a.url && <VisorRemoto arquivo={a} />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>}
    </Card>
  )
}

function VisorRemoto({ arquivo }: { arquivo: ArquivoEdital }) {
  const q = useQuery({ queryKey: ['arquivo-edital', arquivo.url], staleTime: 10 * 60_000, gcTime: 3 * 60_000, retry: 1, queryFn: ({ signal }) => baixarArquivo(arquivo.url, arquivo.titulo, signal) })
  if (q.isLoading) return <p className="border-t p-3 text-sm text-muted-foreground">Baixando o arquivo da fonte oficial…</p>
  if (q.isError) return <p role="alert" className="border-t p-3 text-sm text-destructive">{(q.error as Error).message} <a href={arquivo.url} className="underline" target="_blank" rel="noopener noreferrer">Abrir na fonte</a></p>
  if (!q.data) return null
  return <Visor nome={arquivo.titulo} bytes={q.data.bytes} formato={q.data.formato} fonte={arquivo.url} />
}

/** Mostra um arquivo já baixado: PDF/imagem/texto na página, ZIP como lista, demais formatos com "Baixar". */
function Visor({ nome, bytes, formato, fonte }: { nome: string; bytes: Uint8Array; formato: Formato; fonte?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeDe(formato, bytes) }))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [bytes, formato])
  const tamanho = bytes.length > 1024 * 1024 ? `${(bytes.length / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes.length / 1024))} KB`
  if (!url) return null
  const salvar = nomeParaSalvar(nome, formato)
  const acoes = (
    <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-sm">
      <Badge>{formato === 'outro' ? 'Arquivo' : formato.toUpperCase()} · {tamanho}</Badge>
      {(formato === 'pdf' || formato === 'imagem' || formato === 'texto') && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline"><Maximize2 className="h-4 w-4" />Tela cheia</a>}
      <a href={url} download={salvar} className="inline-flex items-center gap-1.5 text-primary hover:underline"><Download className="h-4 w-4" />Baixar</a>
      {fonte && <a href={fonte} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-muted-foreground hover:underline"><ExternalLink className="h-4 w-4" />Fonte</a>}
    </div>
  )
  if (formato === 'pdf') return <div>{acoes}{mostraPdf() ? <iframe title={`Arquivo: ${nome}`} src={`${url}#view=FitH`} className="h-[75vh] w-full border-t bg-white" /> : <p className="border-t p-3 text-sm text-muted-foreground">Este aparelho não mostra PDF dentro da página. Use “Tela cheia” para ler no navegador.</p>}</div>
  if (formato === 'imagem') return <div>{acoes}<img src={url} alt={nome} className="max-h-[75vh] w-full border-t bg-white object-contain" /></div>
  if (formato === 'texto') return <div>{acoes}<iframe title={`Arquivo: ${nome}`} src={url} sandbox="" className="h-[60vh] w-full border-t bg-white" /></div>
  if (formato === 'zip') return <div>{acoes}<ConteudoZip bytes={bytes} /></div>
  const aviso = formato === 'word' ? 'Arquivo do Word: baixe para abrir no Word, LibreOffice ou Google Docs.'
    : formato === 'planilha' ? 'Planilha: baixe para abrir no Excel, LibreOffice ou Google Planilhas.'
    : formato === 'rar' ? 'Arquivo compactado RAR: o navegador não abre esse formato. Baixe e extraia no computador.'
    : 'Formato que o navegador não mostra. Baixe para abrir no computador.'
  return <div>{acoes}<p className="border-t p-3 text-sm text-muted-foreground">{aviso}</p></div>
}

function ConteudoZip({ bytes }: { bytes: Uint8Array }) {
  const q = useQuery({ queryKey: ['zip', bytes.length, bytes[100], bytes[bytes.length - 1]], staleTime: Infinity, gcTime: 60_000, retry: 0, queryFn: () => abrirZip(bytes) })
  const [aberto, setAberto] = useState<string | null>(null)
  if (q.isLoading) return <p className="border-t p-3 text-sm text-muted-foreground">Abrindo o ZIP…</p>
  if (q.isError || !q.data) return <p className="border-t p-3 text-sm text-muted-foreground">Não foi possível abrir este ZIP aqui (pode estar protegido ou corrompido). Baixe para extrair no computador.</p>
  return (
    <div className="border-t bg-muted/20 p-2">
      <p className="px-1 pb-2 text-xs text-muted-foreground">{q.data.length} {q.data.length === 1 ? 'arquivo' : 'arquivos'} dentro do ZIP</p>
      <ul className="space-y-1.5">
        {q.data.map((i) => {
          const Icone = ICONE[i.formato]
          return (
            <li key={i.caminho} className="overflow-hidden rounded-lg border bg-card">
              <button type="button" onClick={() => setAberto((v) => (v === i.caminho ? null : i.caminho))} aria-expanded={aberto === i.caminho} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-muted/40">
                <Icone className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate" title={i.caminho}>{i.nome}</span>
                {aberto === i.caminho ? <X className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {aberto === i.caminho && <Visor nome={i.nome} bytes={i.bytes} formato={i.formato} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Botão compacto que leva à seção de arquivos da página. */
export function BotaoArquivos() {
  return <Button variante="contorno" tamanho="sm" onClick={() => document.getElementById('arquivos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><FileText className="h-4 w-4" />Edital e arquivos</Button>
}
