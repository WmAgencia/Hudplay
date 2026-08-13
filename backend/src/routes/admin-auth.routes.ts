import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyRefreshToken } from '../auth/jwt.js';
import { loginAdmin, revokeAllForSubject, revokeRefreshToken, rotateRefreshToken } from '../auth/service.js';
import { pool } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { requireAdmin } from '../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha muito curta'),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await loginAdmin(body.email, body.password, request.headers['user-agent']);
    return reply.send(result);
  });

  app.post('/api/auth/refresh', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    const payload = await verifyRefreshToken(refreshToken);
    if (payload.scope !== 'admin') {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Refresh inválido' } });
      return;
    }
    const admin = await pool.query<{
      id: string;
      role: 'owner' | 'admin' | 'employee';
      name: string;
      active: boolean;
    }>('SELECT id, role, name, active FROM admin_users WHERE id = $1', [payload.sub]);
    if (!admin.rows[0] || !admin.rows[0].active) {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Conta inativa' } });
      return;
    }
    const result = await rotateRefreshToken(
      refreshToken,
      'admin',
      {
        sub: admin.rows[0].id,
        role: admin.rows[0].role,
        name: admin.rows[0].name,
      },
      request.headers['user-agent'],
    );
    if (!result) {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Sessão expirada' } });
      return;
    }
    return reply.send(result);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    try {
      const payload = await verifyRefreshToken(refreshToken);
      await revokeRefreshToken(payload.tokenId);
    } catch {
      // token já inválido — idempotente
    }
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', { preHandler: requireAdmin }, async (request) => {
    const payload = request.auth;
    if (!payload || payload.scope !== 'admin') return { user: null };
    const { rows } = await pool.query(
      'SELECT id, name, email, role, permissions, active FROM admin_users WHERE id = $1',
      [payload.sub],
    );
    return { user: rows[0] ?? null };
  });

  app.post('/api/auth/change-password', { preHandler: requireAdmin }, async (request, reply) => {
    const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) });
    const body = schema.parse(request.body);
    const payload = request.auth;
    if (!payload || payload.scope !== 'admin') {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Não autorizado' } });
    }
    const { hashPassword, verifyPassword } = await import('../auth/passwords.js');
    const admin = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM admin_users WHERE id = $1',
      [payload.sub],
    );
    if (!admin.rows[0] || !(await verifyPassword(admin.rows[0].password_hash, body.currentPassword))) {
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'Senha atual incorreta' } });
    }
    const hash = await hashPassword(body.newPassword);
    await pool.query('UPDATE admin_users SET password_hash = $2, updated_at = now() WHERE id = $1', [
      payload.sub,
      hash,
    ]);
    await revokeAllForSubject(payload.sub, 'admin');
    return reply.send({ ok: true });
  });
}
