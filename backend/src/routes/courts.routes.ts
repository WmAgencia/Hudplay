import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';

const courtSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  capacity: z.number().int().min(0),
  pricePerHourCents: z.number().int().min(0),
  color: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
  sportIds: z.array(z.string().uuid()).optional(),
  schedules: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        active: z.boolean().optional(),
      }),
    )
    .optional(),
  prices: z
    .array(
      z.object({
        sportId: z.string().uuid().optional().nullable(),
        dayOfWeek: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
        pricePerHourCents: z.number().int().min(0),
      }),
    )
    .optional(),
});

export async function courtsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/courts', async () => {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.photo_url, c.capacity, c.price_per_hour_cents,
              c.color, c.status,
              (SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'icon', s.icon, 'max_players', s.max_players))
                 FROM court_sports cs JOIN sports s ON s.id = cs.sport_id WHERE cs.court_id = c.id) AS sports
         FROM courts c WHERE c.status = 'active' ORDER BY c.name ASC`,
    );
    return { courts: rows };
  });

  app.get('/api/courts/admin', { preHandler: requireAdmin }, async () => {
    const { rows } = await pool.query(
      `SELECT c.*,
              (SELECT json_agg(s.id) FROM court_sports cs JOIN sports s ON s.id = cs.sport_id WHERE cs.court_id = c.id) AS sport_ids,
              (SELECT json_agg(s) FROM (SELECT id, day_of_week, start_time, end_time, active FROM schedules WHERE court_id = c.id ORDER BY day_of_week, start_time) s) AS schedules,
              (SELECT json_agg(p) FROM (SELECT id, sport_id, day_of_week, start_time, end_time, price_per_hour_cents FROM prices WHERE court_id = c.id ORDER BY day_of_week, start_time) p) AS prices
         FROM courts c ORDER BY c.name ASC`,
    );
    return { courts: rows };
  });

  app.get('/api/courts/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.description, c.photo_url, c.capacity, c.price_per_hour_cents, c.color, c.status,
              (SELECT json_agg(s.id) FROM court_sports cs JOIN sports s ON s.id = cs.sport_id WHERE cs.court_id = c.id) AS sport_ids,
              (SELECT json_agg(s) FROM (SELECT id, day_of_week, start_time, end_time, active FROM schedules WHERE court_id = c.id ORDER BY day_of_week, start_time) s) AS schedules,
              (SELECT json_agg(p) FROM (SELECT id, sport_id, day_of_week, start_time, end_time, price_per_hour_cents FROM prices WHERE court_id = c.id ORDER BY day_of_week, start_time) p) AS prices
         FROM courts c WHERE c.id = $1`,
      [id],
    );
    if (rows.length === 0) throw new NotFoundError('Quadra não encontrada');
    return { court: rows[0] };
  });

  app.post('/api/courts', { preHandler: requireAdmin }, async (request, reply) => {
    const body = courtSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO courts (name, description, photo_url, capacity, price_per_hour_cents, color, status)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'active')) RETURNING id`,
        [
          body.name,
          body.description ?? null,
          body.photoUrl ?? null,
          body.capacity,
          body.pricePerHourCents,
          body.color ?? null,
          body.status ?? null,
        ],
      );
      const courtId = rows[0]!.id;
      if (body.sportIds?.length) {
        for (const sportId of body.sportIds) {
          await client.query('INSERT INTO court_sports (court_id, sport_id) VALUES ($1,$2)', [
            courtId,
            sportId,
          ]);
        }
      }
      if (body.schedules?.length) {
        for (const s of body.schedules) {
          await client.query(
            `INSERT INTO schedules (court_id, day_of_week, start_time, end_time, active)
             VALUES ($1,$2,$3,$4,COALESCE($5,true))`,
            [courtId, s.dayOfWeek, s.startTime, s.endTime, s.active ?? null],
          );
        }
      }
      if (body.prices?.length) {
        for (const p of body.prices) {
          await client.query(
            `INSERT INTO prices (court_id, sport_id, day_of_week, start_time, end_time, price_per_hour_cents)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [courtId, p.sportId ?? null, p.dayOfWeek, p.startTime, p.endTime, p.pricePerHourCents],
          );
        }
      }
      await client.query('COMMIT');
      await audit(request, 'admin.update', 'court', courtId, { action: 'create' });
      return reply.status(201).send({ id: courtId });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.put('/api/courts/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = courtSchema.partial().parse(request.body);
    const existing = await pool.query('SELECT id FROM courts WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new NotFoundError('Quadra não encontrada');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const values: unknown[] = [];
      const sets: string[] = [];
      const map: Record<string, unknown> = {
        name: body.name,
        description: body.description ?? null,
        photo_url: body.photoUrl ?? null,
        capacity: body.capacity,
        price_per_hour_cents: body.pricePerHourCents,
        color: body.color ?? null,
        status: body.status,
      };
      for (const [col, val] of Object.entries(map)) {
        if (val !== undefined) {
          values.push(val);
          sets.push(`${col} = $${values.length}`);
        }
      }
      if (sets.length > 0) {
        values.push(id);
        await client.query(
          `UPDATE courts SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
          values,
        );
      }
      if (body.sportIds) {
        await client.query('DELETE FROM court_sports WHERE court_id = $1', [id]);
        for (const sportId of body.sportIds) {
          await client.query(
            'INSERT INTO court_sports (court_id, sport_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [id, sportId],
          );
        }
      }
      if (body.schedules) {
        await client.query('DELETE FROM schedules WHERE court_id = $1', [id]);
        for (const s of body.schedules) {
          await client.query(
            `INSERT INTO schedules (court_id, day_of_week, start_time, end_time, active)
             VALUES ($1,$2,$3,$4,COALESCE($5,true))`,
            [id, s.dayOfWeek, s.startTime, s.endTime, s.active ?? null],
          );
        }
      }
      if (body.prices) {
        await client.query('DELETE FROM prices WHERE court_id = $1', [id]);
        for (const p of body.prices) {
          await client.query(
            `INSERT INTO prices (court_id, sport_id, day_of_week, start_time, end_time, price_per_hour_cents)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [id, p.sportId ?? null, p.dayOfWeek, p.startTime, p.endTime, p.pricePerHourCents],
          );
        }
      }
      await client.query('COMMIT');
      await audit(request, 'admin.update', 'court', id, { patch: Object.keys(body) });
      return reply.send({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.delete('/api/courts/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const hasMatches = await pool.query('SELECT id FROM matches WHERE court_id = $1 LIMIT 1', [id]);
    if (hasMatches.rows.length > 0) {
      throw new ValidationError('Não é possível excluir uma quadra com partidas vinculadas');
    }
    const result = await pool.query('DELETE FROM courts WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw new NotFoundError('Quadra não encontrada');
    await audit(request, 'admin.delete', 'court', id);
    return reply.send({ ok: true });
  });

  // Disponibilidade: horários livres da quadra para uma data
  app.get('/api/courts/:id/availability', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.query);
    const dow = new Date(`${date}T00:00:00`).getDay();

    const { rows: sched } = await pool.query<{ start_time: string; end_time: string }>(
      'SELECT start_time, end_time FROM schedules WHERE court_id = $1 AND day_of_week = $2 AND active = true ORDER BY start_time',
      [id, dow],
    );
    const { rows: busy } = await pool.query<{ start_time: string; end_time: string }>(
      `SELECT start_time, end_time FROM matches WHERE court_id = $1 AND match_date = $2 AND status <> 'cancelled'`,
      [id, date],
    );

    const free = sched.map((slot) => {
      const overlapping = busy.filter((b) => slot.start_time < b.end_time && b.start_time < slot.end_time);
      return { start: slot.start_time, end: slot.end_time, busy: overlapping };
    });

    return { date, dow, slots: free };
  });
}
