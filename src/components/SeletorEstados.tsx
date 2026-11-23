import { MapPin } from 'lucide-react'
import MenuFiltros, { AcaoSecao, ChipFiltro, SecaoFiltro } from '@/components/MenuFiltros'
import { UFS } from '@/lib/filtrosOportunidades'

/** Rótulo do botão: "Brasil inteiro", os estados (até 3) ou quantos são. */
function rotuloEstados(ufs: string[]) {
  return !ufs.length ? 'Brasil inteiro' : ufs.length <= 3 ? ufs.join(', ') : `${ufs.length} estados`
}

/**
 * Escolha de vários estados de uma vez (nenhum = Brasil inteiro). Abre a mesma janela dos filtros;
 * `aoAplicar` (opcional) mostra o botão "Aplicar e buscar" no rodapé.
 */
export default function SeletorEstados({ valor, aoMudar, aoAplicar, carregando, className }: {
  valor: string[]; aoMudar: (ufs: string[]) => void; aoAplicar?: () => void; carregando?: boolean; className?: string
}) {
  const alternar = (u: string) => aoMudar(valor.includes(u) ? valor.filter((x) => x !== u) : [...valor, u])
  return <MenuFiltros className={className} rotulo={rotuloEstados(valor)} titulo="Estados" icone={MapPin} ativos={valor.length}
    aoLimpar={() => aoMudar([])}
    rodape={aoAplicar ? (fechar) => <button type="button" disabled={carregando} onClick={() => { fechar(); aoAplicar() }}
      className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 sm:h-9">Aplicar e buscar</button> : undefined}>
    <SecaoFiltro icone={MapPin} cor="verde" titulo="Escolha os estados" descricao="Nenhum marcado = Brasil inteiro."
      acao={<span className="flex gap-3"><AcaoSecao onClick={() => aoMudar([...UFS])}>Marcar todos</AcaoSecao><AcaoSecao onClick={() => aoMudar([])}>Desmarcar</AcaoSecao></span>}>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7">
        {UFS.map((u) => <ChipFiltro key={u} ativo={valor.includes(u)} onClick={() => alternar(u)}>{u}</ChipFiltro>)}
      </div>
    </SecaoFiltro>
  </MenuFiltros>
}
