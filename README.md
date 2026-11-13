# LicitaFlow - Plataforma de Gestão de Licitações

SaaS completo para gestão de licitações públicas brasileiras.

## Estrutura do Projeto

- **Produção**: `licitaflow.com.br` - Com banco Supabase real
- **Demo**: `demo.licitaflow.com.br` - Com dados mockados

## Deploy no Vercel

### 1. Configurar Variáveis de Ambiente (Produção)

No Vercel Dashboard, adicione estas variáveis:

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
VITE_STRIPE_PUBLIC_KEY=pk_live_...
VITE_DEMO_MODE=false
```

### 2. Configurar Variáveis de Ambiente (Demo)

```
VITE_SUPABASE_URL=https://demo.supabase.co
VITE_SUPABASE_ANON_KEY=demo-key
VITE_STRIPE_PUBLIC_KEY=pk_test_...
VITE_DEMO_MODE=true
```

### 3. Build

```bash
pnpm install
pnpm build
```

## Desenvolvimento Local

```bash
pnpm install
pnpm dev
```

## Funcionalidades

- Dashboard com métricas
- Gestão de editais (integração PNCP)
- Funil de vendas de licitações
- Ordens de serviço
- Contratos e parcelas
- Financeiro
- Configurações multi-empresa
- Planos: Básico (R$97), Business (R$197), Enterprise (R$497)

## Tecnologias

- React + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Supabase
- Stripe
