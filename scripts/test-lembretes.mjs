// Rastreio de aparelho, lembretes de pendências e canal de reserva (e-mail/WhatsApp).
// Uso: node scripts/test-lembretes.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'

const db = new PGlite()
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
grant usage on schema public, auth, storage to authenticated, anon, service_role;`)
for (const f of readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'))
await db.exec('grant usage on all sequences in schema public to authenticated, service_role;')

let n = 0
const ok = (v, m) => { if (!v) throw Error(m); n++; console.log('PASS', m) }
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222', ADM = '33333333-3333-3333-3333-333333333333'
await db.exec(`insert into auth.users(id,email) values ('${U1}','ana@t.com'),('${U2}','beto@t.com'),('${ADM}','adm@t.com');
  insert into public.platform_admins(user_id) values ('${ADM}')`)
async function como(uid, sql, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub', '${uid}', false)`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec("reset role; select set_config('request.jwt.sub','',false)") }
}
const rejeita = async (acao, msg) => { let falhou = false; try { await acao() } catch { falhou = true } ok(falhou, msg) }
const o1 = (await como(U1, `select public.criar_organizacao('Org Ana','fornecedor') id`))[0].id
const o2 = (await como(U2, `select public.criar_organizacao('Org Beto','fornecedor') id`))[0].id
await db.query(`update public.profiles set nome = 'Ana Souza' where id = $1`, [U1])

// ---------- rastreio por aparelho
const reg = (uid, ap, inst, perm, push) => como(uid, 'select public.registrar_aparelho($1,$2,$3,$4,$5)', [ap, inst, perm, push, 'Android · Chrome'])
await reg(U1, 'aparelho-ana-1', false, 'default', false)
await reg(U1, 'aparelho-ana-1', false, 'default', false)
let ev = (await db.query(`select evento from public.engajamento_eventos where user_id=$1 order by id`, [U1])).rows.map(r => r.evento)
ok(ev.join() === 'primeiro_acesso', 'primeiro acesso gera um evento só; repetir o mesmo estado não gera outro')
await reg(U1, 'aparelho-ana-1', true, 'granted', true)
ev = (await db.query(`select evento from public.engajamento_eventos where user_id=$1 order by id`, [U1])).rows.map(r => r.evento)
ok(ev.join() === 'primeiro_acesso,app_instalado,push_permitido,push_ativado', 'instalação, permissão e push viram eventos quando mudam')
await reg(U1, 'aparelho-ana-1', false, 'denied', false)
const ap = (await db.query(`select * from public.usuario_aparelhos where user_id=$1`, [U1])).rows[0]
ok(ap.instalado === true && ap.permissao === 'denied', 'aba comum não desfaz "instalado"; permissão negada é registrada')
await rejeita(() => como(U1, 'select public.registrar_aparelho($1,true,$2,true,$3)', ['x', 'granted', '']), 'id de aparelho inválido é recusado')
ok((await como(U2, 'select * from public.usuario_aparelhos')).length === 0, 'cliente não vê aparelhos de outra conta')
ok((await como(U1, 'select * from public.engajamento_eventos')).length === 0, 'eventos só o master vê')
ok((await como(ADM, 'select * from public.engajamento_eventos')).length >= 5, 'master vê os eventos')

// ---------- configuração protegida
await rejeita(() => como(U1, `update public.notificacoes_config set canal_reserva='whatsapp'`).then(r => { if (!r) throw 0 }).then(async () => {
  if ((await db.query('select canal_reserva from public.notificacoes_config')).rows[0].canal_reserva !== 'email') throw Error('alterou')
  throw Error('sem efeito')
}), 'cliente não altera o canal de reserva')
await rejeita(() => como(ADM, 'select whatsapp_token_cifrado from public.notificacoes_config'), 'nem o master lê o token do WhatsApp pelo navegador')
await rejeita(() => como(ADM, `update public.notificacoes_config set whatsapp_ativo=true`), 'WhatsApp não liga sem número e token')
await como(ADM, `update public.notificacoes_config set canal_reserva='whatsapp'`)
ok((await db.query('select canal_reserva from public.notificacoes_config')).rows[0].canal_reserva === 'whatsapp', 'master escolhe o canal de reserva')
await rejeita(() => como(U1, 'select public.admin_lembretes_executar()'), 'cliente não dispara lembretes')
await rejeita(() => como(U1, 'select public.notificacoes_lote($1)', ['x']), 'cliente não reserva a fila')
await rejeita(() => db.query('select public.notificacoes_lote($1)', ['x']), 'token inválido é recusado')

