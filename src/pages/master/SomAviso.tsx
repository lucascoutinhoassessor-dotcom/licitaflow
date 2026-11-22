import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Upload, RotateCcw, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase, mensagemErro } from '@/lib/supabase'
import { Aviso, Badge, Button, CabecalhoPagina, Card } from '@/components/ui'
import { CAMINHO_SOM_PERSONALIZADO, LIMITE_BYTES, LIMITE_SEGUNDOS, SOM_PADRAO, baixarSomAviso } from '@/lib/somAviso'

async function duracao(dados: ArrayBuffer) {
  const ctx = new AudioContext()
  try { return (await ctx.decodeAudioData(dados.slice(0))).duration } finally { void ctx.close() }
}

/** Console master: ouvir, trocar e voltar ao padrão o som que toca quando chega um aviso com o app aberto. */
export default function SomAviso() {
  const qc = useQueryClient()
  const arquivo = useRef<HTMLInputElement>(null)
  const [versao, setVersao] = useState(() => Date.now())
  const [enviando, setEnviando] = useState(false)
  const [removendo, setRemovendo] = useState(false)

  const atual = useQuery({
    queryKey: ['master-som-aviso', versao],
    queryFn: async () => {
      const { dados, personalizado } = await baixarSomAviso(versao)
      const url = URL.createObjectURL(new Blob([dados], { type: 'audio/mpeg' }))
      return { url, personalizado, segundos: await duracao(dados).catch(() => 0) }
    },
  })
  useEffect(() => () => { if (atual.data) URL.revokeObjectURL(atual.data.url) }, [atual.data])

  function tocar(url?: string) { if (url) void new Audio(url).play().catch(() => toast.error('O navegador não deixou tocar o áudio')) }

  async function enviar(f: File) {
    if (!f.type.startsWith('audio/')) return toast.error('Escolha um arquivo de áudio (MP3, WAV, OGG ou M4A)')
    if (f.size > LIMITE_BYTES) return toast.error('Áudio maior que 1 MB. Use um trecho curto.')
    setEnviando(true)
    try {
      const seg = await duracao(await f.arrayBuffer()).catch(() => { throw new Error('Não consegui ler esse áudio. Tente um MP3.') })
      if (seg > LIMITE_SEGUNDOS) throw new Error(`O áudio tem ${seg.toFixed(1)} s. Use no máximo ${LIMITE_SEGUNDOS} s.`)
      const { error } = await supabase.storage.from('site').upload(CAMINHO_SOM_PERSONALIZADO, f, { contentType: f.type, cacheControl: '60', upsert: true })
      if (error) throw error
      setVersao(Date.now()); await qc.invalidateQueries({ queryKey: ['master-som-aviso'] })
      toast.success('Som do aviso trocado. Os apps abertos passam a usar em até 10 minutos.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setEnviando(false) }
  }

  async function voltarAoPadrao() {
    if (!confirm('Apagar o áudio enviado e voltar ao som padrão "licitaforce!"?')) return
    setRemovendo(true)
    try {
      const { error } = await supabase.storage.from('site').remove([CAMINHO_SOM_PERSONALIZADO])
      if (error) throw error
      setVersao(Date.now())
      toast.success('Voltou ao som padrão.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setRemovendo(false) }
  }

  return <>
    <CabecalhoPagina titulo="Som do aviso" descricao="O áudio que toca quando um aviso chega com o app aberto na tela."/>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold"><Volume2 className="h-4 w-4"/>Som em uso</h2>
          {atual.data && <Badge cor={atual.data.personalizado ? 'azul' : 'neutro'}>{atual.data.personalizado ? 'Enviado por você' : 'Padrão'}</Badge>}
        </div>
        {atual.isError ? <Aviso>Não foi possível carregar o som atual.</Aviso> : <>
          <audio controls src={atual.data?.url} className="w-full" preload="auto"/>
          <p className="text-xs text-muted-foreground">{atual.isLoading ? 'Carregando…' : atual.data?.segundos ? `${atual.data.segundos.toFixed(1)} segundos` : ''}</p>
        </>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => tocar(atual.data?.url)} disabled={!atual.data}><Play className="h-4 w-4"/>Ouvir</Button>
          <Button variante="contorno" carregando={enviando} onClick={() => arquivo.current?.click()}>{!enviando && <Upload className="h-4 w-4"/>}Enviar meu áudio</Button>
          {atual.data?.personalizado && <Button variante="perigo" carregando={removendo} onClick={voltarAoPadrao}>{!removendo && <RotateCcw className="h-4 w-4"/>}Voltar ao padrão</Button>}
          <input ref={arquivo} type="file" accept="audio/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void enviar(f) }}/>
        </div>
      </Card>
      <Card className="space-y-3 p-5 text-sm">
        <h2 className="font-semibold">Como funciona</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Envie um áudio curto: até {LIMITE_SEGUNDOS} segundos e 1 MB (MP3, WAV, OGG ou M4A). Bom tamanho: 1 a 2 segundos.</li>
          <li>Ele vale para todos os clientes. Quem está com o app aberto passa a ouvir o som novo em até 10 minutos.</li>
          <li>Com o app <strong>fechado</strong>, o celular ou o computador toca o som padrão de notificação dele. O navegador não deixa sites trocarem esse som.</li>
          <li>Sem áudio enviado, vale o padrão: vinheta + voz dizendo "licitaforce!".</li>
        </ul>
        <Button variante="fantasma" onClick={() => tocar(SOM_PADRAO)}><Play className="h-4 w-4"/>Ouvir o som padrão</Button>
      </Card>
    </div>
  </>
}
