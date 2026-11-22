import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Mail } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { pagamentoAPI } from '@/lib/pagamentos'
import { Aviso, Badge, Button, Campo, Card, Input, Select } from '@/components/ui'

interface Status { ativo: boolean; host: string | null; porta: number; usuario: string | null; tem_senha: boolean; remetente_nome: string; remetente_email: string | null; boas_vindas: boolean; testado_em: string | null; enviados_30d: number }

/** Provedores comuns: preenchem servidor, porta e usuário. */
const PROVEDORES = {
  gmail: { rotulo: 'Gmail (senha de app)', host: 'smtp.gmail.com', porta: '465', usuario: '', ajuda: 'Conta Google com verificação em duas etapas → Segurança → Senhas de app. Use o próprio Gmail como usuário e remetente. Limite de cerca de 500 e-mails por dia.' },
  resend: { rotulo: 'Resend', host: 'smtp.resend.com', porta: '465', usuario: 'resend', ajuda: 'A senha é a chave de API do Resend. Exige um domínio próprio verificado no Resend para o remetente.' },
  brevo: { rotulo: 'Brevo', host: 'smtp-relay.brevo.com', porta: '587', usuario: '', ajuda: 'Brevo → SMTP e API → chave SMTP. O usuário é o login SMTP mostrado lá. Plano grátis: 300 e-mails por dia.' },
  outro: { rotulo: 'Outro servidor', host: '', porta: '465', usuario: '', ajuda: 'Dados do servidor SMTP do seu provedor de e-mail.' },
} as const
type Provedor = keyof typeof PROVEDORES

function provedorDe(host: string | null): Provedor {
  return (Object.keys(PROVEDORES) as Provedor[]).find(p => p !== 'outro' && PROVEDORES[p].host === host) ?? 'outro'
}

