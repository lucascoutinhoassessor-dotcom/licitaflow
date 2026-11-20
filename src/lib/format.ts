const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatarMoeda(v: number | null | undefined): string {
  return v == null ? '—' : brl.format(v)
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return d.toLocaleDateString('pt-BR')
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function apenasDigitos(s: string): string {
  return s.replace(/\D/g, '')
}

export function formatarCnpj(s: string): string {
  const d = apenasDigitos(s).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/** Valida CNPJ numérico (14 dígitos) pelos dígitos verificadores. */
export function cnpjValido(s: string): boolean {
  const c = apenasDigitos(s)
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = calc(c.slice(0, 12))
  const d2 = calc(c.slice(0, 12) + d1)
  return c.endsWith(`${d1}${d2}`)
}

/** Dias inteiros entre hoje e a data (negativo = já passou). */
export function diasAte(iso: string, hoje = new Date()): number {
  const alvo = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  const a = Date.UTC(alvo.getFullYear(), alvo.getMonth(), alvo.getDate())
  const b = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((a - b) / 86_400_000)
}

/** "hoje", "amanhã", "em 12 dias" pelo calendário local; "encerrado" se já passou; vazio sem data. */
export function prazoRelativo(data: string | null | undefined, agora = new Date()) {
  if (!data) return ''
  const alvo = new Date(data)
  if (Number.isNaN(alvo.getTime())) return ''
  if (alvo.getTime() < agora.getTime()) return 'encerrado'
  const dia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const dias = Math.round((dia(alvo) - dia(agora)) / 86_400_000)
  return dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`
}
