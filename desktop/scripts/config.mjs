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
const papel = (jwt) => { try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString()).role } catch { return null } }

/** Sem .env (por exemplo, no GitHub Actions): lê o endereço e a chave pública do site publicado, que já os entrega ao navegador. */
async function doSitePublicado(site) {
  const html = await (await fetch(site)).text()
  for (const js of [...new Set(html.match(/\/assets\/[^"']+\.js/g) ?? [])]) {
    const codigo = await (await fetch(new URL(js, site))).text()
    const url = codigo.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0]
    // Chave pública no formato novo (sb_publishable_…) ou no antigo (JWT com papel "anon"). Nunca a de serviço.
    const chave = codigo.match(/sb_publishable_[A-Za-z0-9_-]{10,}/)?.[0]
      ?? (codigo.match(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []).find((j) => papel(j) === 'anon')
    if (url && chave) return { url, chave }
  }
  return {}
}

let supabaseUrl = env.LICITAFORCE_SUPABASE_URL || env.VITE_SUPABASE_URL
let supabaseAnonKey = env.LICITAFORCE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey) {
  const p = await doSitePublicado(env.LICITAFORCE_SITE_URL || 'https://licitaforce-app.vercel.app').catch(() => ({}))
  supabaseUrl ||= p.url
  supabaseAnonKey ||= p.chave
}
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltam o endereço e a chave pública do Supabase (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).')
  process.exit(1)
}
if (String(supabaseAnonKey).startsWith('sb_secret_') || /service_role/.test(Buffer.from(String(supabaseAnonKey).split('.')[1] ?? '', 'base64').toString())) {
  console.error('A chave informada é a de serviço, não a pública. Use a anon key.')
  process.exit(1)
}
writeFileSync(join(aqui, '..', 'src', 'config.json'), JSON.stringify({
  supabaseUrl, supabaseAnonKey, siteUrl: env.LICITAFORCE_SITE_URL || 'https://licitaforce-app.vercel.app', descoberta: env.LICITAFORCE_DESCOBERTA !== '0',
}, null, 2))
console.log('config.json pronto (' + new URL(supabaseUrl).hostname + ')')
