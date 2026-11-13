-- =============================================
-- LICITAFLOW - ESTRUTURA COMPLETA DO BANCO
-- =============================================

-- =============================================
-- 1. EXTENSÕES
-- =============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- 2. ENUMS
-- =============================================
CREATE TYPE plan_type AS ENUM ('trial', 'basic', 'business', 'enterprise');
CREATE TYPE billing_cycle AS ENUM ('monthly', 'yearly');
CREATE TYPE empresa_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE edital_status AS ENUM ('draft', 'published', 'under_analysis', 'sent', 'won', 'lost', 'canceled', 'expired');
CREATE TYPE funnel_stage AS ENUM ('identification', '初步分析', 'proposal', 'negotiation', 'closing', 'contract_signed');
CREATE TYPE contract_status AS ENUM ('draft', 'active', 'completed', 'terminated', 'suspended');
CREATE TYPE parcel_status AS ENUM ('pending', 'paid', 'overdue', 'canceled');
CREATE TYPE alert_frequency AS ENUM ('realtime', 'daily', 'weekly');
CREATE TYPE alert_status AS ENUM ('active', 'paused', 'deleted');
CREATE TYPE integration_status AS ENUM ('connected', 'disconnected', 'error');

-- =============================================
-- 3. TABELAS PRINCIPAIS
-- =============================================

-- Tenants (Empresas/Contas)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    domain TEXT UNIQUE,
    plan plan_type NOT NULL DEFAULT 'trial',
    billing_cycle billing_cycle NOT NULL DEFAULT 'monthly',
    max_companies INTEGER NOT NULL DEFAULT 1,
    max_users INTEGER NOT NULL DEFAULT 5,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (Usuários)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    password_hash TEXT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    avatar_url TEXT,
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- Empresas (Companies que o usuário gerencia)
CREATE TABLE empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cnpj TEXT NOT NULL,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    inscricao_estadual TEXT,
    inscricao_municipal TEXT,
    endereco TEXT,
    cidade TEXT,
    UF CHAR(2),
    CEP TEXT,
    telefone TEXT,
    email TEXT,
    porte TEXT DEFAULT 'ME-EPP',
    status empresa_status DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, cnpj)
);

-- Editais (Licitações)
CREATE TABLE editais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
    numero_edital TEXT NOT NULL,
    UASG TEXT,
    titulo TEXT NOT NULL,
    descricao TEXT,
    orgao TEXT NOT NULL,
    orgao_cnpj TEXT,
    cidade TEXT,
    UF CHAR(2),
    portal TEXT,
    portal_id TEXT,
    modalidade TEXT NOT NULL,
    tipo TEXT,
    valor_estimado DECIMAL(15,2),
    valor_homologado DECIMAL(15,2),
    data_publicacao DATE,
    data_abertura DATE,
    data_encerramento DATE,
    status edital_status DEFAULT 'published',
    processo_url TEXT,
    resultado_url TEXT,
    criterios_aceite TEXT[],
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, portal_id)
);

-- Funil (Pipeline de oportunidades)
CREATE TABLE funil (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL,
    edital_id UUID REFERENCES editais(id) ON DELETE CASCADE,
    stage funnel_stage NOT NULL DEFAULT 'identification',
    probability INTEGER DEFAULT 10,
    valor_proposta DECIMAL(15,2),
    data_proposta DATE,
    data_resultado DATE,
    resultado TEXT,
    motivo_perda TEXT,
    notes TEXT,
    responsible_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contratos
CREATE TABLE contratos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    edital_id UUID REFERENCES editais(id),
    numero_contrato TEXT NOT NULL,
    numero_processo TEXT,
    objeto TEXT NOT NULL,
    contratante TEXT NOT NULL,
    valor_contratado DECIMAL(15,2) NOT NULL,
    valor_original DECIMAL(15,2),
    data_inicio DATE,
    data_fim DATE,
    data_assinatura DATE,
    status contract_status DEFAULT 'draft',
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Parcelas (Pagamentos de contratos)
CREATE TABLE parcelas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    descricao TEXT,
    valor DECIMAL(15,2) NOT NULL,
    data_vencimento DATE NOT NULL,
    data_pagamento DATE,
    status parcel_status DEFAULT 'pending',
    observaciones TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alertas (Buscas automáticas)
CREATE TABLE alertas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    nome TEXT NOT NULL,
    termo_busca TEXT NOT NULL,
    UFs CHAR(2)[],
    modalidades TEXT[],
    portais TEXT[],
    valor_minimo DECIMAL(15,2),
    valor_maximo DECIMAL(15,2),
    palavras_excluir TEXT[],
    frequencia alert_frequency DEFAULT 'daily',
    status alert_status DEFAULT 'active',
    last_run_at TIMESTAMPTZ,
    results_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Integrações
CREATE TABLE integracoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    nome TEXT NOT NULL,
    credentials JSONB,
    status integration_status DEFAULT 'disconnected',
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, tipo)
);

