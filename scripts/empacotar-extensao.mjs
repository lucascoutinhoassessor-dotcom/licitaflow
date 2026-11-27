// Gera public/licitaforce-extensao.zip a partir de extensao/ (sem os testes), para baixar e instalar no Chrome/Edge.
// Uso: node scripts/empacotar-extensao.mjs  (rode de novo sempre que mudar algo em extensao/).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { zipSync } from 'fflate'

const arquivos = {}
for (const nome of readdirSync('extensao').sort()) {
  if (/\.test\.|\.md$/.test(nome)) continue
  arquivos[`licitaforce-extensao/${nome}`] = [new Uint8Array(readFileSync(`extensao/${nome}`)), { mtime: new Date('2026-01-01') }]
}
const zip = zipSync(arquivos, { level: 9 })
writeFileSync('public/licitaforce-extensao.zip', zip)
console.log(`public/licitaforce-extensao.zip: ${Object.keys(arquivos).length} arquivos, ${zip.length} bytes`)
