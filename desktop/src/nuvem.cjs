// Conversa com o LicitaForce (Supabase) com o login do próprio usuário: as regras de acesso (RLS) são as
// mesmas do site. A sessão do LicitaForce fica guardada com a criptografia do Windows (safeStorage).
// Nada do portal (senha, cookies, token) passa por aqui.
const fs = require('node:fs')
const path = require('node:path')
const { createClient } = require('@supabase/supabase-js')

function armazenamento(arquivo, safeStorage) {
  let cache = {}
  try {
    const bruto = fs.readFileSync(arquivo)
    cache = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(bruto) : bruto.toString('utf8'))
  } catch { cache = {} }
  const salvar = () => {
    const texto = JSON.stringify(cache)
    fs.mkdirSync(path.dirname(arquivo), { recursive: true })
    fs.writeFileSync(arquivo, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(texto) : texto)
  }
  return {
    getItem: (k) => cache[k] ?? null,
    setItem: (k, v) => { cache[k] = v; salvar() },
    removeItem: (k) => { delete cache[k]; salvar() },
  }
}

function criarNuvem({ config, arquivoSessao, safeStorage, nomeComputador, versao }) {
  const sb = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { storage: armazenamento(arquivoSessao, safeStorage), persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  let org = null
  let computadorId = null
  let empresas = []
  const sessoes = new Map() // `${portal}:${chave}` → linha de pav_sessoes
  let fila = []
  let enviando = false

  const erroAmigavel = (e) => {
    const m = e?.message ?? String(e)
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.'
    if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar.'
    if (/fetch failed|network|ENOTFOUND|ECONN/i.test(m)) return 'Sem conexão com a internet.'
    return m
  }

  async function usuario() {
    const { data } = await sb.auth.getSession()
    return data.session?.user ?? null
  }

  async function entrar(email, senha) {
    const { error } = await sb.auth.signInWithPassword({ email, password: senha })
    if (error) throw new Error(erroAmigavel(error))
    return prepararConta()
  }

  async function sair() {
    await sb.auth.signOut().catch(() => {})
    org = null; computadorId = null; sessoes.clear(); fila = []
  }

  /** Organizações do usuário; usa a escolhida antes ou a primeira. */
  async function prepararConta(orgEscolhida) {
    const u = await usuario()
    if (!u) return null
    const { data, error } = await sb.from('memberships').select('org_id, papel, organizations(nome)').eq('user_id', u.id)
    if (error) throw new Error(erroAmigavel(error))
    const orgs = (data ?? []).map((m) => ({ id: m.org_id, nome: m.organizations?.nome ?? 'Organização', papel: m.papel }))
    if (!orgs.length) throw new Error('Sua conta ainda não tem organização. Termine o cadastro no site.')
    org = orgs.find((o) => o.id === orgEscolhida) ?? orgs[0]
    const emp = await sb.from('empresas').select('cnpj, razao_social, nome_fantasia').eq('org_id', org.id)
    empresas = emp.data ?? []
    await sinalDeVida()
    await carregarSessoes()
    return { email: u.email, org, orgs }
  }

  /** Registra o computador e renova o sinal de vida (o site mostra "computador conectado"). */
  async function sinalDeVida() {
    if (!org) return
    const u = await usuario()
    if (!u) return
    const { data, error } = await sb.from('pav_computadores')
      .upsert({ org_id: org.id, user_id: u.id, nome: nomeComputador, versao, sinal_em: new Date().toISOString() }, { onConflict: 'org_id,user_id,nome' })
      .select('id').single()
    if (error) throw new Error(erroAmigavel(error))
    computadorId = data.id
    const ativas = [...sessoes.values()].filter((s) => s.situacao === 'acompanhando').map((s) => s.id)
    if (ativas.length) await sb.from('pav_sessoes').update({ sinal_em: new Date().toISOString() }).in('id', ativas)
  }

  async function carregarSessoes() {
    if (!org) return []
    const { data } = await sb.from('pav_sessoes').select('*, processos(objeto, numero)').eq('org_id', org.id)
      .neq('situacao', 'encerrada').order('created_at', { ascending: false }).limit(50)
    sessoes.clear()
    for (const s of data ?? []) sessoes.set(`${s.portal}:${s.chave}`, s)
    return [...sessoes.values()]
  }

  /** Começa (ou retoma) o acompanhamento de um pregão. Respeita o módulo e o limite do plano no banco. */
  async function garantirSessao(portal, chave, titulo) {
    const k = `${portal}:${chave}`
    const atual = sessoes.get(k)
    if (atual && atual.situacao !== 'encerrada') return atual
    const { data, error } = await sb.from('pav_sessoes')
      .upsert({ org_id: org.id, portal, chave, titulo, computador_id: computadorId, situacao: 'acompanhando', sinal_em: new Date().toISOString() }, { onConflict: 'org_id,portal,chave' })
      .select('*, processos(objeto, numero)').single()
    if (error) throw new Error(erroAmigavel(error))
    sessoes.set(k, data)
    return data
  }

  async function mudarSituacao(sessaoId, situacao) {
    const { data, error } = await sb.from('pav_sessoes').update({ situacao }).eq('id', sessaoId).select('*, processos(objeto, numero)').single()
    if (error) throw new Error(erroAmigavel(error))
    sessoes.set(`${data.portal}:${data.chave}`, data)
    return data
  }

  /** Eventos vão numa fila e saem em lotes; o banco ignora os repetidos pela impressão. */
  function enfileirar(sessaoId, eventos) {
    for (const e of eventos) fila.push({ sessao_id: sessaoId, org_id: org.id, ...e })
    if (fila.length > 2000) fila = fila.slice(-2000)
  }

  async function enviarFila() {
    if (enviando || !fila.length || !org) return 0
    enviando = true
    const lote = fila.slice(0, 100)
    try {
      const { error } = await sb.from('pav_eventos').upsert(lote, { onConflict: 'sessao_id,impressao', ignoreDuplicates: true })
      if (error) throw error
      fila = fila.slice(lote.length)
      return lote.length
    } finally { enviando = false }
  }

  return {
    entrar, sair, prepararConta, sinalDeVida, carregarSessoes, garantirSessao, mudarSituacao, enfileirar, enviarFila,
    usuario, get org() { return org }, get empresas() { return empresas }, get sessoes() { return [...sessoes.values()] },
    sessaoPorChave: (portal, chave) => sessoes.get(`${portal}:${chave}`), pendentes: () => fila.length, erroAmigavel,
  }
}

module.exports = { criarNuvem }
