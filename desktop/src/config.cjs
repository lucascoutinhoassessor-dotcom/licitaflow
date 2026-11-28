// Endereço do LicitaForce e chave pública (anon) do Supabase, as mesmas que o site usa no navegador.
// São gravadas em config.json pelo scripts/config.mjs na hora do build (o arquivo não vai para o git).
let gerado = {}
try { gerado = require('./config.json') } catch { gerado = {} }

module.exports = {
  supabaseUrl: process.env.LICITAFORCE_SUPABASE_URL || gerado.supabaseUrl,
  supabaseAnonKey: process.env.LICITAFORCE_SUPABASE_ANON_KEY || gerado.supabaseAnonKey,
  siteUrl: gerado.siteUrl || 'https://licitaforce-app.vercel.app',
  // Guarda amostras do que o portal manda (só no computador do cliente) para ajustar os conectores.
  descoberta: process.env.LICITAFORCE_DESCOBERTA === '0' ? false : gerado.descoberta !== false,
}
