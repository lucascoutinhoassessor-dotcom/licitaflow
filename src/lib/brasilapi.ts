import { apenasDigitos } from './format'

export interface DadosCnpj {
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  porte: string | null
  optante_simples: boolean | null
  cnae_principal: string | null
  cnaes: { codigo: string; descricao: string }[]
  uf: string | null
  municipio: string | null
  email: string | null
  telefone: string | null
  endereco: Record<string, string | null>
  situacao: string | null
}

/** Consulta dados públicos do CNPJ na BrasilAPI (Receita Federal). */
export async function consultarCnpj(cnpj: string): Promise<DadosCnpj> {
  const c = apenasDigitos(cnpj)
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`)
  if (r.status === 404) throw new Error('CNPJ não encontrado na Receita Federal.')
  if (!r.ok) throw new Error('Não foi possível consultar o CNPJ agora. Preencha manualmente.')
  const j = await r.json()
  const porteMap: Record<string, string> = { 'MICRO EMPRESA': 'ME', 'EMPRESA DE PEQUENO PORTE': 'EPP', DEMAIS: 'DEMAIS' }
  return {
    cnpj: c,
    razao_social: j.razao_social,
    nome_fantasia: j.nome_fantasia || null,
    porte: porteMap[j.porte] ?? j.porte ?? null,
    optante_simples: j.opcao_pelo_simples ?? null,
    cnae_principal: j.cnae_fiscal ? String(j.cnae_fiscal) : null,
    cnaes: [
      ...(j.cnae_fiscal ? [{ codigo: String(j.cnae_fiscal), descricao: j.cnae_fiscal_descricao }] : []),
      ...((j.cnaes_secundarios ?? []) as { codigo: number; descricao: string }[])
        .filter((x) => x.codigo)
        .map((x) => ({ codigo: String(x.codigo), descricao: x.descricao })),
    ],
    uf: j.uf || null,
    municipio: j.municipio || null,
    email: j.email || null,
    telefone: j.ddd_telefone_1 || null,
    endereco: {
      logradouro: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ') || null,
      numero: j.numero || null,
      complemento: j.complemento || null,
      bairro: j.bairro || null,
      cep: j.cep || null,
    },
    situacao: j.descricao_situacao_cadastral || null,
  }
}
