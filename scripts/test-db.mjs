// Testes do banco: aplica as migrations num Postgres em memória (PGlite) com stubs do Supabase
// e verifica isolamento RLS entre organizações, convites, papéis e storage.
// Uso: node scripts/test-db.mjs supabase/migrations
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const db = new PGlite();

const stubs = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
grant usage on schema public, auth, storage to authenticated, anon;
`;
await db.exec(stubs);

for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
    console.log('OK   ', f);
  } catch (e) {
    console.log('ERRO ', f, '->', e.message);
    process.exit(1);
  }
}

await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
               grant usage on all sequences in schema public to authenticated;
               grant select, insert, update, delete on storage.objects to authenticated;`);

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${U1}', 'a@teste.com', '{"nome":"Ana"}'), ('${U2}', 'b@teste.com', '{"nome":"Beto"}');`);

async function as(uid, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub', '${uid}', false);`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role;');
  }
}

let fails = 0;
const expect = (cond, msg) => { console.log(cond ? 'PASS ' : 'FAIL ', msg); if (!cond) fails++; };

const o1 = (await as(U1, `select public.criar_organizacao('Org Ana', 'fornecedor') as id`)).rows[0].id;
const o2 = (await as(U2, `select public.criar_organizacao('Assessoria Beto', 'assessoria') as id`)).rows[0].id;
expect(!!o1 && !!o2, 'criar_organizacao cria org + owner');

const e1 = (await as(U1, `insert into public.empresas (org_id, cnpj, razao_social) values ('${o1}', '12345678000190', 'Ana LTDA') returning id`)).rows[0].id;
await as(U2, `insert into public.empresas (org_id, cnpj, razao_social) values ('${o2}', '98765432000110', 'Cliente 1 LTDA')`);

const p1 = (await as(U1, `insert into public.processos (org_id, empresa_id, objeto) values ('${o1}', '${e1}', 'Aquisição de notebooks') returning id`)).rows[0].id;

expect((await as(U2, `select * from public.processos`)).rows.length === 0, 'U2 não vê processos da org de U1');
expect((await as(U2, `select * from public.empresas`)).rows.length === 1, 'U2 vê apenas a própria empresa');
expect((await as(U2, `select * from public.organizations`)).rows.length === 1, 'U2 vê apenas a própria organização');

let blocked = false;
try { await as(U2, `insert into public.processos (org_id, empresa_id, objeto) values ('${o1}', '${e1}', 'invasão')`); } catch { blocked = true; }
expect(blocked, 'U2 não consegue inserir na org de U1');

blocked = false;
try {
  const e2 = (await as(U2, `select id from public.empresas`)).rows[0].id;
  await as(U2, `insert into public.processos (org_id, empresa_id, objeto) values ('${o2}', '${e1}', 'empresa alheia')`);
} catch { blocked = true; }
expect(blocked, 'não é possível usar empresa de outra org');

await as(U1, `update public.processos set etapa = 'analise' where id = '${p1}'`);
expect((await as(U1, `select * from public.processo_eventos where processo_id = '${p1}' and tipo = 'etapa'`)).rows.length === 1, 'mudança de etapa gera evento na linha do tempo');
expect((await as(U1, `select * from public.audit_log`)).rows.length >= 2, 'auditoria registra alterações (owner lê)');

// convite
const tok = (await as(U1, `insert into public.convites (org_id, email, papel, criado_por) values ('${o1}', 'b@teste.com', 'leitor', '${U1}') returning token`)).rows[0].token;
await as(U2, `select public.aceitar_convite('${tok}')`);
expect((await as(U2, `select * from public.processos`)).rows.length === 1, 'após aceitar convite, U2 vê processos da org de U1');
blocked = false;
try { await as(U2, `insert into public.processos (org_id, empresa_id, objeto) values ('${o1}', '${e1}', 'leitor escrevendo')`); } catch { blocked = true; }
expect(blocked, 'leitor não pode escrever');

// storage
blocked = false;
try { await as(U2, `insert into storage.objects (bucket_id, name) values ('arquivos', '${o2}/x.pdf')`); } catch { blocked = true; }
expect(!blocked, 'upload no próprio prefixo é permitido');
blocked = false;
try { await as(U2, `insert into storage.objects (bucket_id, name) values ('arquivos', '${o1}/x.pdf')`); } catch { blocked = true; }
expect(blocked, 'upload no prefixo de org onde é leitor é bloqueado');

// painel master
blocked = false;
try { await as(U2, `select public.admin_resumo()`); } catch { blocked = true; }
expect(blocked, 'usuário comum não acessa o painel master');

blocked = false;
try { await as(U2, `insert into public.platform_admins (user_id) values ('${U2}')`); } catch { blocked = true; }
expect(blocked, 'usuário comum não consegue se tornar admin');

await db.exec(`insert into public.platform_admins (user_id) values ('${U2}')`);  // via SQL Editor
const resumo = (await as(U2, `select public.admin_resumo() r`)).rows[0].r;
expect(resumo.organizacoes === 2 && resumo.usuarios === 2, 'admin vê totais de toda a plataforma');
expect((await as(U2, `select * from public.admin_organizacoes()`)).rows.length === 2, 'admin lista todas as organizações');
expect((await as(U2, `select * from public.admin_usuarios()`)).rows.length === 2, 'admin lista todos os usuários');
expect((await as(U2, `select * from public.admin_atividade(50)`)).rows.length > 0, 'admin vê a atividade da plataforma');

