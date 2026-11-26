import { useCallback, useEffect, useRef, useState } from 'react'
import { BellRing } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal } from '@/components/ui'
import { useAuth } from '@/providers/AuthProvider'
import { ativarPush, devePedirNotificacoes, estadoPush, notificacoesPermitidas, observarPermissao, sincronizarPush, type EstadoPush } from '@/lib/push'
import { useInstalacao } from '@/hooks/useInstalacao'
import { mensagemErro } from '@/lib/supabase'

const CHAVE_ESTADO = 'lf-push-ultimo-estado'
const chaveAdiado = (id: string) => `lf-push-adiado-${id}`
const ler = (s: Storage, k: string) => { try { return s.getItem(k) } catch { return null } }
const gravar = (s: Storage, k: string, v: string | null) => { try { if (v === null) s.removeItem(k); else s.setItem(k, v) } catch { /* armazenamento indisponível */ } }

/**
 * Logo depois do login, pede para ativar as notificações neste aparelho.
 * - Já ativas: não pergunta nada (só regrava a inscrição para a conta atual).
 * - Desativadas ou bloqueadas depois de ativas: percebe a mudança e pede de novo.
 * - "Agora não" vale até o próximo login/abertura do app.
 */
export default function PedirNotificacoes() {
  const { user } = useAuth()
  const { instalado, conferindo } = useInstalacao()
  const [estado, setEstado] = useState<EstadoPush | null>(null)
  const [aberto, setAberto] = useState(false)
  const [desativou, setDesativou] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const ultimo = useRef<string | null>(null)
  const consulta = useRef(0)

  const conferir = useCallback(async () => {
    if (!user || conferindo) return
    const versao = ++consulta.current
    const e = await estadoPush().catch(() => 'inativo' as EstadoPush)
    if (versao !== consulta.current) return
    const permitido = notificacoesPermitidas()
    const antes = ultimo.current ?? ler(localStorage, CHAVE_ESTADO)
    const atual = permitido ? 'permitido' : e
    ultimo.current = atual
    gravar(localStorage, CHAVE_ESTADO, atual)
    setEstado(e)
    if (permitido) void sincronizarPush().catch(() => undefined)
    if (!devePedirNotificacoes(e, instalado)) { setAberto(false); setDesativou(false); return }
    // Estava ativo e deixou de estar: pergunta de novo, mesmo que tenha dito "agora não" antes.
    if (antes === 'ativo' || antes === 'permitido') { setDesativou(true); gravar(sessionStorage, chaveAdiado(user.id), null) }
    if (!ler(sessionStorage, chaveAdiado(user.id))) setAberto(true)
  }, [user, instalado, conferindo])

  useEffect(() => {
    ultimo.current = null
    setAberto(false)
    setDesativou(false)
    if (!user || conferindo) return
    // Espera a tela carregar antes de perguntar.
    const t = window.setTimeout(() => void conferir(), 1500)
    const parar = observarPermissao(() => void conferir())
    return () => { ++consulta.current; window.clearTimeout(t); parar() }
  }, [user, conferindo, conferir])

  if (!user || !estado) return null
  function adiar() { gravar(sessionStorage, chaveAdiado(user!.id), '1'); setAberto(false) }
  async function ativar() {
    setOcupado(true)
    ++consulta.current
    try {
      const e = await ativarPush()
      ultimo.current = e; gravar(localStorage, CHAVE_ESTADO, e); setEstado(e)
      if (e === 'ativo') { setAberto(false); setDesativou(false); toast.success('Notificações ativadas neste aparelho.') }
      else if (e === 'negado') toast.error('O navegador bloqueou as notificações. Libere nas configurações do site e volte aqui.')
    } catch (e) { toast.error(mensagemErro(e)) } finally {
      ++consulta.current
      if (notificacoesPermitidas()) {
        ultimo.current = 'permitido'
        gravar(localStorage, CHAVE_ESTADO, 'permitido')
        setAberto(false)
        setDesativou(false)
      }
      setOcupado(false)
    }
  }

  const titulo = desativou ? 'As notificações foram desativadas' : 'Ative as notificações'
  return (
    <Modal aberto={aberto} aoFechar={adiar} titulo={titulo}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"><BellRing className="h-5 w-5" /></span>
          <p className="text-sm text-muted-foreground">
            {estado === 'negado'
              ? 'As notificações do LicitaForce estão bloqueadas neste navegador. Toque no cadeado ao lado do endereço (ou em Configurações do site), permita as notificações e volte aqui.'
              : estado === 'sem-suporte'
                ? 'No iPhone, as notificações só funcionam com o LicitaForce instalado: toque em Compartilhar → Adicionar à Tela de Início e abra o app por lá.'
                : desativou
                  ? 'Este aparelho deixou de receber os avisos do LicitaForce. Ative de novo para receber disputas, prazos e comunicados na hora, mesmo com o app fechado.'
                  : 'Receba oportunidades do Radar, mudanças da Sentinela, o resumo diário das suas IAs e comunicados do LicitaForce no celular ou no computador, mesmo com o app fechado. Escolha os avisos na tela Agentes de IA.'}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variante="contorno" onClick={adiar}>Agora não</Button>
          {estado === 'inativo' && <Button carregando={ocupado} onClick={ativar}>Ativar notificações</Button>}
          {estado === 'negado' && <Button carregando={ocupado} onClick={() => void conferir()}>Já liberei</Button>}
        </div>
      </div>
    </Modal>
  )
}
