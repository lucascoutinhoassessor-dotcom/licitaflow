// Checkout transparente. Dados completos do cartão existem só durante a requisição.
import { isIP } from 'node:net'
import { asaas } from './asaas.js'

export const PAGOS = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']
export const ABERTOS = ['PENDING', 'OVERDUE']
const digitos = v => String(v ?? '').replace(/\D/g, '')
const invalido = msg => Object.assign(new Error(msg), { status: 400 })

export function dadosCartao(body, req) {
  const c = body.cartao ?? {}, t = body.titular ?? {}
  const numero = digitos(c.numero), mes = Number(c.mes), ano = Number(c.ano), cvv = String(c.cvv ?? '')
  const hoje = new Date()
  if (!String(c.nome ?? '').trim() || numero.length < 13 || numero.length > 19 || !/^\d{3,4}$/.test(cvv)
      || !Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano) || ano < hoje.getFullYear()
      || ano > hoje.getFullYear() + 30 || (ano === hoje.getFullYear() && mes < hoje.getMonth() + 1)) {
    throw invalido('Confira o nome, número, validade e código de segurança do cartão.')
  }
  // Vercel sobrescreve este cabeçalho com o IP original; fora dela, usa o socket.
  const ip = String((process.env.VERCEL ? req.headers['x-forwarded-for'] : req.socket?.remoteAddress) ?? '').split(',')[0].trim().replace(/^::ffff:/, '')
  if (!isIP(ip)) throw invalido('Não foi possível identificar o dispositivo do pagador.')
  const doc = digitos(t.documento), cep = digitos(t.cep), telefone = digitos(t.telefone)
  if (!String(t.nome ?? '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(t.email ?? ''))
      || ![11, 14].includes(doc.length) || cep.length !== 8 || !String(t.numero ?? '').trim()
      || telefone.length < 10 || telefone.length > 13) throw invalido('Confira os dados e o endereço do titular do cartão.')
  return {
    creditCard: { holderName: String(c.nome).trim().slice(0,100), number: numero, expiryMonth: String(mes).padStart(2,'0'), expiryYear: String(ano), ccv: cvv },
    creditCardHolderInfo: { name: String(t.nome).trim().slice(0,100), email: String(t.email).trim().slice(0,254), cpfCnpj: doc,
      postalCode: cep, addressNumber: String(t.numero).trim().slice(0,30), phone: telefone },
    remoteIp: ip,
  }
}

/** Só devolve campos necessários ao checkout, nunca tokens ou dados de cartão. */
export async function apresentarPagamento(cfg, p, carregarCodigos = true) {
  const r = { id: p.id, status: p.status, pago: PAGOS.includes(p.status), valor_centavos: Math.round(p.value * 100),
    vencimento: p.dueDate, forma: p.billingType, pix: null, boleto: null, aviso: null }
  if (!carregarCodigos || !ABERTOS.includes(p.status)) return r
  if (['PIX','UNDEFINED','BOLETO'].includes(p.billingType)) {
    try {
      const pix = await asaas(cfg, `/payments/${encodeURIComponent(p.id)}/pixQrCode`)
      r.pix = { imagem: pix.encodedImage, codigo: pix.payload, expira_em: pix.expirationDate }
    } catch (e) {
      if (p.billingType === 'PIX') r.aviso = 'O Pix ainda não está disponível. Atualize o checkout para tentar novamente.'
    }
  }
  if (['BOLETO','UNDEFINED'].includes(p.billingType)) {
    try {
      const boleto = await asaas(cfg, `/payments/${encodeURIComponent(p.id)}/identificationField`)
      r.boleto = { linha: boleto.identificationField, url: p.bankSlipUrl?.startsWith('https://') ? p.bankSlipUrl : null }
    } catch {
      if (p.billingType === 'BOLETO') r.aviso = 'O boleto ainda está sendo emitido. Atualize o checkout em instantes.'
    }
  }
  return r
}
