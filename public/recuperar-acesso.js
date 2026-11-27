// Executa antes do bundle: funciona mesmo quando o JavaScript da aplicação não chega.
(function () {
  var iniciado = false, aviso;
  function mostrar() {
    if (aviso) return;
    var splash = document.getElementById('lf-splash');
    if (splash) splash.remove();
    aviso = document.createElement('div');
    aviso.setAttribute('role', 'alert');
    aviso.style.cssText = 'position:fixed;inset:0;z-index:2147483001;display:grid;place-content:center;gap:20px;padding:28px;background:#0f172a;color:#f8fafc;font:16px system-ui;text-align:center';
    var titulo = document.createElement('h1');
    titulo.textContent = 'Não foi possível abrir o LicitaForce';
    var texto = document.createElement('p');
    texto.textContent = 'Verifique sua conexão e tente novamente.';
    var botao = document.createElement('button');
    botao.textContent = 'Tentar novamente';
    botao.style.cssText = 'padding:14px;border:0;border-radius:8px;background:#2563eb;color:white;font:inherit;cursor:pointer';
    botao.addEventListener('click', function () { location.reload(); });
    aviso.append(titulo, texto, botao);
    document.body.appendChild(aviso);
  }
  function recuperar(evento) {
    if (evento) evento.preventDefault();
    // Uma única tentativa automática por minuto evita ciclos se o servidor continuar falhando.
    try {
      var chave = 'lf-recuperacao-acesso';
      var ultima = Number(sessionStorage.getItem(chave) || 0);
      if (navigator.onLine && Date.now() - ultima > 60000) {
        sessionStorage.setItem(chave, String(Date.now()));
        location.reload();
        return;
      }
    } catch (_) { /* Sem armazenamento: oferece a tentativa manual. */ }
    mostrar();
  }
  window.addEventListener('vite:preloadError', recuperar);
  window.addEventListener('error', function (evento) {
    var alvo = evento.target;
    if (alvo && alvo.tagName === 'SCRIPT' && /\/assets\/.*\.js(?:\?|$)/.test(alvo.src || '')) recuperar();
  }, true);
  window.addEventListener('lf:iniciado', function () { iniciado = true; });
  setTimeout(function () { if (!iniciado) mostrar(); }, 20000);
})();
