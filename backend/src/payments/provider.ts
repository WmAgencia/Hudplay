import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { generatePixReference } from '../lib/ids.js';
import { getPaymentSettings, requirePaymentSettings } from '../modules/settings/settings-service.js';

/**
 * Interface de provedor de pagamento PIX.
 *
 * Hoje existe apenas o provedor "manual", em que a confirmação é feita pelo
 * proprietário ao verificar o extrato bancário. A arquitetura está preparada
 * para plugar uma API bancária / Open Finance / provedor de cobrança no
 * futuro sem alterar os módulos de negócio.
 *
 * IMPORTANTE: NENHUM provedor pode confirmar um pagamento sem uma fonte
 * verificável. O status "pix_confirmed" só é alcançado por:
 *   - confirmação manual registrada (payment_confirmations com responsável), ou
 *   - verificação automática de uma transação real do provedor.
 */
export interface PixProvider {
  readonly name: string;
  /** Cria a cobrança/gera a referência. Não confirma nada. */
  createPayment(opts: {
    matchCode: string;
    amountCents: number;
    pixKey: string;
  }): Promise<{ reference: string; providerTransactionId?: string }>;
  /** Consulta uma transação criada por este provedor (retorna null se indisponível). */
  checkTransaction(providerTransactionId: string): Promise<{ paid: boolean; confirmedAt?: Date } | null>;
}

class ManualPixProvider implements PixProvider {
  readonly name = 'manual';

  async createPayment(opts: { matchCode: string; amountCents: number; pixKey: string }) {
    // Gera uma referência única que deve ser enviada como descrição do PIX.
    // O proprietário identifica o pagamento no extrato através desta referência.
    return { reference: generatePixReference(opts.matchCode) };
  }

  async checkTransaction(_providerTransactionId: string) {
    // Sem integração automática: nunca "confirma" sozinho.
    return null;
  }
}

// Provedor de exemplo para integração futura (API bancária). Desativado até
// que credenciais reais existam; nunca confirma sem fonte verificável.
class BankApiPixProvider implements PixProvider {
  readonly name = 'bank_api';

  async createPayment(_opts: {
    matchCode: string;
    amountCents: number;
    pixKey: string;
  }): Promise<{ reference: string; providerTransactionId?: string }> {
    throw new AppError('Provedor de API bancária não configurado nesta instalação.', {
      statusCode: 503,
      code: 'PIX_PROVIDER_UNAVAILABLE',
    });
  }

  async checkTransaction(
    _providerTransactionId: string,
  ): Promise<{ paid: boolean; confirmedAt?: Date } | null> {
    return null;
  }
}

export function getPixProvider(): PixProvider {
  switch (env.PIX_PROVIDER) {
    case 'bank_api':
      return new BankApiPixProvider();
    default:
      return new ManualPixProvider();
  }
}

/**
 * Cria o registro de pagamento PIX (status pix_initiated) para uma participação.
 * Retorna chave + referência para exibição ao jogador.
 */
