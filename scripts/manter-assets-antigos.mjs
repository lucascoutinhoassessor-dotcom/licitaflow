// Roda depois do `vite build`, no deploy de produção. Mantém no ar os arquivos das versões anteriores do app.
//
// Por quê: cada deploy troca os nomes dos arquivos das páginas (dist/assets/Pagina-<hash>.js). Quem estava com o
// app aberto continua pedindo os nomes antigos; se eles somem, a página não abre e a tela fica em branco.
// Aqui copiamos para o novo deploy os arquivos da versão que está no ar e das anteriores (até DIAS_RETENCAO dias
// depois de saírem do ar). Os nomes têm hash, então nunca colidem com os novos.
//
// dist/versoes-assets.json guarda { arquivo: última vez que fez parte da versão no ar } para o próximo deploy.
//
// Origem: ASSETS_ANTERIORES_URL, ou o site oficial em deploy de produção. Sem origem (build local, preview), não faz nada.
// Se a versão no ar não puder ser copiada inteira, o build FALHA: é melhor não publicar do que derrubar quem
// está com o app aberto. Emergência: ASSETS_ANTERIORES_IGNORAR=1.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DIST = process.argv[2] ?? 'dist'
const PASTA = path.join(DIST, 'assets')
const MANIFESTO = 'versoes-assets.json'
const DIAS_RETENCAO = 30
const SITE_OFICIAL = 'https://licitaforce-app.vercel.app'

const env = process.env
const producao = env.VERCEL_ENV === 'production' && !String(env.VERCEL_PROJECT_PRODUCTION_URL ?? '').includes('demo')
const origem = (env.ASSETS_ANTERIORES_URL || (producao ? SITE_OFICIAL : '')).replace(/\/$/, '')
if (!origem) { console.log('[assets antigos] sem origem (build local ou preview): nada a copiar'); process.exit(0) }

const ignorarFalha = env.ASSETS_ANTERIORES_IGNORAR === '1'
const agora = new Date().toISOString()
const limite = Date.now() - DIAS_RETENCAO * 86_400_000
const NOME = /^[\w.-]+\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp|gif|ico|wasm)$/

async function baixar(url, tentativas = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return Buffer.from(await r.arrayBuffer())
    } catch (e) {
      if (i >= tentativas) throw new Error(`${url}: ${e.message}`)
      await new Promise(res => setTimeout(res, 1000 * i))
    }
  }
}

/** Nomes de arquivos de assets/ citados num HTML, JS ou CSS ("/assets/x.js", "assets/x.js", "./x.js"). */
function citados(texto, dentroDeAssets) {
  const nomes = new Set()
  for (const m of texto.matchAll(/(?:\/?assets\/)([\w.-]+\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp|gif|ico|wasm))/g)) nomes.add(m[1])
  if (dentroDeAssets) for (const m of texto.matchAll(/["'`(]\.\/([\w.-]+\.(?:js|css|woff2?|ttf|svg|png|jpe?g|webp|gif|ico|wasm))/g)) nomes.add(m[1])
  return nomes
}

/** Copia para dist/assets todos os arquivos da versão no ar, seguindo as referências a partir do index.html. */
async function versaoNoAr() {
  const html = await baixar(`${origem}/entrar?_=${Date.now()}`)
  if (!html) throw new Error('index.html da versão no ar não encontrado')
  const fila = [...citados(html.toString('utf8'), false)]
  const vistos = new Set(fila)
  const conteudo = new Map()
  while (fila.length) {
    const lote = fila.splice(0, 8)
    await Promise.all(lote.map(async nome => {
      const dados = await baixar(`${origem}/assets/${nome}`)
      if (!dados) throw new Error(`a versão no ar cita assets/${nome}, mas o arquivo não existe`)
      conteudo.set(nome, dados)
      if (/\.(js|css)$/.test(nome)) for (const n of citados(dados.toString('utf8'), true)) if (!vistos.has(n)) { vistos.add(n); fila.push(n) }
    }))
    if (vistos.size > 5000) throw new Error('referências demais: algo errado na leitura da versão no ar')
  }
  return conteudo
}

async function manifestoAnterior() {
  const dados = await baixar(`${origem}/${MANIFESTO}?_=${Date.now()}`).catch(() => null)
  if (!dados) return {}
  try { return JSON.parse(dados.toString('utf8')).arquivos ?? {} } catch { return {} }
}

async function main() {
  if (!existsSync(PASTA)) mkdirSync(PASTA, { recursive: true })
  const atuais = new Set(readdirSync(PASTA))
  const noAr = await versaoNoAr()
  const anterior = await manifestoAnterior()

  const manifesto = {}
  let copiados = 0, bytes = 0
  const gravar = (nome, dados) => {
    if (atuais.has(nome)) return
    writeFileSync(path.join(PASTA, nome), dados); atuais.add(nome); copiados++; bytes += dados.length
  }

  for (const [nome, dados] of noAr) { gravar(nome, dados); manifesto[nome] = agora }

  // Versões mais antigas, ainda dentro do prazo.
  const antigos = Object.entries(anterior).filter(([nome, quando]) => !manifesto[nome] && NOME.test(nome) && Date.parse(quando) >= limite)
  let faltando = 0
  for (let i = 0; i < antigos.length; i += 8) {
    await Promise.all(antigos.slice(i, i + 8).map(async ([nome, quando]) => {
      if (atuais.has(nome)) { manifesto[nome] = quando; return }
      const dados = await baixar(`${origem}/assets/${nome}`).catch(() => null)
      if (!dados) { faltando++; return }
      gravar(nome, dados); manifesto[nome] = quando
    }))
  }

  for (const nome of readdirSync(PASTA)) if (!manifesto[nome]) manifesto[nome] = agora
  writeFileSync(path.join(DIST, MANIFESTO), JSON.stringify({ atualizado: agora, retencaoDias: DIAS_RETENCAO, arquivos: manifesto }))
  console.log(`[assets antigos] versão no ar: ${noAr.size} arquivos; copiados ${copiados} (${(bytes / 1048576).toFixed(1)} MB); ` +
    `mantidos ${Object.keys(manifesto).length} no total` + (faltando ? `; ${faltando} antigos não encontrados` : ''))
}

main().catch(e => {
  console.error(`[assets antigos] FALHOU: ${e.message}`)
  if (ignorarFalha) { console.error('[assets antigos] ASSETS_ANTERIORES_IGNORAR=1: seguindo sem os arquivos antigos'); process.exit(0) }
  console.error('Quem estiver com o app aberto ficaria com a tela em branco. Deploy interrompido.')
  process.exit(1)
})
