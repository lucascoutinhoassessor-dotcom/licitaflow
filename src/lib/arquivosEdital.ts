// Arquivos publicados de um edital no PNCP (edital, termo de referência, ETP, anexos, atas...).
// O PNCP libera CORS para esses arquivos: o navegador baixa direto, sem passar pelo servidor do LicitaFlow.

export interface ArquivoEdital {
  url: string; titulo: string; tipo: string; sequencial: number; publicadoEm: string | null
}
export type Formato = 'pdf' | 'zip' | 'word' | 'planilha' | 'imagem' | 'texto' | 'rar' | 'outro'
export interface ConteudoArquivo { bytes: Uint8Array; formato: Formato; mime: string }

const MAX_BYTES = 60 * 1024 * 1024

/** Ordem dos tipos na lista: o que o licitante lê primeiro vem antes. */
const ORDEM_TIPO = ['edital', 'termo de referencia', 'estudo tecnico', 'projeto basico', 'anexo', 'minuta', 'aviso', 'esclarecimento', 'impugna', 'ata', 'resultado', 'homologa', 'contrato']
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function pesoTipo(tipo: string) {
  const t = sem(tipo), i = ORDEM_TIPO.findIndex((o) => t.includes(o))
  return i < 0 ? ORDEM_TIPO.length : i
}

/** Título legível: o PNCP às vezes devolve o nome do arquivo com %20. */
export function tituloLegivel(titulo: string) {
  let t = titulo
  try { t = decodeURIComponent(titulo) } catch { /* fica como veio */ }
  return t.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim() || 'Documento'
}

/** Lista os arquivos ativos do edital, na ordem de leitura (edital, TR, ETP, anexos...). */
export async function listarArquivos(cnpj: string, ano: number | string, seq: number | string, signal?: AbortSignal): Promise<ArquivoEdital[]> {
  const r = await fetch(`https://pncp.gov.br/api/pncp/v1/orgaos/${encodeURIComponent(cnpj)}/compras/${ano}/${seq}/arquivos`, { signal })
  if (r.status === 204 || r.status === 404) return []
  if (!r.ok) throw new Error('A fonte oficial não entregou a lista de arquivos agora.')
  const lista = await r.json().catch(() => [])
  return (Array.isArray(lista) ? lista : [])
    .filter((a) => a?.statusAtivo !== false && typeof a?.url === 'string' && a.url.startsWith('https://pncp.gov.br/'))
    .map((a) => ({ url: a.url, titulo: tituloLegivel(String(a.titulo ?? '')), tipo: String(a.tipoDocumentoNome ?? a.tipoDocumentoDescricao ?? 'Outros documentos'), sequencial: Number(a.sequencialDocumento) || 0, publicadoEm: a.dataPublicacaoPncp ?? null }))
    .sort((a, b) => pesoTipo(a.tipo) - pesoTipo(b.tipo) || a.sequencial - b.sequencial)
}

