import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import { AuthProvider } from './providers/AuthProvider'
import { InstalacaoProvider } from './providers/InstalacaoProvider'
import './index.css'
import { tocarPing } from './lib/ping'
import { iniciarRegistroUso } from './lib/registroUso'
import { LimiteErro } from './components/LimiteErro'

// Propostas do botão favorito do Compras.gov.br chegam depois do # do endereço. Guarda antes do login,
// que pode trocar de página e perder o #; a página /app/importar-propostas lê daqui.
if (window.location.hash.startsWith('#lf-propostas=')) {
  try { sessionStorage.setItem('lf-propostas', window.location.hash.slice(14)) } catch { /* sem armazenamento */ }
  history.replaceState(null, '', window.location.pathname + window.location.search)
}

// Registro de uso, erros e lentidão por usuário (master → Logs → Uso dos clientes).
iniciarRegistroUso()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LimiteErro><InstalacaoProvider><AuthProvider>
        <App />
        <Toaster richColors position="top-right" />
      </AuthProvider></InstalacaoProvider></LimiteErro>
    </QueryClientProvider>
  </StrictMode>,
)
window.dispatchEvent(new Event('lf:iniciado'))

// Abertura animada (desenhada em index.html antes do JavaScript), só no app instalado (classe posta por
// public/pwa.js): sai depois que a animação termina. No navegador comum ela nunca aparece.
const splash = document.getElementById('lf-splash')
if (splash && !document.documentElement.classList.contains('lf-instalado')) splash.remove()
else if (splash) {
  const animar = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  setTimeout(() => {
    splash.classList.add('sair')
    setTimeout(() => splash.remove(), 500)
  }, Math.max(0, (animar ? 1750 : 300) - performance.now()))
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const registrar = () => { navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => { /* A aplicação online continua disponível. */ }) }
  if (document.readyState === 'complete') registrar()
  else window.addEventListener('load', registrar, { once: true })
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.tipo === 'push-ping' && document.visibilityState === 'visible') void tocarPing(e.data.som)
  })
}
