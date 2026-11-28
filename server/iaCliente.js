import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
// IA do próprio cliente: Claude (Anthropic), Gemini (Google) ou ChatGPT (OpenAI) com a chave de API da conta dele.
//
// - A chave é cifrada aqui (AES-256-GCM) antes de ir ao banco. A chave de cifra é derivada da chave de serviço
//   do Supabase (HKDF): trocar a chave de serviço invalida as chaves salvas (o cliente cadastra de novo).
// - criarClienteIA devolve um objeto com a mesma forma de `client.beta.messages.parse` do SDK da Anthropic,
//   para que o Leitor e o Jurídico funcionem sem mudar: com Gemini e ChatGPT, o pedido é convertido.

export const PROVEDORES = {
  anthropic: { nome: 'Claude (Anthropic)', modeloPadrao: 'claude-opus-5-5', formato: /^sk-ant-[A-Za-z0-9_-]{20,}$/ },
  google: { nome: 'Gemini (Google)', modeloPadrao: 'gemini-2.5-pro', formato: /^[A-Za-z0-9_-]{30,60}$/ },
  openai: { nome: 'ChatGPT (OpenAI)', modeloPadrao: 'gpt-5', formato: /^sk-[A-Za-z0-9_-]{20,}$/ },
}
export const MODELO_VALIDO = /^[A-Za-z0-9._:-]{2,80}$/

const chaveDeCifra = (segredo) => Buffer.from(crypto.hkdfSync('sha256', String(segredo), 'licitaforce', 'ia-chaves-cliente-v1', 32))

export function cifrar(texto, segredo) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', chaveDeCifra(segredo), iv)
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()])
  return 'v1.' + Buffer.concat([iv, c.getAuthTag(), dados]).toString('base64')
}

export function decifrar(cifrada, segredo) {
  if (!String(cifrada).startsWith('v1.')) throw new Error('Formato de chave desconhecido')
  const b = Buffer.from(String(cifrada).slice(3), 'base64')
  const d = crypto.createDecipheriv('aes-256-gcm', chaveDeCifra(segredo), b.subarray(0, 12))
  d.setAuthTag(b.subarray(12, 28))
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
}

const erro = (status, mensagem) => Object.assign(new Error(mensagem), { status })

/** Confere a chave listando os modelos (não gasta tokens). */
export async function testarChave({ provedor, chave, fetcher = fetch }) {
  const pedidos = {
    anthropic: ['https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01' } }],
    google: ['https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': chave } }],
    openai: ['https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${chave}` } }],
  }
  const [url, opcoes] = pedidos[provedor] ?? []
  if (!url) throw erro(400, 'Provedor inválido')
  let r
  try { r = await fetcher(url, { ...opcoes, signal: AbortSignal.timeout(15000) }) } catch { throw erro(502, 'Não foi possível falar com o provedor agora. Tente de novo.') }
  if (r.status === 401 || r.status === 403 || r.status === 400) throw erro(400, `A ${PROVEDORES[provedor].nome} recusou esta chave. Confira se copiou a chave inteira e se ela está ativa.`)
  if (!r.ok) throw erro(502, `A ${PROVEDORES[provedor].nome} não respondeu agora (código ${r.status}). Tente de novo.`)
  return true
}

// ---------- conversão do pedido no formato da Anthropic ----------
const blocosDe = (conteudo) => (typeof conteudo === 'string' ? [{ type: 'text', text: conteudo }] : Array.isArray(conteudo) ? conteudo : [])
const instrucaoJson = (esquema) =>
  `\n\nResponda somente com um objeto JSON válido, sem texto antes ou depois, que siga exatamente este JSON Schema:\n${JSON.stringify(esquema)}`

