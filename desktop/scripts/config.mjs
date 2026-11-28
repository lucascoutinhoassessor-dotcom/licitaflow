// Grava src/config.json com o endereço e a chave pública (anon) do Supabase, as mesmas do site.
// Lê LICITAFORCE_SUPABASE_URL / LICITAFORCE_SUPABASE_ANON_KEY ou, como o Vite, VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY do ambiente ou do .env da raiz do projeto. Não imprime os valores.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = join(aqui, '..', '..')

function lerEnv(arquivo) {
  if (!existsSync(arquivo)) return {}
  const saida = {}
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) saida[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return saida
}

const env = { ...lerEnv(join(raiz, '.env')), ...lerEnv(join(raiz, '.env.local')), ...process.env }
const supabaseUrl = env.LICITAFORCE_SUPABASE_URL || env.VITE_SUPABASE_URL
const supabaseAnonKey = env.LICITAFORCE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltam o endereço e a chave pública do Supabase (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).')
  process.exit(1)
}
if (/service_role/.test(Buffer.from(String(supabaseAnonKey).split('.')[1] ?? '', 'base64').toString())) {
  console.error('A chave informada é a de serviço, não a pública. Use a anon key.')
  process.exit(1)
}
writeFileSync(join(aqui, '..', 'src', 'config.json'), JSON.stringify({
  supabaseUrl, supabaseAnonKey, siteUrl: env.LICITAFORCE_SITE_URL || 'https://licitaforce-app.vercel.app', descoberta: env.LICITAFORCE_DESCOBERTA !== '0',
}, null, 2))
console.log('config.json pronto (' + new URL(supabaseUrl).hostname + ')')