--Atividades
CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    entity_type TEXT,
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 4. ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE editais ENABLE ROW LEVEL SECURITY;
ALTER TABLE funil ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE integracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Policies para Tenants
CREATE POLICY "Users can view own tenant"
    ON tenants FOR SELECT
    USING (id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Policies para Users
CREATE POLICY "Users can view users in own tenant"
    ON users FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "Users can insert own record"
    ON users FOR INSERT
    WITH CHECK (email = (SELECT email FROM users WHERE id = auth.uid()) OR auth.uid() IS NULL);

-- Policies para Empresas
CREATE POLICY "Users can manage empresas in own tenant"
    ON empresas FOR ALL
    USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Policies para Editais
CREATE POLICY "Users can manage editais in own tenant"
    ON editais FOR ALL
    USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Policies para Funil
CREATE POLICY "Users can manage funil in own tenant"
    ON funil FOR ALL
    USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Policies para Contratos
CREATE POLICY "Users can manage contratos in own tenant"
    ON contratos FOR ALL
    USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Policies para Parcelas
CREATE POLICY "Users can manage parcelas in own tenant"
    ON parcelas FOR ALL
    USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Policies para Alertas
CREATE POLICY "Users can manage alertas in own tenant"
    ON alertas FOR ALL
    USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Policies para Integrações
CREATE POLICY "Users can manage integracoes in own tenant"
    ON integracoes FOR ALL
    USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Policies para Activities
CREATE POLICY "Users can view activities in own tenant"
    ON activities FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert activities in own tenant"
    ON activities FOR INSERT
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- =============================================
-- 5. FUNÇÕES E TRIGGERS
-- =============================================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_empresas_updated_at
    BEFORE UPDATE ON empresas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_editais_updated_at
    BEFORE UPDATE ON editais
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_funil_updated_at
    BEFORE UPDATE ON funil
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_contratos_updated_at
    BEFORE UPDATE ON contratos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_parcelas_updated_at
    BEFORE UPDATE ON parcelas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_alertas_updated_at
    BEFORE UPDATE ON alertas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_integracoes_updated_at
    BEFORE UPDATE ON integracoes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Função para criar tenant e usuário admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    tenant_id_val UUID;
BEGIN
    -- Criar novo tenant
    INSERT INTO tenants (name, plan)
    VALUES (NEW.raw_user_meta_data->>'full_name', 'trial')
    RETURNING id INTO tenant_id_val;

    -- Criar usuário com tenant
    INSERT INTO users (tenant_id, email, full_name, role)
    VALUES (tenant_id_val, NEW.email, NEW.raw_user_meta_data->>'full_name', 'admin');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criar tenant no cadastro
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 6. ÍNDICES
-- =============================================

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_empresas_tenant_id ON empresas(tenant_id);
CREATE INDEX idx_empresas_cnpj ON empresas(cnpj);
CREATE INDEX idx_editais_tenant_id ON editais(tenant_id);
CREATE INDEX idx_editais_portal_id ON editais(portal_id);
CREATE INDEX idx_editais_status ON editais(status);
CREATE INDEX idx_editais_data_publicacao ON editais(data_publicacao);
CREATE INDEX idx_funil_tenant_id ON funil(tenant_id);
CREATE INDEX idx_funil_stage ON funil(stage);
CREATE INDEX idx_contratos_tenant_id ON contratos(tenant_id);
CREATE INDEX idx_contratos_status ON contratos(status);
CREATE INDEX idx_parcelas_contrato_id ON parcelas(contrato_id);
CREATE INDEX idx_parcelas_status ON parcelas(status);
CREATE INDEX idx_alertas_tenant_id ON alertas(tenant_id);
CREATE INDEX idx_activities_tenant_id ON activities(tenant_id);
CREATE INDEX idx_activities_created_at ON activities(created_at);

-- =============================================
-- 7. DADOS DE DEMONSTRAÇÃO
-- =============================================

-- Inserir tenant demo
INSERT INTO tenants (id, name, plan, billing_cycle, max_companies, max_users)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Demo Empresa',
    'business',
    'monthly',
    10,
    20
);

-- Inserir usuário demo
INSERT INTO users (id, tenant_id, email, full_name, role, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'demo@licitaflow.com.br',
    'Usuário Demo',
    'admin',
    true
);

