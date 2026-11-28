// Tela da máquina de lances: um cartão por pregão, uma linha por item, com lance mínimo, desconto,
// opções e o botão de ligar/parar. As linhas são criadas uma vez e só atualizadas, para não apagar o que
// o usuário está digitando quando a sala muda.
/* global window, document */
;(function () {
  const linhas = new Map()
  const grupos = new Map()
  const moeda = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
  const numeroBr = (v) => v == null ? '' : String(v).replace('.', ',')
  const novo = (tag, cls, texto) => { const e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e }
  let simulacao = true

  async function mudar(it, parcial) {
    try { await window.pav.estrategia(it.portal, it.chave, it.item, parcial) } catch (e) {
      window.alert(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }

  function campo(rotulo, input) { const l = novo('label', 'campo-disputa'); l.append(novo('span', null, rotulo), input); return l }

  function criarLinha(it) {
    const raiz = novo('div', 'item-disputa')
    const cab = novo('div', 'cab-item')
    const titulo = novo('strong'); const selo = novo('span', 'selo'); const fase = novo('span', 'mudo')
    cab.append(titulo, selo, fase)

    const valores = novo('div', 'valores')
    const melhor = novo('span'); const meu = novo('span'); const pos = novo('span')
    valores.append(novo('span', 'mudo', 'Melhor lance'), melhor, novo('span', 'mudo', 'Meu lance'), meu, novo('span', 'mudo', 'Posição'), pos)

    const minimo = novo('input'); minimo.inputMode = 'decimal'; minimo.placeholder = '0,00'
    const desconto = novo('input'); desconto.inputMode = 'decimal'; desconto.placeholder = '0,01'
    const tipo = novo('select'); tipo.append(new Option('R$', 'valor'), new Option('%', 'percentual'))
    const intervalo = novo('input'); intervalo.inputMode = 'numeric'; intervalo.placeholder = '20'
    const casas4 = novo('input'); casas4.type = 'checkbox'
    const soNoFim = novo('input'); soNoFim.type = 'checkbox'
    const botao = novo('button', 'play')

    const ctrl = novo('div', 'controles')
    const desc = novo('div', 'desconto'); desc.append(desconto, tipo)
    ctrl.append(campo('Lance mínimo (R$)', minimo), campo('Desconto por lance', desc), campo('Intervalo (s)', intervalo))
    const opcoes = novo('div', 'opcoes')
    const op = (input, texto) => { const l = novo('label'); l.append(input, document.createTextNode(' ' + texto)); return l }
    opcoes.append(op(casas4, 'Lances com 4 casas decimais'), op(soNoFim, 'Só no fim (aleatório ou prorrogação)'))
    const motivo = novo('p', 'motivo mudo')
    const linha = novo('div', 'linha-controles'); linha.append(ctrl, botao)
    raiz.append(cab, valores, linha, opcoes, motivo)

    const atual = { it }
    minimo.addEventListener('change', () => mudar(atual.it, { minimo: minimo.value }))
    desconto.addEventListener('change', () => mudar(atual.it, { desconto: desconto.value }))
    tipo.addEventListener('change', () => mudar(atual.it, { tipoDesconto: tipo.value }))
    intervalo.addEventListener('change', () => mudar(atual.it, { intervaloSeg: intervalo.value }))
    casas4.addEventListener('change', () => mudar(atual.it, { casas4: casas4.checked }))
    soNoFim.addEventListener('change', () => mudar(atual.it, { soNoFim: soNoFim.checked }))
    botao.addEventListener('click', () => {
      const e = atual.it.estrategia
      if (e.ligado) return mudar(atual.it, { ligado: false })
      if (!(e.minimo > 0)) return window.alert('Defina o lance mínimo do item antes de ligar.')
      if (!simulacao && !window.confirm(`Ligar lances AUTOMÁTICOS de verdade no item ${atual.it.item}?\n\nA máquina vai cobrir o melhor lance até ${moeda(e.minimo)}, nunca abaixo disso.`)) return
      mudar(atual.it, { ligado: true })
    })

    const valorSemFoco = (input, v) => { if (document.activeElement !== input) input.value = v }
    atual.atualizar = (it) => {
      atual.it = it
      const e = it.estrategia
      titulo.textContent = `Item ${it.item}${it.descricao ? ' · ' + it.descricao : ''}`
      const ganhando = it.posicao === 1 || (it.meu != null && it.melhor != null && it.meu <= it.melhor)
      selo.textContent = it.melhor == null ? 'aguardando' : ganhando ? 'ganhando' : 'perdendo'
      selo.className = 'selo ' + (it.melhor == null ? '' : ganhando ? 'ok' : 'perigo')
      fase.textContent = it.fase ?? ''
      melhor.textContent = moeda(it.melhor); meu.textContent = moeda(it.meu); pos.textContent = it.posicao ? `${it.posicao}º` : '—'
      valorSemFoco(minimo, numeroBr(e.minimo)); valorSemFoco(desconto, numeroBr(e.desconto)); valorSemFoco(intervalo, String(e.intervaloSeg ?? 20))
      if (document.activeElement !== tipo) tipo.value = e.tipoDesconto
      casas4.checked = !!e.casas4; soNoFim.checked = !!e.soNoFim
      for (const i of [minimo, desconto, tipo, intervalo]) i.disabled = !!e.ligado
      botao.textContent = e.ligado ? '■ Parar' : '▶ Ligar'
      botao.className = e.ligado ? 'play ligado' : 'play'
      raiz.classList.toggle('executando', !!e.ligado)
      motivo.textContent = e.ligado ? (it.decisao?.motivo ?? 'Ligado') : 'Parado'
    }
    atual.raiz = raiz
    return atual
  }

  window.desenharDisputa = function (s) {
    simulacao = s.simulacao !== false
    const chk = document.getElementById('simulacao')
    if (chk && document.activeElement !== chk) chk.checked = simulacao
    const aviso = document.getElementById('avisoDisputa')
    const area = document.getElementById('disputa')
    if (!aviso || !area) return
    aviso.textContent = simulacao
      ? 'Modo simulação ligado: a máquina mostra o lance que daria, sem enviar. Desligue para dar lances de verdade.'
      : 'Lances de verdade: a máquina cobre o melhor lance até o seu mínimo, respeitando o intervalo do portal.'
    aviso.className = simulacao ? 'mudo' : 'alerta-real'
    const vivos = new Set()
    if (!s.disputa?.length) {
      if (!area.querySelector('.vazio')) { area.replaceChildren(novo('p', 'vazio', 'Abra a sala de disputa do pregão na janela do portal: os itens aparecem aqui para você definir o lance mínimo e ligar a máquina.')); linhas.clear(); grupos.clear() }
      return
    }
    area.querySelector('.vazio')?.remove()
    for (const p of s.disputa) {
      const gk = `${p.portal}:${p.chave}`
      let g = grupos.get(gk)
      if (!g) {
        g = { raiz: novo('div', 'pregao-disputa'), titulo: novo('h3'), corpo: novo('div') }
        g.raiz.append(g.titulo, g.corpo); area.append(g.raiz); grupos.set(gk, g)
      }
      g.titulo.textContent = p.titulo
      vivos.add(gk)
      for (const it of p.itens) {
        const k = `${gk}:${it.item}`
        const dados = { ...it, portal: p.portal, chave: p.chave }
        let l = linhas.get(k)
        if (!l) { l = criarLinha(dados); linhas.set(k, l); g.corpo.append(l.raiz) }
        l.atualizar(dados)
        vivos.add(k)
      }
    }
    for (const [k, l] of linhas) if (!vivos.has(k)) { l.raiz.remove(); linhas.delete(k) }
    for (const [k, g] of grupos) if (!vivos.has(k)) { g.raiz.remove(); grupos.delete(k) }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('simulacao')?.addEventListener('change', async (e) => {
      const ligada = e.target.checked
      if (!ligada && !window.confirm('Desligar o modo simulação?\n\nA partir de agora, os itens ligados recebem lances de verdade no portal.')) { e.target.checked = true; return }
      await window.pav.simulacao(ligada)
    })
    document.getElementById('pararTudo')?.addEventListener('click', () => window.pav.pararTudo())
  })
})()
