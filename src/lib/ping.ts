// Som do aviso com o app aberto: o áudio enviado pelo master em /master/som-aviso ou, sem ele, o padrão
// (vinheta de três notas + voz dizendo "licitaforce!", public/sons/licitaforce.mp3). Ver src/lib/somAviso.ts.
// Toca pelo Web Audio, então só soa se o navegador já liberou áudio (houve um toque/clique na página).
// Se nada carregar, cai no "ping" de duas notas gerado na hora.
import { baixarSomAviso } from './somAviso'

let ctx: AudioContext | null = null
let voz: Promise<AudioBuffer | null> | null = null
let carregadoEm = 0

function carregarVoz(c: AudioContext) {
  // Recarrega a cada 10 min para pegar um som novo trocado pelo master sem precisar recarregar a página.
  if (voz && Date.now() - carregadoEm > 600_000) voz = null
  if (!voz) {
    carregadoEm = Date.now()
    voz = baixarSomAviso()
      .then(({ dados }) => c.decodeAudioData(dados))
      .catch(() => { voz = null; return null })
  }
  return voz
}

function tocarNotas(c: AudioContext) {
  const agora = c.currentTime
  for (const [freq, inicio] of [[880, 0], [1320, 0.12]] as const) {
    const osc = c.createOscillator()
    const vol = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    vol.gain.setValueAtTime(0.0001, agora + inicio)
    vol.gain.exponentialRampToValueAtTime(0.25, agora + inicio + 0.01)
    vol.gain.exponentialRampToValueAtTime(0.0001, agora + inicio + 0.35)
    osc.connect(vol).connect(c.destination)
    osc.start(agora + inicio)
    osc.stop(agora + inicio + 0.4)
  }
}

export async function tocarPing() {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx = ctx || new Ctor()
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
    if (ctx.state !== 'running') return
    const buffer = await carregarVoz(ctx)
    if (!buffer) return tocarNotas(ctx)
    const fonte = ctx.createBufferSource()
    fonte.buffer = buffer
    fonte.connect(ctx.destination)
    fonte.start()
  } catch { /* sem som, a notificação continua aparecendo */ }
}
