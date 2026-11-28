import { Link } from 'react-router-dom'
import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { conectado, PORTAIS } from '@/lib/pregaoAoVivo'
import { CartaoComputadores, LinhaDoTempo, useSessoes } from '@/components/PregaoAoVivo'
import { Badge, CabecalhoPagina, Card, Carregando } from '@/components/ui'
import { formatarDataHora } from '@/lib/format'

const PASSOS = [
  'Baixe e instale o programa no computador que fica ligado durante a sessão.',
  'Entre com a mesma conta do LicitaForce.',
  'Clique em "Abrir portal" e faça o login no Compras.gov.br com as suas mãos (senha e captcha são sempre seus).',
  'Entre na sala de disputa do pregão. O programa reconhece a compra e começa a acompanhar.',
  'Acompanhe aqui, no processo ou no celular: mensagens do pregoeiro, convocações com prazo, fases dos itens, lances e a sua posição.',
]

export default function PregaoAoVivo() {
  const q = useSessoes()
  const sessoes = q.data ?? []
  const ativas = sessoes.filter((s) => s.situacao === 'acompanhando')

  return (
    <>
      <CabecalhoPagina titulo="Pregão ao Vivo" descricao="Acompanhe a sala de disputa em tempo real, com a sessão que você abriu no portal, pelo programa instalado no seu computador." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CartaoComputadores />
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">O que aconteceu nas salas {ativas.length > 0 && <Badge cor="verde" className="ml-2">{ativas.length} ao vivo</Badge>}</h2>
            {q.isLoading ? <Carregando /> : <LinhaDoTempo sessoes={sessoes.filter((s) => s.situacao !== 'encerrada')} vazio="Nenhuma sessão acompanhada agora. Siga os passos ao lado para começar." />}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Sessões</h2>
            {!sessoes.length ? <p className="text-sm text-muted-foreground">Nenhuma ainda.</p> : (
              <ul className="space-y-2 text-sm">
                {sessoes.map((s) => (
                  <li key={s.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{s.titulo ?? s.chave}</span>
                      <Badge cor={s.situacao === 'acompanhando' ? (conectado(s.sinal_em) ? 'verde' : 'amarelo') : 'neutro'}>
                        {s.situacao === 'acompanhando' ? (conectado(s.sinal_em) ? 'ao vivo' : 'sem sinal') : s.situacao}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{PORTAIS[s.portal]?.nome ?? s.portal}{s.ultimo_evento_em ? ` · último evento ${formatarDataHora(s.ultimo_evento_em)}` : ''}</p>
                    {s.processo_id ? (
                      <Link to={`/app/processos/${s.processo_id}`} className="mt-1 block truncate text-xs font-semibold text-primary">{s.processos?.objeto ?? 'Abrir processo'}</Link>
                    ) : <p className="mt-1 text-xs text-muted-foreground">Sem processo ligado (cadastre a UASG e o número no processo).</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Como começar</h2>
            <ol className="space-y-2 text-sm">
              {PASSOS.map((p, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{p}</li>)}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">Portais: {Object.values(PORTAIS).map((p) => p.nome + (p.disponivel ? '' : ' (em breve)')).join(', ')}.</p>
          </Card>
          <Card className="flex gap-3 p-5 text-sm text-muted-foreground">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
            <p>O programa não guarda a sua senha do portal e não resolve captcha. Ele só lê o que a sala mostra para você e envia os eventos para a sua conta.</p>
          </Card>
        </div>
      </div>
    </>
  )
}