/** Formato pelo conteúdo (a fonte manda tudo como application/octet-stream) e, na falta, pelo nome. */
export function detectarFormato(bytes: Uint8Array, nome = ''): Formato {
  const b = bytes
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf'
  if (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21) return 'rar'
  if ((b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || (b[0] === 0xff && b[1] === 0xd8)) return 'imagem'
  const n = sem(nome)
  if (b[0] === 0x50 && b[1] === 0x4b) {
    if (/\.docx$/.test(n)) return 'word'
    if (/\.xlsx$/.test(n)) return 'planilha'
    // DOCX/XLSX também são ZIP: olha o primeiro nome interno.
    const cabeca = new TextDecoder('latin1').decode(b.slice(0, 600))
    if (/word\//.test(cabeca)) return 'word'
    if (/xl\//.test(cabeca)) return 'planilha'
    return 'zip'
  }
  if (b[0] === 0xd0 && b[1] === 0xcf) return /\.xls$/.test(n) ? 'planilha' : 'word'
  if (/\.(txt|csv|xml|html?)$/.test(n)) return 'texto'
  if (/\.pdf$/.test(n)) return 'pdf'
  return 'outro'
}

export const MIME: Record<Formato, string> = {
  pdf: 'application/pdf', zip: 'application/zip', word: 'application/msword', planilha: 'application/vnd.ms-excel',
  imagem: 'image/*', texto: 'text/plain;charset=utf-8', rar: 'application/vnd.rar', outro: 'application/octet-stream',
}
export function mimeDe(formato: Formato, bytes: Uint8Array) {
  if (formato === 'imagem') return bytes[0] === 0x89 ? 'image/png' : 'image/jpeg'
  return MIME[formato]
}

/**
 * Endereço do arquivo pelo próprio domínio (rewrite /pncp-arquivos na Vercel e no Vite): quando entrega o arquivo,
 * o PNCP manda "Access-Control-Allow-Origin: *" duas vezes e o navegador bloqueia a leitura direta.
 */
export function urlArquivoLocal(url: string) {
  const m = url.match(/^https:\/\/pncp\.gov\.br\/pncp-api\/v1\/(orgaos\/\d{14}\/compras\/\d{4}\/\d+\/arquivos\/\d+)$/)
  return m ? `/pncp-arquivos/${m[1]}` : url
}

/** Baixa o arquivo do PNCP. O PNCP às vezes responde 422 ("Erro ao tentar carregar arquivo") e acerta na tentativa seguinte. */
export async function baixarArquivo(url: string, nome: string, signal?: AbortSignal): Promise<ConteudoArquivo> {
  let r: Response | null = null
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    if (tentativa) await new Promise((ok) => setTimeout(ok, 700 * tentativa))
    r = await fetch(urlArquivoLocal(url), { signal }).catch((e) => { if (signal?.aborted) throw e; return null })
    if (r?.ok || (r && r.status !== 422 && r.status < 500)) break
  }
  if (!r?.ok) throw new Error('A fonte oficial não entregou o arquivo agora. Tente de novo em instantes.')
  if (Number(r.headers.get('content-length')) > MAX_BYTES) throw new Error('Arquivo grande demais para abrir aqui (mais de 60 MB). Use “Abrir na fonte”.')
  const bytes = new Uint8Array(await r.arrayBuffer())
  const formato = detectarFormato(bytes, nome)
  return { bytes, formato, mime: mimeDe(formato, bytes) }
}

export interface ItemZip { nome: string; caminho: string; bytes: Uint8Array; formato: Formato }

/** Abre um ZIP no navegador e lista os arquivos (sem pastas e sem lixo do macOS). */
export async function abrirZip(bytes: Uint8Array): Promise<ItemZip[]> {
  const { unzipSync } = await import('fflate')
  const arquivos = unzipSync(bytes)
  return Object.entries(arquivos)
    .filter(([caminho, b]) => b.length > 0 && !caminho.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store)/.test(caminho))
    .map(([caminho, b]) => {
      // Nomes antigos vêm em CP437/latin1 e aparecem com "Ã§": tenta consertar.
      let nome = caminho.split('/').pop() || caminho
      try { if (/Ã|Â/.test(nome)) nome = decodeURIComponent(escape(nome)) } catch { /* mantém */ }
      return { nome, caminho, bytes: b, formato: detectarFormato(b, nome) }
    })
    .sort((a, b) => (a.formato === 'pdf' ? 0 : 1) - (b.formato === 'pdf' ? 0 : 1) || a.caminho.localeCompare(b.caminho, 'pt-BR'))
}

/** Nome para salvar com extensão coerente com o conteúdo. */
export function nomeParaSalvar(titulo: string, formato: Formato) {
  const ext: Partial<Record<Formato, string>> = { pdf: '.pdf', zip: '.zip', rar: '.rar', word: '.doc', planilha: '.xls', imagem: '.jpg', texto: '.txt' }
  const base = titulo.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'arquivo'
  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}${ext[formato] ?? ''}`
}
