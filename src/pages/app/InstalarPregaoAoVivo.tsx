import { Link } from 'react-router-dom'
import { CheckCircle2, Download, Gavel, MonitorDown, MousePointerClick, Radio, ShieldCheck, ShieldAlert } from 'lucide-react'
import { LINK_DOWNLOAD, PORTAIS } from '@/lib/pregaoAoVivo'
import { Badge, Button, CabecalhoPagina, Card } from '@/components/ui'

const PASSOS = [
  { titulo: 'Baixe o instalador', texto: 'Clique em "Baixar para Windows". É um arquivo só (cerca de 110 MB).' },
  { titulo: 'Abra o arquivo baixado', texto: 'Ele instala tudo sozinho e já abre o programa, sem pedir senha de administrador.' },
  { titulo: 'Se o Windows avisar', texto: 'Na tela "O Windows protegeu o computador", clique em "Mais informações" e depois em "Executar assim mesmo".' },
  { titulo: 'Entre com a sua conta', texto: 'Use o mesmo e-mail e a mesma senha do LicitaForce.' },
  { titulo: 'Abra o portal e a sala', texto: 'Clique em "Abrir portal", faça o login no Compras.gov.br e entre na sala de disputa do pregão. Os itens aparecem no programa.' },
  { titulo: 'Configure e ligue', texto: 'Em cada item, defina o lance mínimo e o desconto e clique em Ligar. Comece no modo simulação.' },
]

/** Página "Disputa → Instalar o programa": baixar o instalador do Pregão ao Vivo e como começar. */
export default function InstalarPregaoAoVivo() {
  return (
    <>
      <CabecalhoPagina titulo="Instalar o Pregão ao Vivo" descricao="O programa que fica no seu computador para acompanhar a sala de disputa e dar os lances, com a sessão que você abre no portal." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"><MonitorDown className="h-9 w-9 text-primary" /></div>
            <div>
              <h2 className="text-xl font-semibold">LicitaForce Pregão ao Vivo para Windows</h2>
              <p className="mt-1 text-sm text-muted-foreground">Um arquivo só: você abre, ele instala tudo e se atualiza sozinho nas próximas versões.</p>
            </div>
            <a href={LINK_DOWNLOAD} download><Button tamanho="lg"><Download className="h-5 w-5" />Baixar para Windows</Button></a>
            <p className="text-xs text-muted-foreground">Funciona nos modos de disputa aberto e aberto/fechado, item por item.</p>
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 font-semibold">Como instalar e começar</h2>
            <ol className="space-y-4">
              {PASSOS.map((p, i) => (
                <li key={p.titulo} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{i + 1}</span>
                  <div>
                    <p className="font-medium">{p.titulo}</p>
                    <p className="text-sm text-muted-foreground">{p.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-sm">
              Depois de instalado, acompanhe tudo também pelo site em <Link to="/app/pregao-ao-vivo" className="font-semibold text-primary hover:underline">Disputa → Pregão ao Vivo</Link>.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">O que o programa faz</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><Radio className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Acompanha a sala ao vivo: mensagens do pregoeiro, convocações com prazo, fases, lances e a sua posição.</li>
              <li className="flex gap-2"><Gavel className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Dá os lances por você: lance mínimo, desconto em R$ ou %, intervalo e "só no fim".</li>
              <li className="flex gap-2"><MousePointerClick className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Modo simulação para testar antes, e o botão Parar tudo sempre à vista.</li>
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Requisitos</h2>
            <ul className="space-y-1.5 text-sm">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Windows 10 ou 11, 64 bits</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />4 GB de memória (8 GB para várias salas ao mesmo tempo)</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Internet estável durante a disputa</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Computador ligado e sem hibernar enquanto a máquina dá lances</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Ainda não há versão para Mac ou Linux.</p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Portais</h2>
            <div className="flex flex-wrap gap-2">
              {Object.values(PORTAIS).map((p) => <Badge key={p.nome} cor={p.disponivel ? 'verde' : 'neutro'}>{p.nome}{p.disponivel ? '' : ' · em breve'}</Badge>)}
            </div>
          </Card>

          <Card className="space-y-3 p-5 text-sm text-muted-foreground">
            <p className="flex gap-2"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />O programa não guarda a sua senha do portal e não resolve captcha. O login é sempre seu, na janela oficial do portal.</p>
            <p className="flex gap-2"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />A máquina nunca dá lance abaixo do mínimo que você definir, e você é responsável pelos valores configurados.</p>
          </Card>
        </div>
      </div>
    </>
  )
}
