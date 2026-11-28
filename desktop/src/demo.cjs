// Demonstração da máquina de lances: um pregão de mentira, com "concorrentes" que dão lances sozinhos, para o
// cliente ver como a máquina funciona sem estar numa disputa de verdade. Nada é enviado a nenhum portal.
const CHAVE = 'DEMO'
const ITENS = [
  { item: '1', descricao: 'Papel A4 75 g/m² (caixa com 10 resmas)', melhor: 189.9, meu: 199, posicao: 3, pisoConcorrente: 151.2, minimoSugerido: 160, desconto: 1 },
  { item: '2', descricao: 'Caneta esferográfica azul (caixa com 50)', melhor: 42.5, meu: 45, posicao: 2, pisoConcorrente: 36.9, minimoSugerido: 38, desconto: 0.3 },
]
const FASES = [
  { ate: 100, nome: 'Em disputa aberta' },
  { ate: 160, nome: 'Encerramento aleatório' },
  { ate: Infinity, nome: 'Encerrado' },
]

function criarDemo({ aoEvento = () => {}, aleatorio = Math.random, agora = () => Date.now() } = {}) {
  const ctx = { estado: new Map(), apis: new Map(), empresas: [] }
  let inicio = 0

  const fase = () => FASES.find((f) => (agora() - inicio) / 1000 < f.ate).nome
  const moeda = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  function iniciar() {
    inicio = agora()
    ctx.estado.clear()
    for (const it of ITENS) ctx.estado.set(`${CHAVE}|${it.item}`, { chave: CHAVE, item: it.item, descricao: it.descricao, fase: FASES[0].nome, melhor: it.melhor, meu: it.meu, posicao: it.posicao })
    aoEvento({ tipo: 'fase', texto: 'Demonstração: a disputa começou. Defina o lance mínimo e clique em Ligar.' })
  }

  /** Um "tique" da sala: muda a fase e, às vezes, um concorrente cobre o seu lance. */
  function tique() {
    const f = fase()
    for (const it of ctx.estado.values()) {
      const base = ITENS.find((x) => x.item === it.item)
      if (it.fase !== f) {
        it.fase = f
        aoEvento({ tipo: 'fase', item: it.item, texto: `Item ${it.item}: ${f}` })
        if (f === 'Encerrado') aoEvento({ tipo: it.posicao === 1 ? 'aviso' : 'fase', item: it.item, texto: it.posicao === 1 ? `Item ${it.item}: você terminou em 1º lugar com ${moeda(it.meu)}.` : `Item ${it.item}: encerrado com melhor lance de ${moeda(it.melhor)}.` })
      }
      if (f === 'Encerrado') continue
      if (it.posicao === 1 && aleatorio() < 0.55) {
        const novo = Math.round((it.melhor - (0.2 + aleatorio() * 1.3)) * 100) / 100
        if (novo >= base.pisoConcorrente) {
          it.melhor = novo
          it.posicao = 2
          aoEvento({ tipo: 'lance', item: it.item, texto: `Item ${it.item}: um concorrente cobriu com ${moeda(novo)}.` })
        }
      }
    }
  }

  /** O lance "dado" pela máquina na demonstração. */
  function aplicarLance(item, valor) {
    const it = ctx.estado.get(`${CHAVE}|${item}`)
    if (!it || it.fase === 'Encerrado') return
    it.meu = valor
    if (valor < it.melhor) { it.melhor = valor; it.posicao = 1 }
  }

  return { ctx, iniciar, tique, aplicarLance, CHAVE, ITENS }
}

module.exports = { criarDemo, CHAVE_DEMO: CHAVE, ITENS_DEMO: ITENS }
