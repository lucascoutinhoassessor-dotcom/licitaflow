// Utilidades puras do checkout: máscaras, bandeira do cartão e preços por ciclo.

export type Ciclo = 'mensal' | 'anual'
const dig = (v: string) => v.replace(/\D/g, '')

export function mascaraDocumento(v: string) {
  const d = dig(v).slice(0, 14)
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}
export function mascaraTelefone(v: string) {
  const d = dig(v).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
export function mascaraCep(v: string) { const d = dig(v).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d }
export function mascaraValidade(v: string) { const d = dig(v).slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }

export type Bandeira = 'visa' | 'mastercard' | 'amex' | 'elo' | 'hipercard' | 'diners' | null
export function bandeira(numero: string): Bandeira {
  const n = dig(numero)
  if (/^(4011(78|79)|43(1274|8935)|45(1416|7393|763(1|2))|50(4175|6699|67[0-7][0-9]|9000)|627780|63(6297|6368)|650(03([^4])|04([0-9])|05(0|1)|4(0[5-9]|3[0-9]|8[5-9]|9[0-9])|5([0-2][0-9]|3[0-8]))|65(0(7(0[0-9]|1[0-8]|2[0-9])|9[0-6][0-9])|16(5[2-9]|6[0-9]|7[0-9])|500[0-9]))/.test(n)) return 'elo'
  if (/^(606282|3841)/.test(n)) return 'hipercard'
  if (/^3[47]/.test(n)) return 'amex'
  if (/^3(0[0-5]|[68])/.test(n)) return 'diners'
  if (/^4/.test(n)) return 'visa'
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return 'mastercard'
  return null
}
export function mascaraCartao(v: string) {
  const d = dig(v).slice(0, 19)
  if (bandeira(d) === 'amex') return d.replace(/^(\d{4})(\d{0,6})(\d{0,5}).*/, (_, a, b, c) => [a, b, c].filter(Boolean).join(' '))
  return d.replace(/(\d{4})(?=\d)/g, '$1 ')
}
/** Luhn: evita mandar ao gateway um número digitado errado. */
export function cartaoValido(numero: string) {
  const d = dig(numero)
  if (d.length < 13 || d.length > 19) return false
  let soma = 0
  for (let i = 0; i < d.length; i++) {
    let x = Number(d[d.length - 1 - i])
    if (i % 2) { x *= 2; if (x > 9) x -= 9 }
    soma += x
  }
  return soma % 10 === 0
}
/** "MM/AA" → { mes, ano } com ano de 4 dígitos; null se inválida ou vencida. */
export function lerValidade(v: string, hoje = new Date()) {
  const m = /^(\d{2})\/(\d{2})$/.exec(v.trim())
  if (!m) return null
  const mes = Number(m[1]), ano = 2000 + Number(m[2])
  if (mes < 1 || mes > 12) return null
  if (ano < hoje.getFullYear() || (ano === hoje.getFullYear() && mes < hoje.getMonth() + 1)) return null
  return { mes: String(mes).padStart(2, '0'), ano: String(ano) }
}
export function documentoValido(v: string) {
  const d = dig(v)
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false
    const calc = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false
    const calc = (n: number) => { const p = n === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r }
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
  }
  return false
}

export interface PrecoPlano { mensal_centavos: number; anual_centavos: number }
/** Valor cobrado no ciclo, equivalente mensal e economia do anual sobre 12 mensalidades. */
export function precoCiclo(p: PrecoPlano, ciclo: Ciclo) {
  const cheio = p.mensal_centavos * 12
  const temAnual = p.anual_centavos >= 100
  const anual = temAnual ? p.anual_centavos : cheio
  return {
    cobrado: ciclo === 'anual' ? anual : p.mensal_centavos,
    porMes: ciclo === 'anual' ? Math.round(anual / 12) : p.mensal_centavos,
    economia: ciclo === 'anual' && cheio > anual ? cheio - anual : 0,
    economiaPct: cheio > anual ? Math.round((1 - anual / cheio) * 100) : 0,
    temAnual,
  }
}
