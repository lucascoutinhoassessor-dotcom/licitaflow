import { createClient } from '@supabase/supabase-js'

// Para desenvolvimento, usamos variáveis de ambiente
// Em produção, essas variáveis devem estar configuradas no Vercel/Netlify
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Funções helper para operações comuns com o banco de dados
export const db = {
  // TENANTS
  async getTenant(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('*, tenant:tenants(*)')
      .eq('id', userId)
      .single()
    return data?.tenant
  },

  async createTenant(tenant: any) {
    const { data, error } = await supabase
      .from('tenants')
      .insert(tenant)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateTenant(id: string, updates: any) {
    const { data, error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // USERS
  async createUser(userData: any) {
    const { data, error } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async getUser(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('*, tenant:tenants(*)')
      .eq('id', userId)
      .single()
    return data
  },

  // COMPANIES
  async getCompanies(tenantId: string) {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async getCompany(id: string) {
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single()
    return data
  },

  async createCompany(company: any) {
    const { data, error } = await supabase
      .from('companies')
      .insert(company)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateCompany(id: string, updates: any) {
    const { data, error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteCompany(id: string) {
    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // CONTACTS
  async getContacts(companyId: string) {
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    return data || []
  },

  async createContact(contact: any) {
    const { data, error } = await supabase
      .from('contacts')
      .insert(contact)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // EDITAIS
  async getEditais(companyId?: string, filters?: {
    uf?: string[]
    status?: string
    modalidade?: string
    dataInicio?: string
    dataFim?: string
    search?: string
  }) {
    let query = supabase
      .from('editais')
      .select('*')
      .order('data_encerramento', { ascending: true })

    if (companyId) {
      query = query.eq('company_id', companyId)
    }

    if (filters?.uf?.length) {
      query = query.in('uf', filters.uf)
    }
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.modalidade) {
      query = query.eq('modalidade', filters.modalidade)
    }
    if (filters?.dataInicio) {
      query = query.gte('data_publicacao', filters.dataInicio)
    }
    if (filters?.dataFim) {
      query = query.lte('data_publicacao', filters.dataFim)
    }
    if (filters?.search) {
      query = query.or(`objeto.ilike.%${filters.search}%,orgao.ilike.%${filters.search}%,numero_compra.ilike.%${filters.search}%`)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async createEdital(edital: any) {
    const { data, error } = await supabase
      .from('editais')
      .insert(edital)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateEdital(id: string, updates: any) {
    const { data, error } = await supabase
      .from('editais')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteEdital(id: string) {
    const { error } = await supabase
      .from('editais')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  // CONTRATOS
  async getContratos(companyId: string) {
    const { data, error } = await supabase
      .from('contratos')
      .select('*, parcelas(*)')
      .eq('company_id', companyId)
      .order('data_inicio', { ascending: false })
    if (error) throw error
    return data || []
  },

  async createContrato(contrato: any) {
    const { data, error } = await supabase
      .from('contratos')
      .insert(contrato)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateContrato(id: string, updates: any) {
    const { data, error } = await supabase
      .from('contratos')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // PARCELAS
  async updateParcela(id: string, updates: any) {
    const { data, error } = await supabase
      .from('parcelas')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // ORDENS DE SERVICO
  async getOrdensServico(companyId?: string) {
    let query = supabase
      .from('ordens_servico')
      .select('*')
      .order('prazo', { ascending: true })

    if (companyId) {
      query = query.eq('company_id', companyId)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  },

  async createOrdemServico(ordem: any) {
    const { data, error } = await supabase
      .from('ordens_servico')
      .insert(ordem)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateOrdemServico(id: string, updates: any) {
    const { data, error } = await supabase
      .from('ordens_servico')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  // ALERTAS
  async getAlertas(tenantId: string) {
    const { data, error } = await supabase
      .from('alertas')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lido', false)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async createAlerta(alerta: any) {
    const { data, error } = await supabase
      .from('alertas')
      .insert(alerta)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async markAlertaAsRead(id: string) {
    const { error } = await supabase
      .from('alertas')
      .update({ lido: true })
      .eq('id', id)
    if (error) throw error
  },

  async markAllAlertasAsRead(tenantId: string) {
    const { error } = await supabase
      .from('alertas')
      .update({ lido: true })
      .eq('tenant_id', tenantId)
      .eq('lido', false)
    if (error) throw error
  }
}

export default db