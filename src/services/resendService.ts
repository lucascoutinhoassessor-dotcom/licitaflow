/**
 * Serviço de e-mails transacionais via Resend
 * Documentação: https://resend.com/docs
 */

const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY || '';
const FROM_EMAIL = 'LicitaFlow <noreply@licitaflow.com.br>';
const FROM_SUPPORT = 'Suporte LicitaFlow <suporte@licitaflow.com.br>';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer | string }[];
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

class ResendService {
  private apiKey: string = RESEND_API_KEY;

  /**
   * Enviar e-mail
   */
  async send(options: EmailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.apiKey) {
      console.warn('Resend API key não configurada');
      // Simular envio bem-sucedido
      return { success: true, id: 'simulated_' + Date.now() };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro ao enviar e-mail: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, id: data.id };
    } catch (error) {
      console.error('Erro ao enviar e-mail:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ============================================
  // TEMPLATES DE E-MAIL
  // ============================================

  /**
   * Template: Boas-vindas
   */
  getWelcomeTemplate(name: string, email: string): EmailTemplate {
    return {
      subject: 'Bem-vindo ao LicitaFlow! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; padding: 30px 0;">
            <h1 style="color: #3B82F6; margin: 0;">LicitaFlow</h1>
          </div>

          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; border-radius: 16px; text-align: center; margin-bottom: 30px;">
            <h2 style="margin: 0 0 10px 0;">Bem-vindo, ${name}!</h2>
            <p style="margin: 0; opacity: 0.9;">Sua conta foi criada com sucesso</p>
          </div>

          <div style="background: #f8fafc; padding: 30px; border-radius: 12px; margin-bottom: 30px;">
            <h3 style="color: #1e293b; margin-top: 0;">O que você pode fazer no LicitaFlow:</h3>
            <ul style="padding-left: 20px;">
              <li>📊 Acompanhar editais em tempo real</li>
              <li>📈 Gerenciar seu funil de vendas</li>
              <li>💼 Controlar contratos e pagamentos</li>
              <li>🔔 Receber alertas personalizados</li>
            </ul>
          </div>

          <div style="text-align: center; margin-bottom: 30px;">
            <a href="https://licitaflow.com.br/dashboard" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Acessar minha conta</a>
          </div>

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

          <p style="color: #64748b; font-size: 14px; text-align: center;">
            Em caso de dúvidas, entre em contato com nosso suporte:<br>
            <a href="mailto:suporte@licitaflow.com.br" style="color: #3B82F6;">suporte@licitaflow.com.br</a>
          </p>
        </body>
        </html>
      `,
      text: `Bem-vindo ao LicitaFlow!\n\nOlá ${name},\n\nSua conta foi criada com sucesso. Você pode agora acessar sua conta e começar a usar o LicitaFlow.\n\nAtenciosamente,\nEquipe LicitaFlow`,
    };
  }

  /**
   * Template: Confirmação de e-mail
   */
  getEmailConfirmationTemplate(name: string, confirmUrl: string): EmailTemplate {
    return {
      subject: 'Confirme seu e-mail - LicitaFlow',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; padding: 30px 0;">
            <h1 style="color: #3B82F6; margin: 0;">LicitaFlow</h1>
          </div>

          <div style="background: #f8fafc; padding: 40px 30px; border-radius: 12px;">
            <h2 style="color: #1e293b; margin-top: 0;">Confirme seu e-mail</h2>
            <p>Olá ${name},</p>
            <p>Você precisa confirmar seu e-mail para ativar sua conta. Clique no botão abaixo:</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${confirmUrl}" style="display: inline-block; background: #10B981; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Confirmar e-mail</a>
            </div>

            <p style="color: #64748b; font-size: 14px;">
              Se você não criou uma conta no LicitaFlow, ignore este e-mail.<br>
              Este link expira em 24 horas.
            </p>
          </div>
        </body>
        </html>
      `,
      text: `Confirme seu e-mail - LicitaFlow\n\nOlá ${name},\n\nVocê precisa confirmar seu e-mail para ativar sua conta. Acesse o link abaixo:\n\n${confirmUrl}\n\nSe você não criou uma conta no LicitaFlow, ignore este e-mail.\nEste link expira em 24 horas.`,
    };
  }

  /**
   * Template: Redefinição de senha
   */
  getPasswordResetTemplate(name: string, resetUrl: string): EmailTemplate {
    return {
      subject: 'Redefinir senha - LicitaFlow',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; padding: 30px 0;">
            <h1 style="color: #3B82F6; margin: 0;">LicitaFlow</h1>
          </div>

          <div style="background: #f8fafc; padding: 40px 30px; border-radius: 12px;">
            <h2 style="color: #1e293b; margin-top: 0;">Redefinir senha</h2>
            <p>Olá ${name},</p>
            <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo:</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: #EF4444; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Redefinir senha</a>
            </div>

            <p style="color: #64748b; font-size: 14px;">
              Se você não solicitou a redefinição de senha, ignore este e-mail.<br>
              Este link expira em 1 hora.
            </p>
          </div>
        </body>
        </html>
      `,
      text: `Redefinir senha - LicitaFlow\n\nOlá ${name},\n\nRecebemos uma solicitação para redefinir sua senha. Acesse o link abaixo:\n\n${resetUrl}\n\nSe você não solicitou a redefinição de senha, ignore este e-mail.\nEste link expira em 1 hora.`,
    };
  }

  /**
   * Template: Novo edital encontrado
   */
  getNewEditalAlertTemplate(name: string, edital: {
    numero: string;
    titulo: string;
    orgao: string;
    valor: number;
    encerramento: string;
    url: string;
  }): EmailTemplate {
    return {
      subject: `🔔 Novo edital: ${edital.numero} - ${edital.titulo.substring(0, 50)}...`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; padding: 20px 0;">
            <h1 style="color: #3B82F6; margin: 0;">LicitaFlow</h1>
            <p style="color: #64748b; margin: 5px 0 0 0;">Alerta de Nova Licitação</p>
          </div>

          <div style="background: #FEF3C7; padding: 20px; border-radius: 12px; border-left: 4px solid #F59E0B; margin-bottom: 20px;">
            <strong style="color: #92400E;">🚨 Novo edital encontrado!</strong>
          </div>

          <div style="background: #f8fafc; padding: 30px; border-radius: 12px;">
            <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">${edital.titulo}</h2>

            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; color: #64748b;">Número:</td>
                <td style="padding: 10px 0; font-weight: 600;">${edital.numero}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b;">Órgão:</td>
                <td style="padding: 10px 0;">${edital.orgao}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b;">Valor estimado:</td>
                <td style="padding: 10px 0; font-weight: 600; color: #059669;">R$ ${edital.valor.toLocaleString('pt-BR')}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b;">Encerra em:</td>
                <td style="padding: 10px 0; color: #DC2626;">${new Date(edital.encerramento).toLocaleDateString('pt-BR')}</td>
              </tr>
            </table>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${edital.url}" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver edital completo</a>
            </div>
          </div>

          <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 20px;">
            Você está recebendo este e-mail porque configurou alertas no LicitaFlow.<br>
            <a href="#" style="color: #3B82F6;">Gerenciar alertas</a>
          </p>
        </body>
        </html>
      `,
      text: `Novo Edital - LicitaFlow\n\nOlá ${name},\n\nEncontramos um novo edital que pode interessar:\n\n${edital.titulo}\n\nNúmero: ${edital.numero}\nÓrgão: ${edital.orgao}\nValor: R$ ${edital.valor.toLocaleString('pt-BR')}\nEncerra em: ${new Date(edital.encerramento).toLocaleDateString('pt-BR')}\n\nAcesse: ${edital.url}`,
    };
  }

  /**
   * Template: Notificação de novo lead
   */
  getNewLeadNotificationTemplate(lead: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
    cnpj?: string;
    message?: string;
  }): EmailTemplate {
    return {
      subject: `🎯 Novo Lead - ${lead.name} solicitou demonstração`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; padding: 20px 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0;">🎯 Novo Lead - LicitaFlow</h1>
          </div>

          <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <div style="background: #DBEAFE; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #3B82F6;">
              <strong style="color: #1E40AF;">Nova solicitação de demonstração!</strong>
            </div>

            <h2 style="color: #1e293b; margin-top: 0;">Dados do Lead:</h2>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b; width: 120px;"><strong>Nome:</strong></td>
                <td style="padding: 12px 0; font-weight: 600;">${lead.name}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b;"><strong>E-mail:</strong></td>
                <td style="padding: 12px 0;">
                  <a href="mailto:${lead.email}" style="color: #3B82F6; text-decoration: none;">${lead.email}</a>
                </td>
              </tr>
              ${lead.phone ? `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b;"><strong>Telefone:</strong></td>
                <td style="padding: 12px 0;">${lead.phone}</td>
              </tr>
              ` : ''}
              ${lead.company ? `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b;"><strong>Empresa:</strong></td>
                <td style="padding: 12px 0;">${lead.company}</td>
              </tr>
              ` : ''}
              ${lead.cnpj ? `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 12px 0; color: #64748b;"><strong>CNPJ:</strong></td>
                <td style="padding: 12px 0;">${lead.cnpj}</td>
              </tr>
              ` : ''}
            </table>

            ${lead.message ? `
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">Mensagem:</h3>
              <p style="margin: 0; color: #64748b; white-space: pre-wrap;">${lead.message}</p>
            </div>
            ` : ''}

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://licitaflow.com.br/leads" style="display: inline-block; background: #3B82F6; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver no Painel de Leads</a>
            </div>

            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

            <p style="color: #64748b; font-size: 12px; text-align: center;">
              Este é um e-mail automático do LicitaFlow.<br>
              Data e hora: ${new Date().toLocaleString('pt-BR')}
            </p>
          </div>
        </body>
        </html>
      `,
      text: `Novo Lead - LicitaFlow

Nome: ${lead.name}
E-mail: ${lead.email}
${lead.phone ? `Telefone: ${lead.phone}\n` : ''}${lead.company ? `Empresa: ${lead.company}\n` : ''}${lead.cnpj ? `CNPJ: ${lead.cnpj}\n` : ''}
${lead.message ? `Mensagem: ${lead.message}\n` : ''}

Acesse o painel: https://licitaflow.com.br/leads`,
    };
  }

  /**
   * Template: Convite de acesso antecipado
   */
  getEarlyAccessInviteTemplate(name: string, accessLink: string): EmailTemplate {
    return {
      subject: `🚀 Seu acesso antecipado ao LicitaFlow está pronto!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; padding: 30px 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🎯 LicitaFlow</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Gestão Inteligente de Licitações</p>
          </div>

          <div style="background: #f8fafc; padding: 40px 30px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0; border-top: none;">
            <h2 style="color: #1e293b; margin-top: 0;">Olá ${name},</h2>
            
            <div style="background: #DBEAFE; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3B82F6;">
              <strong style="color: #1E40AF;">🎉 Parabéns! Seu acesso antecipado foi aprovado!</strong>
            </div>

            <p style="color: #475569; font-size: 16px; line-height: 1.8;">
              Você foi selecionado para testar o <strong>LicitaFlow</strong> antes do lançamento oficial. 
              Estamos muito felizes em ter você conosco!
            </p>

            <div style="background: white; padding: 25px; border-radius: 8px; margin: 25px 0; border: 1px solid #e2e8f0;">
              <h3 style="margin: 0 0 15px 0; color: #1e293b;">🚀 Como acessar:</h3>
              <p style="margin: 0 0 20px 0; color: #64748b;">
                Clique no botão abaixo para acessar sua conta:
              </p>
              
              <div style="text-align: center;">
                <a href="${accessLink}" 
                   style="display: inline-block; background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%); color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);">
                  Acessar LicitaFlow
                </a>
              </div>

              <p style="margin: 20px 0 0 0; font-size: 12px; color: #94a3b8; text-align: center;">
                O link é válido por 7 dias. Se expirar, solicite um novo.
              </p>
            </div>

            <div style="background: #F0FDF4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10B981;">
              <h4 style="margin: 0 0 10px 0; color: #166534;">💡 Dicas para começar:</h4>
              <ul style="margin: 0; padding-left: 20px; color: #166534;">
                <li>Explore o dashboard e familiarize-se com a interface</li>
                <li>Cadastre sua primeira empresa</li>
                <li>Configure alertas de editais do seu interesse</li>
                <li>Teste o funil de prospecção</li>
              </ul>
            </div>

            <div style="margin: 30px 0; padding: 20px; background: #FEF3C7; border-radius: 8px; border-left: 4px solid #F59E0B;">
              <p style="margin: 0; color: #92400E; font-size: 14px;">
                <strong>📧 Precisa de ajuda?</strong><br>
                Responda este email ou entre em contato conosco. 
                Estamos aqui para ajudar você a aproveitar ao máximo o LicitaFlow!
              </p>
            </div>

            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

            <p style="color: #64748b; font-size: 12px; text-align: center;">
              Este é um email automático do LicitaFlow.<br>
              Data do envio: ${new Date().toLocaleString('pt-BR')}
            </p>
          </div>
        </body>
        </html>
      `,
      text: `LicitaFlow - Acesso Antecipado Aprovado!

Olá ${name},

Parabéns! Seu acesso antecipado ao LicitaFlow foi aprovado!

Acesse agora: ${accessLink}

O link é válido por 7 dias.

Dicas para começar:
- Explore o dashboard
- Cadastre sua empresa
- Configure alertas de editais
- Teste o funil de prospecção

Precisa de ajuda? Responda este email.

---
LicitaFlow - Gestão Inteligente de Licitações`,
    };
  }

  getProposalSubmittedTemplate(name: string, proposta: {
    numero: string;
    titulo: string;
    valor: number;
    prazo: string;
  }): EmailTemplate {
    return {
      subject: `✅ Proposta enviada: ${proposta.numero}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; padding: 20px 0;">
            <h1 style="color: #3B82F6; margin: 0;">LicitaFlow</h1>
          </div>

          <div style="background: #D1FAE5; padding: 20px; border-radius: 12px; border-left: 4px solid #10B981; margin-bottom: 20px;">
            <strong style="color: #065F46;">✅ Proposta enviada com sucesso!</strong>
          </div>

          <div style="background: #f8fafc; padding: 30px; border-radius: 12px;">
            <p>Olá ${name},</p>
            <p>Sua proposta foi enviada com sucesso para o edital:</p>

            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0;">${proposta.titulo}</h3>
              <p style="margin: 5px 0; color: #64748b;">Número: ${proposta.numero}</p>
              <p style="margin: 5px 0; color: #059669; font-weight: 600;">Valor proposto: R$ ${proposta.valor.toLocaleString('pt-BR')}</p>
              <p style="margin: 5px 0; color: #64748b;">Resultado em: ${proposta.prazo}</p>
            </div>

            <p>Acompanhe o andamento da sua proposta no LicitaFlow.</p>
          </div>
        </body>
        </html>
      `,
      text: `Proposta Enviada - LicitaFlow\n\nOlá ${name},\n\nSua proposta foi enviada com sucesso!\n\nEdital: ${proposta.titulo}\nNúmero: ${proposta.numero}\nValor: R$ ${proposta.valor.toLocaleString('pt-BR')}\nResultado em: ${proposta.prazo}\n\nAcompanhe no LicitaFlow.`,
    };
  }

  // ============================================
  // MÉTODOS DE ENVIO PRONTOS
  // ============================================

  /**
   * Enviar e-mail de boas-vindas
   */
  async sendWelcome(email: string, name: string): Promise<boolean> {
    const template = this.getWelcomeTemplate(name, email);
    const result = await this.send({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    return result.success;
  }

  /**
   * Enviar confirmação de e-mail
   */
  async sendEmailConfirmation(email: string, name: string, token: string): Promise<boolean> {
    const confirmUrl = `https://licitaflow.com.br/confirm-email?token=${token}`;
    const template = this.getEmailConfirmationTemplate(name, confirmUrl);
    const result = await this.send({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    return result.success;
  }

  /**
   * Enviar redefinição de senha
   */
  async sendPasswordReset(email: string, name: string, token: string): Promise<boolean> {
    const resetUrl = `https://licitaflow.com.br/reset-password?token=${token}`;
    const template = this.getPasswordResetTemplate(name, resetUrl);
    const result = await this.send({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    return result.success;
  }

  /**
   * Enviar alerta de novo edital
   */
  async sendNewEditalAlert(email: string, name: string, edital: any): Promise<boolean> {
    const url = `https://licitaflow.com.br/editais/${edital.id}`;
    const template = this.getNewEditalAlertTemplate(name, {
      numero: edital.numeroEdital,
      titulo: edital.titulo,
      orgao: edital.orgao,
      valor: edital.valorEstimado,
      encerramento: edital.dataEncerramento,
      url,
    });
    const result = await this.send({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    return result.success;
  }

  /**
   * Enviar confirmação de proposta
   */
  async sendProposalConfirmation(email: string, name: string, proposta: any): Promise<boolean> {
    const template = this.getProposalSubmittedTemplate(name, {
      numero: proposta.numero,
      titulo: proposta.tituloEdital,
      valor: proposta.valorProposta,
      prazo: proposta.dataResultado,
    });
    const result = await this.send({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    return result.success;
  }

  /**
   * Enviar notificação de novo lead
   */
  async sendNewLeadNotification(lead: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
    cnpj?: string;
    message?: string;
  }): Promise<boolean> {
    const template = this.getNewLeadNotificationTemplate(lead);
    const result = await this.send({
      to: 'lucascoutinho.assessor@gmail.com',
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    return result.success;
  }

  /**
   * Enviar convite de acesso antecipado
   */
  async sendEarlyAccessInvite(email: string, name: string, accessLink: string): Promise<boolean> {
    const template = this.getEarlyAccessInviteTemplate(name, accessLink);
    const result = await this.send({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
    return result.success;
  }
}

export const resendService = new ResendService();
export default resendService;