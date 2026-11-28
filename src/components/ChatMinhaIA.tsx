import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertTriangle, FolderOpen, SendHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PROVEDORES_IA, type ChaveIA } from '@/lib/minhaIA'
import { cn } from '@/lib/utils'
import { RoboIA } from '@/components/RoboIA'
import { TextoIA } from '@/components/TextoIA'

export interface MensagemChat { papel: 'usuario' | 'ia'; texto: string; em: string }

const SUGESTOES = [
  'Quais são os meus próximos prazos?',
  'Quais processos têm sessão nesta semana?',
  'Resuma os riscos do edital deste processo.',
  'Me ajude a escrever um pedido de esclarecimento.',
]

/** Conversa guardada neste navegador, por organização (some ao limpar os dados do navegador). */
export function useConversa(org?: string) {
  const chave = `licitaforce:minha-ia:${org ?? '-'}`
  const [mensagens, setMensagens] = useState<MensagemChat[]>([])
  useEffect(() => {
    try { setMensagens(JSON.parse(localStorage.getItem(chave) ?? '[]')) } catch { setMensagens([]) }
  }, [chave])
  const salvar = useCallback((lista: MensagemChat[]) => {
    setMensagens(lista)
    try { localStorage.setItem(chave, JSON.stringify(lista.slice(-60))) } catch { /* navegador sem espaço */ }
  }, [chave])
  return { mensagens, salvar, limpar: () => salvar([]) }
}

export function ChatMinhaIA({ org, conversa, ia }: { org: string; conversa: ReturnType<typeof useConversa>; ia: ChaveIA }) {
  const { pathname } = useLocation()
  const processoId = /^\/app\/processos\/([0-9a-f-]{36})/i.exec(pathname)?.[1] ?? null
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const fim = useRef<HTMLDivElement>(null)
  const { mensagens, salvar } = conversa

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens.length, ocupado])

  async function enviar(pergunta: string) {
    const p = pergunta.trim()
    if (!p || ocupado) return
    const lista: MensagemChat[] = [...mensagens, { papel: 'usuario', texto: p, em: new Date().toISOString() }]
    salvar(lista); setTexto(''); setErro(''); setOcupado(true)
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw new Error('Entre na sua conta.')
      const r = await fetch(`/api/agentes?agente=chat&org=${org}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagens: lista.slice(-20).map(({ papel, texto }) => ({ papel, texto })), processo_id: processoId }),
      })
      const corpo = await r.json().catch(() => null)
      if (!r.ok) throw new Error(corpo?.error ?? 'A IA não respondeu agora. Tente de novo.')
      salvar([...lista, { papel: 'ia', texto: corpo.texto, em: new Date().toISOString() }])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'A IA não respondeu agora. Tente de novo.')
    } finally { setOcupado(false) }
  }

  const teclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(texto) }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 p-4">
        {mensagens.length === 0 && (
          <div className="flex flex-col items-center gap-3 pt-6 text-center">
            <RoboIA tamanho={72} ligado />
            <p className="font-semibold">Olá! Sou o seu {PROVEDORES_IA[ia.provedor].nome} dentro do LicitaForce.</p>
            <p className="text-sm text-muted-foreground">Já sei dos seus processos em andamento e dos próximos prazos. Aberta num processo, também leio os itens e a leitura do edital.</p>
            <div className="mt-2 grid w-full gap-2">
              {SUGESTOES.map((s) => (
                <button key={s} type="button" onClick={() => void enviar(s)} className="rounded-lg border px-3 py-2 text-left text-sm hover:border-primary/50 hover:bg-muted/50">{s}</button>
              ))}
            </div>
          </div>
        )}
        {mensagens.map((m, i) => (
          <div key={i} className={cn('flex gap-2', m.papel === 'usuario' ? 'justify-end' : 'justify-start')}>
            {m.papel === 'ia' && <span className="mt-1 shrink-0"><RoboIA tamanho={26} ligado animado={false} /></span>}
            <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5', m.papel === 'usuario' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted/60')}>
              {m.papel === 'usuario' ? <p className="whitespace-pre-wrap text-sm">{m.texto}</p> : <TextoIA texto={m.texto} />}
            </div>
          </div>
        ))}
        {ocupado && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RoboIA tamanho={26} ligado />
            <span className="animate-pulse">Pensando…</span>
          </div>
        )}
        {erro && <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erro}</p>}
        <div ref={fim} />
      </div>
      <div className="sticky bottom-0 border-t bg-card p-3">
        {processoId && <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"><FolderOpen className="h-3.5 w-3.5" />Usando o processo aberto na tela</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={teclar} rows={2} maxLength={8000}
            placeholder="Pergunte sobre seus processos, editais, prazos…"
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            aria-label="Mensagem para a sua IA"
          />
          <button type="button" onClick={() => void enviar(texto)} disabled={ocupado || !texto.trim()} aria-label="Enviar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
            <SendHorizontal className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">Usa a sua conta da {PROVEDORES_IA[ia.provedor].empresa}. Confira as respostas antes de protocolar ou enviar algo.</p>
      </div>
    </div>
  )
}
