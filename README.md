# Hudplay — Gestão de Quadras Esportivas

Sistema profissional de gerenciamento de quadras e partidas esportivas para arenas,
quadras e complexos esportivos. Inclui painel web do proprietário, página pública de
partida (mobile-first) e aplicativo Android (APK).

## Visão geral

Três experiências em um único produto (instalação independente por cliente — sem SaaS
multitenant):

1. **Painel do Proprietário** — área administrativa protegida (dashboard, calendário,
   partidas, quadras, esportes, jogadores, pagamentos, fidelidade, recompensas, relatórios,
   configurações).
2. **Página pública da partida** — link compartilhável `/partida/ABC123` otimizado para
   celular; qualquer pessoa participa sem instalar o aplicativo.
3. **Aplicativo Android (APK)** — jogadores acompanham partidas, entram em partidas e
   gerenciam perfil, pontos e recompensas.

## Repositório

- Organização: `WmAgencia`
- Repositório: `Hudplay`
- Monorepo npm workspaces (web + api compartilhada) + backend + database.

## Stack

| Camada      | Tecnologia                                             |
|-------------|--------------------------------------------------------|
| Web         | React 19, Vite, TypeScript, Tailwind CSS v4, React Router 7, TanStack Query |
| Mobile      | Capacitor 8 (Android), mesmo código React              |
| Backend     | Fastify 4, TypeScript, Zod, `pg`, pino                 |
| Banco       | PostgreSQL (migrations SQL versionadas)                |
| Auth        | JWT (access + refresh rotativo), hash argon2           |
| Pagamentos  | Provider PIX com arquitetura para integração bancária; confirmação manual |
| Testes      | Vitest                                                |
| Lint/Formatação | Biome                                            |
| Deploy      | Backend: Railway · Web: Vercel · DB: Postgres gerenciado |

## Estrutura

```
Hudplay/
├── apps/
│   ├── web/            # SPA React (painel + página pública + jogador web)
│   └── android/        # Capacitor → APK Android
├── packages/
│   └── api/            # Tipos/DTOs compartilhados entre web, android e backend
├── backend/            # API Fastify (regras de negócio)
├── database/
│   ├── migrations/     # SQL versionado (001_*.sql, ...)
│   └── seeds/          # Seed de demonstração (Hudplay)
├── docs/               # Documentação técnica
├── scripts/            # Scripts utilitários (build, apk, helpers)
└── .env.example        # Variáveis documentadas (sem secrets)
```

## Modelo de negócio (regras críticas)

- **Valor da partida**: `preço da quadra por hora × horas ÷ nº de jogadores`, calculado e
  validado no backend. O frontend nunca define valores.
- **Concorrência**: ocupação de vaga é atômica (lock de linha + update condicional); não
  permite 19/18.
- **Pagamentos**: PIX segue o fluxo `gerado → informado como pago → confirmado`.
  **Nenhum clique de usuário confirma pagamento.** Confirmação é sempre por fonte
  verificável (extrato/provedor). Pagamento presencial é confirmado pelo funcionário.
- **Lista de espera**: prioridade FIFO com prazo configurável para aceitar vaga liberada.
- **Fidelidade**: regras configuráveis (participações → recompensas) e sistema de pontos
  (XP) opcional.

## Documentação

- [Arquitetura](ARCHITECTURE.md)
- [Banco de dados](DATABASE.md)
- [Ambiente / variáveis](ENV.md)
- [Segurança](SECURITY.md)
- [Personalização para novos clientes](CUSTOMIZATION.md)

## Desenvolvimento

```bash
# instalar dependências (raiz)
npm install

# preparar banco (criar database hudplay no Postgres)
npm run db:migrate && npm run db:seed

# backend em http://localhost:3000
npm run dev:backend

# web em http://localhost:5173
npm run dev:web

# testes / lint / typecheck / build
npm test
npm run lint
npm run typecheck
npm run build
```

## Deploy

- Backend: Railway (config via `nixpacks.toml` ou painel). Precisa de `DATABASE_URL`,
  `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PUBLIC_BASE_URL`, `ALLOWED_ORIGINS`.
- Web: Vercel (config `vercel.json`), com `VITE_API_URL` apontando para o backend.
- APK: gerado via `apps/android` (ver `docs/MOBILE.md`).