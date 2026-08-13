import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.fn();
vi.mock('../src/db/pool.js', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a) },
}));

import { claimPixPaid } from '../src/payments/provider.js';

describe('claimPixPaid — anti-fraude', () => {
  beforeEach(() => poolQuery.mockReset());

  it('nunca confirma pagamento sozinho: status vira "aguardando confirmação"', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ status: 'pix_initiated' }] });
    poolQuery.mockResolvedValueOnce({ rows: [] });
    const status = await claimPixPaid('pay1', 'player1');
    expect(status).toBe('pix_claimed_paid');
  });

  it('não regride um pagamento já confirmado', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ status: 'pix_confirmed' }] });
    const status = await claimPixPaid('pay1', 'player1');
    expect(status).toBe('pix_confirmed');
  });

  it('não altera pagamentos finalizados (cartão)', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [{ status: 'paid_card' }] });
    const status = await claimPixPaid('pay1', 'player1');
    expect(status).toBe('paid_card');
  });
});
