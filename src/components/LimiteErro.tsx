import { Component, type ReactNode } from 'react'
import { FalhaAcesso } from './FalhaAcesso'

/** Inclui falhas de imports de páginas após uma nova publicação. */
export class LimiteErro extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false }
  static getDerivedStateFromError() { return { erro: true } }
  render() {
    if (this.state.erro) return <FalhaAcesso aoTentar={() => window.location.reload()} />
    return this.props.children
  }
}
