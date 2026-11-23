import type { CompraPNCP } from './pncp'
import type { LimiteIA } from './agentesIA'

export interface EmpresaRadar {
  empresa_id: string; razao_social: string; nome_fantasia: string | null; uf: string | null; palavras_chave: string[]
  monitorada: boolean; motivo: string | null; ultima_busca: string | null; ultima_novas: number | null; pendentes: number
}
export interface ResumoRadar { liberado: boolean; limite: LimiteIA; empresas: EmpresaRadar[] }
export interface PerfilRadar {
  empresa_id: string; org_id: string; ativo: boolean; excluir: string[]; ufs: string[]; modalidades: number[]
  valor_min: number | null; valor_max: number | null; antecedencia_horas: number
}
export interface SugestaoRadar {
  id: number; org_id: string; empresa_id: string; controle: string; objeto: string | null; orgao: string | null; uf: string | null
  modalidade: number | null; valor: number | null; publicacao: string | null; encerramento: string | null; pontuacao: number
  motivos: string[]; compra: CompraPNCP | null; status: 'nova' | 'adicionada' | 'descartada'; processo_id: string | null; created_at: string
}

/** Aderência pela pontuação: alta (objeto cita várias palavras), média (objeto ou itens) ou baixa (só complemento). */
export function aderencia(pontos: number): { rotulo: string; cor: 'verde' | 'azul' | 'neutro' } {
  if (pontos >= 70) return { rotulo: 'Aderência alta', cor: 'verde' }
  if (pontos >= 40) return { rotulo: 'Aderência média', cor: 'azul' }
  return { rotulo: 'Aderência baixa', cor: 'neutro' }
}

/** Texto da lista de palavras: "papel, toner; cartucho" → ["papel", "toner", "cartucho"] (sem repetidas, até 30). */
export function lerPalavras(texto: string): string[] {
  const vistas = new Set<string>()
  const saida: string[] = []
  for (const p of texto.split(/[,;\n]/).map((x) => x.trim().replace(/\s+/g, ' ')).filter((x) => x.length >= 2)) {
    const k = p.toLowerCase()
    if (vistas.has(k)) continue
    vistas.add(k)
    saida.push(p.slice(0, 60))
  }
  return saida.slice(0, 30)
}

/** Valor em reais digitado ("50.000,00", "50000") → número; vazio → null; inválido → undefined. */
export function lerValor(texto: string): number | null | undefined {
  const t = texto.trim()
  if (!t) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** "Faltam 3 dias", "Falta 1 dia", "Encerra hoje". */
export function faltam(iso: string | null, agora = Date.now()) {
  if (!iso) return ''
  const dias = Math.floor((Date.parse(iso) - agora) / 864e5)
  if (dias <= 0) return 'Encerra hoje'
  return dias === 1 ? 'Falta 1 dia' : `Faltam ${dias} dias`
}
