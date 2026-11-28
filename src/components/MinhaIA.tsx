import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, KeyRound, MessageSquarePlus, Sparkles, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { useModulos } from '@/hooks/useModulos'
import { cn } from '@/lib/utils'
import { PROVEDORES_IA, type ChaveIA, type ProvedorIA } from '@/lib/minhaIA'
import { useChavesIA } from '@/hooks/useMinhaIA'
import { Aviso, Button, Campo, Input, InputSenha } from '@/components/ui'
import { RoboIA } from '@/components/RoboIA'
import { ChatMinhaIA, useConversa } from '@/components/ChatMinhaIA'

/**
 * Robozinho flutuante "Minha IA". Sem a IA do cliente ligada, abre a tela de conexão (Claude, Gemini ou ChatGPT);
 * com ela ligada, abre a conversa, já com os dados da conta. A chave vai direto ao servidor, que testa, cifra e
 * guarda; o navegador nunca recebe a chave de volta.
 */
export default function MinhaIA() {
  const { org, podeAdministrar } = useOrg()
  const { estado } = useModulos()
  const liberado = estado('/app/agentes') === 'liberado'
  const [aberto, setAberto] = useState(false)
  const [conexoes, setConexoes] = useState(false)
  const qc = useQueryClient()
  const chaves = useChavesIA(liberado)
  const conversa = useConversa(org?.id)
  if (!org || !liberado) return null
  const ativa = chaves.data?.find((c) => c.ativa)
  const mostrarConexoes = conexoes || !ativa

  return (
    <>
      <AnimatePresence>
        {!aberto && (
          <motion.button
            type="button"
            key="robo"
            drag
            dragMomentum={false}
            dragElastic={0.1}
            dragConstraints={{ top: -window.innerHeight + 140, left: -window.innerWidth + 90, right: 0, bottom: 0 }}
            onTap={() => setAberto(true)}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ y: { duration: 3, repeat: Infinity, ease: 'easeInOut' }, default: { duration: 0.25 } }}
            whileHover={{ scale: 1.08 }}
            aria-label={ativa ? `Conversar com a sua IA (${PROVEDORES_IA[ativa.provedor].nome})` : 'Minha IA: ligar Claude, Gemini ou ChatGPT'}
            title={ativa ? `Conversar com o seu ${PROVEDORES_IA[ativa.provedor].nome}` : 'Ligar a sua IA'}
            className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 cursor-grab touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing lg:bottom-6 lg:right-6"
          >
            {ativa && <motion.span className="absolute inset-1 rounded-full bg-emerald-400/40" animate={{ scale: [1, 1.35], opacity: [0.6, 0] }} transition={{ duration: 2, repeat: Infinity }} />}
            <span className="relative block drop-shadow-[0_8px_16px_rgba(14,165,233,0.35)]"><RoboIA tamanho={60} ligado={!!ativa} /></span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {aberto && (
          <motion.aside
            key="painel"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 260 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-card text-card-foreground shadow-2xl sm:w-[440px]"
            aria-label="Minha IA"
          >
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <RoboIA tamanho={36} ligado={!!ativa} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">Minha IA</p>
                <p className="truncate text-xs text-muted-foreground">{ativa ? `${PROVEDORES_IA[ativa.provedor].nome} · ${ativa.modelo}` : 'Nenhuma IA conectada'}</p>
              </div>
              {ativa && !mostrarConexoes && conversa.mensagens.length > 0 && (
                <button type="button" onClick={conversa.limpar} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Nova conversa" title="Nova conversa"><MessageSquarePlus className="h-5 w-5" /></button>
              )}
              {ativa && (
                <button type="button" onClick={() => setConexoes(!conexoes)} className={cn('rounded-md p-2 hover:bg-muted', conexoes ? 'text-primary' : 'text-muted-foreground hover:text-foreground')} aria-label="Conexões de IA" title="Conexões de IA"><KeyRound className="h-5 w-5" /></button>
              )}
              <button type="button" onClick={() => setAberto(false)} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {mostrarConexoes ? (
                <div className="p-4">
                  {!ativa && <p className="mb-4 text-sm text-muted-foreground">Ligue a sua conta do Claude, do Gemini ou do ChatGPT. Assim que conectar, esta tela vira uma conversa com a sua IA, já sabendo dos seus processos, prazos e editais no LicitaForce.</p>}
                  <PainelMinhaIA chaves={chaves.data ?? []} podeAdministrar={podeAdministrar} org={org.id}
                    aoMudar={async () => { await qc.invalidateQueries({ queryKey: ['ia-chaves', org.id] }); setConexoes(false) }} />
                </div>
              ) : (
                <ChatMinhaIA org={org.id} conversa={conversa} ia={ativa!} />
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}

function PainelMinhaIA({ chaves, podeAdministrar, org, aoMudar }: { chaves: ChaveIA[]; podeAdministrar: boolean; org: string; aoMudar: () => void }) {
  const ativa = chaves.find((c) => c.ativa)
  const [editando, setEditando] = useState<ProvedorIA | null>(null)
  const [ocupado, setOcupado] = useState('')

  async function rpc(nome: 'ia_ativar_chave' | 'ia_remover_chave', provedor: ProvedorIA | null, msg: string) {
    setOcupado(nome + provedor)
    const { error } = await supabase.rpc(nome, { p_org: org, p_provedor: provedor })
    setOcupado('')
    if (error) { toast.error(error.message); return }
    toast.success(msg); aoMudar()
  }

  return (
    <div className="space-y-4 text-sm">
      <div className={cn('flex items-start gap-3 rounded-lg border p-3', ativa ? 'border-emerald-500/40 bg-emerald-500/5' : 'bg-muted/40')}>
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium">{ativa ? `Usando a sua conta: ${PROVEDORES_IA[ativa.provedor].nome}` : 'Usando a IA do LicitaForce'}</p>
          <p className="text-muted-foreground">
            {ativa
              ? `Modelo ${ativa.modelo}, chave terminada em ${ativa.final}. O Leitor de editais e o Jurídico com IA usam a sua conta: o custo é cobrado pelo provedor e não conta no limite do seu plano.`
              : 'O Leitor de editais e o Jurídico com IA usam a IA do LicitaForce, dentro do limite do seu plano. Ligue a sua conta para usar sem esse limite.'}
          </p>
          {ativa && podeAdministrar && (
            <button type="button" className="mt-1 text-xs font-semibold text-primary hover:underline" disabled={!!ocupado} onClick={() => rpc('ia_ativar_chave', null, 'Voltou para a IA do LicitaForce.')}>
              Voltar para a IA do LicitaForce
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(PROVEDORES_IA) as ProvedorIA[]).map((id) => {
          const p = PROVEDORES_IA[id]
          const salva = chaves.find((c) => c.provedor === id)
          return (
            <div key={id} className={cn('flex flex-col gap-2 rounded-lg border p-3', salva?.ativa && 'border-emerald-500/60')}>
              <p className="font-semibold">{p.nome}</p>
              <p className="text-xs text-muted-foreground">{salva ? `Chave ••••${salva.final} · ${salva.modelo}` : 'Nenhuma chave cadastrada.'}</p>
              {salva?.ativa && <p className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />Em uso</p>}
              {podeAdministrar && (
                <div className="mt-auto flex flex-wrap gap-2">
                  {salva && !salva.ativa && <Button tamanho="sm" carregando={ocupado === 'ia_ativar_chave' + id} onClick={() => rpc('ia_ativar_chave', id, `${p.curto} ativado.`)}>Usar</Button>}
                  <Button tamanho="sm" variante="contorno" onClick={() => setEditando(id)}><KeyRound className="h-3.5 w-3.5" />{salva ? 'Trocar' : 'Ligar'}</Button>
                  {salva && <Button tamanho="sm" variante="contorno" aria-label={`Remover chave da ${p.nome}`} carregando={ocupado === 'ia_remover_chave' + id} onClick={() => rpc('ia_remover_chave', id, 'Chave removida.')}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editando && <FormChave provedor={editando} org={org} aoSalvar={() => { setEditando(null); aoMudar() }} aoCancelar={() => setEditando(null)} />}

      {!podeAdministrar && <Aviso tipo="info">Só o dono ou um administrador da organização liga ou troca a IA.</Aviso>}
      <p className="text-xs text-muted-foreground">
        A assinatura Pro, Plus ou Advanced do aplicativo (claude.ai, ChatGPT, Gemini) não serve aqui: é preciso uma <strong>chave de API</strong>,
        cobrada à parte pelo provedor conforme o uso. A chave é testada, guardada cifrada no servidor e nunca volta a aparecer na tela.
      </p>
    </div>
  )
}

function FormChave({ provedor, org, aoSalvar, aoCancelar }: { provedor: ProvedorIA; org: string; aoSalvar: () => void; aoCancelar: () => void }) {
  const p = PROVEDORES_IA[provedor]
  const [chave, setChave] = useState('')
  const [modelo, setModelo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function salvar() {
    setOcupado(true); setErro('')
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw new Error('Entre na sua conta.')
      const r = await fetch(`/api/agentes?agente=chave&org=${org}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provedor, chave: chave.trim(), modelo: modelo.trim() || undefined }),
      })
      const corpo = await r.json().catch(() => null)
      if (!r.ok) throw new Error(corpo?.error ?? 'Não foi possível salvar a chave.')
      setChave('')
      toast.success(`${p.nome} ligado. O Leitor e o Jurídico já usam a sua conta.`)
      aoSalvar()
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar a chave.') } finally { setOcupado(false) }
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/40 p-4">
      <p className="font-semibold">Ligar {p.nome}</p>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Abra o painel da {p.empresa} e crie uma chave de API: <a href={p.painel} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{p.painelTexto}<ExternalLink className="h-3 w-3" /></a></li>
        <li>Coloque crédito ou um meio de pagamento na conta da {p.empresa}.</li>
        <li>Cole a chave abaixo. Ela é testada antes de ser salva.</li>
      </ol>
      <Campo rotulo="Chave de API" htmlFor="ia-chave">
        <InputSenha id="ia-chave" value={chave} onChange={(e) => setChave(e.target.value)} placeholder={p.exemplo} autoComplete="off" spellCheck={false} />
      </Campo>
      <Campo rotulo="Modelo (opcional)" htmlFor="ia-modelo" ajuda={`Em branco usa ${p.modeloPadrao}. Use o nome exato do modelo no painel da ${p.empresa}.`}>
        <Input id="ia-modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder={p.modeloPadrao} autoComplete="off" spellCheck={false} />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex gap-2">
        <Button onClick={salvar} carregando={ocupado} disabled={chave.trim().length < 20}>Testar e salvar</Button>
        <Button variante="contorno" onClick={aoCancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
