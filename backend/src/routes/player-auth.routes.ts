import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyRefreshToken } from '../auth/jwt.js';
import { hashPassword } from '../auth/passwords.js';
import { loginPlayer, rotateRefreshToken } from '../auth/service.js';
import { pool } from '../db/pool.js';
import { normalizePhone } from '../lib/ids.js';
import { requirePlayer } from '../middleware/auth.js';
import { getSettings } from '../modules/settings/settings-service.js';

const loginSchema = z.object({
  phone: z.string().min(8),
  password: z.string().min(6),
});

const registerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  password: z.string().min(6),
});

export async function playerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/player/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await loginPlayer(
      normalizePhone(body.phone),
      body.password,
      request.headers['user-agent'],
    );
    return reply.send(result);
  });

  app.post('/api/player/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const phone = normalizePhone(body.phone);

    const existing = await pool.query<{ id: string; password_hash: string | null }>(
      'SELECT id, password_hash FROM players WHERE phone = $1',
      [phone],
    );
    const hash = await hashPassword(body.password);
    if (existing.rows[0]) {
      // Vincula a conta existente a uma senha (criada via link público).
      if (existing.rows[0].password_hash) {
        return reply.status(409).send({
          error: { code: 'ALREADY_REGISTERED', message: 'Este telefone já possui cadastro' },
        });
      }
      await pool.query('UPDATE players SET name = $2, password_hash = $3, updated_at = now() WHERE id = $1', [
        existing.rows[0].id,
        body.name.trim(),
        hash,
      ]);
      const result = await loginPlayer(phone, body.password, request.headers['user-agent']);
      return reply.send(result);
    }

    const created = await pool.query<{ id: string }>(
      `INSERT INTO players (name, phone, password_hash, status) VALUES ($1, $2, $3, 'active') RETURNING id`,
      [body.name.trim(), phone, hash],
    );
    const result = await loginPlayer(phone, body.password, request.headers['user-agent']);
    return reply.send({ ...result, playerId: created.rows[0]!.id });
  });

  app.post('/api/player/auth/refresh', async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string().min(1) }).parse(request.body);
    const payload = await verifyRefreshToken(refreshToken);
    if (payload.scope !== 'player') {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Refresh inválido' } });
      return;
    }
    const player = await pool.query<{ id: string; name: string; status: string }>(
      'SELECT id, name, status FROM players WHERE id = $1',
      [payload.sub],
    );
    if (!player.rows[0] || player.rows[0].status !== 'active') {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Conta inativa' } });
      return;
    }
    const result = await rotateRefreshToken(
      refreshToken,
      'player',
      {
        sub: player.rows[0].id,
        name: player.rows[0].name,
      },
      request.headers['user-agent'],
    );
    if (!result) {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sessão expirada' } });
      return;
    }
    return reply.send(result);
  });

  app.get('/api/player/me', { preHandler: requirePlayer }, async (request) => {
    const payload = request.auth;
    if (!payload || payload.scope !== 'player') return { user: null };
    const settings = await getSettings();
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.phone, p.email, p.photo_url, p.points, p.status, p.created_at
         FROM players p WHERE p.id = $1`,
      [payload.sub],
    );
    const player = rows[0];
    if (!player) return { user: null };
    const { countPlayerProgress, listPlayerRewards } = await import('../modules/loyalty/loyalty-service.js');
    const progress = await countPlayerProgress(payload.sub, 'month');
    const rewards = await listPlayerRewards(payload.sub);
    return {
      user: {
        ...player,
        loyaltyEnabled: settings.loyalty.enabled,
        pointsEnabled: settings.loyalty.pointsEnabled,
        monthMatches: progress.count,
        nextRewardProgress: progress.nextRule
          ? {
              remaining:
                (progress.nextRule as { required_matches: number }).required_matches - progress.count,
            }
          : null,
        rewards,
      },
    };
  });

  app.patch('/api/player/me', { preHandler: requirePlayer }, async (request, reply) => {
    const payload = request.auth;
    if (!payload || payload.scope !== 'player') {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Não autorizado' } });
    }
    const schema = z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional().or(z.literal('')),
      photoUrl: z.string().url().optional().or(z.literal('')),
      password: z.string().min(6).optional(),
    });
    const body = schema.parse(request.body);
    const sets: string[] = [];
    const values: unknown[] = [];
    if (body.name) {
      values.push(body.name.trim());
      sets.push(`name = $${values.length}`);
    }
    if (body.email !== undefined) {
      values.push(body.email);
      sets.push(`email = $${values.length}`);
    }
    if (body.photoUrl !== undefined) {
      values.push(body.photoUrl);
      sets.push(`photo_url = $${values.length}`);
    }
    if (body.password) {
      const hash = await hashPassword(body.password);
      values.push(hash);
      sets.push(`password_hash = $${values.length}`);
    }
    if (sets.length > 0) {
      values.push(payload.sub);
      await pool.query(
        `UPDATE players SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
        values,
      );
    }
    return reply.send({ ok: true });
  });
}
