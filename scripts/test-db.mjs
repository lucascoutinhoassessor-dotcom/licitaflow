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
blocked = false;
try { await as(U2, `delete from public.admin_audit`); } catch { blocked = true; }
expect((await as(U2, `select * from public.admin_audit`)).rows.length > 0, 'master não apaga histórico pela API');
expect((await as(U2, `select * from public.site_content_history`)).rows.length === 2, 'histórico guarda rascunho e publicação');

await as(U2, `select public.admin_atualizar_org('${o1}', 'profissional', current_date, false, null, 'Nota confidencial de atendimento')`);
expect((await as(U1, `select notas_admin from public.organizations where id='${o1}'`)).rows[0].notas_admin === null, 'notas internas não vazam pela organização do cliente');
expect((await as(U1, `select * from public.organization_admin_notes`)).rows.length === 0, 'cliente não acessa a tabela privada de notas');
expect((await as(U2, `select * from public.admin_organizacoes()`)).rows.find(o=>o.id===o1).notas_admin === 'Nota confidencial de atendimento', 'master continua consultando notas internas');

// delete em cascata da org
await as(U1, `delete from public.organizations where id = '${o1}'`);
expect((await db.query(`select count(*)::int c from public.processos`)).rows[0].c === 0, 'excluir organização remove dados em cascata');

console.log(fails ? `\n${fails} falha(s)` : '\nTodos os testes passaram');
process.exit(fails ? 1 : 0);
