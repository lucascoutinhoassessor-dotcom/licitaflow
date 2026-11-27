import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { pagamentoAPI } from '@/lib/pagamentos'
import { mensagemErro } from '@/lib/supabase'
import { formatarData, formatarMoeda } from '@/lib/format'
import { Aviso, Button, Campo, Carregando, Input, Modal, Select } from '@/components/ui'

interface Pagamento {
  id: string; pago: boolean; status: string; forma: string; valor_centavos: number; vencimento: string
  pix: { imagem: string; codigo: string; expira_em: string } | null
  boleto: { linha: string; url: string | null } | null
  aviso: string | null
}
const vazio = () => ({ nome: '', numero: '', mes: '', ano: '', cvv: '' })
const titularVazio = () => ({ nome: '', email: '', documento: '', cep: '', numero: '', telefone: '' })

/** O pagamento é concluído aqui; dados do cartão não são persistidos no navegador. */
export function CheckoutPagamento({ assinatura, fatura, aoFechar, embutido = false }: { assinatura: string; fatura?: string; aoFechar: () => void; embutido?: boolean }) {
  const qc = useQueryClient()
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [forma, setForma] = useState('')
  const [cartao, setCartao] = useState(vazio)
  const [titular, setTitular] = useState(titularVazio)
  const [tentativa, setTentativa] = useState(false)
  const confirmado = useRef(false)
  const q = useQuery<Pagamento>({
    queryKey: ['checkout-pagamento', assinatura, fatura],
    queryFn: () => pagamentoAPI({ acao: 'checkout_assinatura', id: assinatura, fatura }),
    staleTime: 0, retry: false, refetchOnWindowFocus: !ocupado,
    refetchInterval: consulta => !ocupado && !consulta.state.data?.pago ? 30_000 : false,
  })
  const p = q.data
  useEffect(() => {
    if (!p?.pago || confirmado.current) return
    confirmado.current = true
    setCartao(vazio()); setTitular(titularVazio())
    toast.success('Pagamento confirmado. Seu acesso foi atualizado.')
    for (const key of ['assinatura','organizacoes','empresas','plano-cliente','admin-assinaturas','admin-financeiro','checkout-cliente']) {
      void qc.invalidateQueries({ queryKey: [key] })
    }
  }, [p?.pago, qc])

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); toast.success('Código copiado.') }
    catch { toast.error('Selecione e copie o código exibido abaixo.') }
  }
  async function pagar(e: FormEvent) {
    e.preventDefault()
    if (ocupado || tentativa) return
    setOcupado(true); setErro(''); setTentativa(true)
    try {
      const r = await pagamentoAPI({ acao: 'pagar_cartao', id: assinatura, fatura, cartao, titular }) as Pagamento
      qc.setQueryData(['checkout-pagamento',assinatura,fatura],r)
      if (!r.pago) setErro('Pagamento enviado para análise. Aguarde a confirmação antes de tentar novamente.')
    } catch (e) {
      setErro(mensagemErro(e))
      // Antes de outra tentativa, a pessoa precisa conferir o resultado no gateway.
    } finally {
      setCartao(vazio()); setTitular(titularVazio()); setOcupado(false)
    }
  }
  async function conferir() {
    const resultado = await q.refetch()
    if (!resultado.error) setTentativa(false)
  }
  const formas = p?.forma === 'UNDEFINED' ? ['PIX','BOLETO','CREDIT_CARD'] : [p?.forma ?? 'PIX']
  const escolhida = formas.includes(forma) ? forma : formas[0]

  const conteudo = <div className="space-y-4">
      {q.isLoading && <Carregando />}
      {q.isError && <Aviso>{mensagemErro(q.error)}</Aviso>}
      {p && <>
        <p className="text-sm">Total: <strong>{formatarMoeda(p.valor_centavos / 100)}</strong> · Vencimento: {formatarData(p.vencimento)}</p>
        {p.aviso && <Aviso tipo="info">{p.aviso}</Aviso>}
        {p.pago ? <Aviso tipo="sucesso">Pagamento confirmado. O plano está liberado.</Aviso> : !['PENDING','OVERDUE'].includes(p.status) ? <Aviso tipo="info">Situação do pagamento: {p.status}. Aguarde a confirmação ou fale com o suporte.</Aviso> : <>
          {formas.length > 1 && <Campo rotulo="Pagar com" htmlFor="checkout-forma"><Select id="checkout-forma" value={escolhida} disabled={ocupado} onChange={e => setForma(e.target.value)}>
            {formas.map(f => <option key={f} value={f}>{f === 'PIX' ? 'Pix' : f === 'BOLETO' ? 'Boleto' : 'Cartão de crédito'}</option>)}
          </Select></Campo>}
          {escolhida === 'PIX' && p.pix && <div className="space-y-3">
            <p className="text-sm">Escaneie o QR Code no aplicativo do banco ou copie o código Pix.</p>
            {p.pix.imagem && <img className="mx-auto h-52 w-52 rounded-xl bg-white p-3" src={`data:image/png;base64,${p.pix.imagem}`} alt="QR Code para pagar com Pix" />}
            <Campo rotulo="Pix copia e cola" htmlFor="checkout-pix"><Input id="checkout-pix" readOnly value={p.pix.codigo} onFocus={e => e.target.select()} /></Campo>
            <Button variante="contorno" onClick={() => copiar(p.pix!.codigo)}>Copiar código Pix</Button>
            {p.pix.expira_em && <p className="text-xs text-muted-foreground">Validade: {p.pix.expira_em}</p>}
          </div>}
          {escolhida === 'BOLETO' && p.boleto && <div className="space-y-3">
            <Campo rotulo="Linha digitável" htmlFor="checkout-boleto"><Input id="checkout-boleto" readOnly value={p.boleto.linha} onFocus={e => e.target.select()} /></Campo>
            <Button variante="contorno" onClick={() => copiar(p.boleto!.linha)}>Copiar linha digitável</Button>
            {p.boleto.url && <a href={p.boleto.url} target="_blank" rel="noopener noreferrer" className="ml-3 text-sm text-primary underline">Baixar boleto</a>}
            <p className="text-xs text-muted-foreground">O acesso é liberado quando o banco confirmar a compensação.</p>
          </div>}
          {escolhida === 'CREDIT_CARD' && <form className="space-y-3" onSubmit={pagar}>
            <fieldset disabled={ocupado || tentativa} className="space-y-3">
              <Campo rotulo="Nome no cartão" htmlFor="cc-nome"><Input id="cc-nome" autoComplete="cc-name" required value={cartao.nome} onChange={e => setCartao({...cartao,nome:e.target.value})} /></Campo>
              <Campo rotulo="Número do cartão" htmlFor="cc-numero"><Input id="cc-numero" inputMode="numeric" autoComplete="cc-number" required maxLength={23} value={cartao.numero} onChange={e => setCartao({...cartao,numero:e.target.value})} /></Campo>
              <div className="grid grid-cols-3 gap-2">
                <Campo rotulo="Mês" htmlFor="cc-mes"><Input id="cc-mes" inputMode="numeric" autoComplete="cc-exp-month" required maxLength={2} placeholder="MM" value={cartao.mes} onChange={e => setCartao({...cartao,mes:e.target.value})} /></Campo>
                <Campo rotulo="Ano" htmlFor="cc-ano"><Input id="cc-ano" inputMode="numeric" autoComplete="cc-exp-year" required minLength={4} maxLength={4} placeholder="AAAA" value={cartao.ano} onChange={e => setCartao({...cartao,ano:e.target.value})} /></Campo>
                <Campo rotulo="CVV" htmlFor="cc-cvv"><Input id="cc-cvv" type="password" inputMode="numeric" autoComplete="cc-csc" required minLength={3} maxLength={4} value={cartao.cvv} onChange={e => setCartao({...cartao,cvv:e.target.value})} /></Campo>
              </div>
              <p className="pt-2 text-sm font-medium">Dados do titular</p>
              <Campo rotulo="Nome completo" htmlFor="ct-nome"><Input id="ct-nome" autoComplete="name" required value={titular.nome} onChange={e => setTitular({...titular,nome:e.target.value})} /></Campo>
              <Campo rotulo="E-mail" htmlFor="ct-email"><Input id="ct-email" type="email" autoComplete="email" required value={titular.email} onChange={e => setTitular({...titular,email:e.target.value})} /></Campo>
              <Campo rotulo="CPF ou CNPJ" htmlFor="ct-doc"><Input id="ct-doc" inputMode="numeric" required maxLength={18} value={titular.documento} onChange={e => setTitular({...titular,documento:e.target.value})} /></Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo rotulo="CEP" htmlFor="ct-cep"><Input id="ct-cep" inputMode="numeric" autoComplete="postal-code" required maxLength={9} value={titular.cep} onChange={e => setTitular({...titular,cep:e.target.value})} /></Campo>
                <Campo rotulo="Número do endereço" htmlFor="ct-num"><Input id="ct-num" required maxLength={30} value={titular.numero} onChange={e => setTitular({...titular,numero:e.target.value})} /></Campo>
              </div>
              <Campo rotulo="Telefone com DDD" htmlFor="ct-tel"><Input id="ct-tel" inputMode="tel" autoComplete="tel" required maxLength={20} value={titular.telefone} onChange={e => setTitular({...titular,telefone:e.target.value})} /></Campo>
            </fieldset>
            <p className="text-xs text-muted-foreground">Processado pelo Asaas. O cartão será utilizado nas cobranças recorrentes do plano.</p>
            <Button type="submit" carregando={ocupado} disabled={tentativa}>Pagar {formatarMoeda(p.valor_centavos / 100)}</Button>
          </form>}
        </>}
      </>}
      {erro && <Aviso>{erro}</Aviso>}
      {!p?.pago && <Button variante="contorno" carregando={q.isFetching} disabled={ocupado} onClick={conferir}>Atualizar pagamento</Button>}
      <p className="text-xs text-muted-foreground">O pagamento é confirmado pelo provedor. Pix e boleto são pagos no aplicativo do seu banco.</p>
    </div>
  return embutido ? conteudo : <Modal aberto aoFechar={() => { if (!ocupado) aoFechar() }} titulo="Checkout LicitaForce">{conteudo}</Modal>
}
