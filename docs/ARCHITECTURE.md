# Arquitetura

## Princípios

1. **Backend autoritário** — toda regra de negócio, cálculo de valores, validação de
   disponibilidade e transição de status de pagamento acontece no servidor.
2. **Frontend nunca define valores financeiros** — valores são calculados e devolvidos
   pela API; o cliente apenas apresenta.
3. **Pagamento nunca é confirmado por declaração do usuário** — somente por fonte
   verificável (provedor/API bancária) ou confirmação manual registrada.
4. **Concorrência segura** — transações com `SELECT ... FOR UPDATE` e updates atômicos.
5. **Instalação independente** — sem multitenancy; cada cliente é um deploy próprio.

## Camadas

```
┌─────────────────────────────────────────────┐
│  apps/web (painel + pública + jogador)      │
│  apps/android (Capacitor → APK)             │
└──────────────────────┬──────────────────────┘
                       │ HTTPS + JWT
┌──────────────────────▼──────────────────────┐
│  backend (Fastify)                          │
│  ├── auth/       (JWT, RBAC, senhas)        │
│  ├── modules/    (sports, courts, matches,  │
│  │                payments, waiting,        │
│  │                loyalty, reports, ...)    │
│  ├── payments/   (PaymentProvider interface)│
│  ├── notifications/                         │
│  └── middleware/ (erros, rate-limit, audit) │
└──────────────────────┬──────────────────────┘
                       │ pg
┌──────────────────────▼──────────────────────┐
│  PostgreSQL (migrations versionadas)        │
└─────────────────────────────────────────────┘
```

## Fluxos críticos

### Criação de partida
1. Frontend envia esporte, quadra, data, horário(s), nº de jogadores.
2. Backend valida: quadra existe, esporte permitido na quadra, horário dentro dos
   agendamentos (`schedules`), **sem conflito** com outra partida (mesma quadra/intervalo
   sobreposto — verificação atômica).
3. Backend calcula o preço por hora a partir de `prices` (override) ou preço padrão da
   quadra, multiplica pelas horas e divide pelo nº de jogadores.
4. `matches.price_per_player_cents` é persistido; o frontend exibe o valor devolvido.

### Entrada de jogador (página pública)
1. `POST /api/public/matches/:code/join` com nome, telefone e método de pagamento.
2. Backend encontra/cria `players` (telefone normalizado único), abre transação com lock
   na partida, conta confirmados + aguardando; se `count < players_max`, insere
   `match_players` (`confirmed`); senão, insere em `waiting_list`.
3. Cria `payments` no status correspondente (`pay_at_court` ou `pix_initiated`).
4. Retorna token de jogador (JWT `player`) + dados da participação.

### Pagamento PIX
- `pix_initiated`: sistema gera `pix_reference` único e exibe a chave PIX cadastrada.
- Usuário clica "Já paguei" → `pix_claimed_paid` (**aguardando confirmação**).
- Proprietário verifica extrato e confirma → `pix_confirmed`, com registro em
  `payment_confirmations` (quem, quando, valor, método).
- Se o proprietário rejeitar → volta a `pix_initiated` (pendente).

### Pagamento presencial
- Jogador escolhe "Pagar na quadra" → `pay_at_court` (pendente).
- Funcionário abre a partida, clica "Marcar como pago" e seleciona Dinheiro/Cartão/
  PIX presencial → `paid_cash` / `paid_card` / `paid_manual_pix`.

### Lista de espera
- Partida cheia → jogador entra na fila (`waiting_list`, posição FIFO).
- Cancelamento libera vaga → primeiro da fila recebe notificação com prazo
  (`waitlist_accept_minutes`); aceitar move para participante (novo fluxo de pagamento);
  recusar/expiar passa ao próximo.

### Fidelidade
- Ao concluir partida (`matches.status = completed`), serviço `loyalty` contabiliza
  participações do período por regra ativa e concede `player_rewards` quando o limite é
  atingido; pontos (XP) são registrados em `player_points` se habilitados.

## Decisões de design

- **Monorepo npm workspaces**: web e android compartilham ~90% de código; um único
  repositório versiona tudo junto (menor custo de manutenção).
- **JWT rotativo**: access curto (15m) + refresh rotativo revogável; senha com argon2.
- **Provedor de pagamento por interface**: `PaymentProvider` permite plugar API bancária /
  Open Finance no futuro sem alterar os módulos de negócio.
- **IDs**: UUID para entidades; `matches.code` é um token curto único para links públicos.