/** SMTP da plataforma: e-mail de acesso liberado após o pagamento. A senha vai só para o servidor, cifrada. */
export function EmailConfig() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['email-status'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_email_status'); if (error) throw error; return data as Status
  }, retry: false })
  const [prov, setProv] = useState<Provedor>('gmail')
  const [f, setF] = useState({ host: '', porta: '465', usuario: '', senha: '', nome: 'LicitaFlow', remetente: '', boasVindas: true, para: '' })
  const [ocupado, setOcupado] = useState('')
  useEffect(() => {
    if (!q.data) return
    const s = q.data
    if (s.host) setProv(provedorDe(s.host))
    setF(x => ({ ...x, host: s.host ?? x.host, porta: String(s.porta), usuario: s.usuario ?? '', nome: s.remetente_nome, remetente: s.remetente_email ?? '', boasVindas: s.boas_vindas }))
  }, [q.data])

  function escolher(p: Provedor) {
    setProv(p)
    const d = PROVEDORES[p]
    setF(x => ({ ...x, host: d.host || x.host, porta: d.porta, usuario: d.usuario || (p === 'gmail' ? x.remetente : x.usuario) }))
  }

  async function salvar(ativo?: boolean) {
    setOcupado(ativo === undefined ? 'salvar' : 'ativar')
    try {
      await pagamentoAPI({ acao: 'email_salvar', host: f.host, porta: Number(f.porta), usuario: f.usuario, senha: f.senha || undefined,
        remetente_email: f.remetente, remetente_nome: f.nome, boas_vindas: f.boasVindas, ...(ativo === undefined ? {} : { ativo }) })
      setF(x => ({ ...x, senha: '' }))
      await qc.invalidateQueries({ queryKey: ['email-status'] })
      toast.success(ativo === undefined ? 'Configuração de e-mail salva.' : ativo ? 'Envio de e-mails ativado.' : 'Envio de e-mails desativado.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }
  async function testar() {
    setOcupado('testar')
    try {
      const r = await pagamentoAPI({ acao: 'email_testar', para: f.para || undefined })
      await qc.invalidateQueries({ queryKey: ['email-status'] })
      toast.success(`E-mail de teste enviado para ${r.para}. Confira a caixa de entrada e o spam.`)
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }

  const s = q.data
  return <Card className="space-y-5 p-5">
    <div className="flex flex-wrap items-center gap-2">
      <Mail className="h-5 w-5 text-primary" /><h2 className="flex-1 font-semibold">E-mail da plataforma (SMTP)</h2>
      {s && <Badge cor={s.ativo ? 'verde' : 'amarelo'}>{s.ativo ? 'Envio ativo' : 'Desativado'}</Badge>}
    </div>
    {q.isError && <Aviso>{mensagemErro(q.error)} — aplique a migração de e-mail da plataforma.</Aviso>}
    {s && <>
      <p className="text-sm text-muted-foreground">Envia ao cliente o e-mail <strong>“Pagamento confirmado: seu acesso está liberado”</strong> no primeiro pagamento de cada assinatura. Recibos e faturas continuam saindo pelo Asaas.</p>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <p>Senha: <strong>{s.tem_senha ? 'cadastrada' : 'ausente'}</strong></p>
        <p>Último teste: <strong>{s.testado_em ? formatarDataHora(s.testado_em) : 'nunca'}</strong></p>
        <p>Acessos liberados avisados (30 dias): <strong>{s.enviados_30d}</strong></p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Campo rotulo="Provedor" htmlFor="smtp-prov" ajuda={PROVEDORES[prov].ajuda}>
          <Select id="smtp-prov" value={prov} onChange={e => escolher(e.target.value as Provedor)}>
            {(Object.keys(PROVEDORES) as Provedor[]).map(p => <option key={p} value={p}>{PROVEDORES[p].rotulo}</option>)}
          </Select></Campo>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Campo rotulo="Servidor SMTP" htmlFor="smtp-host"><Input id="smtp-host" value={f.host} onChange={e => setF({ ...f, host: e.target.value })} placeholder="smtp.exemplo.com" /></Campo></div>
          <Campo rotulo="Porta" htmlFor="smtp-porta"><Select id="smtp-porta" value={f.porta} onChange={e => setF({ ...f, porta: e.target.value })}>{['465', '587', '2525', '25'].map(p => <option key={p}>{p}</option>)}</Select></Campo>
        </div>
        <Campo rotulo="Remetente (e-mail)" htmlFor="smtp-de"><Input id="smtp-de" type="email" value={f.remetente} onChange={e => setF({ ...f, remetente: e.target.value, ...(prov === 'gmail' ? { usuario: e.target.value } : {}) })} placeholder="contato@seudominio.com.br" /></Campo>
        <Campo rotulo="Nome do remetente" htmlFor="smtp-nome"><Input id="smtp-nome" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="Usuário SMTP" htmlFor="smtp-user"><Input id="smtp-user" autoComplete="off" value={f.usuario} onChange={e => setF({ ...f, usuario: e.target.value })} /></Campo>
        <Campo rotulo={s.tem_senha ? 'Nova senha / chave (deixe vazio para manter)' : 'Senha / chave SMTP'} htmlFor="smtp-senha" ajuda="Fica cifrada no servidor e nunca volta para a tela.">
          <Input id="smtp-senha" type="password" autoComplete="new-password" value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} /></Campo>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.boasVindas} onChange={e => setF({ ...f, boasVindas: e.target.checked })} />Enviar “acesso liberado” no primeiro pagamento de cada assinatura</label>

      <div className="flex flex-wrap gap-2">
        <Button carregando={ocupado === 'salvar'} disabled={!!ocupado} onClick={() => salvar()}>Salvar configuração</Button>
        <Button variante={s.ativo ? 'contorno' : 'primario'} carregando={ocupado === 'ativar'} disabled={!!ocupado} onClick={() => salvar(!s.ativo)}>{s.ativo ? 'Desativar envio' : 'Ativar envio'}</Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1"><Campo rotulo="Enviar teste para (vazio = seu e-mail)" htmlFor="smtp-para"><Input id="smtp-para" type="email" value={f.para} onChange={e => setF({ ...f, para: e.target.value })} /></Campo></div>
        <Button variante="contorno" carregando={ocupado === 'testar'} disabled={!!ocupado || !s.tem_senha} onClick={testar}>Enviar e-mail de teste</Button>
      </div>

      <div className="space-y-2 rounded-md border p-4 text-sm">
        <h3 className="font-medium">Cadastro e “Esqueci minha senha” (Supabase)</h3>
        <p className="text-muted-foreground">Esses dois e-mails saem pelo Supabase, não por aqui. Sem SMTP próprio, o Supabase só entrega para a equipe do projeto e poucas vezes por hora. Use os mesmos dados:</p>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Supabase → Authentication → Emails → SMTP Settings → ativar <em>Custom SMTP</em> com servidor, porta, usuário, senha e remetente acima.</li>
          <li>Authentication → URL Configuration: Site URL <span className="font-mono text-xs text-foreground">https://licitaflow-prod.vercel.app</span> e, em Redirect URLs, <span className="font-mono text-xs text-foreground">https://licitaflow-prod.vercel.app/**</span>.</li>
          <li>Authentication → Rate Limits: aumentar o limite de e-mails por hora (ex.: 100).</li>
          <li>Testar: criar uma conta com um e-mail de fora e usar “Esqueci minha senha”.</li>
        </ol>
      </div>
    </>}
  </Card>
}
