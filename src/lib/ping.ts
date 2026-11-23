// Som do aviso com o app aberto. Cada aviso escolhe o som (src/lib/somAviso.ts → SONS_AVISO):
//   principal   = o "Som do aviso" do console master (áudio enviado lá ou, sem ele, o padrão "licitaforce!")
//   licitaforce = sempre a vinheta + voz padrão (public/sons/licitaforce.mp3)
//   ping        = duas notas curtas geradas na hora
//   silencio    = nada
// Toca pelo Web Audio, então só soa se o navegador já liberou áudio (houve um toque/clique na página).
// Se um arquivo não carregar, cai no "ping" de duas notas.
import { baixarSomAviso, SOM_PADRAO, type SomAviso } from './somAviso'

let ctx: AudioContext | null = null
const cache = new Map<'principal' | 'licitaforce', { buffer: Promise<AudioBuffer | null>; em: number }>()

function carregar(c: AudioContext, qual: 'principal' | 'licitaforce') {
  const atual = cache.get(qual)
  // O principal recarrega a cada 10 min para pegar um som novo trocado pelo master sem recarregar a página.
  if (atual && (qual === 'licitaforce' || Date.now() - atual.em < 600_000)) return atual.buffer
  const dados = qual === 'principal'
    ? baixarSomAviso().then(r => r.dados)
    : fetch(SOM_PADRAO).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('sem áudio'))))
  const buffer = dados.then(d => c.decodeAudioData(d)).catch(() => { cache.delete(qual); return null })
  cache.set(qual, { buffer, em: Date.now() })
  return buffer
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

export async function tocarPing(som: SomAviso | string = 'principal') {
  if (som === 'silencio') return
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx = ctx || new Ctor()
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
    if (ctx.state !== 'running') return
    if (som === 'ping') return tocarNotas(ctx)
    const buffer = await carregar(ctx, som === 'licitaforce' ? 'licitaforce' : 'principal')
    if (!buffer) return tocarNotas(ctx)
    const fonte = ctx.createBufferSource()
    fonte.buffer = buffer
    fonte.connect(ctx.destination)
    fonte.start()
  } catch { /* sem som, a notificação continua aparecendo */ }
}
