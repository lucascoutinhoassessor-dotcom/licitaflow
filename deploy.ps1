# Script de Deploy - LicitaFlow
# Este script ajuda a fazer deploy no Vercel

Write-Host "🚀 LicitaFlow - Deploy Script" -ForegroundColor Cyan
Write-Host ""

# Verificar se o Vercel CLI está instalado
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelInstalled) {
    Write-Host "⚠️  Vercel CLI não encontrado. Instalando..." -ForegroundColor Yellow
    npm install -g vercel
}

# Menu de opções
Write-Host "Escolha o ambiente de deploy:" -ForegroundColor Green
Write-Host "1. Demo (demo.licitaflow.com.br)"
Write-Host "2. Produção (licitaflow.com.br)"
Write-Host "3. Sair"
Write-Host ""

$choice = Read-Host "Digite sua escolha (1-3)"

switch ($choice) {
    "1" {
        Write-Host "🧪 Deploy para DEMO..." -ForegroundColor Cyan
        $env:VITE_DEMO_MODE = "true"
        vercel --prod
    }
    "2" {
        Write-Host "🏭 Deploy para PRODUÇÃO..." -ForegroundColor Cyan
        $env:VITE_DEMO_MODE = "false"
        vercel --prod
    }
    "3" {
        Write-Host "👋 Saindo..." -ForegroundColor Gray
        exit 0
    }
    default {
        Write-Host "❌ Opção inválida" -ForegroundColor Red
        exit 1
    }
}
