# Banco de Dados

PostgreSQL. Migrations versionadas em `database/migrations/` (SQL puro), aplicadas em
ordem crescente pelo runner do backend.

## Entidades

### Acesso administrativo
- `admin_users` — id, name, email (unique), password_hash, role (`owner|admin|employee`),
  permissions (jsonb), active.

### Jogadores
- `players` — id, name, phone (unique, normalizado), photo_url, email, password_hash
  (opcional), points, status, notes.

### Catálogo
- `sports` — id, name, icon, image_url, min_players, recommended_players, max_players,
  rules, active, sort_order.
- `courts` — id, name, description, photo_url, capacity, price_per_hour_cents (padrão),
  status, color.
- `court_sports` — N:N quadra×esporte (esportes permitidos). unique(court_id, sport_id).
- `schedules` — janelas de horário por quadra: day_of_week, start_time, end_time, active.
- `prices` — overrides de preço: court_id, sport_id (nullable), day_of_week,
  start_time, end_time, price_per_hour_cents. Resolução: registro mais específico vence;
  senão preço padrão da quadra.

### Partidas
- `matches` — id, code (unique), court_id, sport_id, title, match_date, start_time,
  end_time, players_max, price_per_player_cents, total_value_cents, status
  (`scheduled|in_progress|completed|cancelled`), created_by (admin_users), organizer_name,
  notes, created_at, updated_at.
- `match_players` — match_id, player_id, status (`pending|confirmed|cancelled|no_show`),
  position, joined_at. **unique(match_id, player_id)**.
- `waiting_list` — match_id, player_id, position, status
  (`waiting|invited|accepted|declined|expired`), invited_at, deadline_at.
  **unique(match_id, player_id)**.
- `guests` — match_id, player_id (nullable), name, phone, status
  (`invited|confirmed|removed`). unique(match_id, phone).

### Pagamentos
- `payments` — id, match_id, player_id, method (`pix|pay_at_court`), status
  (`pending|pix_initiated|pix_claimed_paid|pix_confirmed|pay_at_court|paid_cash|
    paid_card|paid_manual_pix|cancelled|refunded`), amount_cents, pix_key_snapshot,
  pix_reference, provider, provider_transaction_id, idempotency_key (unique),
  claimed_at, confirmed_at, cancelled_at, notes. **unique(match_id, player_id)** impede
  duplicidade de pagamento.
- `payment_confirmations` — payment_id, confirmed_by (admin_users), method
  (`cash|card|manual_pix|pix_verified|other`), amount_cents, occurred_at,
  transaction_id, note.
- `pix_transactions` — registros de integração futura: payment_id, provider,
  provider_transaction_id (unique), payload (jsonb), status, verified_at.

### Fidelidade
- `loyalty_rules` — name, description, required_matches, period (`month|week|all_time`),
  benefit_type (`free_hours|discount|credit|drink|food|product|gift|other`),
  benefit_value (jsonb), valid_until, max_uses, active.
- `rewards` — catálogo de benefícios (name, type, value jsonb, active).
- `player_rewards` — concedidas: player_id, reward_id, rule_id, code (unique), status
  (`granted|used|expired`), granted_at, used_at, expires_at, used_by.
- `player_points` — ledger: player_id, match_id, points, reason, created_at.

### Notificações / auditoria / config
- `notifications` — player_id (nullable), admin_user_id (nullable), type, title, body,
  data (jsonb), read_at, created_at.
- `audit_logs` — admin_user_id, action, entity_type, entity_id, details (jsonb), ip,
  created_at.
- `settings` — linha única (id=1), data (jsonb): empresa, aparência, pagamentos,
  reservas, fidelidade.

## Integridade & concorrência

- Todos os valores financeiros em **centavos (integer)**.
- Ocupação de vaga: transação com `SELECT ... FOR UPDATE` na partida + verificação
  `count(confirmed+pending) < players_max` antes do insert (impede 19/18).
- Cancelamento/liberação de vaga notifica o primeiro da fila dentro da mesma transação.
- `payments` com unique(match_id, player_id) e idempotency_key impedem pagamento duplicado.
- FK com `ON DELETE RESTRICT` para dados financeiros; soft-delete via status.