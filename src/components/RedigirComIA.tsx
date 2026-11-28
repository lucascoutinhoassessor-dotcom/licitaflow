import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ListChecks, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/providers/OrgProvider'
import { useModulos } from '@/hooks/useModulos'
import type { LimiteIA } from '@/lib/agentesIA'
import { useMinhaIA } from '@/hooks/useMinhaIA'
import { PROVEDORES_IA } from '@/lib/minhaIA'
import type { DadosPeca, Tese, TipoPeca } from '@/lib/juridico'
import { Aviso, Button, Card } from '@/components/ui'

export interface PecaIA { fatos: string; argumentos: string; pedidos: string; perguntas: string; pontos_de_atencao: string[] }

/**
 * Jurídico com IA: manda o que o cliente preencheu (relato, itens, decisão, teses) e o processo ao servidor,
 * que junta a leitura do edital pelo Leitor e peças parecidas da base e devolve os campos redigidos pelo Opus.
 * Só aparece com o módulo "agentes" liberado e o plano incluindo o agente.
 */
export function RedigirComIA({ tipo, processoId, dados, teses, aoRedigir }: {
  tipo: TipoPeca; processoId: string; dados: DadosPeca; teses: Tese[]; aoRedigir: (p: PecaIA) => void
}) {
  const { org, podeEditar } = useOrg()
  const qc = useQueryClient()
  const { estado } = useModulos()
  const liberado = estado('/app/agentes') === 'liberado'
  const uso = useQuery({ queryKey: ['ia-uso-resumo', org?.id], enabled: !!org && liberado, staleTime: 60_000, queryFn: async () => {
    const { data, error } = await supabase.rpc('ia_uso_resumo', { p_org: org!.id }); if (error) throw error; return data as Record<string, LimiteIA>
  } })
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [pontos, setPontos] = useState<string[] | null>(null)
  const [extras, setExtras] = useState<{ leitura: boolean; referencias: number } | null>(null)
  const propria = useMinhaIA(liberado)
  const u = uso.data?.juridico
  // Com a IA do próprio cliente (botão Minha IA), o limite do plano não se aplica.
  if (!liberado || !podeEditar || !u || (u.limite === 0 && !propria)) return null
  const esgotado = !propria && u.limite != null && (u.usadas ?? 0) >= u.limite

  async function redigir() {
    setOcupado(true); setErro(''); setPontos(null)
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw new Error('Entre na sua conta.')
      const r = await fetch(`/api/agentes?agente=juridico&org=${org!.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo, processo_id: processoId || null, teses: teses.map((t) => ({ rotulo: t.rotulo, texto: t.texto })),
          dados: { orgao: dados.orgao, modalidade: dados.modalidade, numero: dados.numero, objeto: dados.objeto, itens: dados.itens, concorrente: dados.concorrente,
            atoRecorrido: dados.atoRecorrido, fatos: dados.fatos, argumentos: dados.argumentos, perguntas: dados.perguntas },
        }),
      })
      const corpo = await r.json().catch(() => null)
      if (!r.ok) throw new Error(corpo?.error ?? 'Não foi possível redigir a peça agora.')
      aoRedigir(corpo.peca as PecaIA)
      setPontos(corpo.peca.pontos_de_atencao ?? [])
      setExtras({ leitura: !!corpo.usou_leitura, referencias: Number(corpo.referencias ?? 0) })
      await qc.invalidateQueries({ queryKey: ['ia-uso-resumo'] })
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível redigir a peça agora.') } finally { setOcupado(false) }
  }

  return (
    <Card className="space-y-3 border-primary/30 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary"><Sparkles className="h-4 w-4" />Redigir com IA</h3>
      <p className="text-sm text-muted-foreground">
        A IA escreve os fatos, a fundamentação e os pedidos a partir do que você preencheu acima e das teses marcadas.
        {processoId ? ' Se o edital deste processo já foi lido pelo Leitor, os riscos e os trechos do edital entram no argumento.' : ' Escolha o processo para a IA usar a leitura do edital.'}
        {' '}O texto continua editável: revise antes de protocolar.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={redigir} carregando={ocupado} disabled={esgotado}><Sparkles className="h-4 w-4" />{ocupado ? 'Redigindo…' : 'Redigir com IA'}</Button>
        <span className="text-xs text-muted-foreground">{propria ? `Usando a sua conta: ${PROVEDORES_IA[propria.provedor].nome} (${propria.modelo}), sem contar no limite do plano.` : `Peças com IA neste mês: ${u.usadas ?? 0}${u.limite == null ? '' : ` de ${u.limite}`}`}</span>
      </div>
      {ocupado && <p className="text-xs text-muted-foreground">Leva cerca de 1 minuto.</p>}
      {esgotado && <Aviso tipo="info">Você já usou as peças com IA deste mês. O limite renova no dia 1º; o formulário continua montando a minuta normalmente.</Aviso>}
      {erro && <Aviso><span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erro}</span></Aviso>}
      {pontos && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium"><ListChecks className="h-4 w-4 text-primary" />Confira antes de protocolar</p>
          {pontos.length > 0 && <ul className="mt-1.5 list-disc space-y-0.5 pl-5">{pontos.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          {extras && <p className="mt-2 text-xs text-muted-foreground">{extras.leitura ? 'Usou a leitura do edital pelo Leitor. ' : ''}{extras.referencias ? `Usou ${extras.referencias} peça(s) parecida(s) da base como referência de argumentos. ` : ''}Os trechos [COMPLETAR] precisam ser preenchidos por você.</p>}
        </div>
      )}
    </Card>
  )
}
