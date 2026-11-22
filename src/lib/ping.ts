// "Ping" de notificação (duas notas curtas, estilo app de mensagens), gerado na hora com Web Audio:
// não precisa de arquivo de som. Só toca se o navegador já liberou áudio (houve um toque/clique na página).
let ctx: AudioContext | null = null

export async function tocarPing() {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx = ctx || new Ctor()
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
    if (ctx.state !== 'running') return
    const agora = ctx.currentTime
    for (const [freq, inicio] of [[880, 0], [1320, 0.12]] as const) {
      const osc = ctx.createOscillator()
      const vol = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      vol.gain.setValueAtTime(0.0001, agora + inicio)
      vol.gain.exponentialRampToValueAtTime(0.25, agora + inicio + 0.01)
      vol.gain.exponentialRampToValueAtTime(0.0001, agora + inicio + 0.35)
      osc.connect(vol).connect(ctx.destination)
      osc.start(agora + inicio)
      osc.stop(agora + inicio + 0.4)
    }
  } catch { /* sem som, a notificação continua aparecendo */ }
}
