import { describe, expect, it } from 'vitest'
import { formatarWhatsapp, linkWhatsapp, normalizarWhatsapp } from './telefone'

describe('WhatsApp', () => {
  it('aceita celular e fixo com DDD, com ou sem 55 e máscara', () => {
    expect(normalizarWhatsapp('(11) 91234-5678')).toBe('11912345678')
    expect(normalizarWhatsapp('+55 11 91234-5678')).toBe('11912345678')
    expect(normalizarWhatsapp('1134567890')).toBe('1134567890')
  })
  it('recusa número sem DDD, curto ou celular sem o 9', () => {
    expect(normalizarWhatsapp('91234-5678')).toBeNull()
    expect(normalizarWhatsapp('11812345678')).toBeNull()
    expect(normalizarWhatsapp('')).toBeNull()
    expect(normalizarWhatsapp('01912345678')).toBeNull()
  })
  it('formata e gera o link', () => {
    expect(formatarWhatsapp('11912345678')).toBe('(11) 91234-5678')
    expect(linkWhatsapp('(11) 91234-5678')).toBe('https://wa.me/5511912345678')
    expect(linkWhatsapp('abc')).toBeNull()
  })
})
