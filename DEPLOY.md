# 🚀 Guia de Deploy - LicitaFlow

Este guia explica como publicar o LicitaFlow no Vercel com duas versões:
- **Produção**: `licitaflow.com.br` (com Supabase real)
- **Demo**: `demo.licitaflow.com.br` (com dados mockados)

---

## 📋 Pré-requisitos

1. Conta no [Vercel](https://vercel.com)
2. Conta no [Supabase](https://supabase.com) (para produção)
3. Conta no [Stripe](https://stripe.com) (para pagamentos)
4. Domínio `licitaflow.com.br` configurado

---

## 🗂️ Estrutura de Deploy

```
licitaflow.com.br      →  Produção (VITE_DEMO_MODE=false)
demo.licitaflow.com.br →  Demo (VITE_DEMO_MODE=true)
```

---

## 🚀 Passo 1: Deploy da Versão Demo

### 1.1 Criar projeto no Vercel

```bash
# Instalar Vercel CLI (se ainda não tiver)
npm i -g vercel

# Login no Vercel
vercel login

# No diretório do projeto
vercel
```

### 1.2 Configurar Variáveis de Ambiente (Demo)

No dashboard do Vercel, vá em **Settings → Environment Variables** e adicione:

```
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=demo-key-placeholder
VITE_STRIPE_PUBLIC_KEY=pk_test_demo
VITE_DEMO_MODE=true
```

### 1.3 Configurar Domínio Demo

1. No dashboard Vercel, vá em **Settings → Domains**
2. Adicione: `demo.licitaflow.com.br`
3. Siga as instruções para configurar o DNS no seu registrador

---

## 🚀 Passo 2: Deploy da Versão Produção

### 2.1 Configurar Supabase

1. Crie um novo projeto no [Supabase](https://supabase.com)
2. Execute o SQL em `supabase/migration.sql` no SQL Editor
3. Copie a **URL** e **Anon Key** do projeto

### 2.2 Configurar Stripe

1. Crie uma conta no [Stripe](https://stripe.com)
2. Crie 3 produtos:
   - **Basic** - R$ 97/mês
   - **Business** - R$ 197/mês
   - **Enterprise** - R$ 497/mês
3. Copie a chave pública (pk_live_...)

### 2.3 Criar projeto de Produção

```bash
# No diretório do projeto
vercel --prod
```

Ou configure como novo projeto no dashboard.

### 2.4 Configurar Variáveis de Ambiente (Produção)

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-aqui
VITE_STRIPE_PUBLIC_KEY=pk_live_sua_chave
VITE_DEMO_MODE=false
```

### 2.5 Configurar Domínio Produção

1. No dashboard Vercel, vá em **Settings → Domains**
2. Adicione: `licitaflow.com.br`
3. Configure o DNS no seu registrador:
   - Tipo: `CNAME`
   - Nome: `@` ou `licitaflow.com.br`
   - Valor: `cname.vercel-dns.com`

---

## ⚙️ Configuração de DNS

No seu registrador de domínio (Registro.br, GoDaddy, etc.):

### Para domínio principal (licitaflow.com.br)
```
Tipo: A
Nome: @
Valor: 76.76.21.21

Tipo: CNAME
Nome: www
Valor: cname.vercel-dns.com
```

### Para subdomínio demo (demo.licitaflow.com.br)
```
Tipo: CNAME
Nome: demo
Valor: cname.vercel-dns.com
```

---

## 🔧 Comandos Úteis

```bash
# Desenvolvimento local
pnpm dev

# Build local
pnpm build

# Preview do build
pnpm preview

# Deploy para Vercel
vercel

# Deploy produção
vercel --prod
```

---

## ✅ Checklist Pré-Deploy

- [ ] Todas as variáveis de ambiente configuradas
- [ ] Banco Supabase criado e SQL executado
- [ ] Produtos Stripe criados
- [ ] Domínios configurados no Vercel
- [ ] DNS configurado no registrador
- [ ] SSL/HTTPS ativo (Vercel faz automaticamente)

---

## 🐛 Troubleshooting

### Build falha
```bash
# Limpar cache
rm -rf node_modules .vercel
pnpm install
vercel
```

### Variáveis de ambiente não carregam
- Verifique se começam com `VITE_`
- Reinicie o deploy após alterar

### Erro 404 em rotas
- O `vercel.json` já está configurado com rewrites
- Verifique se está no diretório raiz

---

## 📞 Suporte

- [Documentação Vercel](https://vercel.com/docs)
- [Documentação Supabase](https://supabase.com/docs)
- [Documentação Stripe](https://stripe.com/docs)
