import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import { addGuest, removeGuest } from '../modules/guests/guests-service.js';
import { processLoyaltyForMatch } from '../modules/loyalty/loyalty-service.js';
import {
  cancelMatch,
  completeMatch,
  createMatch,
  getMatchDetail,
  listMatches,
  updateMatch,
} from '../modules/matches/matches-service.js';
import { notifyPlayer } from '../modules/notifications/notifications-service.js';
import { removePlayerFromMatch } from '../modules/players/participation-service.js';
import { getSettings } from '../modules/settings/settings-service.js';
import { confirmPayment } from '../payments/provider.js';

const createMatchSchema = z.object({
  courtId: z.string().uuid(),
  sportId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  playersMax: z.number().int().min(1),
  priceOverrideCents: z.number().int().min(0).optional().nullable(),
  title: z.string().max(120).optional(),
  notes: z.string().optional(),
  organizerName: z.string().max(120).optional(),
});

const markPaidSchema = z.object({
  method: z.enum(['cash', 'card', 'manual_pix', 'pix_verified', 'other']),
  amountCents: z.number().int().min(0).optional(),
  transactionId: z.string().optional(),
  note: z.string().optional(),
});

export async function matchesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/matches', { preHandler: requireAdmin }, async (request) => {
    const query = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        status: z.string().optional(),
        sportId: z.string().uuid().optional(),
        courtId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      })
      .parse(request.query);
    const result = await listMatches(query);
    return result;
  });

  app.get('/api/matches/calendar', { preHandler: requireAdmin }, async (request) => {
    const query = z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(request.query);
    const { rows } = await pool.query(
      `SELECT m.id, m.title, m.match_date, m.start_time, m.end_time, m.status,
              m.players_max, m.price_per_player_cents, m.total_value_cents,
              c.name AS court_name, c.color AS court_color, s.name AS sport_name, s.icon AS sport_icon,
              (SELECT count(*) FROM match_players mp WHERE mp.match_id = m.id AND mp.status = 'confirmed') AS confirmed
         FROM matches m JOIN courts c ON c.id = m.court_id JOIN sports s ON s.id = m.sport_id
        WHERE m.match_date BETWEEN $1::date AND $2::date
        ORDER BY m.match_date ASC, m.start_time ASC`,
      [query.from, query.to],
    );
    return { events: rows };
  });

  app.post('/api/matches', { preHandler: requireAdmin }, async (request, reply) => {
    const body = createMatchSchema.parse(request.body);
    if (request.auth?.scope !== 'admin') return;
    const match = await createMatch({
      ...body,
      createdBy: request.auth.sub,
    });
    await audit(request, 'match.create', 'match', match.id as string, { code: match.code });
    return reply.status(201).send({ match });
  });

  app.get('/api/matches/:id', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const detail = await getMatchDetail(id);
    return detail;
  });

  app.put('/api/matches/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        title: z.string().max(120).optional(),
        playersMax: z.number().int().min(1).optional(),
        priceOverrideCents: z.number().int().min(0).nullable().optional(),
        notes: z.string().optional(),
        status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
      })
      .parse(request.body);
    await updateMatch(id, body);
    await audit(request, 'match.update', 'match', id, { patch: Object.keys(body) });
    return reply.send({ ok: true });
  });

  app.post('/api/matches/:id/cancel', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await cancelMatch(id);
    await audit(request, 'match.cancel', 'match', id);
    return reply.send({ ok: true });
  });

  app.post('/api/matches/:id/complete', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await completeMatch(id);
    await processLoyaltyForMatch(id);
    await audit(request, 'match.complete', 'match', id);
    return reply.send({ ok: true });
  });

  // Confirmar pagamento de um jogador (presencial ou PIX informado)
  app.post(
    '/api/matches/:id/players/:playerId/mark-paid',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id, playerId } = z
        .object({ id: z.string().uuid(), playerId: z.string().uuid() })
        .parse(request.params);
      const body = markPaidSchema.parse(request.body);
      if (request.auth?.scope !== 'admin') return;

      const payment = await pool.query<{ id: string }>(
        'SELECT id FROM payments WHERE match_id = $1 AND player_id = $2',
        [id, playerId],
      );
      if (payment.rows.length === 0) throw new NotFoundError('Pagamento não encontrado');

      await confirmPayment({
        paymentId: payment.rows[0]!.id,
        adminUserId: request.auth.sub,
        method: body.method,
        amountCents: body.amountCents,
        transactionId: body.transactionId,
        note: body.note,
      });

      await audit(request, 'payment.confirm', 'payment', payment.rows[0]!.id, {
        matchId: id,
        playerId,
        method: body.method,
      });

      // Notifica jogador + XP pagamento antecipado
      await notifyPlayer({
        playerId,
        type: 'payment.confirmed',
        title: 'Pagamento confirmado 🎉',
        body: 'Seu pagamento foi confirmado. Até a quadra!',
        data: { matchId: id },
      });
      const settings = await getSettings();
      if (settings.loyalty.pointsEnabled) {
        await pool.query(
          `INSERT INTO player_points (player_id, match_id, points, reason)
         VALUES ($1, $2, $3, 'pagamento_antecipado')
         ON CONFLICT DO NOTHING`,
          [playerId, id, settings.loyalty.earlyPaymentXp],
        );
        await pool.query('UPDATE players SET points = points + $1 WHERE id = $2', [
          settings.loyalty.earlyPaymentXp,
          playerId,
        ]);
      }

      return reply.send({ ok: true });
    },
  );

  // Rejeitar pagamento PIX informado (volta a pendente)
  app.post(
    '/api/matches/:id/players/:playerId/reject-pix',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id, playerId } = z
        .object({ id: z.string().uuid(), playerId: z.string().uuid() })
        .parse(request.params);
      const updated = await pool.query(
        `UPDATE payments SET status = 'pix_initiated', claimed_at = NULL, updated_at = now()
        WHERE match_id = $1 AND player_id = $2 AND status = 'pix_claimed_paid' RETURNING id`,
        [id, playerId],
      );
      if (updated.rows.length === 0) {
        throw new ConflictError('Pagamento não está no estado "informado como pago"');
      }
      await audit(request, 'payment.reject', 'payment', updated.rows[0].id, { matchId: id, playerId });
      return reply.send({ ok: true });
    },
  );

  app.delete('/api/matches/:id/players/:playerId', { preHandler: requireAdmin }, async (request, reply) => {
    const { id, playerId } = z
      .object({ id: z.string().uuid(), playerId: z.string().uuid() })
      .parse(request.params);
    await removePlayerFromMatch({ matchId: id, playerId });
    await audit(request, 'player.remove', 'match', id, { playerId });
    return reply.send({ ok: true });
  });

  // Convidados
  app.get('/api/matches/:id/guests', { preHandler: requireAdmin }, async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { listGuests } = await import('../modules/guests/guests-service.js');
    return { guests: await listGuests(id) };
  });

  app.post('/api/matches/:id/guests', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ name: z.string().min(2), phone: z.string().optional() }).parse(request.body);
    const guest = await addGuest({ matchId: id, name: body.name, phone: body.phone });
    await audit(request, 'guest.add', 'guest', guest.id as string, { matchId: id });
    return reply.status(201).send({ guest });
  });

  app.delete('/api/matches/:id/guests/:guestId', { preHandler: requireAdmin }, async (request, reply) => {
    const { id, guestId } = z
      .object({ id: z.string().uuid(), guestId: z.string().uuid() })
      .parse(request.params);
    await removeGuest(id, guestId);
    await audit(request, 'guest.remove', 'guest', guestId, { matchId: id });
    return reply.send({ ok: true });
  });
}
