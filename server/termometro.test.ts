import { deflateRawSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { abrirZip, atualizarCapag, lerCsvEstados, lerXlsxMunicipios, numero, posicaoDoNome, recursoMaisNovo } from './termometro.js'

/** ZIP mínimo (deflate) com os arquivos dados, para testar o leitor de XLSX. */
function zip(arquivos: Record<string, string>) {
  const locais: Buffer[] = [], centrais: Buffer[] = []
  let pos = 0
  for (const [nome, texto] of Object.entries(arquivos)) {
    const dados = deflateRawSync(Buffer.from(texto)), n = Buffer.from(nome)
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(dados.length, 18); l.writeUInt16LE(n.length, 26)
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(dados.length, 20); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42)
    locais.push(l, n, dados); centrais.push(c, n)
    pos += 30 + n.length + dados.length
  }
  const central = Buffer.concat(centrais)
  const fim = Buffer.alloc(22); fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(Object.keys(arquivos).length, 10); fim.writeUInt32LE(central.length, 12); fim.writeUInt32LE(pos, 16)
  return Buffer.concat([...locais, central, fim])
}

const strs = ['Código Município Completo', 'Nome_Município', 'UF', 'CAPAG', 'Indicador 3', 'Nota 3', "Alta Floresta D'Oeste", 'RO', 'C', 'n.d.', 'Prévia da CAPAG', 'Outra']
const ss = `<sst>${strs.map((s) => `<si><t>${s.replace("'", '&apos;')}</t></si>`).join('')}</sst>`
const cel = (r: string, i: number) => `<c r="${r}" t="s"><v>${i}</v></c>`
const sheet = `<worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>título</t></is></c></row>
<row r="2">${cel('A2', 0)}${cel('B2', 1)}${cel('C2', 2)}${cel('D2', 3)}${cel('I2', 4)}${cel('J2', 5)}${cel('Y2', 0)}</row>
<row r="3"><c r="A3"><v>1100015</v></c>${cel('B3', 6)}${cel('C3', 7)}${cel('D3', 8)}<c r="I3"><v>4.4E-2</v></c>${cel('J3', 8)}</row>
<row r="4"><c r="A4"><v>123</v></c>${cel('C4', 7)}${cel('D4', 9)}</row>
</sheetData></worksheet>`
const xlsx = zip({
  'xl/workbook.xml': '<workbook><sheets><sheet name="Outra" sheetId="1" r:id="rId9"/><sheet name="Prévia da CAPAG" sheetId="2" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet7.xml"/><Relationship Id="rId9" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/sharedStrings.xml': ss, 'xl/worksheets/sheet7.xml': sheet, 'xl/worksheets/sheet1.xml': '<worksheet/>',
})

describe('leitura da CAPAG', () => {
  it('lê números da planilha', () => {
    expect([numero('27,98%'), numero('0.125'), numero('1.234,56'), numero('4.4E-2'), numero('n.d.'), numero('')]).toEqual([0.2798, 0.125, 1234.56, 0.044, null, null])
  })

  it('lê o CSV dos estados', () => {
    const csv = '﻿UF;Indicador 1;Nota 1;Indicador 2;Nota 2;Indicador 3;Nota 3;Classificação da CAPAG;Qualidade da informação contábil e fiscal;Observação\r\nMG;183,70%;C;95,87%;C;-17,52%;C;D;Bicf;\r\nXX;1;A;1;A;1;A;A;;\r\n'
    expect(lerCsvEstados(csv, { posicao: '2026', fonte: 'f' })).toEqual([{ chave: 'E:MG', esfera: 'E', ibge: null, uf: 'MG', nome: 'Minas Gerais', nota: 'D',
      indicador1: 1.837, nota1: 'C', indicador2: 0.9587, nota2: 'C', indicador3: -0.1752, nota3: 'C', icf: 'Bicf', observacao: null, posicao: '2026', fonte: 'f' }])
  })

  it('abre o XLSX pela aba "Prévia da CAPAG" e acha o cabeçalho', () => {
    expect(Object.keys(abrirZip(xlsx, ['xl/workbook.xml']))).toEqual(['xl/workbook.xml'])
    const m = lerXlsxMunicipios(xlsx, { posicao: '01/09/2026', fonte: 'f' })
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ chave: 'M:1100015', ibge: '1100015', uf: 'RO', nome: "Alta Floresta D'Oeste", nota: 'C', indicador3: 0.044, nota3: 'C', posicao: '01/09/2026' })
  })

  it('escolhe o arquivo mais recente e a posição pelo nome', () => {
    const pacote = { resources: [{ id: 'a', format: 'XLSX', url: 'u1', name: 'Capag 2026 - 01/06/2026', last_modified: '2026-06-18' }, { id: 'b', format: 'XLSX', url: 'u2', name: 'Capag Municípios 2026 - 01/09/2026', last_modified: '2026-11-23' }, { id: 'c', format: 'PDF', url: 'u3', last_modified: '2026-12-01' }] }
    expect(recursoMaisNovo(pacote, 'XLSX')?.id).toBe('b')
    // Arquivo antigo reenviado depois do novo (caso real de 23/11/2026): vale a data de posição do nome.
    const reenvio = { resources: [{ id: 'set', format: 'XLSX', url: 'u', name: 'Capag Municípios 2026 - 01/09/2026', last_modified: '2026-11-23T15:15' }, { id: 'jun', format: 'XLSX', url: 'u', name: 'Capag Municípios 2026 - 01/06/2026', last_modified: '2026-11-23T18:37' }] }
    expect(recursoMaisNovo(reenvio, 'XLSX')?.id).toBe('set')
    const estados = { resources: [{ id: 'r24', format: 'CSV', url: 'u', name: 'Capag Estados 2024 - Revisão', last_modified: '2025-04-24' }, { id: 'e26', format: 'CSV', url: 'u', name: 'Capag Estados 2026', last_modified: '2026-11-18' }, { id: 'e25', format: 'CSV', url: 'u', name: 'Capag Estados 2025', last_modified: '2026-03-10' }] }
    expect(recursoMaisNovo(estados, 'CSV')?.id).toBe('e26')
    expect(posicaoDoNome('Capag Municípios 2026 - 01/09/2026')).toBe('01/09/2026')
    expect(posicaoDoNome('Capag Estados 2026')).toBe('2026')
  })
})

