import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { ConflictError } from '../lib/errors.js';
import { requirePlayer } from '../middleware/auth.js';
import { listPlayerRewards } from '../modules/loyalty/loyalty-service.js';
import {
  listPlayerNotifications,
  markPlayerNotificationRead,
} from '../modules/notifications/notifications-service.js';
import { joinMatch } from '../modules/players/participation-service.js';

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  // Partidas disponíveis (encontrar partida) — sem auth para discovery pública
  app.get('/api/player/matches/find', async (request) => {
    const query = z
      .object({
        sportId: z.string().uuid().optional(),
        courtId: z.string().uuid().optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
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

    const where: string[] = ["m.status = 'scheduled'"];
    const values: unknown[] = [];
    if (query.sportId) {
      values.push(query.sportId);
      where.push(`m.sport_id = $${values.length}`);
    }
    if (query.courtId) {
      values.push(query.courtId);
      where.push(`m.court_id = $${values.length}`);
    }
    if (query.date) {
      values.push(query.date);
      where.push(`m.match_date = $${values.length}::date`);
    } else {
      values.push(query.from ?? new Date().toISOString().slice(0, 10));
      where.push(`m.match_date >= $${values.length}::date`);
      if (query.to) {
        values.push(query.to);
        where.push(`m.match_date <= $${values.length}::date`);
      }
    }

    const { rows } = await pool.query(
      `SELECT m.id, m.code, m.title, m.match_date, m.start_time, m.end_time, m.players_max,
              m.price_per_player_cents, m.status,
              c.name AS court_name, s.name AS sport_name, s.icon AS sport_icon,
              (SELECT count(*) FROM match_players mp WHERE mp.match_id = m.id AND mp.status = 'confirmed') AS confirmed
         FROM matches m
         JOIN courts c ON c.id = m.court_id
         JOIN sports s ON s.id = m.sport_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.match_date ASC, m.start_time ASC
        LIMIT 100`,
      values,
    );
    return { matches: rows };
  });

  // Minhas partidas
  app.get('/api/player/me/matches', { preHandler: requirePlayer }, async (request) => {
    if (request.auth?.scope !== 'player') return { matches: [] };
    const { rows } = await pool.query(
      `SELECT m.id, m.code, m.title, m.match_date, m.start_time, m.end_time, m.players_max,
              m.price_per_player_cents, m.status,
              c.name AS court_name, s.name AS sport_name, s.icon AS sport_icon,
              mp.status AS participation_status,
              pay.status AS payment_status, pay.method AS payment_method,
              (SELECT count(*) FROM match_players x WHERE x.match_id = m.id AND x.status = 'confirmed') AS confirmed
         FROM match_players mp
         JOIN matches m ON m.id = mp.match_id
         JOIN courts c ON c.id = m.court_id
         JOIN sports s ON s.id = m.sport_id
         LEFT JOIN payments pay ON pay.match_id = m.id AND pay.player_id = mp.player_id
        WHERE mp.player_id = $1
        ORDER BY m.match_date DESC, m.start_time DESC
        LIMIT 100`,
      [request.auth.sub],
    );
    return { matches: rows };
  });

  // Recompensas
  app.get('/api/player/me/rewards', { preHandler: requirePlayer }, async (request) => {
    if (request.auth?.scope !== 'player') return { rewards: [] };
    return { rewards: await listPlayerRewards(request.auth.sub) };
  });

  // Notificações
  app.get('/api/player/me/notifications', { preHandler: requirePlayer }, async (request) => {
    if (request.auth?.scope !== 'player') return { notifications: [] };
    return { notifications: await listPlayerNotifications(request.auth.sub) };
  });

  app.patch(
    '/api/player/me/notifications/:id/read',
    { preHandler: requirePlayer },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      if (request.auth?.scope !== 'player') return;
      await markPlayerNotificationRead(id, request.auth.sub);
      return reply.send({ ok: true });
    },
  );

  // Entrar direto numa partida pelo app (mesmo fluxo da página pública)
  app.post('/api/player/matches/:code/join', { preHandler: requirePlayer }, async (request, reply) => {
    const { code } = z.object({ code: z.string().min(4).max(20) }).parse(request.params);
    if (request.auth?.scope !== 'player') return;
    const body = z.object({ paymentMethod: z.enum(['pix', 'pay_at_court']) }).parse(request.body);

    const player = await pool.query<{ name: string; phone: string; photo_url: string | null }>(
      'SELECT name, phone, photo_url FROM players WHERE id = $1',
      [request.auth.sub],
    );
    if (!player.rows[0]) throw new ConflictError('Jogador não encontrado');

    const result = await joinMatch({
      matchCode: code,
      name: player.rows[0].name,
      phone: player.rows[0].phone,
      photoUrl: player.rows[0].photo_url ?? undefined,
      paymentMethod: body.paymentMethod,
    });
    return reply.status(201).send(result);
  });
}
