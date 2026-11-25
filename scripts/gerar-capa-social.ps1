# Gera a capa de compartilhamento com a marca existente, sem dependências externas.
# Uso (Windows): pwsh -File scripts/gerar-capa-social.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$saida = Join-Path $PSScriptRoot '../public/social'
New-Item -ItemType Directory -Path $saida -Force | Out-Null
$imagem = [System.Drawing.Bitmap]::new(1200, 630)
$g = [System.Drawing.Graphics]::FromImage($imagem)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$fundo = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Rectangle]::new(0, 0, 1200, 630),
    [System.Drawing.ColorTranslator]::FromHtml('#0f172a'),
    [System.Drawing.ColorTranslator]::FromHtml('#102d48'), 20)
$g.FillRectangle($fundo, 0, 0, 1200, 630)
$branco = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$verde = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#6ee7b7'))
$cinza = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#cbd5e1'))
$linha = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(18, 110, 231, 183), 1)
for ($x = 800; $x -lt 1200; $x += 40) { $g.DrawLine($linha, $x, 0, $x, 630) }
for ($y = 0; $y -lt 630; $y += 40) { $g.DrawLine($linha, 800, $y, 1200, $y) }
$icone = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot '../public/icons/icone-512.png'))
$g.DrawImage($icone, 72, 66, 72, 72)
$fonteMarca = [System.Drawing.Font]::new('Segoe UI', 34, [System.Drawing.FontStyle]::Bold, 'Pixel')
$fonteTitulo = [System.Drawing.Font]::new('Segoe UI', 68, [System.Drawing.FontStyle]::Bold, 'Pixel')
$fonteTexto = [System.Drawing.Font]::new('Segoe UI', 27, [System.Drawing.FontStyle]::Regular, 'Pixel')
$fonteRodape = [System.Drawing.Font]::new('Segoe UI', 21, [System.Drawing.FontStyle]::Regular, 'Pixel')
$g.DrawString('LicitaForce', $fonteMarca, $branco, 160, 78)
$g.DrawString('Gestão inteligente', $fonteTitulo, $branco, 66, 197)
$g.DrawString('de licitações.', $fonteTitulo, $verde, 66, 278)
$g.DrawString('Oportunidades, prazos e contratos', $fonteTexto, $cinza, 72, 389)
$g.DrawString('em um só lugar. Com agentes de IA.', $fonteTexto, $cinza, 72, 431)
$g.FillRectangle($verde, 72, 541, 38, 4)
$g.DrawString('licitaforce-app.vercel.app', $fonteRodape, $cinza, 126, 526)
$imagem.Save((Join-Path $saida 'licitaforce-v1.png'), [System.Drawing.Imaging.ImageFormat]::Png)
foreach ($recurso in @($icone, $fonteMarca, $fonteTitulo, $fonteTexto, $fonteRodape, $linha, $branco, $verde, $cinza, $fundo, $g, $imagem)) { $recurso.Dispose() }
