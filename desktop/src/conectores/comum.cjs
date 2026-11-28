// Funções comuns aos conectores de portal: texto, datas de Brasília, prazos citados pelo pregoeiro,
// menção à empresa do cliente e a impressão digital que evita gravar o mesmo evento duas vezes.
const crypto = require('node:crypto')

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const normalizar = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const limpar = (s, max = 4000) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

function impressao(...partes) {
  return crypto.createHash('sha1').update(partes.map((p) => String(p ?? '')).join('|')).digest('hex')
}

/** Data/hora com o fuso de Brasília (o horário oficial dos portais). */
function dataBrasilia(ano, mes, dia, hora = 0, min = 0, seg = 0) {
  const p = (n, t = 2) => String(n).padStart(t, '0')
  const d = new Date(`${p(ano, 4)}-${p(mes)}-${p(dia)}T${p(hora)}:${p(min)}:${p(seg)}-03:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Lê "2026-11-27T14:30:00", "27/11/2026 14:30:05" ou milissegundos. Sem fuso = Brasília. */
function lerData(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return new Date(v > 1e12 ? v : v * 1000)
  const s = String(v).trim()
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T,às]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) return dataBrasilia(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (m && !/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return dataBrasilia(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Partes de uma data no fuso de Brasília. */
function partesBrasilia(d) {
  const b = new Date(d.getTime() - 3 * 3600e3)
  return { ano: b.getUTCFullYear(), mes: b.getUTCMonth() + 1, dia: b.getUTCDate() }
}

const NUMEROS = { uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, oito: 8, doze: 12, vinte: 20, trinta: 30, quarenta: 40 }

/**
 * Prazo citado numa mensagem: "até as 14:30 do dia 28/11/2026", "até 28/11 às 10h",
 * "no prazo de 2 (duas) horas", "em até 30 minutos". `base` é a hora da mensagem.
 */
function extrairPrazo(texto, base) {
  const t = semAcento(texto).toLowerCase()
  const ref = base instanceof Date && !Number.isNaN(base.getTime()) ? base : new Date()
  const hoje = partesBrasilia(ref)
  // até 28/11/2026 às 14:30 | até o dia 28/11 as 14h
  let m = t.match(/ate\s+(?:o\s+dia\s+|dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:,|as|a partir das|ate as|-)?\s*(\d{1,2})(?:[:h](\d{2}))?\s*h?/)
  if (m) {
    const ano = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : hoje.ano
    return dataBrasilia(ano, +m[2], +m[1], +m[4], +(m[5] ?? 0))
  }
  // até as 14:30 (do dia 28/11/2026)
  m = t.match(/ate\s+(?:as|a)\s+(\d{1,2})(?:[:h](\d{2}))?\s*h?(?:min)?(?:\s*(?:do dia|de|em|no dia)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?)?/)
  if (m) {
    if (m[3]) {
      const ano = m[5] ? (m[5].length === 2 ? 2000 + +m[5] : +m[5]) : hoje.ano
      return dataBrasilia(ano, +m[4], +m[3], +m[1], +(m[2] ?? 0))
    }
    let d = dataBrasilia(hoje.ano, hoje.mes, hoje.dia, +m[1], +(m[2] ?? 0))
    if (d && d < ref) d = new Date(d.getTime() + 24 * 3600e3)
    return d
  }
  // prazo de 2 (duas) horas | em ate 30 minutos
  m = t.match(/(?:prazo\s+(?:maximo\s+)?de|em\s+ate|dentro\s+de)\s+(\d{1,3}|[a-z]+)\s*(?:\([a-z ]+\)\s*)?(horas?|minutos?|min)\b/)
  if (m) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : NUMEROS[m[1]]
    if (n) return new Date(ref.getTime() + n * (m[2].startsWith('h') ? 3600e3 : 60e3))
  }
  return null
}

// Forma jurídica no fim do nome ("Ana Comércio LTDA - ME" → "ana comercio").
const SUFIXOS = /(\s+(ltda|me|epp|eireli|s a|sa|s s|limitada|mei))+$/

/** A mensagem cita uma das empresas do cliente (CNPJ ou nome)? */
function citaCliente(texto, empresas = []) {
  const n = ' ' + normalizar(texto) + ' '
  const digitos = String(texto ?? '').replace(/\D/g, '')
  return empresas.some((e) => {
    if (e.cnpj && digitos.includes(e.cnpj)) return true
    return [e.razao_social, e.nome_fantasia].some((nome) => {
      const chave = normalizar(nome).replace(SUFIXOS, '').trim()
      return chave.length >= 4 && n.includes(' ' + chave + ' ')
    })
  })
}

module.exports = { normalizar, limpar, impressao, lerData, extrairPrazo, citaCliente, dataBrasilia, semAcento }
