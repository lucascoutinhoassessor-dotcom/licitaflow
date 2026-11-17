import { describe,expect,it } from 'vitest'
import { gerarCSV } from './relacionamento'
describe('exportação de relatórios',()=>{
  it('escapa separadores, aspas e quebras de linha',()=>{
    const csv=gerarCSV([{nome:'Empresa; "A"\nFilial',quantidade:2}],[{chave:'nome',rotulo:'Nome'},{chave:'quantidade',rotulo:'Quantidade'}])
    expect(csv).toContain('"Empresa; ""A""\nFilial";"2"')
    expect(csv.startsWith('\ufeff')).toBe(true)
  })
  it('neutraliza fórmulas de planilha em valores textuais',()=>{
    const csv=gerarCSV([{nome:' =HYPERLINK("x")'}],[{chave:'nome',rotulo:'Nome'}])
    expect(csv).toContain("\"' =HYPERLINK")
    expect(gerarCSV([{n:-5}],[{chave:'n',rotulo:'Valor'}])).toContain('"-5"')
  })
})
