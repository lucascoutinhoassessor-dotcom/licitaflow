// Aplica o tema escuro antes da página desenhar (evita piscar). Arquivo próprio para permitir CSP sem 'unsafe-inline'.
try {
  var t = localStorage.getItem('lf-tema');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
