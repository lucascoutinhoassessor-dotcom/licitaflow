import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BellRing, Calculator, FileSearch, Gavel, Radar, Wallet } from 'lucide-react'
import { Badge, Button, CabecalhoPagina, Campo, Card, Input } from '@/components/ui'
import { useLista } from '@/hooks/useDados'
import { controleDe, rotaLeitor } from '@/lib/leitor'
import type { Processo } from '@/types/db'

const PROXIMOS = [
  { icone: Gavel, nome: 'Jurídico', texto: 'Redige impugnações, esclarecimentos e recursos a partir do edital e da sessão.' },
]

export default function Agentes() {
  const navigate = useNavigate()
  const [entrada, setEntrada] = useState('')
  const [erro, setErro] = useState('')
  const processos = useLista<Processo>('processos', { porEmpresa: false })
  const comEdital = (processos.data ?? []).filter((p) => p.pncp_controle).slice(0, 8)

  function abrir(e: FormEvent) {
    e.preventDefault()
    const controle = controleDe(entrada)
    if (!controle) { setErro('Cole o link do edital no PNCP ou o número de controle (ex.: 12345678000190-1-000123/2026).'); return }
    navigate(rotaLeitor(controle))
  }

  return (
    <>
      <CabecalhoPagina titulo="Agentes de IA" descricao="Assistentes que leem os documentos das licitações e fazem o trabalho repetitivo por você." />

      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><FileSearch className="h-6 w-6 text-primary" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">Leitor de editais <Badge cor="azul">Beta</Badge></h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Lê o edital e os anexos publicados no PNCP e devolve o checklist de datas, habilitação, proposta, condições de participação e riscos.
              Cada item vem com o trecho do edital de onde saiu, para você conferir.
            </p>
          </div>
        </div>
        <form onSubmit={abrir} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Campo rotulo="Link do edital no PNCP ou número de controle" htmlFor="leitor-entrada" erro={erro}>
              <Input id="leitor-entrada" value={entrada} onChange={(e) => { setEntrada(e.target.value); setErro('') }} placeholder="https://pncp.gov.br/app/editais/…" />
            </Campo>
          </div>
          <Button type="submit"><FileSearch className="h-4 w-4" />Abrir no Leitor</Button>
        </form>
        {comEdital.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Seus processos com edital no PNCP</p>
            <ul className="divide-y rounded-md border">
              {comEdital.map((p) => (
                <li key={p.id}>
                  <Link to={rotaLeitor(p.pncp_controle!)} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                    <span className="min-w-0 truncate">{p.numero ? `${p.numero} · ` : ''}{p.objeto}</span>
                    <span className="shrink-0 text-xs font-semibold text-primary">Ler</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Link to="/app/agentes/radar" className="mb-6 block">
        <Card className="flex items-start gap-3 p-5 transition-colors hover:bg-muted/40 sm:p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><Radar className="h-6 w-6 text-primary" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">Radar <Badge cor="azul">Beta</Badge></h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Todo dia às 7h cruza os editais abertos com o perfil de cada empresa e sugere os que combinam, com o motivo.
              Você decide o que vai para o funil.
            </p>
            <p className="mt-2 text-sm font-semibold text-primary">Ver oportunidades e ajustar o perfil →</p>
          </div>
        </Card>
      </Link>

      <Link to="/app/agentes/cotador" className="mb-6 block">
        <Card className="flex items-start gap-3 p-5 transition-colors hover:bg-muted/40 sm:p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><Calculator className="h-6 w-6 text-primary" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">Cotador <Badge cor="azul">Beta</Badge></h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Importa os itens do edital, pesquisa o preço de mercado de cada um, calcula o seu preço-limite, sugere o preço e baixa a planilha da proposta.
            </p>
            <p className="mt-2 text-sm font-semibold text-primary">Cotar um processo →</p>
          </div>
        </Card>
      </Link>

      <Link to="/app/agentes/termometro" className="mb-6 block">
        <Card className="flex items-start gap-3 p-5 transition-colors hover:bg-muted/40 sm:p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><Wallet className="h-6 w-6 text-primary" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">Termômetro de Pagamento <Badge cor="azul">Beta</Badge></h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Mostra a saúde financeira do órgão comprador pela nota CAPAG do Tesouro Nacional, antes de você disputar.
              Aparece sozinho no edital, no Leitor, no Radar e no processo.
            </p>
            <p className="mt-2 text-sm font-semibold text-primary">Consultar um município ou estado →</p>
          </div>
        </Card>
      </Link>

      <Link to="/app/agentes/sentinela" className="mb-6 block">
        <Card className="flex items-start gap-3 p-5 transition-colors hover:bg-muted/40 sm:p-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10"><BellRing className="h-6 w-6 text-primary" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">Sentinela <Badge cor="azul">Beta</Badge></h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Vigia no PNCP os editais dos seus processos e avisa quando muda a situação, a data, sai um documento novo ou o resultado.
              Funciona sozinha: basta o processo ter o edital do PNCP vinculado.
            </p>
            <p className="mt-2 text-sm font-semibold text-primary">Ver processos vigiados e últimas mudanças →</p>
          </div>
        </Card>
      </Link>

      <h2 className="mb-3 text-lg font-semibold">Próximos agentes</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PROXIMOS.map((a) => (
          <Card key={a.nome} className="p-4 opacity-80">
            <p className="flex items-center gap-2 font-semibold"><a.icone className="h-4 w-4 text-primary" />{a.nome} <Badge>Em breve</Badge></p>
            <p className="mt-1 text-sm text-muted-foreground">{a.texto}</p>
          </Card>
        ))}
      </div>
    </>
  )
}
