// Mensagens da IA para clientes, pedidas pelo master na hora (Master → Mensagens da IA → Pedir à IA).
// O master escreve uma instrução ("lembre quem tem disputa amanhã de conferir a proposta") e escolhe os clientes;
// para cada um, a IA lê a análise daquele cliente (licitaflow_lembretes.analise_ia, no banco) e redige a mensagem,
// ou diz que a instrução não se aplica a ele. O master revisa a prévia e só então envia (admin_mensagens_ia_enviar).
// Haiku: tarefa curta e repetitiva, um pedido por cliente (regra dos agentes de 21/11/2026).
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'

export const MODELO_MENSAGENS = { modelo: 'claude-haiku-5-5', entrada: 0.1, saida: 0.5 }

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['enviar', 'titulo', 'texto', 'link'],
  properties: {
    enviar: { type: 'boolean', description: 'false quando a instrução não se aplica a este cliente' },
    titulo: { type: 'string', description: 'Assunto curto, até 60 caracteres' },
    texto: { type: 'string', description: 'Mensagem de até 400 caracteres' },
    link: { type: 'string', enum: ['/app', '/app/agentes/radar', '/app/processos', '/app/prazos', '/app/documentos', '/app/agentes', '/app/historico-precos', '/app/agentes/cotador', '/app/avisos'] },
  },
}

const SISTEMA = `Você escreve mensagens curtas do LicitaForce (plataforma de licitações públicas) para um cliente, em português do Brasil.
Recebe a instrução do administrador e a análise daquele cliente: oportunidades novas do Radar, disputas e prazos de hoje e de amanhã,
documentos vencendo e o que ele ainda não configurou.
Regras:
- Use só os fatos da análise. Nunca invente números, datas, órgãos, valores ou objetos.
- Se a instrução depender de algo que este cliente não tem (por exemplo, "quem tem disputa amanhã" e ele não tem nenhuma), responda enviar=false.
- Tom profissional e direto, como um assistente da empresa. Trate o cliente por "você". Sem emojis e sem saudação longa.
- Título com até 60 caracteres; texto com até 400 caracteres, que caiba numa notificação de celular.
- Escolha o link da tela do app mais útil para a mensagem.`

const limpar = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Redige a mensagem de um cliente. `cliente` (SDK) é injetável para testes. */
export async function redigirMensagem({ instrucao, nome, analise, cliente }) {
  const claude = cliente ?? new Anthropic({ timeout: 60_000, maxRetries: 1 })
  const resposta = await claude.beta.messages.parse({
    model: MODELO_MENSAGENS.modelo,
    max_tokens: 2000,
    output_config: { effort: 'low', format: jsonSchemaOutputFormat(ESQUEMA) },
    system: SISTEMA,
    messages: [{ role: 'user', content: `Instrução do administrador:\n${instrucao}\n\nCliente: ${nome}\nAnálise do cliente (JSON):\n${JSON.stringify(analise)}` }],
  })
  if (resposta.stop_reason === 'refusal' || !resposta.parsed_output) return { enviar: false, motivo: 'A IA não redigiu para este cliente.' }
  const p = resposta.parsed_output
  const u = resposta.usage ?? {}
  const custo = ((u.input_tokens ?? 0) * MODELO_MENSAGENS.entrada + (u.output_tokens ?? 0) * MODELO_MENSAGENS.saida) / 1e6
  if (!p.enviar) return { enviar: false, custo_usd: custo }
  const titulo = limpar(p.titulo, 80), texto = limpar(p.texto, 600)
  if (titulo.length < 3 || texto.length < 3) return { enviar: false, motivo: 'Resposta vazia.', custo_usd: custo }
  return { enviar: true, titulo, texto, link: ESQUEMA.properties.link.enum.includes(p.link) ? p.link : '/app', custo_usd: custo }
}

/** Gera a prévia para vários clientes (5 de cada vez). `analises`: [{org_id, nome, analise}]. */
export async function previaMensagens({ instrucao, analises, cliente }) {
  const itens = []
  for (let i = 0; i < analises.length; i += 5) {
    const lote = await Promise.all(analises.slice(i, i + 5).map(async (a) => {
      try {
        return { org_id: a.org_id, nome: a.nome, ...(await redigirMensagem({ instrucao, nome: a.nome, analise: a.analise, cliente })) }
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('A chave da IA foi recusada. Confira ANTHROPIC_API_KEY na Vercel.'), { status: 503 })
        if (e instanceof Anthropic.RateLimitError) return { org_id: a.org_id, nome: a.nome, enviar: false, motivo: 'Limite da IA atingido; tente de novo em instantes.' }
        return { org_id: a.org_id, nome: a.nome, enviar: false, motivo: 'Falha ao redigir para este cliente.' }
      }
    }))
    itens.push(...lote)
  }
  const custo = itens.reduce((s, x) => s + (x.custo_usd ?? 0), 0)
  return { itens: itens.map(({ custo_usd, ...x }) => x), custo_usd: Math.round(custo * 10000) / 10000 }
}
