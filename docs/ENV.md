# Ambiente & Variáveis

Ver `.env.example`. Nunca commitar `.env`/`.env.local` — apenas `.env.example`.

| Variável | Descrição | Obrigatória |
|---|---|---|
| `PORT` | Porta do backend (default 3000) | — |
| `HOST` | Host do servidor (default 0.0.0.0) | — |
| `NODE_ENV` | `development` \| `production` \| `test` | — |
| `LOG_LEVEL` | `trace\|debug\|info\|warn\|error\|fatal` | — |
| `DATABASE_URL` | Connection string Postgres | **sim** |
| `JWT_ACCESS_SECRET` | Secret access token (≥32 bytes) | **sim** |
| `JWT_REFRESH_SECRET` | Secret refresh token (≥32 bytes) | **sim** |
| `JWT_ACCESS_TTL` | Ex.: `15m` | — |
| `JWT_REFRESH_TTL` | Ex.: `30d` | — |
| `ALLOWED_ORIGINS` | CORS allowlist, vírgula-separada. `*` só em dev | **sim (prod)** |
| `PIX_PROVIDER` | `manual` (atual) ou provider futuro | — |
| `PIX_DEFAULT_KEY` | Chave PIX padrão (sobrescrita no painel) | — |
| `PIX_DEFAULT_KEY_TYPE` | `cpf\|cnpj\|phone\|email\|random` | — |
| `PUBLIC_BASE_URL` | Base para links públicos de partida | **sim (prod)** |
| `LOYALTY_POINTS_ENABLED` | Ativa/desativa sistema de pontos | — |

Web (`apps/web/.env.local`):
- `VITE_API_URL` — URL do backend (ex.: `http://localhost:3000`).

## Geração de secrets

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```