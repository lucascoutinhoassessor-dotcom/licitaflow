import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { registrar } from '@/lib/registroUso'
import { emOperacaoCritica } from '@/lib/operacaoCritica'

const CHAVE = 'lf-recarregou-versao'

/** Arquivo da página não chegou: quase sempre é deploy novo (os arquivos da versão antiga somem) ou rede caindo. */
export function ehFalhaDeCarregamento(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch|ChunkLoadError|Loading chunk|Unable to preload CSS/i.test(m)
}

/** Recarrega uma vez para pegar a versão nova. Não repete em menos de 30 s (evita ficar em laço se o problema for outro).
 *  Nunca recarrega durante operação crítica (disputa ao vivo etc.). */
export function recarregarParaVersaoNova(): boolean {
  if (emOperacaoCritica()) return false
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE) ?? 0)
    if (Date.now() - ultima < 30_000) return false
    sessionStorage.setItem(CHAVE, String(Date.now()))
  } catch { /* sem armazenamento: recarrega mesmo assim */ }
  window.location.reload()
  return true
}

type Props = { children: ReactNode; chave?: string }
type Estado = { erro: unknown; recarregando: boolean }

/** Sem isto, qualquer erro ao abrir uma página deixa a tela inteira em branco. */
export class LimiteDeErro extends Component<Props, Estado> {
  state: Estado = { erro: null, recarregando: false }

  static getDerivedStateFromError(erro: unknown): Partial<Estado> {
    return { erro }
  }

  componentDidCatch(erro: unknown, info: ErrorInfo) {
    if (ehFalhaDeCarregamento(erro) && navigator.onLine && recarregarParaVersaoNova()) {
      this.setState({ recarregando: true })
      return
    }
    registrar('erro', `Tela quebrou: ${(erro as Error)?.message ?? String(erro)}`, {
      detalhe: { pilha: String((erro as Error)?.stack ?? '').slice(0, 1200), componentes: String(info.componentStack ?? '').slice(0, 800) },
    })
  }

  // Trocar de página limpa o erro: o resto do app continua usável.
  componentDidUpdate(anterior: Props) {
    if (this.state.erro && anterior.chave !== this.props.chave) this.setState({ erro: null, recarregando: false })
  }

  render() {
    const { erro, recarregando } = this.state
    if (!erro) return this.props.children
    if (recarregando) return null
    const carregamento = ehFalhaDeCarregamento(erro)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <h2 className="text-lg font-semibold">
          {carregamento ? (navigator.onLine ? 'Saiu uma versão nova do LicitaForce' : 'Sem conexão com a internet') : 'Esta tela teve um problema'}
        </h2>
        <p className="text-sm text-muted-foreground">
          {carregamento
            ? 'Não foi possível abrir esta página. Recarregue para continuar.'
            : 'O erro já foi registrado para a equipe. Recarregue ou volte e tente outra página.'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            onClick={() => window.location.reload()}
          >
            Recarregar
          </button>
          <button type="button" className="rounded-md border px-4 py-2 text-sm hover:bg-muted" onClick={() => history.back()}>
            Voltar
          </button>
        </div>
      </div>
    )
  }
}
