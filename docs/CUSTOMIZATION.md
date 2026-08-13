# Personalização para novos clientes

Hudplay é instalado de forma independente por cliente (não é SaaS multitenant).
Este guia descreve como configurar uma nova instalação.

## 1. Dados da empresa (settings)

A tela **Configurações** do painel administra:

- **Empresa**: nome, slogan, telefone, endereço, descrição (usados na página
  pública da partida e no app).
- **Aparência**: cor primária, cor secundária, logo. A página pública da partida
  e o app refletem essas cores dinamicamente.
- **Pagamentos**: chave PIX, tipo da chave e instruções (exibidas ao jogador ao
  escolher PIX).

Backend: tabela `settings` (jsonb) — API `GET/PUT /api/settings` (owner).

## 2. Esportes e quadras

- **Esportes**: nome, capacidade mínima/recomendada/máxima de jogadores.
- **Quadras**: preço por hora (base para cálculo da partida), capacidade, cor,
  esportes permitidos.
- **Horários**: a quadra pode ter `schedules` (dias/horários de funcionamento) e
  `prices` (preço por faixa de horário/dia — opcional; sem eles, usa o preço base).

## 3. Seed de demonstração

`npm run db:seed` cria:

- Admin inicial: `admin@hudplay.com.br` / `hudplay123` (**troque após o 1º login**).
- Esportes: Vôlei, Futsal, Handebol.
- Quadra exemplo (Jardim Europa — Sorocaba) a R$120/h.
- Settings iniciais do Hudplay.

## 4. Novo cliente (recapitulando)

1. Deploy do backend + banco Postgres (Railway/Fly/qualquer Postgres).
2. Rodar `db:migrate` e `db:seed`.
3. Deploy da web (Vercel) com `VITE_API_URL` apontando para o backend.
4. Login, atualizar empresa/aparência/PIX em Configurações.
5. Cadastrar quadras/esportes/horários reais.
6. Opcional: gerar APK Android com o appId do cliente (`br.com.<cliente>.app`).

## 5. Identidade visual

As cores/layout usam tokens CSS (`--hud-primary`, `--hud-secondary`) definidos em
`apps/web/src/index.css` e sobrepostos por settings em runtime. Não é preciso
reescrever componentes para mudar a identidade de um cliente.