import { beforeEach, describe, expect, it, vi } from 'vitest';

// Simula o pool do Postgres para testar a lógica de negócio sem banco real.
const poolQuery = vi.fn();
const client = {
  query: poolQuery,
  release: vi.fn(),
};

vi.mock('../src/db/pool.js', () => ({
  pool: {
    query: (...args: unknown[]) => poolQuery(...args),
    connect: vi.fn(),
  },
  withTransaction: async (fn: (c: typeof client) => Promise<unknown>) => {
    return await fn(client);
  },
}));

vi.mock('../src/payments/provider.js', () => ({
  createPixPayment: vi.fn(async () => ({
    status: 'pix_initiated',
    pixKey: 'chave-teste',
    pixKeyType: 'cpf',
    pixReference: 'HUD-TEST-1234',
    instructions: 'teste',
  })),
  cancelPayment: vi.fn(),
  claimPixPaid: vi.fn(),
  confirmPayment: vi.fn(),
}));

vi.mock('../src/modules/settings/settings-service.js', () => ({
  getReservationSettings: vi.fn(async () => ({
    waitlistAcceptMinutes: 30,
    defaultCapacity: 18,
  })),
  getSettings: vi.fn(async () => ({ loyalty: { enabled: true, pointsEnabled: false } })),
}));

vi.mock('../src/modules/notifications/notifications-service.js', () => ({
  notifyPlayer: vi.fn(async () => {}),
}));

import { joinMatch } from '../src/modules/players/participation-service.js';

describe('joinMatch — controle de concorrência de vagas', () => {
  beforeEach(() => {
    poolQuery.mockReset();
  });

  it('deve colocar o jogador na fila quando a partida está cheia', async () => {
    // match por código
    poolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'm1',
            code: 'ABC123',
            title: 'Vôlei de Quarta',
            players_max: 18,
            price_per_player_cents: 1333,
            status: 'scheduled',
            court_name: 'Quadra Principal',
          },
        ],
      })
      // findOrCreatePlayer: busca por telefone
      .mockResolvedValueOnce({ rows: [] })
      // findOrCreatePlayer: insert
      .mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'João' }] })
      // verificação de participação existente
      .mockResolvedValueOnce({ rows: [] })
      // count de ocupados = 18 (cheio)
      .mockResolvedValueOnce({ rows: [{ c: '18' }] })
      // max position na fila
      .mockResolvedValueOnce({ rows: [{ position: 3 }] })
      // insert na fila
      .mockResolvedValueOnce({ rows: [] });

    const result = await joinMatch({
      matchCode: 'ABC123',
      name: 'João',
      phone: '11999999999',
      paymentMethod: 'pay_at_court',
    });

    expect(result.kind).toBe('waitlist');
    expect(result.position).toBe(3);
  });

  it('deve inserir participante quando há vaga disponível', async () => {
    poolQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'm1',
            code: 'ABC123',
            title: 'Vôlei de Quarta',
            players_max: 18,
            price_per_player_cents: 1333,
            status: 'scheduled',
            court_name: 'Quadra Principal',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'João' }] })
      .mockResolvedValueOnce({ rows: [] })
      // count = 17 (ainda tem vaga)
      .mockResolvedValueOnce({ rows: [{ c: '17' }] })
      // max position
      .mockResolvedValueOnce({ rows: [{ position: 18 }] })
      // insert match_player
      .mockResolvedValueOnce({ rows: [{ id: 'mp1' }] })
      // insert payment pay_at_court
      .mockResolvedValueOnce({ rows: [] });

    const result = await joinMatch({
      matchCode: 'ABC123',
      name: 'João',
      phone: '11999999999',
      paymentMethod: 'pay_at_court',
    });

    expect(result.kind).toBe('joined');
    expect(result.payment.status).toBe('pay_at_court');
  });
});