// ---------- lembretes personalizados
await db.exec(`insert into public.push_inscricoes(user_id,endpoint,p256dh,auth) values ('${U2}','https://push/beto','p','a')`)
await db.query(`insert into public.empresas(org_id,cnpj,razao_social) values ($1,'11222333000181','Beto Ltda')`, [o2])
await db.query(`insert into public.documentos(org_id,nome,categoria,validade) values ($1,'CND Federal','certidao',current_date+3),($1,'FGTS','certidao',current_date+40)`, [o2])
const preparar = (agora) => db.query(`select licitaflow_lembretes.preparar(false, $1::timestamptz) n`, [agora]).then(r => r.rows[0].n)
// 12h UTC = 9h de Brasília (hora padrão dos diários).
const hoje = (await db.query(`select (now() at time zone 'America/Sao_Paulo')::date d`)).rows[0].d.toISOString().slice(0, 10)
await db.query(`insert into public.prazos(org_id,titulo,data_hora,tipo) values ($1,'Sessão pregão 12/2026',$2::timestamptz,'sessao')`, [o2, `${hoje}T17:00:00Z`])
ok(await preparar(`${hoje}T09:00:00Z`) === 0, 'de madrugada (6h de Brasília) nada sai')
ok(await preparar(`${hoje}T12:00:00Z`) === 2, 'na hora configurada cada pessoa recebe um único lembrete')
let envios = (await db.query(`select * from public.notificacoes_envios order by user_id`)).rows
const ana = envios.find(e => e.user_id === U1), beto = envios.find(e => e.user_id === U2)
ok(ana.canal === 'whatsapp' && beto.canal === 'push', 'sem push vai pelo canal de reserva; com push vai por push')
ok(ana.chaves.includes('push_permitir') && ana.chaves.includes('empresa_cadastrar') && ana.texto.includes('Ana,'), 'pendências da Ana são dela, com o primeiro nome')
ok(beto.chaves.includes('documento_vencendo') && beto.texto.includes('CND Federal') && !beto.texto.includes('FGTS'), 'documento vencendo lista só o que está na janela')
ok(beto.chaves.includes('prazo_proximo') && beto.texto.includes('Sessão pregão 12/2026') && beto.refs.length === 1, 'prazo próximo entra com referência própria')
ok(beto.chaves.includes('radar_configurar') && !beto.chaves.includes('push_permitir'), 'quem tem push não recebe "ative as notificações"')
ok(await preparar(`${hoje}T13:00:00Z`) === 0, 'na hora seguinte nada se repete (frequência por regra)')
await db.query(`insert into public.prazos(org_id,titulo,data_hora,tipo) values ($1,'Recurso',$2::timestamptz,'recurso')`, [o2, `${hoje}T16:00:00Z`])
ok(await preparar(`${hoje}T14:00:00Z`) === 1, 'prazo novo sai na conferência horária, fora do horário diário')
ok((await db.query(`select texto from public.notificacoes_envios where user_id=$1 order by created_at desc limit 1`, [U2])).rows[0].texto.includes('Recurso'), 'só o prazo novo é avisado')
await como(U1, `insert into public.push_agentes_preferencias(user_id,lembretes) values ($1,false)`, [U1])
await db.exec(`delete from public.notificacoes_envios`)
ok(await db.query(`select licitaflow_lembretes.preparar(true) n`).then(r => r.rows[0].n) === 1, 'quem desligou os lembretes não recebe')

// ---------- entrega
const token = (await db.query('select token from licitaflow_lembretes.config')).rows[0].token
let lote = (await db.query('select public.notificacoes_lote($1) l', [token])).rows[0].l
ok(lote.length === 1 && lote[0].inscricoes.length === 1 && lote[0].email === 'beto@t.com', 'lote traz contato e aparelhos de quem vai receber')
ok((await db.query('select public.notificacoes_lote($1) l', [token])).rows[0].l.length === 0, 'item reservado não sai duas vezes')
await db.query('select public.notificacoes_concluir($1,$2,$3,$4,$5,$6)', [token, lote[0].id, lote[0].reserva, 'enviado', null, [lote[0].inscricoes[0].id]])
const fim = (await db.query('select status, enviado_em from public.notificacoes_envios where id=$1', [lote[0].id])).rows[0]
ok(fim.status === 'enviado' && fim.enviado_em, 'conclusão marca como enviado')
ok((await db.query(`select count(*)::int n from public.push_inscricoes where user_id=$1`, [U2])).rows[0].n === 0, 'aparelho vencido (410) é removido')

// ---------- aviso do master pelo canal de reserva
const aviso = (await como(ADM, `select public.admin_publicar_aviso('Manutenção','Sistema em manutenção às 22h') id`))[0].id
await como(ADM, 'select public.admin_aviso_reserva($1,true)', [aviso])
await db.exec('delete from public.notificacoes_envios')
await db.query(`insert into public.push_inscricoes(user_id,endpoint,p256dh,auth) values ($1,'https://push/beto2','p','a')`, [U2])
ok(await db.query('select licitaflow_lembretes.enfileirar_avisos() n').then(r => r.rows[0].n) === 1, 'aviso vai por e-mail/WhatsApp só para quem não tem push')
ok(await db.query('select licitaflow_lembretes.enfileirar_avisos() n').then(r => r.rows[0].n) === 0, 'aviso entra na fila uma vez só')
const hist = await como(ADM, 'select * from public.admin_engajamento_historico(50)')
ok(hist.some(h => h.tipo === 'envio') && hist.some(h => h.tipo === 'evento'), 'histórico do master junta eventos e envios')
const us = await como(ADM, 'select * from public.admin_engajamento_usuarios()')
const uAna = us.find(u => u.user_id === U1)
ok(uAna.instalado && uAna.permissao === 'negou' && !uAna.lembretes, 'rastreio por usuário mostra instalação, permissão e preferência')
console.log(`\n${n} verificações OK`)
