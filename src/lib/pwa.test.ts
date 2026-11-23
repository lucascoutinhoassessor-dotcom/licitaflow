import { describe, expect, it } from 'vitest'
import { enderecoCorreto } from './pwa'

describe('enderecoCorreto', () => {
  it('leva o master do site para o endereço próprio', () => {
    expect(enderecoCorreto('licitaforce-app.vercel.app', '/master/usuarios', '?x=1')).toBe('https://licitaforce-master.vercel.app/master/usuarios?x=1')
    expect(enderecoCorreto('licitaforce-app.vercel.app', '/master')).toBe('https://licitaforce-master.vercel.app/master')
  })
  it('mantém o app do usuário no site', () => {
    expect(enderecoCorreto('licitaforce-app.vercel.app', '/app')).toBeNull()
    expect(enderecoCorreto('licitaforce-app.vercel.app', '/mastersomething')).toBeNull()
  })
  it('devolve ao site o que não é master', () => {
    expect(enderecoCorreto('licitaflow-master.vercel.app', '/app/empresas')).toBe('https://licitaforce-app.vercel.app/app/empresas')
    expect(enderecoCorreto('licitaforce-master.vercel.app', '/master/entrar')).toBeNull()
  })
  it('leva o endereço antigo do site para o novo', () => {
    expect(enderecoCorreto('licitaflow-prod.vercel.app', '/app/editais', '?q=1')).toBe('https://licitaforce-app.vercel.app/app/editais?q=1')
    expect(enderecoCorreto('licitaflow-prod.vercel.app', '/master')).toBe('https://licitaforce-master.vercel.app/master')
  })
  it('leva o endereço antigo do master para o novo', () => {
    expect(enderecoCorreto('licitaflow-master.vercel.app', '/master/usuarios')).toBe('https://licitaforce-master.vercel.app/master/usuarios')
    expect(enderecoCorreto('licitaflow-master.vercel.app', '/app')).toBe('https://licitaforce-app.vercel.app/app')
  })
  it('não redireciona em desenvolvimento nem em prévias', () => {
    expect(enderecoCorreto('localhost', '/master')).toBeNull()
    expect(enderecoCorreto('licitaflow-prod-abc123.vercel.app', '/master')).toBeNull()
  })
})
