import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CheckoutPagamento } from './CheckoutPagamento'

function render(forma: string, pago = false) {
  const qc = new QueryClient()
  qc.setQueryData(['checkout-pagamento', 'assinatura-teste', undefined], {
    id: 'pay_teste', forma, pago, status: pago ? 'CONFIRMED' : 'PENDING', valor_centavos: 19700,
    vencimento: '2027-01-01', pix: { imagem: 'aW1hZ2Vt', codigo: '000201-pix' }, boleto: { linha: '123456789', url: null },
  })
  const html = renderToStaticMarkup(<QueryClientProvider client={qc}><CheckoutPagamento assinatura="assinatura-teste" embutido aoFechar={() => {}} /></QueryClientProvider>)
  qc.clear()
  return html
}
describe('pagamento dentro da página de checkout', () => {
  it('permite informar cartão e titular sem enviar para uma página externa', () => {
    const html = render('CREDIT_CARD')
    expect(html).toContain('cc-number')
    expect(html).toContain('cc-csc')
    expect(html).toContain('Dados do titular')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('href="https://')
  })
  it('mostra QR Code e código Pix dentro do checkout', () => {
    const html = render('PIX')
    expect(html).toContain('000201-pix')
    expect(html).toContain('data:image/png;base64,aW1hZ2Vt')
    expect(html).not.toContain('cc-number')
  })
  it('mostra linha digitável do boleto', () => {
    const html = render('BOLETO')
    expect(html).toContain('123456789')
    expect(html).not.toContain('cc-number')
  })
  it('pagamento confirmado remove os campos de cartão e botão para pagar', () => {
    const html = render('CREDIT_CARD', true)
    expect(html).toContain('Pagamento confirmado')
    expect(html).not.toContain('cc-number')
    expect(html).not.toContain('Pagar 197')
  })
})
