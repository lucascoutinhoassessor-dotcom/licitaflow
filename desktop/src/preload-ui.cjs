// Ponte da janela principal: só estas funções chegam à tela, nada do Node.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pav', {
  estado: () => ipcRenderer.invoke('estado'),
  entrar: (email, senha) => ipcRenderer.invoke('entrar', { email, senha }),
  sair: () => ipcRenderer.invoke('sair'),
  contas: () => ipcRenderer.invoke('contas'),
  trocarOrg: (id) => ipcRenderer.invoke('trocarOrg', id),
  abrirPortal: (id, ambiente) => ipcRenderer.invoke('abrirPortal', { id, ambiente }),
  situacao: (sessaoId, situacao) => ipcRenderer.invoke('situacao', { sessaoId, situacao }),
  abrirSite: (rota) => ipcRenderer.invoke('abrirSite', rota),
  estrategia: (portal, chave, item, parcial) => ipcRenderer.invoke('estrategia', { portal, chave, item, parcial }),
  simulacao: (ligada) => ipcRenderer.invoke('simulacao', ligada),
  pararTudo: () => ipcRenderer.invoke('pararTudo'),
  demo: (ligar) => ipcRenderer.invoke('demo', ligar),
  irParaDisputas: (id) => ipcRenderer.invoke('irParaDisputas', id),
  aoEstado: (fn) => ipcRenderer.on('estado', (_e, d) => fn(d)),
  aoTocar: (fn) => ipcRenderer.on('tocar', (_e, d) => fn(d)),
})
