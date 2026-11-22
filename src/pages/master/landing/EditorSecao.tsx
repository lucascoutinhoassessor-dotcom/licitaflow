import type { SecaoSite } from '@/lib/conteudoSite'
import { useCatalogoPlanos } from '@/hooks/useCatalogoPlanos'
import { Botao, EscolherIcone, Imagem, ListaItens, ListaTextos, Opcoes, Texto } from './campos'

type Props = { s: SecaoSite; mudar: (p: Partial<SecaoSite>) => void }

function Cabecalho({ s, mudar, semTexto }: Props & { semTexto?: boolean }) {
  return (
    <>
      <Texto rotulo="Etiqueta acima do título" valor={s.selo} mudar={(selo) => mudar({ selo })} ajuda="Vazio = sem etiqueta" />
      <Texto rotulo="Título" valor={s.titulo} longo mudar={(titulo) => mudar({ titulo })} />
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Texto rotulo="Continuação do título em destaque" valor={s.destaque} mudar={(destaque) => mudar({ destaque })} />
        <Opcoes rotulo="Estilo do destaque" valor={s.destaque_estilo} mudar={(v) => mudar({ destaque_estilo: v as SecaoSite['destaque_estilo'] })} opcoes={[['gradiente', 'Colorido'], ['suave', 'Apagado']]} />
      </div>
      {!semTexto && <Texto rotulo="Texto" valor={s.texto} longo mudar={(texto) => mudar({ texto })} />}
    </>
  )
}

const COLUNAS: [string, string][] = [['1', '1 coluna'], ['2', '2 colunas'], ['3', '3 colunas'], ['4', '4 colunas']]

function PlanoDestaque({ s, mudar }: Props) {
  const catalogo = useCatalogoPlanos(true)
  const opcoes: [string, string][] = [['', 'Nenhum'], ...((catalogo.data ?? []).filter((p) => !['trial', 'cancelado'].includes(p.id)).map((p) => [p.id, p.nome] as [string, string]))]
  if (s.estilo && !opcoes.some(([v]) => v === s.estilo)) opcoes.push([s.estilo, s.estilo])
  return <Opcoes rotulo="Plano em destaque" valor={s.estilo} mudar={(estilo) => mudar({ estilo })} opcoes={opcoes} />
}

