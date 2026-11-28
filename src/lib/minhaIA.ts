/** IA do próprio cliente (botão "Minha IA"). Os modelos padrão ficam iguais aos de server/iaCliente.js. */
export type ProvedorIA = 'anthropic' | 'google' | 'openai'
export interface ChaveIA { provedor: ProvedorIA; modelo: string; final: string; ativa: boolean; updated_at: string }

export const PROVEDORES_IA: Record<ProvedorIA, { nome: string; curto: string; empresa: string; modeloPadrao: string; painel: string; painelTexto: string; exemplo: string }> = {
  anthropic: { nome: 'Claude', curto: 'Claude', empresa: 'Anthropic', modeloPadrao: 'claude-opus-5-5', painel: 'https://console.anthropic.com/settings/keys', painelTexto: 'console.anthropic.com', exemplo: 'sk-ant-…' },
  google: { nome: 'Gemini', curto: 'Gemini', empresa: 'Google', modeloPadrao: 'gemini-2.5-pro', painel: 'https://aistudio.google.com/apikey', painelTexto: 'aistudio.google.com', exemplo: 'AIza…' },
  openai: { nome: 'ChatGPT', curto: 'ChatGPT', empresa: 'OpenAI', modeloPadrao: 'gpt-5', painel: 'https://platform.openai.com/api-keys', painelTexto: 'platform.openai.com', exemplo: 'sk-…' },
}
