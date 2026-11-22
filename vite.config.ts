import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** Em desenvolvimento, atende /api/resultados, /api/precos, /api/compra, /api/atas, /api/mercado e /api/juridico com as mesmas funções usadas na Vercel. */
function apiLocal(): Plugin {
  return {
    name: 'licitaflow-api-local',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''))
      for (const nome of ['resultados', 'precos', 'compra', 'atas', 'mercado', 'juridico']) server.middlewares.use(`/api/${nome}`, async (req, res) => {
        const mod = await server.ssrLoadModule(`/server/${nome}.js`)
        const url = new URL(req.url ?? '', 'http://localhost')
        const resposta = {
          setHeader: (k: string, v: string) => res.setHeader(k, v),
          status(c: number) { res.statusCode = c; return resposta },
          json(o: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)) },
        }
        await mod.default({ method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams) }, resposta)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), apiLocal()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Porta 3100 (a 3000 costuma estar ocupada por outros projetos). Precisa estar nas Redirect URLs do Supabase Auth.
  // /pncp-arquivos repete o rewrite da Vercel (arquivos do edital pelo próprio domínio; o PNCP duplica o cabeçalho de CORS).
  server: { port: 3100, strictPort: true, proxy: { '/pncp-arquivos': { target: 'https://pncp.gov.br', changeOrigin: true, rewrite: (p) => p.replace(/^\/pncp-arquivos/, '/pncp-api/v1') } } },
  preview: { port: 3100 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
})
