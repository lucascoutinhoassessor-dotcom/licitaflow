# 🚀 LicitaFlow - Resumo do Deploy

## ✅ Status do Projeto

O projeto está **100% configurado** para deploy no Vercel com duas versões:

| Ambiente | Domínio | Modo | Banco de Dados |
|----------|---------|------|----------------|
| Demo | demo.licitaflow.com.br | VITE_DEMO_MODE=true | Dados mockados |
| Produção | licitaflow.com.br | VITE_DEMO_MODE=false | Supabase real |

---

## 📁 Arquivos Criados/Modificados

### Configuração de Deploy
- `vercel.json` - Configuração do Vercel (SPA routing, headers, cache)
- `.env.example` - Template de variáveis de ambiente
- `DEPLOY.md` - Guia completo de deploy
- `deploy.ps1` - Script PowerShell para deploy
- `.github/workflows/deploy.yml` - CI/CD com GitHub Actions

### Código Fonte
- `src/context/AuthContext.tsx` - Suporte a demo/produção
- `src/components/DemoBanner.tsx` - Banner indicador de modo demo
- `src/components/layout/Topbar.tsx` - Integração com DemoBanner
- `package.json` - Scripts e dependências otimizados

---

## 🚀 Como Fazer Deploy

### Opção 1: Deploy Manual (Recomendado para teste)

```bash
# Instalar Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy interativo
./deploy.ps1
# ou
vercel
```

### Opção 2: Deploy via GitHub (Recomendado para produção)

1. Crie um repositório no GitHub
2. Envie o código:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/seu-usuario/licitaflow.git
git push -u origin main
```

3. Configure os secrets no GitHub (Settings → Secrets and variables → Actions):
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID_PROD`
   - `VERCEL_PROJECT_ID_DEMO`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_STRIPE_PUBLIC_KEY`

---

## ⚙️ Configuração de Variáveis de Ambiente

### Versão Demo
```
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=demo-key
VITE_STRIPE_PUBLIC_KEY=pk_test_demo
VITE_DEMO_MODE=true
```

### Versão Produção
```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon
VITE_STRIPE_PUBLIC_KEY=pk_live_sua_chave
VITE_DEMO_MODE=false
```

---

## 🌐 Configuração de DNS

No seu registrador de domínio:

```
# Domínio principal
Tipo: A
Nome: @
Valor: 76.76.21.21

# WWW
Tipo: CNAME
Nome: www
Valor: cname.vercel-dns.com

# Demo
Tipo: CNAME
Nome: demo
Valor: cname.vercel-dns.com
```

---

## 📋 Próximos Passos

1. **Criar conta no Vercel**: https://vercel.com/signup
2. **Criar projeto no Supabase** (produção): https://supabase.com
3. **Executar SQL de migração**: `supabase/migration.sql`
4. **Criar produtos no Stripe** (produção)
5. **Configurar domínios no Vercel**
6. **Configurar DNS no registrador**
7. **Fazer deploy!**

---

## 🔧 Comandos Úteis

```bash
# Desenvolvimento
npm run dev

# Build local
npm run build

# Preview do build
npm run preview

# Deploy Vercel
vercel

# Deploy produção
vercel --prod
```

---

## 📞 Suporte

- Documentação Vercel: https://vercel.com/docs
- Documentação Supabase: https://supabase.com/docs
- Documentação do projeto: `DEPLOY.md`

---

**Build status**: ✅ Funcionando
**Última verificação**: 14/05/2026
