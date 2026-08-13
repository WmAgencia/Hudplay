import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool.js';
import { requireAdmin } from '../middleware/auth.js';

/**
 * Listagem de pagamentos para o painel do proprietário.
 * Filtros por status e intervalo de datas.
 */
export async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/payments', { preHandler: requireAdmin }, async (request) => {
    const query = request.query as {
      status?: string;
      from?: string;
      to?: string;
      query?: string;
      limit?: string;
    };

    const where: string[] = [];
    const params: unknown[] = [];

    if (query.status && query.status !== 'all') {
      params.push(query.status);
      where.push(`pay.status = $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      where.push(`pay.created_at::date >= $${params.length}`);
    }
    if (query.to) {
      params.push(query.to);
      where.push(`pay.created_at::date <= $${params.length}`);
    }
    if (query.query) {
      params.push(`%${query.query}%`);
      where.push(
        `(p.name ILIKE $${params.length} OR p.phone ILIKE $${params.length} OR pay.pix_reference ILIKE $${params.length})`,
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Number(query.limit) || 200, 500);

    const { rows } = await pool.query(
      `SELECT pay.id, pay.match_id, pay.player_id, pay.method, pay.status, pay.amount_cents,
              pay.pix_reference, pay.created_at, pay.confirmed_at, pay.claimed_at,
              p.name AS player_name, p.phone AS player_phone, p.photo_url AS player_photo,
              m.code AS match_code, m.match_date, m.start_time,
              c.name AS court_name, sp.name AS sport_name,
              pc.confirmed_by AS confirmation_admin,
              pc.method AS confirmation_method,
              pc.occurred_at AS confirmation_date
         FROM payments pay
         JOIN players p ON p.id = pay.player_id
         JOIN matches m ON m.id = pay.match_id
         JOIN courts c ON c.id = m.court_id
         JOIN sports sp ON sp.id = m.sport_id
         LEFT JOIN payment_confirmations pc ON pc.payment_id = pay.id
         ${whereSql}
        ORDER BY pay.created_at DESC
        LIMIT $${params.length + 1}`,
      [...params, limit],
    );

    return { payments: rows, count: rows.length };
  });
}