// cliente não altera o próprio plano
await as(U1, `update public.organizations set plano = 'profissional', trial_ate = '2099-01-01' where id = '${o1}'`);
const planoU1 = (await db.query(`select plano from public.organizations where id = '${o1}'`)).rows[0].plano;
expect(planoU1 === 'trial', 'cliente não consegue mudar o próprio plano');

// admin suspende org de U1
await as(U2, `select public.admin_atualizar_org('${o1}', 'trial', current_date + 30, true, 'teste', null)`);
await db.exec(`delete from public.memberships where org_id = '${o1}' and user_id = '${U2}'`); // U2 deixa de ser membro (só admin)
expect((await as(U1, `select * from public.processos`)).rows.length === 0, 'org suspensa: membros perdem acesso aos dados');
expect((await as(U1, `select suspensa from public.organizations where id = '${o1}'`)).rows[0]?.suspensa === true, 'org suspensa: dono ainda vê o aviso de suspensão');
await as(U2, `select public.admin_atualizar_org('${o1}', 'profissional', current_date, false, null, null)`);
expect((await as(U1, `select * from public.processos`)).rows.length === 1, 'reativar org devolve o acesso');
expect((await db.query(`select plano from public.organizations where id = '${o1}'`)).rows[0].plano === 'profissional', 'admin muda o plano');

blocked = false;
try { await as(U2, `select public.admin_definir_admin('${U2}', false)`); } catch { blocked = true; }
expect(blocked, 'admin não remove o próprio acesso master');

