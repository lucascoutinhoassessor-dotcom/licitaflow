export const TIPOS_QUADRO = { banner: 'Banner', dica: 'Dica educativa', novidade: 'Funcionalidade', evento: 'Evento' }
export type TipoQuadro = keyof typeof TIPOS_QUADRO
export interface PostQuadro {
  id: string; titulo: string; texto: string; tipo: TipoQuadro; imagem_url: string; link_url: string;
  link_texto: string; org_id: string | null; status: 'rascunho' | 'publicado' | 'arquivado';
  publicar_em: string; expira_em: string | null; ordem: number; created_at: string;
}
export interface RecomendacaoQuadro {
  id: string; chave: string; titulo: string; motivo: string; texto_sugerido: string;
  tipo: TipoQuadro; quantidade: number; status: 'nova' | 'rascunho' | 'dispensada'; created_at: string;
}
/** Links internos da plataforma e destinos HTTPS; rejeita protocolos executáveis e URLs ambíguas. */
export function linkQuadroSeguro(valor: string, imagem = false): boolean {
  if (!valor) return true
  if (/[\s\\]/.test(valor) || [...valor].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return false
  if (!imagem && /^\/(?!\/)/.test(valor)) return true
  try { return new URL(valor).protocol === 'https:' } catch { return false }
}
export function validarPostQuadro(p: Pick<PostQuadro, 'titulo' | 'texto' | 'tipo' | 'imagem_url' | 'link_url' | 'link_texto' | 'publicar_em' | 'expira_em'>): string | null {
  if (p.titulo.trim().length < 3 || p.titulo.trim().length > 160) return 'Informe um título entre 3 e 160 caracteres.'
  if (p.texto.trim().length < 3 || p.texto.trim().length > 5000) return 'Informe um texto entre 3 e 5.000 caracteres.'
  if (!linkQuadroSeguro(p.imagem_url, true) || !linkQuadroSeguro(p.link_url)) return 'Use uma imagem HTTPS e um link HTTPS ou interno.'
  if (p.tipo === 'banner' && !p.imagem_url) return 'Adicione a imagem do banner.'
  if (p.link_url && !p.link_texto.trim()) return 'Informe o texto do botão.'
  if (!Number.isFinite(Date.parse(p.publicar_em))) return 'Informe a data de publicação.'
  if (p.expira_em && (!Number.isFinite(Date.parse(p.expira_em)) || Date.parse(p.expira_em) <= Date.parse(p.publicar_em))) return 'A expiração deve ser posterior à publicação.'
  return null
}
export function dataLocalQuadro(valor: string): string {
  const d = new Date(valor)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
