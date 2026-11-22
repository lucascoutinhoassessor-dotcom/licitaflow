// /api/oportunidades: a pesquisa antiga (que percorria a fonte externa) saiu; clientes antigos recebem 410.
// O mesmo endereço agora serve a camada de dados brutos no Turso (server/turso.js):
//   POST ?acao=turso-coletar   (cron, cabeçalho x-coleta conferido no banco) → grava no Turso o que mudou no PNCP
//   GET  ?acao=turso-situacao  (master)                                          → configurado? quantos editais? última coleta
//   GET  ?acao=turso-buscar&q=&uf= (usuário logado)                              → busca rápida no bruto
import { usuarioLogado, excedeuLimite, guardarNoNavegador } from './protecao.js'
import { buscarBruto, clienteTurso, coletarRodada, situacaoTurso } from './turso.js'

async function rpcServico(fetcher, base, chave, nome, corpo) {
  const r = await fetcher(`${base}/rest/v1/rpc/${nome}`, { method: 'POST', headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(10000) })
  return r.ok ? r.json().catch(() => null) : null
}

export function criarHandler({ fetcher = fetch, env = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    const acao = String(req.query?.acao ?? '')
    if (!acao.startsWith('turso-')) return res.status(410).json({ error: 'A pesquisa foi atualizada. Recarregue a página para usar o catálogo indexado.' })
    const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!base || !anon) return res.status(503).json({ error: 'Configuração Supabase ausente no servidor' })
    const turso = clienteTurso(env, fetcher)
    try {
      if (acao === 'turso-coletar') {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
        // O token mora no banco (licitaflow_turso.config): a Vercel só pergunta se o cabeçalho confere.
        const coleta = String(req.headers['x-coleta'] ?? '')
        if (!/^[0-9a-f]{32,200}$/.test(coleta) || !env.SUPABASE_SERVICE_ROLE_KEY) return res.status(401).json({ error: 'Não autorizado' })
        const ok = await rpcServico(fetcher, base, env.SUPABASE_SERVICE_ROLE_KEY, 'turso_conferir_token', { p_token: coleta })
        if (ok !== true) return res.status(401).json({ error: 'Não autorizado' })
        if (!turso) return res.status(503).json({ error: 'Turso não configurado' })
        return res.status(200).json({ feitos: await coletarRodada(turso, { fetcher }) })
      }
      const token = req.headers.authorization
      if (!/^Bearer \S+$/.test(token ?? '')) return res.status(401).json({ error: 'Entre na sua conta' })
      const usuario = await usuarioLogado(base, anon, token)
      if (!usuario) return res.status(401).json({ error: 'Entre na sua conta' })

      if (acao === 'turso-situacao') {
        const r = await fetcher(`${base}/rest/v1/rpc/is_platform_admin`, { method: 'POST', headers: { apikey: anon, Authorization: token, 'Content-Type': 'application/json' }, body: '{}' })
        if ((await r.json().catch(() => false)) !== true) return res.status(403).json({ error: 'Acesso restrito ao master' })
        const coletaAgendada = env.SUPABASE_SERVICE_ROLE_KEY ? (await rpcServico(fetcher, base, env.SUPABASE_SERVICE_ROLE_KEY, 'turso_coleta_ativa', {}).catch(() => false)) === true : false
        if (!turso) return res.status(200).json({ configurado: false, coletaAgendada })
        return res.status(200).json({ configurado: true, coletaAgendada, ...(await situacaoTurso(turso)) })
      }
      if (acao === 'turso-buscar') {
        if (!turso) return res.status(503).json({ error: 'A base rápida ainda não foi conectada.' })
        if (excedeuLimite('turso-buscar', usuario, 60)) return res.status(429).json({ error: 'Muitas consultas em pouco tempo. Aguarde um minuto.' })
        const editais = await buscarBruto(turso, { termo: String(req.query?.q ?? '').slice(0, 200), uf: String(req.query?.uf ?? '').toUpperCase() })
        guardarNoNavegador(res, 60)
        return res.status(200).json({ editais })
      }
      return res.status(400).json({ error: 'Ação inválida' })
    } catch (e) {
      return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Não foi possível concluir agora.' })
    }
  }
}

export default criarHandler()