// Gestão master e conteúdo: autorização no banco, isolamento e concorrência.
blocked = false;
try { await as(U1, `select public.admin_cliente('${o2}')`); } catch { blocked = true; }
expect(blocked, 'cliente comum não consulta ficha administrativa');
const ficha = (await as(U2, `select public.admin_cliente('${o1}') r`)).rows[0].r;
expect(ficha.processos === 1 && ficha.empresas.length === 1, 'master consulta ficha de qualquer cliente');
blocked = false;
try { await as(U2, `select public.admin_papel_membro('${o1}', '${U1}', 'leitor', 'teste de proteção')`); } catch { blocked = true; }
expect(blocked, 'master não rebaixa proprietário por alteração de membro');
await db.exec(`insert into public.memberships(org_id,user_id,papel) values('${o1}','${U2}','membro')`);
await as(U2, `select public.admin_papel_membro('${o1}', '${U2}', 'leitor', 'Acesso apenas para consulta')`);
expect((await db.query(`select papel from public.memberships where org_id='${o1}' and user_id='${U2}'`)).rows[0].papel === 'leitor', 'master altera papel do membro com motivo');
expect((await as(U1, `select * from public.admin_audit`)).rows.length === 0, 'auditoria administrativa fica oculta ao cliente');
expect((await as(U2, `select * from public.admin_audit where acao='ALTERAR_PAPEL'`)).rows.length === 1, 'mudança de papel tem motivo registrado');
const conteudo = JSON.stringify({titulo:'Nova landing',botao:'Começar agora',descricao:'Rascunho privado',contato:''});
blocked = false;
try { await as(U1, `select public.admin_salvar_site('${conteudo}'::jsonb,0,false)`); } catch { blocked = true; }
expect(blocked, 'cliente comum não edita a landing page');
await as(U2, `select public.admin_salvar_site('${conteudo}'::jsonb,0,false)`);
expect(Object.keys((await as(U1, `select public.site_publico() r`)).rows[0].r).length === 0, 'rascunho nunca aparece na leitura pública');
expect((await as(U1, `select * from public.site_content`)).rows.length === 0, 'cliente não lê rascunhos diretamente');
blocked = false;
try { await as(U2, `select public.admin_salvar_site('${conteudo}'::jsonb,0,true)`); } catch { blocked = true; }
expect(blocked, 'editor rejeita sobrescrita de versão desatualizada');
await as(U2, `select public.admin_salvar_site('${conteudo}'::jsonb,1,true)`);
await db.exec(`set role anon;`);
try {
  expect((await db.query(`select public.site_publico() r`)).rows[0].r.titulo === 'Nova landing', 'visitante anônimo lê somente a versão publicada');
  blocked = false;
  try { await db.query(`select public.admin_cliente('${o1}')`); } catch { blocked = true; }
  expect(blocked, 'visitante anônimo não executa funções master');
} finally {await db.exec('reset role;');}
blocked = false;
try { await as(U2, `select public.admin_salvar_site('{"titulo":"Teste","botao":"Entrar","html":"<script>"}'::jsonb,2,true)`); } catch { blocked = true; }
expect(blocked, 'servidor rejeita campos fora do contrato de conteúdo');
const landing2 = (extra = {}) => JSON.stringify({ versao_schema: 2, seo: {}, tema: {}, marca: {}, menu: {}, rodape: { contato: '' }, secoes: [{ tipo: 'livre', titulo: 'Página nova' }], ...extra }).replace(/'/g, "''");
for (const [rotulo, extra] of [
  ['link javascript:', { secoes: [{ tipo: 'livre', botao: { texto: 'x', link: 'javascript:alert(1)' } }] }],
  ['tag de script', { secoes: [{ tipo: 'livre', texto: '<script>alert(1)</script>' }] }],
  ['campo extra no topo', { html: '<b>' }],
  ['sem seções', { secoes: [] }],
  ['contato que não é e-mail', { rodape: { contato: 'javascript:x' } }],
]) {
  blocked = false;
  try { await as(U2, `select public.admin_salvar_site('${landing2(extra)}'::jsonb,2,true)`); } catch { blocked = true; }
  expect(blocked, `landing completa rejeita ${rotulo}`);
}
blocked = false;
try { await as(U1, `select public.admin_salvar_site('${landing2()}'::jsonb,2,true)`); } catch { blocked = true; }
expect(blocked, 'cliente comum não publica a landing completa');
await as(U2, `select public.admin_salvar_site('${landing2()}'::jsonb,2,true)`);
expect((await as(U1, `select public.site_publico() r`)).rows[0].r.secoes[0].titulo === 'Página nova', 'landing completa (formato 2) é publicada');
blocked = false;
try { await as(U2, `delete from public.admin_audit`); } catch { blocked = true; }
expect((await as(U2, `select * from public.admin_audit`)).rows.length > 0, 'master não apaga histórico pela API');
expect((await as(U2, `select * from public.site_content_history`)).rows.length === 3, 'histórico guarda rascunho e publicações');

await as(U2, `select public.admin_atualizar_org('${o1}', 'profissional', current_date, false, null, 'Nota confidencial de atendimento')`);
expect((await as(U1, `select notas_admin from public.organizations where id='${o1}'`)).rows[0].notas_admin === null, 'notas internas não vazam pela organização do cliente');
expect((await as(U1, `select * from public.organization_admin_notes`)).rows.length === 0, 'cliente não acessa a tabela privada de notas');
expect((await as(U2, `select * from public.admin_organizacoes()`)).rows.find(o=>o.id===o1).notas_admin === 'Nota confidencial de atendimento', 'master continua consultando notas internas');

// Atendimento, avisos, relatórios e planos: controles reais no banco.
const ch=(await as(U1, `select public.abrir_chamado('${o1}', 'Preciso de ajuda', 'Não encontro o edital', 'suporte') id`)).rows[0].id;
expect((await as(U1, `select * from public.suporte_chamados`)).rows.length===1,'cliente abre e consulta o próprio chamado');
await as(U2, `select public.responder_chamado('${ch}', 'Vamos verificar o processo.')`);
expect((await as(U1, `select equipe from public.suporte_mensagens where chamado_id='${ch}' order by created_at desc limit 1`)).rows[0].equipe===true,'resposta do master é identificada pelo servidor');
await as(U1, `select public.marcar_chamado_lido('${ch}')`);
expect((await as(U1, `select nao_lido_cliente from public.suporte_chamados where id='${ch}'`)).rows[0].nao_lido_cliente===false,'leitura do cliente é persistida');
blocked=false;
try{await as(U1, `insert into public.suporte_mensagens(chamado_id,autor_id,autor_nome,equipe,texto) values('${ch}','${U1}','Equipe falsa',true,'Mensagem falsificada')`);}catch{blocked=true;}
expect(blocked,'cliente não falsifica autoria da equipe');
await as(U2, `select public.admin_atualizar_chamado('${ch}', 'fechado', 'alta')`);
blocked=false;
try{await as(U1, `select public.responder_chamado('${ch}', 'Mensagem em chamado fechado')`);}catch{blocked=true;}
expect(blocked,'chamado fechado não recebe resposta sem reabertura');
await as(U2, `select public.admin_atualizar_chamado('${ch}', 'aberto', 'normal')`);
const av=(await as(U2, `select public.admin_publicar_aviso('Aviso privado','Comunicado para a organização','${o1}') id`)).rows[0].id;
const globalAv=(await as(U2, `select public.admin_publicar_aviso('Aviso geral','Comunicado para todas as organizações') id`)).rows[0].id;
await db.exec(`delete from public.memberships where org_id='${o1}' and user_id='${U2}'`);
await db.exec(`delete from public.platform_admins where user_id='${U2}'`);
expect((await as(U2, `select * from public.suporte_chamados where id='${ch}'`)).rows.length===0,'outra organização não vê o chamado');
expect((await as(U2, `select * from public.suporte_mensagens where chamado_id='${ch}'`)).rows.length===0,'outra organização não vê as mensagens');
blocked=false;
try{await as(U2, `select public.responder_chamado('${ch}', 'Tentativa cruzada')`);}catch{blocked=true;}
expect(blocked,'outra organização não responde ao chamado');
expect((await as(U2, `select id from public.plataforma_avisos`)).rows.length===1,'aviso segmentado fica oculto a outro cliente');
expect((await as(U1, `select id from public.plataforma_avisos`)).rows.length===2,'cliente recebe aviso próprio e geral');
blocked=false;
try{await as(U2, `insert into public.aviso_leituras(aviso_id,user_id) values('${av}','${U2}')`);}catch{blocked=true;}
expect(blocked,'cliente não marca leitura de aviso invisível');
blocked=false;
try{await as(U1, `insert into public.aviso_leituras(aviso_id,user_id) values('${globalAv}','${U2}')`);}catch{blocked=true;}
expect(blocked,'cliente não registra leitura em nome de outro usuário');
await as(U1, `insert into public.aviso_leituras(aviso_id,user_id) values('${av}','${U1}')`);
expect((await as(U1, `select * from public.aviso_leituras`)).rows.length===1,'cliente registra a própria leitura');
blocked=false;
try{await as(U1, `select public.admin_publicar_aviso('Tentativa','Cliente publicando')`);}catch{blocked=true;}
expect(blocked,'cliente não publica comunicados administrativos');
blocked=false;
try{await as(U1, `select public.admin_relatorio_operacao()`);}catch{blocked=true;}
expect(blocked,'cliente não consulta relatórios globais');
blocked=false;
try{await as(U1, `select public.relatorio_cliente('${o2}')`);}catch{blocked=true;}
expect(blocked,'relatório do cliente não aceita outra organização');
expect((await as(U1, `select public.relatorio_cliente('${o1}','${e1}') r`)).rows[0].r.processos===1,'relatório calcula totais reais com filtro de empresa');
await db.exec(`insert into public.platform_admins(user_id) values('${U2}')`);
await as(U2, `select public.admin_arquivar_aviso('${av}')`);
expect((await as(U1, `select id from public.plataforma_avisos`)).rows.length===1,'aviso arquivado desaparece do painel do cliente');
await as(U2, `select public.admin_publicar_aviso('Agendado','Aviso futuro',null,null,null,now()+interval '1 hour')`);
expect((await as(U1, `select id from public.plataforma_avisos`)).rows.length===1,'aviso agendado fica oculto até a hora');
const avMulti=(await as(U2, `select public.admin_publicar_aviso('Vários','Para dois clientes',null,null,array['${o1}','${o2}']::uuid[]) id`)).rows[0].id;
expect((await as(U1, `select id from public.plataforma_avisos where id='${avMulti}'`)).rows.length===1,'cliente escolhido recebe aviso para vários clientes');
expect((await db.query(`select org_ids from public.plataforma_avisos where id='${avMulti}'`)).rows[0].org_ids.length===2,'aviso guarda os vários clientes');
blocked=false;try{await as(U2, `select public.admin_publicar_aviso('Passado','Data antiga',null,null,null,now()-interval '1 day')`);}catch{blocked=true;}
expect(blocked,'não agenda aviso no passado');
blocked=false;try{await as(U2, `select public.admin_publicar_aviso('Expira','Antes do envio',null,now()+interval '1 hour',null,now()+interval '2 hours')`);}catch{blocked=true;}
expect(blocked,'expiração precisa ser depois do envio agendado');
await as(U2, `select public.admin_atualizar_org('${o1}', 'profissional', current_date, true, 'Teste de atendimento', null)`);
expect(!!(await as(U1, `select public.abrir_chamado('${o1}', 'Solicito reativação', 'Preciso regularizar o acesso', 'suporte') id`)).rows[0].id,'cliente suspenso mantém canal de suporte');
blocked=false;
try{await as(U1, `select public.relatorio_cliente('${o1}')`);}catch{blocked=true;}
expect(blocked,'suspensão continua bloqueando relatórios operacionais');
await as(U2, `select public.admin_atualizar_org('${o1}', 'profissional', current_date, false, null, null)`);
expect((await as(U2, `select public.admin_relatorio_operacao() r`)).rows[0].r.clientes.length===2,'master recebe consolidado real dos clientes');
blocked=false;
try{await as(U1, `select public.admin_salvar_plano('especial','Especial',99900,999000,1,1,1,true)`);}catch{blocked=true;}
expect(blocked,'cliente não cria nem altera planos');
await as(U2, `select public.admin_salvar_plano('especial','Especial',99900,999000,1,1,1,true)`);
await as(U2, `select public.admin_atualizar_org('${o1}', 'especial', current_date, false, null, null)`);
expect((await as(U1, `select public.plano_cliente('${o1}') r`)).rows[0].r.plano.id==='especial','novo plano pode ser vinculado ao cliente');
await as(U2, `select public.admin_aplicar_limites(true)`);
blocked=false;
try{await as(U1, `insert into public.empresas(org_id,cnpj,razao_social) values('${o1}','11111111000191','Empresa excedente')`);}catch{blocked=true;}
expect(blocked,'banco bloqueia nova empresa acima do limite');
blocked=false;
try{await as(U1, `insert into public.processos(org_id,empresa_id,objeto) values('${o1}','${e1}','Processo excedente')`);}catch{blocked=true;}
expect(blocked,'banco bloqueia novo processo acima do limite');
blocked=false;
try{await as(U1, `insert into public.memberships(org_id,user_id,papel) values('${o1}','${U2}','membro')`);}catch{blocked=true;}
expect(blocked,'banco bloqueia novo usuário acima do limite');
expect((await as(U1, `select id from public.empresas`)).rows.length===1,'ativar limites preserva empresas existentes');
await as(U2, `select public.admin_salvar_plano('especial','Especial',99900,999000,2,2,2,false)`);
await as(U1, `insert into public.empresas(org_id,cnpj,razao_social) values('${o1}','11111111000191','Segunda empresa')`);
expect((await as(U1, `select public.plano_cliente('${o1}') r`)).rows[0].r.empresas===2,'limite ampliado permite uso real e conta os registros');
await db.exec(`set role anon; select set_config('request.jwt.sub','',false);`);
try{expect((await db.query(`select id from public.plataforma_planos`)).rows.length===3,'catálogo público oculta trial, cancelado e plano desativado');}finally{await db.exec('reset role;');}
await as(U2, `select public.admin_aplicar_limites(false)`);
await as(U1, `insert into public.empresas(org_id,cnpj,razao_social) values('${o1}','22222222000191','Terceira empresa')`);
expect((await as(U1, `select id from public.empresas`)).rows.length===3,'desativação da política não limita novos cadastros');

// Cobranças SaaS: clientes não criam nem confirmam pagamentos.
blocked=false;
try { await as(U1, `select public.admin_criar_cobranca('${o1}', 'Acesso mensal', 19700, current_date+5, 'stripe')`); } catch {blocked=true;}
expect(blocked, 'cliente não cria cobranças da plataforma');
const cb=(await as(U2, `select public.admin_criar_cobranca('${o1}', 'Acesso mensal', 19700, current_date+5, 'stripe') id`)).rows[0].id;
expect((await as(U1, `select * from public.plataforma_cobrancas`)).rows.length===1, 'dono vê a cobrança da própria organização');
await db.exec(`delete from public.memberships where org_id='${o1}' and user_id='${U2}'`);
await db.exec(`delete from public.platform_admins where user_id='${U2}'`);
expect((await as(U2, `select * from public.plataforma_cobrancas`)).rows.length===0, 'outro cliente não vê a cobrança');
await as(U1, `update public.plataforma_cobrancas set status='paga' where id='${cb}'`);
expect((await db.query(`select status from public.plataforma_cobrancas where id='${cb}'`)).rows[0].status==='rascunho', 'cliente não confirma pagamento pela API do banco');
await db.exec(`insert into public.platform_admins(user_id) values('${U2}')`);
blocked=false;
try {await as(U2, `select public.admin_criar_cobranca('${o1}', 'Valor negativo', -100, current_date+5, 'stripe')`);}catch{blocked=true;}
expect(blocked,'banco rejeita cobrança com valor negativo');
// O histórico financeiro preserva a organização por FK até resolver a retenção.
blocked=false;
try {await as(U1, `delete from public.organizations where id='${o1}'`);}catch{blocked=true;}
expect(blocked,'organização com cobrança não é excluída em cascata');
await db.exec(`delete from public.plataforma_cobrancas where id='${cb}'`);

// O novo índice público não permite que clientes operem o coletor.
blocked=false;
try {await as(U1, `select public.admin_catalogo_oportunidades(false)`);}catch{blocked=true;}
expect(blocked,'cliente comum não pausa a coleta de oportunidades');
const cat=(await as(U2, `select public.admin_catalogo_oportunidades(false) r`)).rows[0].r;
expect(cat.ativo===false,'master consulta e pausa o coletor com autorização no banco');
expect((await db.query(`select count(*) n from public.admin_audit where acao='coleta.alterar'`)).rows[0].n>0,'controle do coletor registra auditoria administrativa');

// Assinaturas pelo Asaas: credenciais ocultas, valor do catálogo, webhook e inadimplência.
// "sistema" simula o servidor (service role / pg_cron): sem usuário logado.
const sistema=async(sql)=>{await db.exec(`select set_config('request.jwt.sub','',false)`);return db.query(sql)};
await sistema(`update public.organizations set suspensa=false, motivo_suspensao=null where id='${o1}'`);
expect((await as(U1, `select * from public.plataforma_gateways`)).rows.length===0,'cliente não lê credenciais do gateway');
blocked=false;try{await as(U1, `select public.admin_gateway_status()`);}catch{blocked=true;}
expect(blocked,'cliente não consulta a configuração do Asaas');
expect((await as(U2, `select public.admin_gateway_status() r`)).rows[0].r.tem_chave===false,'master vê só se a chave existe, nunca o valor');
blocked=false;try{await as(U1, `select public.preparar_assinatura('${o2}','essencial','mensal','PIX','12345678909')`);}catch{blocked=true;}
expect(blocked,'cliente não contrata plano para outra organização');
const ass=(await as(U1, `select public.preparar_assinatura('${o1}','essencial','mensal','UNDEFINED','123.456.789-09') id`)).rows[0].id;
const valorAss=(await db.query(`select a.valor_centavos v, p.mensal_centavos m, a.documento d from public.assinaturas a join public.plataforma_planos p on p.id=a.plano_id where a.id='${ass}'`)).rows[0];
expect(valorAss.v===valorAss.m && valorAss.d==='12345678909','valor da assinatura vem do catálogo e documento fica só com dígitos');
await db.exec(`delete from public.platform_admins where user_id='${U2}'`);
expect((await as(U2, `select * from public.assinaturas`)).rows.length===0,'outro cliente não vê a assinatura');
await db.exec(`insert into public.platform_admins(user_id) values('${U2}')`);
await db.exec(`update public.assinaturas set gateway_assinatura_id='sub_teste' where id='${ass}'`);
blocked=false;try{await as(U1, `select public.preparar_assinatura('${o1}','profissional','mensal','PIX','12345678909')`);}catch{blocked=true;}
expect(blocked,'não cria segunda assinatura em vigor para a mesma organização');
blocked=false;try{await as(U1, `select public.processar_pagamento_asaas('PAYMENT_RECEIVED','{"id":"pay_x","subscription":"sub_teste","value":197}')`);}catch{blocked=true;}
expect(blocked,'cliente não simula pagamento do webhook');
const pag=(id,dias,status)=>`'{"id":"${id}","subscription":"sub_teste","value":${valorAss.m/100},"netValue":190,"status":"${status}","dueDate":"'||to_char(current_date-${dias},'YYYY-MM-DD')||'"}'`;
expect((await sistema(`select public.processar_pagamento_asaas('PAYMENT_OVERDUE',(${pag('pay_1',10,'OVERDUE')})::jsonb) r`)).rows[0].r==='em atraso','webhook de atraso marca a assinatura');
await db.exec(`update public.plataforma_gateways set dias_tolerancia=5, bloquear_inadimplente=true`);
expect((await sistema(`select public.rotina_cobranca() n`)).rows[0].n===1,'rotina suspende quem passou da tolerância');
expect((await db.query(`select motivo_suspensao m from public.organizations where id='${o1}'`)).rows[0].m==='Pagamento em atraso (automático)','suspensão automática fica identificada');
expect((await sistema(`select public.processar_pagamento_asaas('PAYMENT_RECEIVED',(${pag('pay_1',10,'RECEIVED')})::jsonb) r`)).rows[0].r==='acesso liberado','pagamento libera o acesso');
const orgPaga=(await db.query(`select suspensa, plano from public.organizations where id='${o1}'`)).rows[0];
expect(!orgPaga.suspensa && orgPaga.plano==='essencial','pagamento reativa a conta e aplica o plano contratado');
expect((await db.query(`select status from public.assinaturas where id='${ass}'`)).rows[0].status==='ativa','assinatura fica ativa após o pagamento');
await sistema(`select public.processar_pagamento_asaas('PAYMENT_OVERDUE',(${pag('pay_1',10,'OVERDUE')})::jsonb)`);
expect((await db.query(`select status from public.assinatura_faturas where gateway_pagamento_id='pay_1'`)).rows[0].status==='paga','reenvio antigo de atraso não desfaz fatura paga');
await sistema(`update public.organizations set suspensa=true, motivo_suspensao='Suspensão manual' where id='${o1}'`);
await sistema(`select public.processar_pagamento_asaas('PAYMENT_CONFIRMED',(${pag('pay_2',0,'CONFIRMED')})::jsonb)`);
expect((await db.query(`select suspensa from public.organizations where id='${o1}'`)).rows[0].suspensa===true,'pagamento não desfaz suspensão manual do master');
expect((await as(U2, `select public.admin_financeiro() r`)).rows[0].r.mrr===valorAss.m,'painel financeiro calcula o MRR das assinaturas ativas');
blocked=false;try{await as(U1, `select public.admin_financeiro()`);}catch{blocked=true;}
expect(blocked,'cliente não acessa o painel financeiro da plataforma');
expect((await as(U1, `select * from public.assinatura_faturas`)).rows.length===2,'dono acompanha as faturas mesmo suspenso');
expect((await sistema(`select public.encerrar_assinatura_gateway('sub_teste','Excluída no Asaas') r`)).rows[0].r==='assinatura encerrada','assinatura excluída no Asaas é encerrada');
await db.exec(`delete from public.assinatura_faturas; delete from public.assinaturas; update public.organizations set suspensa=false, motivo_suspensao=null where id='${o1}'`);

// Teste grátis: prazo editável pelo master, público para a landing, bloqueio ao vencer sem plano.
await db.exec(`set role anon;`);
try { expect((await db.query(`select public.dias_teste_gratis() d`)).rows[0].d===14,'landing lê o prazo do teste sem login'); } finally { await db.exec('reset role;'); }
blocked=false;try{await as(U1, `select public.admin_teste_gratis(60, true)`);}catch{blocked=true;}
expect(blocked,'cliente não altera o prazo do teste grátis');
blocked=false;try{await as(U2, `select public.admin_teste_gratis(-1, true)`);}catch{blocked=true;}
expect(blocked,'prazo do teste fica entre 0 e 90 dias');
await as(U2, `select public.admin_teste_gratis(7, true)`);
const o3=(await as(U1, `select public.criar_organizacao('Org Nova', 'fornecedor') as id`)).rows[0].id;
expect((await db.query(`select trial_ate - current_date d from public.organizations where id='${o3}'`)).rows[0].d===7,'novo cadastro recebe o prazo definido pelo master');
await sistema(`update public.organizations set plano='trial', trial_ate=current_date-1, suspensa=false, motivo_suspensao=null where id in ('${o1}','${o3}')`);
await sistema(`insert into public.assinaturas(org_id,plano_id,ciclo,valor_centavos,status,gateway_assinatura_id) values('${o1}','essencial','mensal',19700,'ativa','sub_ativa')`);
// Uma assinatura sem pagamento não estende o teste; o RLS bloqueia antes do cron.
expect((await as(U1, `select public.is_member('${o3}') ok`)).rows[0].ok===false,'teste vencido bloqueia o banco antes da rotina');
expect((await as(U1, `select public.has_role('${o3}',array['owner']) ok`)).rows[0].ok===false,'teste vencido impede escrita antes da rotina');
const efetivas=(await as(U1, `select public.minhas_organizacoes() r`)).rows[0].r;
expect(efetivas.find(o=>o.id===o3).suspensa===true,'cliente recebe suspensão efetiva antes do cron');
expect((await as(U1, `select public.is_member('${o1}') ok`)).rows[0].ok===false,'assinatura ativa sem pagamento não libera teste vencido');
expect((await as(U1, `select id from public.processos where org_id='${o1}'`)).rows.length===0,'RLS oculta processos do teste vencido antes do cron');
await sistema(`update public.assinaturas set pago_ate=current_date+30 where org_id='${o1}'`);
expect((await as(U1, `select public.is_member('${o1}') ok`)).rows[0].ok===true,'assinatura paga preserva o acesso');
await sistema(`select public.rotina_cobranca()`);
const st=(await db.query(`select id, suspensa, motivo_suspensao from public.organizations where id in ('${o1}','${o3}')`)).rows;
expect(st.find(r=>r.id===o3).motivo_suspensao==='Teste grátis encerrado (automático)','teste vencido sem plano é bloqueado pela rotina');
expect(st.find(r=>r.id===o1).suspensa===false,'teste vencido com assinatura ativa continua liberado');
await as(U2, `select public.admin_atualizar_org('${o3}','trial',current_date+5,true,'Teste grátis encerrado (automático)','')`);
expect((await db.query(`select suspensa from public.organizations where id='${o3}'`)).rows[0].suspensa===false,'master estende o teste e a conta volta na hora');
await as(U2, `select public.admin_teste_gratis(14, false)`);
expect((await as(U2, `select public.admin_teste_status() r`)).rows[0].r.dias===14,'master consulta o prazo e o bloqueio do teste');
expect((await as(U2, `select public.admin_teste_gratis(30, false, true) n`)).rows[0].n>=1,'master recalcula os testes em andamento');
await as(U2, `select public.admin_teste_gratis(14, false)`);
await sistema(`update public.organizations set trial_ate=current_date-1 where id='${o3}'`);
await sistema(`select public.rotina_cobranca()`);
expect((await db.query(`select suspensa from public.organizations where id='${o3}'`)).rows[0].suspensa===false,'com o bloqueio desligado, teste vencido não é suspenso');
await as(U2, `select public.admin_teste_gratis(0, true)`);
expect((await db.query(`select public.dias_teste_gratis() d`)).rows[0].d===0,'master desativa novos testes com zero dias');
const semTeste=(await as(U1, `select public.criar_organizacao('Sem teste','fornecedor') id`)).rows[0].id;
expect((await as(U1, `select public.is_member('${semTeste}') ok`)).rows[0].ok===false,'cadastro sem teste exige pagamento imediatamente');
expect((await as(U1, `select public.pode_gerir_cobranca('${semTeste}') ok`)).rows[0].ok===true,'conta bloqueada continua podendo contratar');
blocked=false;try{await as(U1, `insert into public.empresas(org_id,cnpj,razao_social) values('${semTeste}','12345678000190','Bloqueada')`);}catch{blocked=true;}
expect(blocked,'conta sem teste não cadastra empresa antes do pagamento');
expect((await as(U1, `select * from public.checkout_acessos`)).rows.length===0,'senhas cifradas não são expostas ao cliente');
const compraSemTeste=(await as(U1, `select public.preparar_assinatura('${semTeste}','essencial','mensal','PIX','12345678909') id`)).rows[0].id;
await sistema(`update public.plataforma_email set ativo=true,boas_vindas=true,senha_cifrada='cifrada-teste' where id='smtp'`);
expect((await sistema(`select public.reservar_boas_vindas('{"id":"pay_sem_teste"}') r`)).rows[0].r===null,'não reserva e-mail de acesso sem pagamento confirmado');
await sistema(`select public.processar_pagamento_asaas('PAYMENT_CONFIRMED',jsonb_build_object('id','pay_sem_teste','externalReference','${compraSemTeste}','value',197,'dueDate',current_date::text,'status','CONFIRMED'))`);
expect((await as(U1, `select public.is_member('${semTeste}') ok`)).rows[0].ok===true,'confirmação do pagamento libera cadastro sem teste');
const envio=(await sistema(`select public.reservar_boas_vindas('{"id":"pay_sem_teste"}') r`)).rows[0].r;
expect(envio.org_id===semTeste && envio.email==='a@teste.com','primeiro pagamento prepara dados de acesso do dono da conta');
expect((await sistema(`select public.reservar_boas_vindas('{"id":"pay_sem_teste"}') r`)).rows[0].r===null,'reserva atômica impede duplicação do e-mail de acesso');
await db.exec(`update public.plataforma_email set ativo=false,senha_cifrada=null where id='smtp'; delete from public.assinatura_faturas where org_id='${semTeste}'; delete from public.assinaturas where org_id='${semTeste}'`);
await sistema(`delete from public.organizations where id='${semTeste}'`);
await as(U2, `select public.admin_teste_gratis(14, false)`);
await db.exec(`delete from public.assinaturas; delete from public.organizations where id='${o3}'`);

// Liberação de funcionalidades: master decide; cliente recebe só o estado efetivo da própria org.
expect((await as(U1, `select public.modulos_da_org('${o1}') r`)).rows[0].r.agentes==='em_breve','cliente recebe os estados dos módulos');
blocked=false;try{await as(U1, `select public.modulos_da_org('${o2}')`);}catch{blocked=true;}
await db.exec(`delete from public.platform_admins where user_id='${U2}'`);
blocked=false;try{await as(U2, `select public.modulos_da_org('${o1}')`);}catch{blocked=true;}
expect(blocked,'cliente não consulta módulos de outra organização');
blocked=false;try{await as(U2, `select public.admin_salvar_modulo('processos','oculto')`);}catch{blocked=true;}
expect(blocked,'cliente não altera a liberação de módulos');
expect((await as(U2, `select * from public.plataforma_modulos`)).rows.length===0,'cliente não lê a lista de organizações de teste');
await db.exec(`insert into public.platform_admins(user_id) values('${U2}')`);
await as(U2, `select public.admin_salvar_modulo('mercado','teste',array['${o1}']::uuid[])`);
expect((await as(U1, `select public.modulos_da_org('${o1}') r`)).rows[0].r.mercado==='liberado','organização de teste vê o módulo em teste');
expect((await as(U2, `select public.modulos_da_org('${o2}') r`)).rows[0].r.mercado==='oculto','demais organizações não veem o módulo em teste');
expect(Object.keys((await as(U2, `select public.admin_modulos() r`)).rows[0].r).includes('mercado'),'master lista as liberações');

// avisos: quem entrou depois não vê aviso antigo
await db.exec(`insert into public.plataforma_avisos(titulo, texto, publicar_em) values ('Aviso antigo', 'Texto do aviso antigo', now() - interval '1 day')`);
expect((await as(U1, `select count(*)::int n from public.plataforma_avisos where titulo='Aviso antigo'`)).rows[0].n === 0, 'membro novo não vê aviso publicado antes da entrada');
await db.exec(`update public.memberships set created_at = now() - interval '3 days' where org_id='${o1}'`);
expect((await as(U1, `select count(*)::int n from public.plataforma_avisos where titulo='Aviso antigo'`)).rows[0].n === 1, 'membro antigo continua vendo o aviso');

// cupons
await as(U2, `select public.admin_salvar_cupom('teste30', 'dias', 30, null, 'Trinta dias', null, 1, true)`);
await as(U2, `select public.admin_salvar_cupom('DEZ', 'percentual', 10)`);
expect((await as(U1, `select count(*)::int n from public.cupons`)).rows[0].n === 0, 'cliente não lista os cupons');
blocked=false;try{await as(U1, `select public.admin_salvar_cupom('HACK', 'dias', 365)`);}catch{blocked=true;}
expect(blocked, 'cliente não cria cupom');
const antes = (await db.query(`select trial_ate::text t from public.organizations where id='${o1}'`)).rows[0].t;
const r = (await as(U1, `select public.resgatar_cupom_dias('Teste30', '${o1}') r`)).rows[0].r;
const depois = (await db.query(`select trial_ate::text t from public.organizations where id='${o1}'`)).rows[0].t;
expect(r.tipo === 'dias' && r.ate === depois && (new Date(depois) - new Date(antes)) / 86400000 === 30, 'cupom de dias soma os dias ao acesso');
await as(U1, `update public.organizations set trial_ate = '2099-01-01' where id = '${o1}'`);
expect((await db.query(`select trial_ate::text t from public.organizations where id='${o1}'`)).rows[0].t === depois, 'cliente continua sem mudar o prazo do teste direto');
blocked=false;try{await as(U1, `select public.resgatar_cupom_dias('TESTE30', '${o1}')`);}catch{blocked=true;}
expect(blocked, 'a mesma organização não usa o cupom duas vezes');
blocked=false;try{await as(U2, `select public.resgatar_cupom_dias('TESTE30', '${o2}')`);}catch{blocked=true;}
expect(blocked, 'cupom respeita o limite de usos');
blocked=false;try{await as(U1, `select public.resgatar_cupom_dias('DEZ', '${o1}')`);}catch{blocked=true;}
expect(blocked, 'cupom de desconto não vira dias de acesso');
blocked=false;try{await as(U1, `select public.registrar_cupom_desconto('DEZ', '${o1}', '${U1}', null)`);}catch{blocked=true;}
expect(blocked, 'cliente não consome cupom de desconto direto');

// logs
await as(U2, `insert into public.plataforma_logs(titulo, texto, publico) values ('Log interno', 'x', false), ('Novidade', 'y', true)`);
expect((await as(U1, `select string_agg(titulo, ',') t from public.plataforma_logs`)).rows[0].t === 'Novidade', 'cliente vê só os logs públicos');
blocked=false;try{await as(U1, `insert into public.plataforma_logs(titulo) values ('Hack log')`);}catch{blocked=true;}
expect(blocked, 'cliente não cria log');

// delete em cascata da org
await as(U1, `delete from public.organizations where id = '${o1}'`);
expect((await db.query(`select count(*)::int c from public.processos`)).rows[0].c === 0, 'excluir organização remove dados em cascata');

console.log(fails ? `\n${fails} falha(s)` : '\nTodos os testes passaram');
process.exit(fails ? 1 : 0);
