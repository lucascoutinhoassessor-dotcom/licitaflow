// Somente servidor: credenciais do Asaas cifradas no banco, chamadas à API e regras de assinatura.
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const BASE = { sandbox: 'https://api-sandbox.asaas.com/v3', production: 'https://api.asaas.com/v3' }
export const CICLO_ASAAS = { mensal: 'MONTHLY', anual: 'YEARLY' }

// A chave de cifra vem de CREDENCIAIS_CHAVE (recomendado) ou, na falta dela, da service role.
// Sem a variável do servidor, um vazamento do banco não revela a chave do Asaas.
function chave(env) {
  const base = env.CREDENCIAIS_CHAVE || env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error('Configuração do servidor ausente para proteger credenciais')
  return createHash('sha256').update('licitaflow-gateways:' + base).digest()
}

export function cifrar(texto, env) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave(env), iv)
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), dados.toString('base64')].join(':')
}

export function decifrar(valor, env) {
  const [v, iv, tag, dados] = String(valor ?? '').split(':')
  if (v !== 'v1' || !iv || !tag || !dados) throw new Error('Credencial guardada em formato inválido')
  const d = createDecipheriv('aes-256-gcm', chave(env), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8')
}

export function mesmoToken(recebido, esperado) {
  if (!recebido || !esperado) return false
  const a = Buffer.from(String(recebido)), b = Buffer.from(String(esperado))
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Data de hoje em Brasília (AAAA-MM-DD). */
export const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export class ErroAsaas extends Error {
  constructor(msg, status) { super(msg); this.status = status; this.definitivo = status >= 400 && status < 500 }
}

/** Configuração ativa: a do painel (banco) tem prioridade; variáveis de ambiente ficam como alternativa. */
export function montarConfig(linha, env) {
  if (linha?.api_key_cifrada) {
    return {
      origem: 'painel', ativo: !!linha.ativo, ambiente: linha.ambiente === 'production' ? 'production' : 'sandbox',
      apiKey: decifrar(linha.api_key_cifrada, env),
      webhookToken: linha.webhook_token_cifrado ? decifrar(linha.webhook_token_cifrado, env) : null,
    }
  }
  if (env.ASAAS_API_KEY) {
    return { origem: 'ambiente', ativo: (env.PAYMENTS_ENABLED_PROVIDERS ?? '').split(',').map(x => x.trim()).includes('asaas'),
      ambiente: env.ASAAS_ENV === 'production' ? 'production' : 'sandbox', apiKey: env.ASAAS_API_KEY, webhookToken: env.ASAAS_WEBHOOK_TOKEN || null }
  }
  return null
}

export async function asaas(cfg, caminho, { method = 'GET', body } = {}) {
  if (!cfg?.apiKey) throw new ErroAsaas('Asaas ainda não configurado. Cadastre a chave em Master → Integrações.', 503)
  const r = await fetch(BASE[cfg.ambiente] + caminho, {
    method,
    headers: { access_token: cfg.apiKey, 'Content-Type': 'application/json', 'User-Agent': 'LicitaFlow' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const texto = await r.text()
  let dados = {}
  try { dados = texto ? JSON.parse(texto) : {} } catch { dados = {} }
  if (!r.ok) {
    const desc = Array.isArray(dados.errors) ? dados.errors.map(e => e.description).filter(Boolean).join('; ') : ''
    throw new ErroAsaas(desc || `Asaas respondeu ${r.status}`, r.status)
  }
  return dados
}

/** Corpo da assinatura no Asaas a partir da linha preparada pelo banco (valor sempre do catálogo). */
export function corpoAssinatura(a, cliente, nomePlano) {
  return {
    customer: cliente,
    billingType: a.forma || 'UNDEFINED',
    value: a.valor_centavos / 100,
    nextDueDate: hojeSP(),
    cycle: CICLO_ASAAS[a.ciclo],
    description: `LicitaFlow · Plano ${nomePlano} (${a.ciclo})`,
    externalReference: a.id,
  }
}
