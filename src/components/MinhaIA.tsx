import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, ExternalLink, KeyRound, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { useModulos } from '@/hooks/useModulos'
import { cn } from '@/lib/utils'
import { PROVEDORES_IA, type ChaveIA, type ProvedorIA } from '@/lib/minhaIA'
import { useChavesIA } from '@/hooks/useMinhaIA'
import { Aviso, Button, Campo, Input, InputSenha, Modal } from '@/components/ui'

/**
 * Botão flutuante "Minha IA": o cliente liga a chave de API da conta dele (Claude, Gemini ou ChatGPT).
 * Com uma chave ativa, o Leitor de editais e o Jurídico com IA usam a conta dele, sem contar no limite do plano.
 * A chave vai direto ao servidor, que testa, cifra e guarda; o navegador nunca recebe a chave de volta.
 */
export default function MinhaIA() {
  const { org, podeAdministrar } = useOrg()
  const { estado } = useModulos()
  const liberado = estado('/app/agentes') === 'liberado'
  const [aberto, setAberto] = useState(false)
  const qc = useQueryClient()
  const chaves = useChavesIA(liberado)
  if (!org || !liberado) return null
  const ativa = chaves.data?.find((c) => c.ativa)

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Minha IA: ligar Claude, Gemini ou ChatGPT"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex items-center gap-2 rounded-full border border-emerald-500/40 bg-gradient-to-br from-emerald-500 to-sky-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition-transform hover:scale-105 lg:bottom-6 lg:right-6"
      >
        <Bot className="h-5 w-5" />
        <span className="hidden sm:inline">{ativa ? PROVEDORES_IA[ativa.provedor].curto : 'Minha IA'}</span>
        {ativa && <span className="h-2 w-2 rounded-full bg-white" />}
      </button>
      <Modal aberto={aberto} aoFechar={() => setAberto(false)} titulo="Minha IA" largo>
        <PainelMinhaIA chaves={chaves.data ?? []} podeAdministrar={podeAdministrar} org={org.id} aoMudar={() => qc.invalidateQueries({ queryKey: ['ia-chaves', org.id] })} />
      </Modal>
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
