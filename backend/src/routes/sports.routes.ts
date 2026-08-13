import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { NotFoundError } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';

const sportSchema = z.object({
  name: z.string().min(2).max(80),
  icon: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  minPlayers: z.number().int().min(1),
  recommendedPlayers: z.number().int().min(1),
  maxPlayers: z.number().int().min(1),
  rules: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

export async function sportsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/sports', async () => {
    const { rows } = await pool.query(
      `SELECT id, name, icon, image_url, min_players, recommended_players, max_players, rules, active, sort_order
         FROM sports WHERE active = true ORDER BY sort_order ASC, name ASC`,
    );
    return { sports: rows };
  });

  app.get('/api/sports/admin', { preHandler: requireAdmin }, async () => {
    const { rows } = await pool.query('SELECT * FROM sports ORDER BY sort_order ASC, name ASC');
    return { sports: rows };
  });

  app.post('/api/sports', { preHandler: requireAdmin }, async (request, reply) => {
    const body = sportSchema.parse(request.body);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO sports (name, icon, image_url, min_players, recommended_players, max_players, rules, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,true)) RETURNING id`,
      [
        body.name,
        body.icon ?? null,
        body.imageUrl ?? null,
        body.minPlayers,
        body.recommendedPlayers,
        body.maxPlayers,
        body.rules ?? null,
        body.active ?? null,
      ],
    );
    await audit(request, 'admin.update', 'sport', rows[0]!.id, { action: 'create' });
    return reply.status(201).send({ id: rows[0]!.id });
  });

  app.put('/api/sports/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = sportSchema.partial().parse(request.body);
    const existing = await pool.query('SELECT id FROM sports WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new NotFoundError('Esporte não encontrado');

    const values: unknown[] = [];
    const sets: string[] = [];
    const map: Record<string, unknown> = {
      name: body.name,
      icon: body.icon ?? null,
      image_url: body.imageUrl ?? null,
      min_players: body.minPlayers,
      recommended_players: body.recommendedPlayers,
      max_players: body.maxPlayers,
      rules: body.rules ?? null,
      active: body.active,
    };
    for (const [col, val] of Object.entries(map)) {
      if (val !== undefined) {
        values.push(val);
        sets.push(`${col} = $${values.length}`);
      }
    }
    if (sets.length > 0) {
      values.push(id);
      await pool.query(
        `UPDATE sports SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
        values,
      );
    }
    await audit(request, 'admin.update', 'sport', id, { patch: Object.keys(body) });
    return reply.send({ ok: true });
  });

  app.delete('/api/sports/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await pool.query('DELETE FROM sports WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw new NotFoundError('Esporte não encontrado');
    await audit(request, 'admin.delete', 'sport', id);
    return reply.send({ ok: true });
  });
}
