import { z } from 'zod'

export const conteudoSiteSchema = z.object({
  titulo: z.string().trim().min(3).max(180),
  destaque: z.string().max(2000),
  descricao: z.string().max(2000),
  botao: z.string().trim().min(2).max(80),
  titulo_final: z.string().max(2000),
  descricao_final: z.string().max(2000),
  contato: z.union([z.literal(''), z.string().email().max(2000)]),
}).strict()
export type ConteudoSite = z.infer<typeof conteudoSiteSchema>
export const CONTEUDO_PADRAO: ConteudoSite = {
  titulo: 'Ganhe mais licitações.',
  destaque: 'Sem perder nenhum prazo.',
  descricao: 'O LicitaFlow organiza processos, documentos, prazos e contratos para sua empresa acompanhar cada licitação, do edital ao pagamento.',
  botao: 'Criar minha conta grátis',
  titulo_final: 'A próxima oportunidade da sua empresa já foi publicada.',
  descricao_final: 'Comece hoje e organize cada etapa da sua participação em licitações.',
  contato: '',
}
export function lerConteudo(dados: unknown): ConteudoSite {
  const r = conteudoSiteSchema.safeParse({ ...CONTEUDO_PADRAO, ...(dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : {}) })
  return r.success ? r.data : CONTEUDO_PADRAO
}