export async function createPixPayment(opts: {
  matchId: string;
  playerId: string;
  matchCode: string;
  amountCents: number;
}): Promise<{
  paymentId: string | null;
  status: string;
  pixKey: string;
  pixKeyType: string;
  pixReference: string;
  instructions: string;
}> {
  const paymentSettings = await requirePaymentSettings();
  const provider = getPixProvider();

  const { reference, providerTransactionId } = await provider.createPayment({
    matchCode: opts.matchCode,
    amountCents: opts.amountCents,
    pixKey: paymentSettings.pixKey,
  });

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO payments (match_id, player_id, method, status, amount_cents, pix_key_snapshot,
                           pix_reference, provider, provider_transaction_id)
     VALUES ($1, $2, 'pix', 'pix_initiated', $3, $4, $5, $6, $7)
     ON CONFLICT (match_id, player_id) DO UPDATE
       SET method = 'pix', status = 'pix_initiated', amount_cents = $3,
           pix_key_snapshot = $4, pix_reference = $5, provider = $6,
           provider_transaction_id = $7, claimed_at = NULL, confirmed_at = NULL,
           cancelled_at = NULL, updated_at = now()
     RETURNING id`,
    [
      opts.matchId,
      opts.playerId,
      opts.amountCents,
      paymentSettings.pixKey,
      reference,
      provider.name,
      providerTransactionId ?? null,
    ],
  );

  return {
    paymentId: rows[0]?.id ?? null,
    status: 'pix_initiated',
    pixKey: paymentSettings.pixKey,
    pixKeyType: paymentSettings.pixKeyType,
    pixReference: reference,
    instructions: paymentSettings.pixInstructions,
  };
}

/**
 * Jogador informa que pagou (pix_claimed_paid). NUNCA confirma sozinho.
 * Se já estiver confirmado, retorna o estado atual sem regressão.
 */
export async function claimPixPaid(paymentId: string, playerId: string): Promise<string> {
  const { rows } = await pool.query<{ status: string }>(
    'SELECT status FROM payments WHERE id = $1 AND player_id = $2',
    [paymentId, playerId],
  );
  const payment = rows[0];
  if (!payment) throw new AppError('Pagamento não encontrado', { statusCode: 404 });
  if (['pix_confirmed', 'paid_cash', 'paid_card', 'paid_manual_pix', 'refunded'].includes(payment.status)) {
    return payment.status;
  }
  await pool.query(
    `UPDATE payments SET status = 'pix_claimed_paid', claimed_at = now(), updated_at = now()
      WHERE id = $1 AND player_id = $2`,
    [paymentId, playerId],
  );
  return 'pix_claimed_paid';
}

/**
 * Confirmação REAL de pagamento. Só deve ser chamada quando houver fonte
 * verificável (confirmação manual do proprietário ou webhook/provider verificado).
 * Registra sempre em payment_confirmations (responsável, método, valor, data).
 */
export async function confirmPayment(opts: {
  paymentId: string;
  adminUserId: string;
  method: 'cash' | 'card' | 'manual_pix' | 'pix_verified' | 'other';
  amountCents?: number;
  transactionId?: string;
  note?: string;
  occurredAt?: Date;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ id: string; status: string; amount_cents: number }>(
      'SELECT id, status, amount_cents FROM payments WHERE id = $1 FOR UPDATE',
      [opts.paymentId],
    );
    const payment = rows[0];
    if (!payment) throw new AppError('Pagamento não encontrado', { statusCode: 404 });
    if (['paid_cash', 'paid_card', 'paid_manual_pix', 'pix_confirmed', 'refunded'].includes(payment.status)) {
      throw new AppError('Pagamento já confirmado anteriormente', {
        statusCode: 409,
        code: 'ALREADY_CONFIRMED',
      });
    }

    const targetStatus =
      opts.method === 'cash'
        ? 'paid_cash'
        : opts.method === 'card'
          ? 'paid_card'
          : opts.method === 'pix_verified'
            ? 'pix_confirmed'
            : opts.method === 'manual_pix'
              ? 'paid_manual_pix'
              : 'paid_cash';

    await client.query(
      `UPDATE payments SET status = $2, confirmed_at = now(), updated_at = now()
        WHERE id = $1`,
      [payment.id, targetStatus],
    );
    await client.query(
      `INSERT INTO payment_confirmations (payment_id, confirmed_by, method, amount_cents, occurred_at, transaction_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        payment.id,
        opts.adminUserId,
        opts.method,
        opts.amountCents ?? payment.amount_cents,
        opts.occurredAt ?? new Date(),
        opts.transactionId ?? null,
        opts.note ?? null,
      ],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Cancela um pagamento (participação cancelada). */
export async function cancelPayment(paymentId: string): Promise<void> {
  await pool.query(
    `UPDATE payments SET status = 'cancelled', cancelled_at = now(), updated_at = now()
      WHERE id = $1 AND status NOT IN ('pix_confirmed', 'paid_cash', 'paid_card', 'paid_manual_pix', 'refunded')`,
    [paymentId],
  );
}