function extrairJson(texto) {
  const t = String(texto ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try { return JSON.parse(t) } catch { /* tenta o maior objeto */ }
  const i = t.indexOf('{'), f = t.lastIndexOf('}')
  if (i >= 0 && f > i) { try { return JSON.parse(t.slice(i, f + 1)) } catch { /* inválido */ } }
  return null
}

async function chamar(fetcher, url, opcoes, nome) {
  let r
  try { r = await fetcher(url, { ...opcoes, signal: AbortSignal.timeout(250_000) }) } catch (e) {
    if (e?.name === 'TimeoutError') throw erro(504, 'A IA demorou demais para responder. Tente de novo.')
    throw erro(502, `Não foi possível falar com a ${nome} agora.`)
  }
  const j = await r.json().catch(() => null)
  if (r.status === 401 || r.status === 403) throw erro(400, `A ${nome} recusou a chave cadastrada. Atualize a chave no botão "Minha IA".`)
  if (r.status === 429) throw erro(429, `A sua conta na ${nome} atingiu o limite de uso ou ficou sem crédito. Confira o painel da ${nome}.`)
  if (!r.ok) throw erro(502, `A ${nome} respondeu com erro: ${String(j?.error?.message ?? r.status).slice(0, 200)}`)
  return j
}

function clienteOpenAI({ chave, modelo, fetcher }) {
  return { beta: { messages: { parse: async (p) => {
    const esquema = p.output_config?.format?.schema
    const partes = p.messages.flatMap((m) => blocosDe(m.content)).map((b) => b.type === 'document' && b.source?.type === 'base64'
      ? { type: 'file', file: { filename: `${String(b.title ?? 'documento').slice(0, 60)}.pdf`, file_data: `data:${b.source.media_type};base64,${b.source.data}` } }
      : { type: 'text', text: String(b.text ?? '') })
    const j = await chamar(fetcher, 'https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo, max_completion_tokens: p.max_tokens,
        messages: [{ role: 'system', content: String(p.system ?? '') + (esquema ? instrucaoJson(esquema) : '') }, { role: 'user', content: partes }],
        ...(esquema ? { response_format: { type: 'json_object' } } : {}),
      }),
    }, PROVEDORES.openai.nome)
    const escolha = j?.choices?.[0]
    const msg = escolha?.message ?? {}
    return {
      model: j?.model ?? modelo,
      stop_reason: msg.refusal ? 'refusal' : escolha?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
      parsed_output: msg.refusal ? null : extrairJson(msg.content),
      usage: { input_tokens: j?.usage?.prompt_tokens ?? 0, output_tokens: j?.usage?.completion_tokens ?? 0 },
    }
  } } } }
}

function clienteGemini({ chave, modelo, fetcher }) {
  return { beta: { messages: { parse: async (p) => {
    const esquema = p.output_config?.format?.schema
    const partes = p.messages.flatMap((m) => blocosDe(m.content)).map((b) => b.type === 'document' && b.source?.type === 'base64'
      ? { inlineData: { mimeType: b.source.media_type, data: b.source.data } }
      : { text: String(b.text ?? '') })
    const j = await chamar(fetcher, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: String(p.system ?? '') + (esquema ? instrucaoJson(esquema) : '') }] },
        contents: [{ role: 'user', parts: partes }],
        generationConfig: { maxOutputTokens: p.max_tokens, ...(esquema ? { responseMimeType: 'application/json' } : {}) },
      }),
    }, PROVEDORES.google.nome)
    const c = j?.candidates?.[0]
    const texto = (c?.content?.parts ?? []).map((x) => x.text ?? '').join('')
    const bloqueado = !c || c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT' || j?.promptFeedback?.blockReason
    return {
      model: j?.modelVersion ?? modelo,
      stop_reason: bloqueado ? 'refusal' : c.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn',
      parsed_output: bloqueado ? null : extrairJson(texto),
      usage: { input_tokens: j?.usageMetadata?.promptTokenCount ?? 0, output_tokens: j?.usageMetadata?.candidatesTokenCount ?? 0 },
    }
  } } } }
}

/** Cliente com a interface `beta.messages.parse` para o provedor do cliente. O modelo do cliente substitui o nosso. */
export function criarClienteIA({ provedor, chave, modelo, fetcher = fetch }) {
  const m = MODELO_VALIDO.test(modelo ?? '') ? modelo : PROVEDORES[provedor]?.modeloPadrao
  if (provedor === 'openai') return clienteOpenAI({ chave, modelo: m, fetcher })
  if (provedor === 'google') return clienteGemini({ chave, modelo: m, fetcher })
  if (provedor === 'anthropic') {
    const sdk = new Anthropic({ apiKey: chave, timeout: 270_000, maxRetries: 1 })
    return { beta: { messages: { parse: (p) => sdk.beta.messages.parse({ ...p, model: m }) } } }
  }
  throw erro(400, 'Provedor inválido')
}

/** Chave ativa da organização (já decifrada), ou null. `banco` usa a chave de serviço. */
export async function chaveAtiva({ banco, org, segredo }) {
  const r = await banco(`ia_chaves_cliente?org_id=eq.${org}&ativa=is.true&select=provedor,modelo,cifrada`)
  const linha = (await r.json().catch(() => []))?.[0]
  if (!linha) return null
  try { return { provedor: linha.provedor, modelo: linha.modelo, chave: decifrar(linha.cifrada, segredo) } } catch {
    throw erro(400, 'A chave de IA da organização precisa ser cadastrada de novo no botão "Minha IA".')
  }
}

