// Quais avisos da plataforma contam para o cliente no sino e na tela de Avisos.
// O banco já filtra para o cliente comum, mas a conta master enxerga todos (arquivados,
// agendados, expirados e os enviados só a outros clientes). Aqui vale a mesma regra para todos.

export interface AvisoAlvo {
  ativo: boolean
  publicar_em: string
  expira_em: string | null
  org_id: string | null
  org_ids: string[] | null
}

export function avisoVisivel(a: AvisoAlvo, orgId: string | null | undefined, agora: Date = new Date()): boolean {
  if (!a.ativo) return false
  if (new Date(a.publicar_em).getTime() > agora.getTime()) return false
  if (a.expira_em && new Date(a.expira_em).getTime() <= agora.getTime()) return false
  const paraTodos = !a.org_id && !a.org_ids?.length
  if (paraTodos) return true
  if (!orgId) return false
  return a.org_id === orgId || (a.org_ids ?? []).includes(orgId)
}
