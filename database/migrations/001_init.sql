-- 001_init.sql — Schema completo Hudplay
-- Valores monetários sempre em centavos (integer).

BEGIN;

-- ============ Acesso administrativo ============
CREATE TABLE admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'employee'
                CHECK (role IN ('owner', 'admin', 'employee')),
  permissions   JSONB NOT NULL DEFAULT '[]',
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_users_email ON admin_users (email);

-- ============ Tokens de refresh (rotativos e revogáveis) ============
CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL,
  scope      TEXT NOT NULL CHECK (scope IN ('admin', 'player')),
  token_id   TEXT NOT NULL UNIQUE,
  revoked    BOOLEAN NOT NULL DEFAULT false,
  replaced_by TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent TEXT
);

CREATE INDEX idx_refresh_tokens_subject ON refresh_tokens (subject_id, scope);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens (token_id);

-- ============ Jogadores ============
CREATE TABLE players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,
  photo_url     TEXT,
  email         TEXT,
  password_hash TEXT,
  points        INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_phone ON players (phone);

-- ============ Catálogo ============
CREATE TABLE sports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL UNIQUE,
  icon                TEXT,
  image_url           TEXT,
  min_players         INTEGER NOT NULL DEFAULT 2,
  recommended_players INTEGER NOT NULL DEFAULT 10,
  max_players         INTEGER NOT NULL DEFAULT 18,
  rules               TEXT,
  active              BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  description           TEXT,
  photo_url             TEXT,
  capacity              INTEGER NOT NULL DEFAULT 0,
  price_per_hour_cents  INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  color                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE court_sports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id   UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  sport_id   UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
  UNIQUE (court_id, sport_id)
);

CREATE TABLE schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id     UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (court_id, day_of_week, start_time, end_time)
);

CREATE TABLE prices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id              UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  sport_id              UUID REFERENCES sports(id) ON DELETE CASCADE,
  day_of_week           INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time            TIME NOT NULL,
  end_time              TIME NOT NULL,
  price_per_hour_cents  INTEGER NOT NULL CHECK (price_per_hour_cents >= 0),
  UNIQUE (court_id, sport_id, day_of_week, start_time, end_time)
);

-- ============ Partidas ============
CREATE TABLE matches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT NOT NULL UNIQUE,
  court_id              UUID NOT NULL REFERENCES courts(id),
  sport_id              UUID NOT NULL REFERENCES sports(id),
  title                 TEXT NOT NULL,
  match_date            DATE NOT NULL,
  start_time            TIME NOT NULL,
  end_time              TIME NOT NULL,
  players_max           INTEGER NOT NULL CHECK (players_max > 0),
  price_per_player_cents INTEGER NOT NULL DEFAULT 0,
  total_value_cents     INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_by            UUID REFERENCES admin_users(id),
  organizer_name        TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_matches_date ON matches (match_date);
CREATE INDEX idx_matches_court_date ON matches (court_id, match_date);
CREATE INDEX idx_matches_status ON matches (status);

-- ============ Participantes ============
CREATE TABLE match_players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'confirmed'
             CHECK (status IN ('pending', 'confirmed', 'cancelled', 'no_show')),
  position   INTEGER NOT NULL DEFAULT 0,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);

CREATE INDEX idx_match_players_match ON match_players (match_id, status);
CREATE INDEX idx_match_players_player ON match_players (player_id);

CREATE TABLE waiting_list (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'waiting'
              CHECK (status IN ('waiting', 'invited', 'accepted', 'declined', 'expired')),
  invited_at  TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  UNIQUE (match_id, player_id)
);

CREATE INDEX idx_waiting_list_match ON waiting_list (match_id, status);

CREATE TABLE guests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id  UUID REFERENCES players(id) ON DELETE SET NULL,
  name       TEXT NOT NULL,
  phone      TEXT,
  status     TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'confirmed', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, phone)
);

-- ============ Pagamentos ============
CREATE TABLE payments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id                UUID NOT NULL REFERENCES matches(id),
  player_id               UUID NOT NULL REFERENCES players(id),
  method                  TEXT NOT NULL CHECK (method IN ('pix', 'pay_at_court')),
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending', 'pix_initiated', 'pix_claimed_paid', 'pix_confirmed',
                            'pay_at_court', 'paid_cash', 'paid_card', 'paid_manual_pix',
                            'cancelled', 'refunded'
                          )),
  amount_cents            INTEGER NOT NULL DEFAULT 0,
  pix_key_snapshot        TEXT,
  pix_reference           TEXT,
  provider                TEXT NOT NULL DEFAULT 'manual',
  provider_transaction_id TEXT,
  idempotency_key         TEXT UNIQUE,
  claimed_at              TIMESTAMPTZ,
  confirmed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);

CREATE INDEX idx_payments_match ON payments (match_id, status);
CREATE INDEX idx_payments_player ON payments (player_id);

CREATE TABLE payment_confirmations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id    UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  confirmed_by  UUID REFERENCES admin_users(id),
  method        TEXT NOT NULL CHECK (method IN ('cash', 'card', 'manual_pix', 'pix_verified', 'other')),
  amount_cents  INTEGER NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  transaction_id TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_confirmations_payment ON payment_confirmations (payment_id);

CREATE TABLE pix_transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id              UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  provider                TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL UNIQUE,
  payload                 JSONB NOT NULL DEFAULT '{}',
  status                  TEXT NOT NULL DEFAULT 'created',
  verified_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ Fidelidade ============
CREATE TABLE rewards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN
             ('free_hours', 'discount', 'credit', 'drink', 'food', 'product', 'gift', 'other')),
  value      JSONB NOT NULL DEFAULT '{}',
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE loyalty_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  reward_id        UUID REFERENCES rewards(id) ON DELETE SET NULL,
  required_matches INTEGER NOT NULL CHECK (required_matches > 0),
  period           TEXT NOT NULL DEFAULT 'month'
                   CHECK (period IN ('week', 'month', 'all_time')),
  valid_until      DATE,
  max_uses         INTEGER,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE player_rewards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reward_id   UUID REFERENCES rewards(id) ON DELETE SET NULL,
  rule_id     UUID REFERENCES loyalty_rules(id) ON DELETE SET NULL,
  code        TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'used', 'expired')),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  used_by     UUID REFERENCES admin_users(id)
);

CREATE INDEX idx_player_rewards_player ON player_rewards (player_id, status);

CREATE TABLE player_points (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  match_id   UUID REFERENCES matches(id) ON DELETE SET NULL,
  points     INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_player_points_player ON player_points (player_id);

-- ============ Notificações / auditoria / config ============
CREATE TABLE notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id      UUID REFERENCES players(id) ON DELETE CASCADE,
  admin_user_id  UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT,
  data           JSONB NOT NULL DEFAULT '{}',
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_player ON notifications (player_id, read_at);
CREATE INDEX idx_notifications_admin ON notifications (admin_user_id, read_at);

CREATE TABLE audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action         TEXT NOT NULL,
  entity_type    TEXT,
  entity_id      TEXT,
  details        JSONB NOT NULL DEFAULT '{}',
  ip             TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_created ON audit_logs (created_at);

CREATE TABLE settings (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  data       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;