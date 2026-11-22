import { useQuery } from '@tanstack/react-query'
import { Bot } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useModulos } from '@/hooks/useModulos'
import { AGENTES_IA, type LimiteIA } from '@/lib/agentesIA'
import { Card } from '@/components/ui'

/** Uso dos agentes de IA no mês para o cliente (em "Meu plano"). Só aparece com os agentes liberados. */
export function UsoIAPlano({ org }: { org: string }) {
  const { estado } = useModulos()
  const liberado = estado('/app/agentes') === 'liberado'
  const q = useQuery({ queryKey: ['ia-uso-resumo', org], enabled: liberado, queryFn: async () => {
    const { data, error } = await supabase.rpc('ia_uso_resumo', { p_org: org })
    if (error) throw error
    return data as Record<string, LimiteIA>
  } })
  if (!liberado || !q.data) return null
  return (
    <div className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Bot className="h-5 w-5 text-primary" />Agentes de IA</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {AGENTES_IA.map((a) => {
          const u = q.data[a.id] ?? { limite: 0, origem: 'plano', usadas: 0 }
          const usadas = u.usadas ?? 0
          return (
            <Card key={a.id} className="space-y-2 p-5">
              <h3 className="text-sm text-muted-foreground">{a.nome}</h3>
              {u.limite === 0 ? <p className="text-sm">Não incluído no seu plano.</p> : (
                <p className="text-2xl font-semibold">{usadas} <span className="text-sm text-muted-foreground">/ {u.limite ?? 'sem limite'} {a.unidade}</span></p>
              )}
              {a.tipo === 'simultaneo' ? (
                <>
                  {u.limite !== null && u.limite > 0 && usadas >= u.limite && <p className="text-xs text-warning">Limite alcançado: os processos mais recentes têm preferência.</p>}
                  <p className="text-xs text-muted-foreground">Processos em andamento com edital no PNCP, vigiados ao mesmo tempo.</p>
                </>
              ) : (
                <>
                  {u.limite !== null && u.limite > 0 && usadas >= u.limite && <p className="text-xs text-warning">Limite do mês alcançado. Editais já lidos continuam abrindo normalmente.</p>}
                  <p className="text-xs text-muted-foreground">Conta só o que é novo. O que já foi lido na plataforma abre sem gastar o limite. O limite renova no dia 1º.</p>
                </>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
