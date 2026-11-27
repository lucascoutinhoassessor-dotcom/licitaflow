import { describe, expect, it } from 'vitest'
import { comDias, conteudoPadrao, imagemSegura, lerConteudo, linkSeguro, validarConteudo } from './conteudoSite'

describe('conteúdo da landing page', () => {
  it('usa a página original quando não há conteúdo publicado', () => {
    const c = lerConteudo(null)
    expect(c.versao_schema).toBe(2)
    expect(c.secoes.map((s) => s.uid)).toEqual(conteudoPadrao().secoes.map((s) => s.uid))
    expect(validarConteudo(c)).toBeNull()
  })
  it('converte o formato antigo de 7 textos', () => {
    const c = lerConteudo({ titulo: 'Título publicado', botao: 'Começar', titulo_final: 'Fim', contato: 'a@b.com' })
    const hero = c.secoes.find((s) => s.tipo === 'hero')!
    expect(hero.titulo).toBe('Título publicado')
    expect(hero.botao.texto).toBe('Começar')
    expect(c.secoes.find((s) => s.tipo === 'cta')!.titulo).toBe('Fim')
    expect(c.rodape.contato).toBe('a@b.com')
    expect(lerConteudo({ titulo: 5 }).secoes[0].titulo).toBe(conteudoPadrao().secoes[0].titulo)
  })
  it('lê o formato 2 de forma tolerante e descarta seções desconhecidas', () => {
    const c = lerConteudo({ versao_schema: 2, tema: { cor1: 'vermelho' }, secoes: [{ tipo: 'livre', titulo: 'Oi', ancora: 'Minha Seção!' }, { tipo: 'html', texto: '<script>' }] })
    expect(c.tema.cor1).toBe('#2563eb')
    expect(c.secoes).toHaveLength(1)
    expect(c.secoes[0].titulo).toBe('Oi')
    expect(c.secoes[0].ancora).toBe('minhaseo')
    expect(c.menu.links.length).toBeGreaterThan(0)
  })
  it('bloqueia links e imagens perigosos', () => {
    expect(linkSeguro('javascript:alert(1)')).toBe('#')
    expect(linkSeguro('//evil.com')).toBe('#')
    expect(linkSeguro('/cadastro')).toBe('/cadastro')
    expect(linkSeguro('#planos')).toBe('#planos')
    expect(linkSeguro('https://wa.me/55')).toBe('https://wa.me/55')
    expect(imagemSegura('data:image/svg+xml,<svg>')).toBe('')
    expect(imagemSegura('http://x.com/a.png')).toBe('')
    const c = conteudoPadrao()
    c.secoes[0].botao.link = 'javascript:alert(1)'
    expect(validarConteudo(c)).toMatch(/link inválido/)
    const d = conteudoPadrao()
    d.rodape.contato = 'javascript:alert(1)'
    expect(validarConteudo(d)).toMatch(/E-mail/)
    const e = conteudoPadrao()
    e.secoes[1].ancora = e.secoes[0].ancora = 'x'
    expect(validarConteudo(e)).toMatch(/âncora/)
  })
  it('troca {dias} pelo prazo do teste', () => {
    expect(comDias('{dias} dias grátis, {dias}!', 7)).toBe('7 dias grátis, 7!')
  })
})


describe('oferta desativada na landing', () => {
  it('remove promessas de teste e cartão dispensado sem alterar o conteúdo salvo', () => {
    for (const texto of ['Testar grátis','Começar {dias} dias grátis','Criar minha conta grátis']) expect(comDias(texto,0)).toBe('Criar minha conta')
    expect(comDias('Comece com {dias} dias grátis em qualquer plano. Sem cartão, sem fidelidade.',0)).not.toMatch(/grátis|0 dias|sem cartão/i)
    expect(comDias('Preciso de cartão de crédito para testar?',0)).toBe('Como começo a usar?')
    expect(comDias('Sem cartão de crédito',0)).not.toMatch(/sem cartão/i)
    expect(comDias('Conheça os planos',0)).toBe('Conheça os planos')
  })
})

describe('tela de login', () => {
  it('mantém os textos atuais em conteúdo publicado antes do campo existir', () => {
    const antigo = { ...conteudoPadrao(), login: undefined }
    expect(lerConteudo(antigo).login).toEqual(conteudoPadrao().login)
  })
  it('lê os textos do master, inclusive link vazio para esconder o convite', () => {
    const c = lerConteudo({ ...conteudoPadrao(), login: { titulo: 'Bem-vindo', subtitulo: '', pergunta: 'Novo aqui?', cadastro: { texto: '', link: '/cadastro' } } })
    expect(c.login).toEqual({ titulo: 'Bem-vindo', subtitulo: '', pergunta: 'Novo aqui?', cadastro: { texto: '', link: '/cadastro' } })
  })
  it('recusa link perigoso no convite', () => {
    const c = conteudoPadrao(); c.login.cadastro.link = 'javascript:alert(1)'
    expect(validarConteudo(c)).toMatch(/login/i)
  })
})
