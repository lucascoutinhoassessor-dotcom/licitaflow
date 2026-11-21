import { describe, expect, it } from 'vitest'
import { enderecoCorreto } from './pwa'

describe('enderecoCorreto', () => {
  it('leva o master do site para o endereço próprio', () => {
    expect(enderecoCorreto('licitaflow-prod.vercel.app', '/master/usuarios', '?x=1')).toBe('https://licitaflow-master.vercel.app/master/usuarios?x=1')
    expect(enderecoCorreto('licitaflow-prod.vercel.app', '/master')).toBe('https://licitaflow-master.vercel.app/master')
  })
  it('mantém o app do usuário no site', () => {
    expect(enderecoCorreto('licitaflow-prod.vercel.app', '/app')).toBeNull()
    expect(enderecoCorreto('licitaflow-prod.vercel.app', '/mastersomething')).toBeNull()
  })
  it('devolve ao site o que não é master', () => {
    expect(enderecoCorreto('licitaflow-master.vercel.app', '/app/empresas')).toBe('https://licitaflow-prod.vercel.app/app/empresas')
    expect(enderecoCorreto('licitaflow-master.vercel.app', '/master/entrar')).toBeNull()
  })
  it('não redireciona em desenvolvimento nem em prévias', () => {
    expect(enderecoCorreto('localhost', '/master')).toBeNull()
    expect(enderecoCorreto('licitaflow-prod-abc123.vercel.app', '/master')).toBeNull()
  })
})
