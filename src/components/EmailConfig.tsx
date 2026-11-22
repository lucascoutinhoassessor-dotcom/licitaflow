import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, EyeOff, Mail, Save, Send } from 'lucide-react'
import { supabase, mensagemErro } from '@/lib/supabase'
import { formatarDataHora } from '@/lib/format'
import { pagamentoAPI } from '@/lib/pagamentos'
import { Aviso, Badge, Button, Card, Carregando, Input } from '@/components/ui'

interface Status { ativo: boolean; host: string | null; porta: number; usuario: string | null; tem_senha: boolean; remetente_nome: string; testado_em: string | null }

/** E-mails dos clientes (confirmação de cadastro, esqueci minha senha, acesso liberado) pelo Gmail com senha de app. */
export function EmailConfig() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['email-status'], queryFn: async () => {
    const { data, error } = await supabase.rpc('admin_email_status'); if (error) throw error; return data as Status
  }, retry: false })
  const [f, setF] = useState({ usuario: '', senha: '', nome: 'LicitaFlow', host: 'smtp.gmail.com', porta: '465' })
  const [ver, setVer] = useState(false)
  const [ocupado, setOcupado] = useState('')
  useEffect(() => {
    if (q.data) setF(x => ({ ...x, usuario: q.data.usuario ?? '', nome: q.data.remetente_nome || 'LicitaFlow', host: q.data.host || 'smtp.gmail.com', porta: String(q.data.porta || 465) }))
  }, [q.data])

  async function salvar() {
    setOcupado('salvar')
    try {
      await pagamentoAPI({ acao: 'email_salvar', usuario: f.usuario, senha: f.senha || undefined, remetente_nome: f.nome, host: f.host, porta: Number(f.porta) || 465 })
      setF(x => ({ ...x, senha: '' }))
      await qc.invalidateQueries({ queryKey: ['email-status'] })
      toast.success('E-mail salvo. Agora clique em “Enviar e-mail de teste”.')
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }
  async function testar() {
    setOcupado('testar')
    try {
      const r = await pagamentoAPI({ acao: 'email_testar' })
      await qc.invalidateQueries({ queryKey: ['email-status'] })
      toast.success(`E-mail de teste enviado para ${r.para}. Confira a caixa de entrada.`)
    } catch (e) { toast.error(mensagemErro(e)) } finally { setOcupado('') }
  }

  const s = q.data
  const configurado = !!(s?.ativo && s.tem_senha)
  return <Card className="space-y-4 p-5">
    <div className="flex flex-wrap items-center gap-2">
      <Mail className="h-5 w-5 text-primary" /><h2 className="flex-1 font-semibold">E-mail (acesso e senha dos clientes)</h2>
      {s && <Badge cor={configurado ? 'verde' : 'amarelo'}>{configurado ? 'Configurado' : 'Não configurado'}</Badge>}
    </div>
    <p className="text-sm text-muted-foreground">Usado para confirmar o cadastro, mandar o link de “Esqueci minha senha” e avisar que o acesso foi liberado quando o cliente paga. Os e-mails saem com o nome e o logo do LicitaFlow. Com Gmail é grátis (até ~500 e-mails por dia).</p>
    {q.isError && <Aviso>{mensagemErro(q.error)}</Aviso>}
    {q.isLoading && <Carregando />}
    {s && <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input aria-label="Seu Gmail" type="email" placeholder="Seu Gmail (ex.: contato.licitaflow@gmail.com)" value={f.usuario} onChange={e => setF({ ...f, usuario: e.target.value })} />
        <div className="relative">
          <Input aria-label="Senha de app do Google" className="pr-10" type={ver ? 'text' : 'password'} autoComplete="new-password"
            placeholder={s.tem_senha ? 'Senha de app salva ✓ (preencha só para trocar)' : 'Senha de app do Google (16 letras)'}
            value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} />
          <button type="button" onClick={() => setVer(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Mostrar ou ocultar a senha">
            {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Input aria-label="Nome do remetente" placeholder="Nome do remetente (ex.: LicitaFlow)" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} />
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer py-2">Outro provedor (SMTP)</summary>
          <div className="grid grid-cols-3 gap-2">
            <Input aria-label="Servidor SMTP" className="col-span-2" placeholder="smtp.gmail.com" value={f.host} onChange={e => setF({ ...f, host: e.target.value })} />
            <Input aria-label="Porta" placeholder="465" value={f.porta} onChange={e => setF({ ...f, porta: e.target.value })} />
          </div>
        </details>
      </div>
      <p className="text-xs text-muted-foreground">Senha de app: na conta Google, ative a verificação em duas etapas e crie em <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a>. Não é a senha normal do Gmail.{s.testado_em ? ` Último teste: ${formatarDataHora(s.testado_em)}.` : ''}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variante="contorno" carregando={ocupado === 'testar'} disabled={!!ocupado || !configurado} onClick={testar}><Send className="h-4 w-4" />Enviar e-mail de teste</Button>
        <Button carregando={ocupado === 'salvar'} disabled={!!ocupado || !f.usuario.trim()} onClick={salvar}><Save className="h-4 w-4" />Salvar</Button>
      </div>
    </>}
  </Card>
}