describe('atualização semanal', () => {
  it('só baixa o que mudou e grava o id do arquivo', async () => {
    const csv = 'UF;Indicador 1;Nota 1;Indicador 2;Nota 2;Indicador 3;Nota 3;Classificação da CAPAG;Qualidade;Observação\n' +
      Object.keys({ AC: 1, AL: 1, AP: 1, AM: 1, BA: 1, CE: 1, DF: 1, ES: 1, GO: 1, MA: 1, MT: 1, MS: 1, MG: 1, PA: 1, PB: 1, PR: 1, PE: 1, PI: 1, RJ: 1, RN: 1, RS: 1, RO: 1, RR: 1, SC: 1, SP: 1, SE: 1, TO: 1 }).map((u) => `${u};1%;A;1%;A;1%;A;A;Aicf;`).join('\n')
    const rpc = vi.fn(async (nome: string) => (nome === 'termometro_estado' ? { ativo: true, recursos: { municipios: 'm1' } } : 27))
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('package_show')) {
        const mun = url.includes('9ff93162')
        return new Response(JSON.stringify({ result: { resources: [mun ? { id: 'm1', format: 'XLSX', url: 'https://t/mun.xlsx', name: 'Mun' } : { id: 'e2', format: 'CSV', url: 'https://t/est.csv', name: 'Capag Estados 2026' }] } }))
      }
      return new Response(csv)
    })
    const r = await atualizarCapag({ token: 't', rpc, fetcher: fetcher as unknown as typeof fetch })
    expect(r).toEqual({ estados: { arquivo: 'Capag Estados 2026', posicao: '2026', gravadas: 27 }, municipios: 'já atualizado' })
    const gravar = rpc.mock.calls.find((c) => c[0] === 'termometro_gravar') as unknown as [string, { p_recurso: unknown; p_linhas: unknown[] }]
    expect(gravar[1].p_recurso).toEqual({ estados: 'e2' })
    expect(gravar[1].p_linhas).toHaveLength(27)
    expect(fetcher).not.toHaveBeenCalledWith('https://t/mun.xlsx', expect.anything())
  })

  it('não grava arquivo suspeito (poucas linhas)', async () => {
    const rpc = vi.fn(async (nome: string) => (nome === 'termometro_estado' ? { ativo: true, recursos: {} } : 0))
    const fetcher = vi.fn(async (url: string) => (url.includes('package_show')
      ? new Response(JSON.stringify({ result: { resources: [{ id: 'x', format: url.includes('9ff93162') ? 'XLSX' : 'CSV', url: 'https://t/a', name: 'A' }] } }))
      : new Response('UF;Classificação\nMG;A')))
    const r = await atualizarCapag({ token: 't', rpc, fetcher: fetcher as unknown as typeof fetch })
    expect(String(r.estados)).toContain('poucas linhas')
    expect(rpc.mock.calls.some((c) => c[0] === 'termometro_gravar')).toBe(false)
  })
})
