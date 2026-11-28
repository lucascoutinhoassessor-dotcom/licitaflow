# Minha IA: a IA do próprio cliente

O botão flutuante **Minha IA** fica no canto da tela e aparece com o módulo "agentes" liberado. Com ele, o cliente liga a chave de API da conta dele no Claude (Anthropic), no Gemini (Google) ou no ChatGPT (OpenAI).

Com uma chave ativa:

- o **Leitor de editais** e o **Jurídico com IA** usam a conta do cliente;
- o custo é cobrado pelo provedor, na conta do cliente;
- o uso **não conta no limite do plano** (`ia_uso.provedor` ≠ `licitaforce` fica fora de `ia_usos_mes`).

A assinatura do aplicativo (Pro, Plus, Advanced) não serve. É preciso uma chave de API, cobrada à parte.

## Segurança

- A chave vai direto ao servidor (`POST /api/agentes?agente=chave`). O servidor faz três coisas:
  - testa a chave listando os modelos, sem gastar tokens;
  - cifra a chave com AES-256-GCM (`server/iaCliente.js`);
  - grava em `ia_chaves_cliente`.
- A tabela não tem políticas de acesso. O navegador só recebe provedor, modelo, os 4 últimos caracteres e qual chave está ativa (`ia_chaves_resumo`).
- A chave de cifra é derivada da `SUPABASE_SERVICE_ROLE_KEY` (HKDF). Se a chave de serviço for trocada, as chaves salvas deixam de abrir e o cliente precisa cadastrar de novo; o aviso diz isso.
- Só o dono ou um administrador cadastra, troca, ativa ou remove uma chave.

## Provedores

| Provedor | Modelo padrão | Como o pedido vai |
|---|---|---|
| Claude | claude-opus-5-5 | SDK da Anthropic com a chave do cliente |
| Gemini | gemini-2.5-pro | `generateContent`, PDF como `inlineData`, resposta em JSON |
| ChatGPT | gpt-5 | `chat/completions`, PDF como `file`, `response_format: json_object` |

O cliente pode informar outro modelo. `criarClienteIA` imita `beta.messages.parse` do SDK da Anthropic, por isso o Leitor e o Jurídico não mudaram.