/**
 * POST /api/agentes?agente=chave&org=…  { provedor, chave, modelo? } — cadastra (ou troca) e ativa a chave.
 * Só dono ou administrador. A chave é testada no provedor antes de salvar.
 */
export async function atenderChave({ req, res, org, usuario, banco, segredo, fetcher = fetch, excedeuLimite }) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })
  const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
  const provedor = String(corpo.provedor ?? '')
  const chave = String(corpo.chave ?? '').trim()
  const modelo = String(corpo.modelo ?? '').trim() || PROVEDORES[provedor]?.modeloPadrao
  if (!PROVEDORES[provedor]) return res.status(400).json({ error: 'Escolha Claude, Gemini ou ChatGPT.' })
  if (!PROVEDORES[provedor].formato.test(chave)) return res.status(400).json({ error: `Isto não parece uma chave de API da ${PROVEDORES[provedor].nome}. Copie a chave inteira do painel do provedor.` })
  if (!MODELO_VALIDO.test(modelo)) return res.status(400).json({ error: 'Nome de modelo inválido.' })
  if (excedeuLimite?.('ia-chave', usuario, 6, 10 * 60_000)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' })

  const papel = (await (await banco(`memberships?org_id=eq.${org}&user_id=eq.${usuario}&select=papel`)).json())?.[0]?.papel
  if (papel !== 'owner' && papel !== 'admin') return res.status(403).json({ error: 'Só o dono ou um administrador liga a IA da organização.' })

  await testarChave({ provedor, chave, fetcher })
  await banco(`ia_chaves_cliente?org_id=eq.${org}&ativa=is.true`, { metodo: 'PATCH', corpo: { ativa: false, updated_at: new Date().toISOString() }, prefer: 'return=minimal' })
  await banco('ia_chaves_cliente?on_conflict=org_id,provedor', { metodo: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', corpo: {
    org_id: org, provedor, modelo, cifrada: cifrar(chave, segredo), final: chave.slice(-4), ativa: true, created_by: usuario, updated_at: new Date().toISOString(),
  } })
  return res.status(200).json({ ok: true, provedor, modelo, final: chave.slice(-4) })
}

/**
 * Conversa (texto livre) com a IA do cliente, para o chat "Minha IA".
 * mensagens: [{ papel: 'usuario' | 'ia', texto }]. Devolve { texto, modelo, entrada, saida }.
 */
export async function conversarIA({ provedor, chave, modelo, sistema, mensagens, fetcher = fetch, maxTokens = 4000 }) {
  const m = MODELO_VALIDO.test(modelo ?? '') ? modelo : PROVEDORES[provedor]?.modeloPadrao
  const lista = mensagens.map((x) => ({ papel: x.papel === 'ia' ? 'ia' : 'usuario', texto: String(x.texto ?? '') }))
  if (provedor === 'anthropic') {
    const j = await chamar(fetcher, 'https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: m, max_tokens: maxTokens, system: sistema, messages: lista.map((x) => ({ role: x.papel === 'ia' ? 'assistant' : 'user', content: x.texto })) }),
    }, PROVEDORES.anthropic.nome)
    return { texto: (j?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(), modelo: j?.model ?? m, entrada: j?.usage?.input_tokens ?? 0, saida: j?.usage?.output_tokens ?? 0 }
  }
  if (provedor === 'openai') {
    const j = await chamar(fetcher, 'https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: m, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: sistema }, ...lista.map((x) => ({ role: x.papel === 'ia' ? 'assistant' : 'user', content: x.texto }))] }),
    }, PROVEDORES.openai.nome)
    const msg = j?.choices?.[0]?.message ?? {}
    return { texto: String(msg.refusal ?? msg.content ?? '').trim(), modelo: j?.model ?? m, entrada: j?.usage?.prompt_tokens ?? 0, saida: j?.usage?.completion_tokens ?? 0 }
  }
  if (provedor === 'google') {
    const j = await chamar(fetcher, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: lista.map((x) => ({ role: x.papel === 'ia' ? 'model' : 'user', parts: [{ text: x.texto }] })),
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }, PROVEDORES.google.nome)
    const c = j?.candidates?.[0]
    return { texto: (c?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim(), modelo: j?.modelVersion ?? m, entrada: j?.usageMetadata?.promptTokenCount ?? 0, saida: j?.usageMetadata?.candidatesTokenCount ?? 0 }
  }
  throw erro(400, 'Provedor inválido')
}
