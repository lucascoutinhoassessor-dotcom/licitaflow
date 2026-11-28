// Passo a passo do topo da tela: mostra em que ponto o usuário está e o que fazer agora.
/* global window, document */
;(function () {
  const novo = (tag, cls, texto) => { const e = document.createElement(tag); if (cls) e.className = cls; if (texto != null) e.textContent = texto; return e }
  const erroDe = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

  function passos(s) {
    const g = s.guia ?? {}
    const cg = s.portais?.find((p) => p.id === 'comprasgov')
    return [
      { feito: g.conta, titulo: 'Conta conectada', texto: `Você entrou como ${s.conta?.org?.nome ?? ''}. O site LicitaForce recebe tudo o que acontecer.` },
      {
        feito: g.portalLogado, titulo: 'Entre no portal',
        texto: g.portalAberto ? 'Faça o login na janela do Compras.gov.br (senha e captcha são sempre seus). Quando o login terminar, este passo fica verde.' : 'Abra o Compras.gov.br numa janela do programa e faça o login como fornecedor.',
        acoes: g.portalAberto ? [{ rotulo: 'Mostrar a janela do portal', fn: () => window.pav.abrirPortal('comprasgov', 'producao') }]
          : [{ rotulo: 'Abrir Compras.gov.br', fn: () => window.pav.abrirPortal('comprasgov', 'producao') }, { rotulo: 'Treinamento', secundario: true, fn: () => window.pav.abrirPortal('comprasgov', 'treinamento') }],
      },
      {
        feito: g.salaAberta, titulo: 'Abra a sala de disputa',
        texto: 'Na janela do portal, vá em "Compras", abra o pregão e entre na disputa (sala de lances). O programa reconhece a compra sozinho e os itens aparecem em "Máquina de lances".',
        acoes: cg?.aberto ? [{ rotulo: 'Ir para as minhas compras', fn: () => window.pav.irParaDisputas('comprasgov') }] : [],
      },
      {
        feito: g.maquinaLigada, titulo: 'Configure e ligue',
        texto: s.simulacao !== false
          ? 'Em cada item, defina o lance mínimo e o desconto e clique em Ligar. O modo simulação está ligado: a máquina mostra o lance que daria, sem enviar.'
          : 'Em cada item, defina o lance mínimo e o desconto e clique em Ligar. A máquina cobre o melhor lance até o seu mínimo.',
      },
    ]
  }

  window.desenharGuia = function (s) {
    const area = document.getElementById('guia')
    if (!area) return
    const lista = passos(s)
    const atual = lista.findIndex((p) => !p.feito)
    area.replaceChildren(...lista.map((p, i) => {
      const c = novo('div', 'passo' + (p.feito ? ' feito' : i === atual ? ' atual' : ''))
      const n = novo('span', 'numero', p.feito ? '✓' : String(i + 1))
      const corpo = novo('div')
      corpo.append(novo('strong', null, p.titulo))
      if (i === atual || (!p.feito && i < atual + 1)) corpo.append(novo('p', 'mudo', p.texto))
      if (i === atual && p.acoes?.length) {
        const acoes = novo('div', 'acoes')
        for (const a of p.acoes) {
          const b = novo('button', a.secundario ? 'secundario' : '', a.rotulo)
          b.addEventListener('click', async () => { try { await a.fn() } catch (e) { window.alert(erroDe(e)) } })
          acoes.append(b)
        }
        corpo.append(acoes)
      }
      c.append(n, corpo)
      return c
    }))
  }
})()
