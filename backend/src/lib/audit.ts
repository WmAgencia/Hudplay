import type { FastifyRequest } from 'fastify';
import { pool } from '../db/pool.js';

export type AuditAction =
  | 'match.create'
  | 'match.update'
  | 'match.cancel'
  | 'match.complete'
  | 'player.remove'
  | 'payment.confirm'
  | 'payment.reject'
  | 'payment.refund'
  | 'guest.add'
  | 'guest.remove'
  | 'reward.use'
  | 'loyalty.process'
  | 'settings.update'
  | 'admin.create'
  | 'admin.update'
  | 'admin.delete';

export async function audit(
  request: FastifyRequest | null,
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  details?: unknown,
): Promise<void> {
  const adminId = request?.auth?.scope === 'admin' ? request.auth.sub : null;
  const ip = request?.ip ?? null;
  await pool.query(
    `INSERT INTO audit_logs (admin_user_id, action, entity_type, entity_id, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [adminId, action, entityType, entityId, JSON.stringify(details ?? {}), ip],
  );
}
