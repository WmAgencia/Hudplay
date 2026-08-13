# Segurança

## Autenticação & autorização
- Senhas com **argon2** (hash + salt); nunca em texto plano.
- **JWT**: access token curto (15m) + refresh token rotativo, revogável, armazenado com
  flag `revoked`. Refresh é invalidado ao rotacionar (proteção contra roubo).
- RBAC por role (`owner` > `admin` > `employee`) + permissões granulares por rota.
  Funcionário: visualizar partidas, confirmar pagamentos, gerenciar jogadores. Não pode
  alterar configurações financeiras nem excluir dados.
- Proteção de rotas: admin e player usam tokens distintos (`admin` scope vs `player` scope)
  para impedir escalonamento.

## Validação
- Toda entrada validada com **Zod** no backend (headers, params, query, body).
- Valores financeiros **recalculados no servidor** — nunca confiar em valores do frontend.

## Pagamentos / anti-fraude
- Usuário clicar "paguei" **não** confirma pagamento: status fica `pix_claimed_paid`
  (aguardando confirmação).
- Confirmação apenas por: integração de provedor/webhook (futuro) OU confirmação manual
  registrada com responsável, data/hora e valor.
- Duplicidade bloqueada por `unique(match_id, player_id)` em payments + `idempotency_key`.
- Webhooks (futuro) tratados de forma **idempotente** com assinatura/secreto.

## Outros
- CORS restrito por `ALLOWED_ORIGINS`.
- Rate limiting em endpoints de autenticação e criação.
- Logs de auditoria em `audit_logs` para ações administrativas sensíveis.
- Erros nunca expõem stack traces/segredos ao cliente (handler central).
- Secrets apenas via variáveis de ambiente; `.env*` ignorados pelo git.
- SQL parametrizado (`pg`); nenhuma concatenação de strings em queries.