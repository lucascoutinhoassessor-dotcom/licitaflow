import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { KeyRound, Mail, Send } from 'lucide-react'
import { supabase, mensagemErro, fetchComSessao } from '@/lib/supabase'
import { Button, Campo, Input, Select } from '@/components/ui'

/** Chama as ações do master em /api/usuarios (editar login, redefinição de senha, liberação da conta). */
export async function acaoUsuarioMaster(dados: Record<string, unknown>) {
  const r = await fetchComSessao('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Não foi possível concluir agora')
  return j as { ok: true; para?: string }
}

/** Nome e tipo da organização. */
export function DadosOrgMaster({ org, nome, tipo, aoSalvar }: { org: string; nome: string; tipo: string; aoSalvar: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ nome, tipo: tipo || 'fornecedor' })
  const [salvando, setSalvando] = useState(false)
  async function salvar(e: FormEvent) {
    e.preventDefault(); setSalvando(true)
    try {
      const { error } = await supabase.rpc('admin_dados_org', { p_org: org, p_nome: f.nome, p_tipo: f.tipo })
      if (error) throw error
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin-orgs'] }), qc.invalidateQueries({ queryKey: ['admin-cliente', org] })])
      toast.success('Dados da organização salvos.'); aoSalvar()
    } catch (err) { toast.error(mensagemErro(err)) } finally { setSalvando(false) }
  }
  return (
    <form onSubmit={salvar} className="space-y-4">
      <Campo rotulo="Nome da organização" htmlFor="org-nome"><Input id="org-nome" required minLength={2} maxLength={120} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
      <Campo rotulo="Tipo" htmlFor="org-tipo"><Select id="org-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="fornecedor">Fornecedor</option><option value="assessoria">Assessoria</option></Select></Campo>
      <Button type="submit" carregando={salvando}>Salvar</Button>
    </form>
  )
}

/** Tudo do login de um membro: nome, e-mail, senha, confirmação, e os envios de redefinição e de liberação da conta. */
export function EditarMembroMaster({ org, membro, aoSalvar }: { org: string; membro: { id: string; nome: string | null; email: string }; aoSalvar: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ nome: membro.nome ?? '', email: membro.email, senha: '' })
  const [comSenha, setComSenha] = useState(false)
  const [ocupado, setOcupado] = useState('')
  const recarregar = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin-cliente', org] }), qc.invalidateQueries({ queryKey: ['admin-usuarios'] }), qc.invalidateQueries({ queryKey: ['admin-orgs'] })])
  async function salvar(e: FormEvent) {
    e.preventDefault()
    const dados: Record<string, unknown> = { acao: 'editar_usuario', usuario: membro.id }
    if (f.nome.trim() !== (membro.nome ?? '')) dados.nome = f.nome
    if (f.email.trim().toLowerCase() !== membro.email) dados.email = f.email
    if (f.senha) dados.senha = f.senha
    if (Object.keys(dados).length === 2) return toast.info('Nada foi alterado.')
    if (dados.email && !confirm(`Trocar o e-mail de login de ${membro.email} para ${f.email.trim().toLowerCase()}? A pessoa passa a entrar com o novo e-mail.`)) return
    setOcupado('salvar')
    try { await acaoUsuarioMaster(dados); await recarregar(); toast.success('Dados do usuário salvos e registrados na auditoria.'); aoSalvar() }
    catch (err) { toast.error(mensagemErro(err)) } finally { setOcupado('') }
  }
  async function enviar(acao: 'enviar_redefinicao' | 'enviar_liberacao') {
    setOcupado(acao)
    try {
      const r = await acaoUsuarioMaster({ acao, usuario: membro.id, org, com_senha: comSenha })
      toast.success(acao === 'enviar_redefinicao' ? `Link de redefinição enviado para ${r.para}.` : `E-mail de liberação enviado para ${r.para}.`)
    } catch (err) { toast.error(mensagemErro(err)) } finally { setOcupado('') }
  }
  return (
    <div className="space-y-5">
      <form onSubmit={salvar} className="space-y-4">
        <Campo rotulo="Nome" htmlFor="mb-nome"><Input id="mb-nome" minLength={2} maxLength={120} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="E-mail de login" htmlFor="mb-email"><Input id="mb-email" type="email" required maxLength={254} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo rotulo="Nova senha (opcional)" htmlFor="mb-senha" ajuda="Deixe em branco para manter a senha atual. Prefira mandar o link de redefinição.">
          <Input id="mb-senha" type="password" autoComplete="new-password" minLength={8} maxLength={72} value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} />
        </Campo>
        <Button type="submit" carregando={ocupado === 'salvar'}>Salvar alterações</Button>
      </form>
      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Envios por e-mail</p>
        <Button variante="contorno" className="w-full justify-start" carregando={ocupado === 'enviar_redefinicao'} disabled={!!ocupado} onClick={() => enviar('enviar_redefinicao')}><KeyRound className="h-4 w-4" />Enviar link de redefinição de senha</Button>
        <div className="rounded-lg border p-3">
          <Button variante="contorno" className="w-full justify-start" carregando={ocupado === 'enviar_liberacao'} disabled={!!ocupado} onClick={() => enviar('enviar_liberacao')}><Send className="h-4 w-4" />Enviar liberação da conta</Button>
          <label className="mt-2 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" className="mt-0.5" checked={comSenha} onChange={(e) => setComSenha(e.target.checked)} />Incluir link para a pessoa criar a senha (para contas criadas pelo master). Também confirma o e-mail, se ainda não estiver confirmado.</label>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" />Usa o e-mail da plataforma configurado em Integrações. Tudo fica na auditoria.</p>
      </div>
    </div>
  )
}
