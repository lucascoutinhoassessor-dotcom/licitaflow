// Gera os ícones PNG de public/icons sem dependências:
//  app-192/512     → app do usuário (fundo azul em degradê, traço verde), o mesmo desenho da abertura em index.html
//  master-192/512  → painel master (fundo escuro, traço âmbar)
//  badge-96        → ícone pequeno da barra de notificações do Android: só a silhueta branca sobre fundo
//                    transparente. O Android pinta o badge de uma cor só; um ícone opaco vira um quadrado branco.
// Uso: node scripts/gerar-icones.mjs
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const EIXO = [[144, 128], [144, 384], [366, 384]]
const LINHA = [[224, 290], [272, 218], [320, 250], [368, 172]]

function distSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}
const naPolilinha = (x, y, pts, r) => pts.slice(1).some((p, i) => distSeg(x, y, pts[i], p) <= r)
function noQuadrado(x, y, r) {
  const cx = Math.min(Math.max(x, r), 512 - r), cy = Math.min(Math.max(y, r), 512 - r)
  return Math.hypot(x - cx, y - cy) <= r
}
const mistura = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))))

const desenhos = {
  app(x, y) {
    if (naPolilinha(x, y, EIXO, 22)) return [255, 255, 255, 255]
    if (Math.hypot(x - 368, y - 172) <= 30) return [110, 231, 183, 255]
    if (naPolilinha(x, y, LINHA, 20)) return [...mistura([16, 185, 129], [110, 231, 183], ((x - 224) + (290 - y)) / 262), 255]
    if (!noQuadrado(x, y, 116)) return [0, 0, 0, 0]
    const fundo = mistura([59, 130, 246], [30, 64, 175], (x + y) / 1024)
    return [...(y < 256 ? mistura(fundo, [255, 255, 255], 0.07) : fundo), 255]
  },
  master(x, y) {
    if (naPolilinha(x, y, EIXO, 22)) return [255, 255, 255, 255]
    if (naPolilinha(x, y, LINHA, 20)) return [251, 191, 36, 255]
    if (noQuadrado(x, y, 100)) return [24, 24, 27, 255]
    return [0, 0, 0, 0]
  },
  // Silhueta mais grossa: no tamanho de 24 px da barra de status os traços finos somem.
  badge(x, y) {
    if (naPolilinha(x, y, EIXO, 34) || naPolilinha(x, y, LINHA, 32) || Math.hypot(x - 368, y - 172) <= 40) return [255, 255, 255, 255]
    return [0, 0, 0, 0]
  },
}

function crc32(buf) {
  let c, crc = 0xffffffff
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c }
  return (crc ^ 0xffffffff) >>> 0
}
function bloco(tipo, dados) {
  const t = Buffer.from(tipo), len = Buffer.alloc(4), crc = Buffer.alloc(4)
  len.writeUInt32BE(dados.length); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])))
  return Buffer.concat([len, t, dados, crc])
}

function png(tam, pixel) {
  const S = 4, esc = 512 / tam, bruto = Buffer.alloc(tam * (tam * 4 + 1))
  for (let y = 0; y < tam; y++) {
    bruto[y * (tam * 4 + 1)] = 0
    for (let x = 0; x < tam; x++) {
      const soma = [0, 0, 0, 0]
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const p = pixel((x + (sx + 0.5) / S) * esc, (y + (sy + 0.5) / S) * esc)
        soma[0] += p[0] * p[3]; soma[1] += p[1] * p[3]; soma[2] += p[2] * p[3]; soma[3] += p[3]
      }
      const o = y * (tam * 4 + 1) + 1 + x * 4, a = soma[3]
      bruto[o] = a ? Math.round(soma[0] / a) : 0
      bruto[o + 1] = a ? Math.round(soma[1] / a) : 0
      bruto[o + 2] = a ? Math.round(soma[2] / a) : 0
      bruto[o + 3] = Math.round(a / (S * S))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tam, 0); ihdr.writeUInt32BE(tam, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', deflateSync(bruto)), bloco('IEND', Buffer.alloc(0))])
}

const saida = (nome, buf) => writeFileSync(new URL(`../public/icons/${nome}.png`, import.meta.url), buf)
for (const t of [192, 512]) { saida(`app-${t}`, png(t, desenhos.app)); saida(`master-${t}`, png(t, desenhos.master)) }
saida('badge-96', png(96, desenhos.badge))
