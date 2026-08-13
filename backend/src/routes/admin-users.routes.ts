import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword } from '../auth/passwords.js';
import { pool } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { NotFoundError } from '../lib/errors.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import { listRewardsCatalog, useReward } from '../modules/loyalty/loyalty-service.js';

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(['owner', 'admin', 'employee']).default('employee'),
  permissions: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export async function adminUsersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin-users', { preHandler: requireAdmin }, async () => {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, permissions, active, created_at FROM admin_users ORDER BY created_at ASC',
    );
    return { users: rows };
  });

  app.post('/api/admin-users', { preHandler: requireRole('owner') }, async (request, reply) => {
    const body = userSchema.parse(request.body);
    const password = body.password ?? randomPassword();
    const hash = await hashPassword(password);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO admin_users (name, email, password_hash, role, permissions, active)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, true)) RETURNING id`,
      [
        body.name,
        body.email.toLowerCase().trim(),
        hash,
        body.role,
        JSON.stringify(body.permissions ?? []),
        body.active ?? null,
      ],
    );
    const adminId = rows[0]?.id;
    if (!adminId) throw new Error('Falha ao criar usuário');
    await audit(request, 'admin.create', 'admin', adminId, { role: body.role });
    return reply.status(201).send({ id: adminId, temporaryPassword: password });
  });

  app.put('/api/admin-users/:id', { preHandler: requireRole('owner') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = userSchema.partial().parse(request.body);
    const existing = await pool.query('SELECT id FROM admin_users WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new NotFoundError('Usuário não encontrado');

    const values: unknown[] = [];
    const sets: string[] = [];
    if (body.name) {
      values.push(body.name);
      sets.push(`name = $${values.length}`);
    }
    if (body.email) {
      values.push(body.email.toLowerCase().trim());
      sets.push(`email = $${values.length}`);
    }
    if (body.role) {
      values.push(body.role);
      sets.push(`role = $${values.length}`);
    }
    if (body.permissions) {
      values.push(JSON.stringify(body.permissions));
      sets.push(`permissions = $${values.length}`);
    }
    if (body.active !== undefined) {
      values.push(body.active);
      sets.push(`active = $${values.length}`);
    }
    if (body.password) {
      const hash = await hashPassword(body.password);
      values.push(hash);
      sets.push(`password_hash = $${values.length}`);
    }
    if (sets.length > 0) {
      values.push(id);
      await pool.query(
        `UPDATE admin_users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
        values,
      );
    }
    await audit(request, 'admin.update', 'admin', id, { patch: Object.keys(body) });
    return reply.send({ ok: true });
  });

  app.delete('/api/admin-users/:id', { preHandler: requireRole('owner') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const target = await pool.query<{ role: string }>('SELECT role FROM admin_users WHERE id = $1', [id]);
    if (target.rows.length === 0) throw new NotFoundError('Usuário não encontrado');
    if (target.rows[0]!.role === 'owner') {
      return reply
        .status(400)
        .send({ error: { code: 'BAD_REQUEST', message: 'O proprietário não pode ser excluído' } });
    }
    await pool.query('DELETE FROM admin_users WHERE id = $1', [id]);
    await audit(request, 'admin.delete', 'admin', id);
    return reply.send({ ok: true });
  });
}

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function loyaltyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/loyalty/rewards', { preHandler: requireAdmin }, async () => {
    return { rewards: await listRewardsCatalog() };
  });

  app.post('/api/loyalty/rewards', { preHandler: requireAdmin }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(2),
        type: z.enum(['free_hours', 'discount', 'credit', 'drink', 'food', 'product', 'gift', 'other']),
        value: z.record(z.unknown()).optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO rewards (name, type, value, active) VALUES ($1, $2, $3, COALESCE($4, true)) RETURNING id`,
      [body.name, body.type, JSON.stringify(body.value ?? {}), body.active ?? null],
    );
    return reply.status(201).send({ id: rows[0]!.id });
  });

  app.put('/api/loyalty/rewards/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(2).optional(),
        type: z
          .enum(['free_hours', 'discount', 'credit', 'drink', 'food', 'product', 'gift', 'other'])
          .optional(),
        value: z.record(z.unknown()).optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);
    const values: unknown[] = [];
    const sets: string[] = [];
    if (body.name) {
      values.push(body.name);
      sets.push(`name = $${values.length}`);
    }
    if (body.type) {
      values.push(body.type);
      sets.push(`type = $${values.length}`);
    }
    if (body.value) {
      values.push(JSON.stringify(body.value));
      sets.push(`value = $${values.length}`);
    }
    if (body.active !== undefined) {
      values.push(body.active);
      sets.push(`active = $${values.length}`);
    }
    if (sets.length > 0) {
      values.push(id);
      await pool.query(
        `UPDATE rewards SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
        values,
      );
    }
    return reply.send({ ok: true });
  });

  app.delete('/api/loyalty/rewards/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await pool.query('DELETE FROM rewards WHERE id = $1', [id]);
    return reply.send({ ok: true });
  });

  // Regras de fidelidade
  app.get('/api/loyalty/rules', { preHandler: requireAdmin }, async () => {
    const { rows } = await pool.query(
      `SELECT lr.*, r.name AS reward_name FROM loyalty_rules lr
         LEFT JOIN rewards r ON r.id = lr.reward_id
        ORDER BY lr.required_matches ASC`,
    );
    return { rules: rows };
  });

  app.post('/api/loyalty/rules', { preHandler: requireAdmin }, async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(2),
        description: z.string().optional(),
        rewardId: z.string().uuid().nullable().optional(),
        requiredMatches: z.number().int().min(1),
        period: z.enum(['week', 'month', 'all_time']).default('month'),
        validUntil: z.string().date().optional().nullable(),
        maxUses: z.number().int().min(1).optional().nullable(),
        active: z.boolean().optional(),
      })
      .parse(request.body);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO loyalty_rules (name, description, reward_id, required_matches, period, valid_until, max_uses, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, true)) RETURNING id`,
      [
        body.name,
        body.description ?? null,
        body.rewardId ?? null,
        body.requiredMatches,
        body.period,
        body.validUntil ?? null,
        body.maxUses ?? null,
        body.active ?? null,
      ],
    );
    return reply.status(201).send({ id: rows[0]!.id });
  });

  app.put('/api/loyalty/rules/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(2).optional(),
        description: z.string().nullable().optional(),
        rewardId: z.string().uuid().nullable().optional(),
        requiredMatches: z.number().int().min(1).optional(),
        period: z.enum(['week', 'month', 'all_time']).optional(),
        validUntil: z.string().date().nullable().optional(),
        maxUses: z.number().int().min(1).nullable().optional(),
        active: z.boolean().optional(),
      })
      .parse(request.body);
    const values: unknown[] = [];
    const sets: string[] = [];
    const map: Record<string, unknown> = {
      name: body.name,
      description: body.description ?? null,
      reward_id: body.rewardId ?? null,
      required_matches: body.requiredMatches,
      period: body.period,
      valid_until: body.validUntil ?? null,
      max_uses: body.maxUses ?? null,
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
        `UPDATE loyalty_rules SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
        values,
      );
    }
    return reply.send({ ok: true });
  });

  app.delete('/api/loyalty/rules/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await pool.query('DELETE FROM loyalty_rules WHERE id = $1', [id]);
    return reply.send({ ok: true });
  });

  // Recompensas concedidas (painel)
  app.get('/api/loyalty/player-rewards', { preHandler: requireAdmin }, async () => {
    const { rows } = await pool.query(
      `SELECT pr.id, pr.code, pr.status, pr.granted_at, pr.used_at,
              p.name AS player_name, p.phone AS player_phone,
              r.name AS reward_name, r.type AS reward_type,
              lr.name AS rule_name
         FROM player_rewards pr
         JOIN players p ON p.id = pr.player_id
         LEFT JOIN rewards r ON r.id = pr.reward_id
         LEFT JOIN loyalty_rules lr ON lr.id = pr.rule_id
        ORDER BY pr.granted_at DESC LIMIT 100`,
    );
    return { rewards: rows };
  });

  app.post('/api/loyalty/player-rewards/:id/use', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    if (request.auth?.scope !== 'admin') return;
    await useReward({ rewardId: id, adminUserId: request.auth.sub });
    await audit(request, 'reward.use', 'reward', id);
    return reply.send({ ok: true });
  });

  // Reprocessar fidelidade manualmente
  app.post('/api/loyalty/process', { preHandler: requireAdmin }, async (request, reply) => {
    const { matchId } = z.object({ matchId: z.string().uuid() }).parse(request.body);
    const { processLoyaltyForMatch } = await import('../modules/loyalty/loyalty-service.js');
    await processLoyaltyForMatch(matchId);
    await audit(request, 'loyalty.process', 'match', matchId);
    return reply.send({ ok: true });
  });
}
