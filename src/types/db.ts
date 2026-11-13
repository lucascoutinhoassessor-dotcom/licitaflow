// Tipos das tabelas usadas no frontend (espelham supabase/migrations).
// Quando o projeto Supabase existir, podem ser gerados com:
//   npx supabase gen types typescript --project-id <id> > src/types/supabase.ts

export type Papel = 'owner' | 'admin' | 'membro' | 'leitor'
export type TipoOrg = 'fornecedor' | 'assessoria'

export interface Organizacao {
  id: string
  nome: string
  tipo: TipoOrg
  plano: string
  trial_ate: string
  created_at: string
}

export interface OrganizacaoComPapel extends Organizacao {
  papel: Papel
}

export interface Empresa {
  id: string
  org_id: string
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  porte: string | null
  optante_simples: boolean | null
  cnae_principal: string | null
  cnaes: { codigo: string; descricao: string }[]
  endereco: Record<string, string | null>
  uf: string | null
  municipio: string | null
  email: string | null
  telefone: string | null
  palavras_chave: string[]
  ativa: boolean
  created_at: string
}

export interface Membro {
  org_id: string
  user_id: string
  papel: Papel
  created_at: string
  profiles: { nome: string | null; email: string | null } | null
}

export interface Convite {
  id: string
  org_id: string
  email: string
  papel: Exclude<Papel, 'owner'>
  token: string
  aceito_em: string | null
  expira_em: string
  created_at: string
}

export const NOME_PAPEL: Record<Papel, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  membro: 'Membro',
  leitor: 'Somente leitura',
}
