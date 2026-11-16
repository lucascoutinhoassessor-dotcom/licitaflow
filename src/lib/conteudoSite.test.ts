import { describe, expect, it } from 'vitest'
import { CONTEUDO_PADRAO, conteudoSiteSchema, lerConteudo } from './conteudoSite'

describe('conteúdo da landing page', () => {
  it('mantém conteúdo padrão se o serviço ainda não estiver disponível', () => {
    expect(lerConteudo(null)).toEqual(CONTEUDO_PADRAO)
    expect(lerConteudo({ titulo: 5 })).toEqual(CONTEUDO_PADRAO)
    expect(lerConteudo({ titulo: 'Título publicado' }).titulo).toBe('Título publicado')
  })
  it('rejeita campos inesperados, título vazio e contato que não seja e-mail', () => {
    expect(conteudoSiteSchema.safeParse({ ...CONTEUDO_PADRAO, script: 'alert(1)' }).success).toBe(false)
    expect(conteudoSiteSchema.safeParse({ ...CONTEUDO_PADRAO, titulo: ' ' }).success).toBe(false)
    expect(conteudoSiteSchema.safeParse({ ...CONTEUDO_PADRAO, contato: 'javascript:alert(1)' }).success).toBe(false)
  })
})