export function EditorSecao({ s, mudar }: Props) {
  const ancora = (
    <Texto
      rotulo="Âncora (para links do menu)"
      valor={s.ancora}
      mudar={(v) => mudar({ ancora: v.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
      ajuda={s.ancora ? `Link para esta seção: #${s.ancora}` : 'Opcional. Ex.: precos → use #precos no menu'}
    />
  )
  switch (s.tipo) {
    case 'hero':
      return (
        <>
          <Cabecalho s={s} mudar={mudar} />
          <Botao rotulo="Botão principal" valor={s.botao} mudar={(botao) => mudar({ botao })} />
          <Botao rotulo="Botão secundário" valor={s.botao2} mudar={(botao2) => mudar({ botao2 })} />
          <ListaTextos rotulo="Marcadores abaixo dos botões" valor={s.marcadores} mudar={(marcadores) => mudar({ marcadores })} />
          <Opcoes rotulo="Ao lado do texto" valor={s.estilo || 'mockup'} mudar={(estilo) => mudar({ estilo })} opcoes={[['mockup', 'Ilustração animada do painel'], ['imagem', 'Minha imagem'], ['nenhum', 'Nada (texto centralizado)']]} />
          {s.estilo === 'imagem' && <Imagem rotulo="Imagem" valor={s.imagem} mudar={(imagem) => mudar({ imagem })} />}
          {ancora}
        </>
      )
    case 'faixa':
      return <><ListaTextos rotulo="Palavras da faixa" valor={s.marcadores} mudar={(marcadores) => mudar({ marcadores })} />{ancora}</>
    case 'cards':
      return (
        <>
          <Cabecalho s={s} mudar={mudar} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Opcoes rotulo="Estilo dos cartões" valor={s.estilo || 'padrao'} mudar={(estilo) => mudar({ estilo })} opcoes={[['padrao', 'Padrão'], ['colorido', 'Ícone colorido grande'], ['alerta', 'Alerta (vermelho)']]} />
            <Opcoes rotulo="Colunas" valor={String(s.colunas)} mudar={(v) => mudar({ colunas: Number(v) })} opcoes={COLUNAS} />
          </div>
          <ListaItens rotulo="Cartões" valor={s.itens} mudar={(itens) => mudar({ itens })} campos={{ icone: true, selo: true, cor: s.estilo === 'colorido' ? 'gradiente' : 'selo' }} />
          <Texto rotulo="Nota abaixo dos cartões" valor={s.nota} mudar={(nota) => mudar({ nota })} />
          {ancora}
        </>
      )
    case 'passos':
      return (
        <>
          <Cabecalho s={s} mudar={mudar} />
          <Opcoes rotulo="Colunas" valor={String(s.colunas)} mudar={(v) => mudar({ colunas: Number(v) })} opcoes={COLUNAS} />
          <ListaItens rotulo="Passos" valor={s.itens} mudar={(itens) => mudar({ itens })} campos={{}} />
          {ancora}
        </>
      )
    case 'lateral':
      return (
        <>
          <Cabecalho s={s} mudar={mudar} />
          <EscolherIcone rotulo="Ícone grande animado" valor={s.estilo} vazio="nenhum" mudar={(estilo) => mudar({ estilo })} />
          <Imagem rotulo="Imagem no lugar do ícone (opcional)" valor={s.imagem} mudar={(imagem) => mudar({ imagem })} />
          <Opcoes rotulo="Colunas dos cartões" valor={String(Math.min(2, s.colunas))} mudar={(v) => mudar({ colunas: Number(v) })} opcoes={COLUNAS.slice(0, 2)} />
          <ListaItens rotulo="Cartões" valor={s.itens} mudar={(itens) => mudar({ itens })} campos={{ icone: true }} />
          {ancora}
        </>
      )
    case 'planos':
      return (
        <>
          <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">Nomes, preços e limites vêm do menu Planos. Use {'{dias}'} para mostrar o prazo do teste grátis.</p>
          <Cabecalho s={s} mudar={mudar} />
          <Texto rotulo="Descrição em cada plano" valor={s.destaque} mudar={(destaque) => mudar({ destaque })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <PlanoDestaque s={s} mudar={mudar} />
            <Texto rotulo="Etiqueta do plano em destaque" valor={s.nota} mudar={(nota) => mudar({ nota })} />
          </div>
          <ListaTextos rotulo="Recursos listados em todos os planos" valor={s.marcadores} mudar={(marcadores) => mudar({ marcadores })} />
          <Botao rotulo="Botão dos planos" valor={s.botao} mudar={(botao) => mudar({ botao })} />
          {ancora}
        </>
      )
    case 'faq':
      return (
        <>
          <Cabecalho s={s} mudar={mudar} />
          <ListaItens rotulo="Perguntas" valor={s.itens} mudar={(itens) => mudar({ itens })} campos={{ rotuloTitulo: 'Pergunta', rotuloTexto: 'Resposta' }} />
          {ancora}
        </>
      )
    case 'cta':
      return (
        <>
          <EscolherIcone rotulo="Ícone no topo" valor={s.estilo} mudar={(estilo) => mudar({ estilo })} />
          <Cabecalho s={s} mudar={mudar} />
          <Botao rotulo="Botão" valor={s.botao} mudar={(botao) => mudar({ botao })} />
          <Texto rotulo="Nota abaixo do botão" valor={s.nota} mudar={(nota) => mudar({ nota })} />
          {ancora}
        </>
      )
    case 'livre':
      return (
        <>
          <Cabecalho s={s} mudar={mudar} />
          <ListaTextos rotulo="Lista com marcadores (opcional)" valor={s.marcadores} mudar={(marcadores) => mudar({ marcadores })} />
          <Botao rotulo="Botão principal" valor={s.botao} mudar={(botao) => mudar({ botao })} />
          <Botao rotulo="Botão secundário" valor={s.botao2} mudar={(botao2) => mudar({ botao2 })} />
          <Imagem rotulo="Imagem (opcional)" valor={s.imagem} mudar={(imagem) => mudar({ imagem })} />
          {s.imagem && <Opcoes rotulo="Posição da imagem" valor={s.estilo || 'direita'} mudar={(estilo) => mudar({ estilo })} opcoes={[['direita', 'À direita do texto'], ['esquerda', 'À esquerda do texto'], ['abaixo', 'Abaixo do texto']]} />}
          {ancora}
        </>
      )
  }
}
