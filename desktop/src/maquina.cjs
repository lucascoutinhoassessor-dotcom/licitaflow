// Ciclo da máquina de lances, separado do Electron para poder ser testado:
// para cada item ligado, pergunta ao motor o que fazer e, se for lance, envia (ou simula).
const { decidir } = require('./motor.cjs')

const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })

/**
 * deps:
 *  estrategias            — criarEstrategias(...)
 *  executar(idPortal, codigo) → Promise<{ ok, status, mensagem }>  (roda o código na janela do portal)
 *  registrar({ titulo, item, texto, enviado, valor, chave })        (tela, histórico e LicitaForce)
 *  notificar(titulo, corpo)                                          (aviso do Windows + som)
 *  tituloDe(idPortal, chave)
 *  agora() → ms (opcional)
 */
function criarMaquina({ estrategias, executar, registrar, notificar, tituloDe, agora = () => Date.now(), tempoLimite = 15000 }) {
  const controles = new Map()

  async function enviar(idPortal, conector, it, valor, k, titulo) {
    const ctl = controles.get(k)
    ctl.enviando = true
    try {
      if (estrategias.simulacao) {
        ctl.ultimoEnvio = agora()
        registrar({ titulo, item: it.item, chave: it.chave, valor, enviado: false, texto: `Simulação: daria lance de ${moeda(valor)} no item ${it.item} (não enviado).` })
        return
      }
      const codigo = conector.codigoEnviarLance({ apiBase: it.apiBase, chave: it.chave, item: it.item, valor, faseBruta: it.faseBruta })
      const r = await Promise.race([
        executar(idPortal, codigo),
        new Promise((res) => setTimeout(() => res({ ok: false, status: 0, mensagem: `O portal não respondeu em ${tempoLimite / 1000} s.` }), tempoLimite)),
      ])
      ctl.ultimoEnvio = agora()
      if (r?.ok) {
        ctl.erros = 0
        registrar({ titulo, item: it.item, chave: it.chave, valor, enviado: true, texto: `Lance enviado: ${moeda(valor)} no item ${it.item}.` })
        return
      }
      falhou(idPortal, it, titulo, ctl, `Lance de ${moeda(valor)} recusado no item ${it.item}: ${r?.mensagem || 'código ' + (r?.status ?? '?')}.`, valor)
    } catch (e) {
      ctl.ultimoEnvio = agora()
      falhou(idPortal, it, titulo, ctl, `Não foi possível enviar o lance do item ${it.item}: ${e.message}`, valor)
    } finally {
      ctl.enviando = false
    }
  }

  function falhou(idPortal, it, titulo, ctl, texto, valor) {
    ctl.erros = (ctl.erros ?? 0) + 1
    registrar({ titulo, item: it.item, chave: it.chave, valor, enviado: false, recusado: true, texto })
    // Três falhas seguidas: desliga o item por segurança e avisa.
    if (ctl.erros >= 3) {
      estrategias.mudar(idPortal, it.chave, it.item, { ligado: false })
      notificar('Máquina de lances parou um item', `${titulo}\nItem ${it.item}: o portal recusou 3 lances seguidos. Confira a sala.`)
    }
  }

  /** Avalia os itens de um portal. Devolve as promessas de envio (para quem quiser esperar) e se algo mudou. */
  function avaliar(idPortal, conector, ctx) {
    let mudou = false
    const envios = []
    for (const it of ctx.estado.values()) {
      if (!it.chave) continue
      const k = `${idPortal}:${it.chave}:${it.item}`
      const ctl = controles.get(k) ?? {}
      controles.set(k, ctl)
      const cfg = estrategias.de(idPortal, it.chave, it.item)
      if (!cfg.ligado) {
        if (ctl.decisao && ctl.decisao.acao !== 'parado') { ctl.decisao = { acao: 'parado', motivo: 'Parado' }; mudou = true }
        ctl.erros = 0
        continue
      }
      const d = decidir(cfg, it, ctl, agora())
      if (ctl.decisao?.motivo !== d.motivo) mudou = true
      ctl.decisao = d
      const titulo = tituloDe(idPortal, it.chave)
      if (d.acao === 'limite' && !ctl.avisouLimite) {
        ctl.avisouLimite = true
        notificar('Lance mínimo alcançado', `${titulo}\nItem ${it.item}: a máquina parou no seu mínimo (${moeda(cfg.minimo)}).`)
      }
      if (d.acao !== 'limite') ctl.avisouLimite = false
      if (d.acao === 'enviar') { mudou = true; envios.push(enviar(idPortal, conector, it, d.valor, k, titulo)) }
    }
    return { mudou, envios }
  }

  return { avaliar, decisaoDe: (k) => controles.get(k)?.decisao ?? null }
}

module.exports = { criarMaquina, moeda }
