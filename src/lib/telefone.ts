/** WhatsApp brasileiro: só dígitos, com DDD (10 ou 11), aceitando o 55 na frente. Devolve null se inválido. */
export function normalizarWhatsapp(valor: string | null | undefined): string | null {
  let d = String(valor ?? '').replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return null
  if (d[0] === '0' || d[2] === '0') return null
  if (d.length === 11 && d[2] !== '9') return null
  return d
}

/** (11) 91234-5678 */
export function formatarWhatsapp(valor: string | null | undefined): string {
  const d = normalizarWhatsapp(valor)
  if (!d) return String(valor ?? '')
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
}

/** Link para abrir a conversa no WhatsApp. */
export function linkWhatsapp(valor: string | null | undefined): string | null {
  const d = normalizarWhatsapp(valor)
  return d ? `https://wa.me/55${d}` : null
}
