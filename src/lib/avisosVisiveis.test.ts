import { describe, expect, it } from 'vitest'
import { avisoVisivel, type AvisoAlvo } from './avisosVisiveis'

const agora = new Date('2026-11-27T15:00:00Z')
const base: AvisoAlvo = { ativo: true, publicar_em: '2026-11-27T10:00:00Z', expira_em: null, org_id: null, org_ids: null }

describe('avisoVisivel', () => {
  it('aviso publicado para todos aparece', () => {
    expect(avisoVisivel(base, 'org-a', agora)).toBe(true)
    expect(avisoVisivel({ ...base, org_ids: [] }, 'org-a', agora)).toBe(true)
  })
  it('arquivado, agendado ou expirado não aparece', () => {
    expect(avisoVisivel({ ...base, ativo: false }, 'org-a', agora)).toBe(false)
    expect(avisoVisivel({ ...base, publicar_em: '2026-11-28T10:00:00Z' }, 'org-a', agora)).toBe(false)
    expect(avisoVisivel({ ...base, expira_em: '2026-11-27T14:00:00Z' }, 'org-a', agora)).toBe(false)
    expect(avisoVisivel({ ...base, expira_em: '2026-11-27T16:00:00Z' }, 'org-a', agora)).toBe(true)
  })
  it('aviso para outros clientes não aparece', () => {
    expect(avisoVisivel({ ...base, org_id: 'org-b' }, 'org-a', agora)).toBe(false)
    expect(avisoVisivel({ ...base, org_ids: ['org-b', 'org-c'] }, 'org-a', agora)).toBe(false)
    expect(avisoVisivel({ ...base, org_ids: ['org-b', 'org-a'] }, 'org-a', agora)).toBe(true)
    expect(avisoVisivel({ ...base, org_id: 'org-a' }, 'org-a', agora)).toBe(true)
    expect(avisoVisivel({ ...base, org_id: 'org-a' }, null, agora)).toBe(false)
  })
})