-- Inserir empresas demo
INSERT INTO empresas (tenant_id, cnpj, razao_social, nome_fantasia, UF, status)
VALUES
    ('00000000-0000-0000-0000-000000000001', '12.345.678/0001-90', 'Empresa Demo Ltda', 'Demo Tech', 'SP', 'active'),
    ('00000000-0000-0000-0000-000000000001', '98.765.432/0001-10', 'Serviços Brasil S/A', 'Serviços BR', 'RJ', 'active'),
    ('00000000-0000-0000-0000-000000000001', '45.678.901/0001-23', 'Construções Silva Eireli', 'Const. Silva', 'MG', 'active');

-- Inserir editais demo
INSERT INTO editais (tenant_id, empresa_id, numero_edital, UASG, titulo, orgao, cidade, UF, modalidade, valor_estimado, data_publicacao, data_encerramento, status)
VALUES
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '001/2024', '160305', 'Aquisição de Equipamentos de TI', 'Universidade Federal', 'São Paulo', 'SP', 'Pregão Eletrônico', 150000.00, '2024-01-15', '2024-02-15', 'published'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '002/2024', '927990', 'Serviços de Limpeza Hospitalar', 'Hospital das Clínicas', 'Rio de Janeiro', 'RJ', 'Concorrência', 500000.00, '2024-01-20', '2024-03-01', 'under_analysis'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '003/2024', '155605', 'Obras de Reforma e Ampliação', 'Prefeitura Municipal', 'Belo Horizonte', 'MG', 'Tomada de Preços', 800000.00, '2024-02-01', '2024-03-15', 'sent');

-- Inserir contratos demo
INSERT INTO contratos (tenant_id, empresa_id, numero_contrato, objeto, contratante, valor_contratado, data_inicio, data_fim, status)
VALUES
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'CTR001/2024', 'Fornecimento de Computadores', 'Governo do Estado de SP', 250000.00, '2024-01-01', '2024-12-31', 'active'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'CTR002/2024', 'Serviços de Manutenção', 'Prefeitura de São Paulo', 180000.00, '2024-02-01', '2025-01-31', 'active');

-- Inserir parcelas demo
INSERT INTO parcelas (contrato_id, numero, descricao, valor, data_vencimento, status)
VALUES
    ('00000000-0000-0000-0000-000000000001', 1, 'Parcela 1/12', 20833.33, '2024-01-30', 'paid'),
    ('00000000-0000-0000-0000-000000000001', 2, 'Parcela 2/12', 20833.33, '2024-02-28', 'paid'),
    ('00000000-0000-0000-0000-000000000001', 3, 'Parcela 3/12', 20833.33, '2024-03-30', 'pending'),
    ('00000000-0000-0000-0000-000000000002', 1, 'Parcela 1/6', 30000.00, '2024-02-15', 'paid'),
    ('00000000-0000-0000-0000-000000000002', 2, 'Parcela 2/6', 30000.00, '2024-03-15', 'pending');

-- Inserir alertas demo
INSERT INTO alertas (tenant_id, user_id, nome, termo_busca, UFs, modalidades, status)
VALUES
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'TI e Tecnologia', 'tecnologia OR informática OR software', ARRAY['SP', 'RJ', 'MG'], ARRAY['Pregão Eletrônico', 'Concorrência'], 'active'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Construção Civil', 'construção OR obra OR reforma', ARRAY['SP'], ARRAY['Tomada de Preços', 'Concorrência'], 'active');

-- =============================================
-- 8. TABELA DE LEADS (CONTATOS DO FORMULÁRIO)
-- =============================================

CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'converted', 'approved', 'lost');

CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    cnpj TEXT,
    plan_interest TEXT,
    message TEXT,
    source TEXT DEFAULT 'website',
    status lead_status DEFAULT 'new',
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    ip_address TEXT,
    user_agent TEXT,
    access_link TEXT,
    access_link_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    contacted_at TIMESTAMPTZ,
    notes TEXT
);

-- RLS para leads (permitir insert anônimo, apenas admin pode ver)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert"
    ON leads FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Only authenticated users can view leads"
    ON leads FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can update leads"
    ON leads FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Trigger para updated_at
CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Índices para leads
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_email ON leads(email);

-- =============================================
-- 9. CONFIGURAÇÕES
-- =============================================

-- Habilitar Realtime para editais
ALTER PUBLICATION supabase_realtime ADD TABLE editais;
ALTER PUBLICATION supabase_realtime ADD TABLE funil;
ALTER PUBLICATION supabase_realtime ADD TABLE atividades;
