import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ListChecks } from 'lucide-react'
import { Button, Card, Carregando } from '@/components/ui'
import { FavoritoPropostas } from '@/components/ConcorrentesItem'
import { enviarPropostas, type PropostasColetadas } from '@/lib/atas'

/** Desfaz o que o coletor pôs depois do #: "z." = JSON comprimido (deflate-raw), "j." = JSON puro, em base64url. */
async function decodificar(fragmento: string): Promise<PropostasColetadas> {
  const [tipo, dados] = [fragmento.slice(0, 2), fragmento.slice(2)]
  const b64 = dados.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0))
  let texto: string
  if (tipo === 'z.') texto = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()
  else if (tipo === 'j.') texto = new TextDecoder().decode(bytes)
  else throw new Error('formato')
  const json = JSON.parse(texto)
  if (json?.v !== 1 || !/^\d{15,20}$/.test(String(json.idCompra)) || !Array.isArray(json.itens)) throw new Error('formato')
  return json as PropostasColetadas
}

/** Recebe as propostas capturadas pelo botão favorito no Compras.gov.br e grava na compra. */
export default function ImportarPropostas() {
  const qc = useQueryClient()
  const [dados, setDados] = useState<PropostasColetadas | null>(null)
  const [erroLeitura, setErroLeitura] = useState(false)
  const iniciou = useRef(false)
  const envio = useMutation({
    mutationFn: enviarPropostas,
    onSuccess: (r, d) => {
      try { sessionStorage.removeItem('lf-propostas') } catch { /* nada */ }
      qc.setQueryData(['atas-enviadas', d.idCompra], (atual: { hash: string }[] = []) => [r, ...atual.filter((a) => a.hash !== r.hash)])
    },
  })

  useEffect(() => {
    if (iniciou.current) return
    iniciou.current = true
    let fragmento: string | null = null
    try { fragmento = sessionStorage.getItem('lf-propostas') } catch { /* sem armazenamento */ }
    if (!fragmento) return
    decodificar(fragmento).then((d) => { setDados(d); envio.mutate(d) }).catch(() => setErroLeitura(true))
  }, [envio])

  const empresas = new Set(dados?.itens.flatMap((i) => (i.p as { c?: string }[]).map((p) => p.c)).filter(Boolean)).size
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-semibold"><ListChecks className="h-5 w-5 text-emerald-400" />Propostas do Compras.gov.br</h1>
      {!dados && !erroLeitura && (
        <>
          <p className="mb-4 text-sm text-muted-foreground">Nenhuma proposta chegou. Use o botão favorito na página da compra no Compras.gov.br e clique em "Enviar para o LicitaForce".</p>
          <FavoritoPropostas idCompra={null} />
        </>
      )}
      {erroLeitura && <Card className="p-5 text-sm text-red-600 dark:text-red-400">Não foi possível ler os dados enviados pelo favorito. Volte à página da compra e clique em "Enviar para o LicitaForce" de novo.</Card>}
      {dados && (
        <Card className="p-5 text-sm">
          <p className="text-muted-foreground">Compra <b className="text-foreground">{dados.idCompra}</b> · {dados.itens.length} {dados.itens.length === 1 ? 'item' : 'itens'} · {empresas} empresas</p>
          {envio.isPending && <Carregando texto="Gravando as propostas na compra…" />}
          {envio.isError && (
            <div className="mt-3">
              <p className="text-red-600 dark:text-red-400">{(envio.error as Error).message}</p>
              <Button tamanho="sm" variante="contorno" className="mt-3" onClick={() => envio.mutate(dados)}>Tentar de novo</Button>
            </div>
          )}
          {envio.isSuccess && (
            <div className="mt-3">
              <p className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-300"><CheckCircle2 className="h-5 w-5" />Propostas gravadas: {envio.data.novos} {envio.data.novos === 1 ? 'item' : 'itens'} agora, {envio.data.resultado.itens?.length ?? 0} no total desta compra.</p>
              <p className="mt-1 text-xs text-muted-foreground">Todos os usuários passam a ver essas empresas em cada item. Para guardar mais itens, abra-os no Compras.gov.br e envie de novo.</p>
              <Link to={`/app/compras/${dados.idCompra}`} className="mt-4 inline-flex h-9 items-center rounded-full bg-primary px-4 font-semibold text-primary-foreground">Ver a compra</Link>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
