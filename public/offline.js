const botao = document.getElementById('tentar')
  const estado = document.getElementById('estado')
  let pendente = false, timer, tentativas = 0
  function agendar() {
    clearTimeout(timer)
    timer = setTimeout(verificar, Math.min(30000, 5000 * Math.pow(2, Math.min(tentativas, 3))))
  }
  async function verificar() {
    if (pendente) return
    clearTimeout(timer)
    if (document.hidden) { agendar(); return }
    pendente = true
    botao.disabled = true
    estado.textContent = 'Verificando a conexão…'
    const abort = new AbortController()
    const limite = setTimeout(() => abort.abort(), 6000)
    try {
      // Requisição não navegacional: o service worker não pode respondê-la com esta tela.
      const resposta = await fetch('/manifest.webmanifest?conexao=' + Date.now(), { cache: 'no-store', signal: abort.signal })
      if (!resposta.ok) throw new Error('Serviço indisponível')
      const manifesto = await resposta.json()
      if (manifesto.name !== 'LicitaForce') throw new Error('Resposta inesperada')
      estado.textContent = 'Conexão restabelecida. Abrindo a plataforma…'
      window.location.reload()
      return
    } catch (_) {
      tentativas++
      estado.textContent = 'A conexão ainda não foi restabelecida. Tentaremos novamente em instantes.'
    } finally {
      clearTimeout(limite)
      pendente = false
      botao.disabled = false
    }
    agendar()
  }
  botao.addEventListener('click', () => { tentativas = 0; verificar() })
  window.addEventListener('online', () => { tentativas = 0; verificar() })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verificar() })
  agendar()
