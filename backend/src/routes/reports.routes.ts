import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import {
  getDashboard,
  getFinancialReport,
  getLoyaltyReport,
  getPlayersReport,
  getReservationsReport,
} from '../modules/reports/reports-service.js';

export async function reportsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboard', { preHandler: requireAdmin }, async () => {
    return await getDashboard();
  });

  app.get('/api/reports/financial', { preHandler: requireAdmin }, async (request) => {
    const query = z
      .object({
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(request.query);
    return await getFinancialReport(query);
  });

  app.get('/api/reports/players', { preHandler: requireAdmin }, async (request) => {
    const query = z
      .object({
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(request.query);
    return await getPlayersReport(query);
  });

  app.get('/api/reports/reservations', { preHandler: requireAdmin }, async (request) => {
    const query = z
      .object({
        from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(request.query);
    return await getReservationsReport(query);
  });

  app.get('/api/reports/loyalty', { preHandler: requireAdmin }, async () => {
    return await getLoyaltyReport();
  });

  app.get('/api/players', { preHandler: requireAdmin }, async (request) => {
    const query = z
      .object({
        q: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      })
      .parse(request.query);
    const { pool } = await import('../db/pool.js');
    const values: unknown[] = [];
    let where = '';
    if (query.q) {
      values.push(`%${query.q}%`);
      where = 'WHERE p.name ILIKE $1 OR p.phone ILIKE $1';
    }
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.phone, p.email, p.photo_url, p.points, p.status, p.created_at,
              (SELECT count(*) FROM match_players mp WHERE mp.player_id = p.id AND mp.status = 'confirmed') AS total_matches,
              (SELECT count(*) FROM match_players mp JOIN matches m ON m.id = mp.match_id
                WHERE mp.player_id = p.id AND mp.status = 'confirmed' AND m.status = 'completed'
                  AND m.match_date >= date_trunc('month', now())::date) AS month_matches,
              (SELECT COALESCE(sum(pa.amount_cents),0) FROM payments pa
                WHERE pa.player_id = p.id AND pa.status IN ('pix_confirmed','paid_cash','paid_card','paid_manual_pix')) AS total_spent_cents
         FROM players p ${where}
        ORDER BY p.created_at DESC LIMIT ${Math.min(query.limit ?? 50, 200)} OFFSET ${query.offset ?? 0}`,
      values,
    );
    return { players: rows };
  });

  // Detalhe de um jogador (perfil administrativo)
  app.get('/api/players/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { pool } = await import('../db/pool.js');
    const player = await pool.query(
      `SELECT p.id, p.name, p.phone, p.email, p.photo_url, p.points, p.status, p.notes, p.created_at,
              (SELECT count(*) FROM match_players mp WHERE mp.player_id = p.id AND mp.status = 'confirmed') AS total_matches
         FROM players p WHERE p.id = $1`,
      [id],
    );
    if (player.rows.length === 0) {
      return { error: { code: 'NOT_FOUND', message: 'Jogador não encontrado' } };
    }
    const matches = await pool.query(
      `SELECT m.id, m.code, m.title, m.match_date, m.start_time, m.end_time, m.status,
              s.name AS sport_name, c.name AS court_name,
              mp.status AS participation_status, pay.status AS payment_status
         FROM match_players mp
         JOIN matches m ON m.id = mp.match_id
         JOIN sports s ON s.id = m.sport_id
         JOIN courts c ON c.id = m.court_id
         LEFT JOIN payments pay ON pay.match_id = m.id AND pay.player_id = mp.player_id
        WHERE mp.player_id = $1
        ORDER BY m.match_date DESC LIMIT 50`,
      [id],
    );
    const { listPlayerRewards } = await import('../modules/loyalty/loyalty-service.js');
    const rewards = await listPlayerRewards(id);
    return { player: player.rows[0], matches: matches.rows, rewards };
  });
}
