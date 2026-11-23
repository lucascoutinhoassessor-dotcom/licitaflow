// Empresas que nunca aparecem no LicitaForce (análise de empresas, preços, mercado, compras e atas).
// A mesma lista fica no banco, em licitaflow_coleta.empresas_bloqueadas (resumo de fornecedores).
export const CNPJS_BLOQUEADOS = new Set([
  '34477874000156',
])

/** O CNPJ (com ou sem pontuação) está bloqueado? */
export const cnpjBloqueado = (cnpj) => cnpj != null && CNPJS_BLOQUEADOS.has(String(cnpj).replace(/\D/g, ''))
