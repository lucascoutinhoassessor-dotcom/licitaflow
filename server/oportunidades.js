// /api/oportunidades: a pesquisa antiga (que percorria a fonte externa) saiu; clientes antigos recebem 410.
// O mesmo endereço agora serve a base de editais no Turso (server/turso.js):
//   POST ?acao=turso-coletar   (pg_cron, cabeçalho x-coleta conferido no banco) → grava no Turso o que mudou no PNCP
//   GET  ?acao=turso-situacao  (master)                                          → conectado? quantos editais? última coleta
//   POST ?acao=turso-buscar    (usuário logado) {filtros, pagina}                → busca no mesmo formato do buscar_oportunidades
import { emCache, usuarioLogado, excedeuLimite } from './protecao.js'
import { buscarTurso, clienteTurso, coletarRodada, FiltroInvalido, situacaoTurso } from './turso.js'

async function rpcServico(fetcher, base, chave, nome, corpo) {
  const r = await fetcher(`${base}/rest/v1/rpc/${nome}`, { method: 'POST', headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(10000) })
  return r.ok ? r.json().catch(() => null) : null
}

export function criarHandler({ fetcher = fetch, env = process.env, validarSessao = usuarioLogado } = {}) {
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
      // A sessão confirmada fica 5 minutos em memória: a busca não espera o Supabase a cada página.
      const sessao = emCache('sessao', token, 5 * 60_000, () => validarSessao(base, anon, token), 2000)

      if (acao === 'turso-situacao') {
        if (!(await sessao)) return res.status(401).json({ error: 'Entre na sua conta' })
        const r = await fetcher(`${base}/rest/v1/rpc/is_platform_admin`, { method: 'POST', headers: { apikey: anon, Authorization: token, 'Content-Type': 'application/json' }, body: '{}' })
        if ((await r.json().catch(() => false)) !== true) return res.status(403).json({ error: 'Acesso restrito ao master' })
        const coletaAgendada = env.SUPABASE_SERVICE_ROLE_KEY ? (await rpcServico(fetcher, base, env.SUPABASE_SERVICE_ROLE_KEY, 'turso_coleta_ativa', {}).catch(() => false)) === true : false
        if (!turso) return res.status(200).json({ configurado: false, coletaAgendada })
        return res.status(200).json({ configurado: true, coletaAgendada, ...(await situacaoTurso(turso)) })
      }
      if (acao === 'turso-buscar') {
        if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
        if (!turso) return res.status(409).json({ error: 'A base rápida ainda não foi conectada.', codigo: 'turso_indisponivel' })
        const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
        const filtros = corpo.filtros && typeof corpo.filtros === 'object' ? corpo.filtros : {}
        const pagina = Number(corpo.pagina) || 1
        // Consulta e login em paralelo; o resultado só sai se a sessão for válida.
        const chave = JSON.stringify([filtros, pagina])
        const consulta = emCache('turso-busca', chave, 60_000, () => buscarTurso(turso, filtros, pagina), 500)
        consulta.catch(() => undefined)
        const usuario = await sessao
        if (!usuario) return res.status(401).json({ error: 'Entre na sua conta' })
        if (excedeuLimite('turso-buscar', usuario, 90)) return res.status(429).json({ error: 'Muitas consultas em pouco tempo. Aguarde um minuto.' })
        const r = await consulta
        // Enquanto a carga completa não terminou (ou os itens estão atrasados), quem responde é o Postgres.
        if (!r.catalogo.carga_inicial_concluida) return res.status(409).json({ error: 'A base rápida ainda está carregando.', codigo: 'turso_carregando' })
        if (r.detalhesPendentes > Math.max(20, r.totalRegistros * 0.1)) return res.status(409).json({ error: 'Itens ainda em coleta na base rápida.', codigo: 'turso_itens' })
        // Palavra-chave também procura nos itens: até os itens cobrirem 90% dos editais, o Postgres responde.
        if (r.comTermo && r.coberturaItens < 0.9) return res.status(409).json({ error: 'Itens ainda em coleta na base rápida.', codigo: 'turso_itens' })
        const { coberturaItens, comTermo, ...resposta } = r
        return res.status(200).json({ ...resposta, catalogo: { ...resposta.catalogo, cobertura_itens: Math.round(coberturaItens * 100) } })
      }
      return res.status(400).json({ error: 'Ação inválida' })
    } catch (e) {
      if (e instanceof FiltroInvalido) return res.status(400).json({ error: e.message })
      return res.status(e.status ?? 500).json({ error: e.status ? e.message : 'Não foi possível concluir agora.' })
    }
  }
}

export default criarHandler()
