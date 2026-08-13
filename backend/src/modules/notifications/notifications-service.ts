import { pool } from '../../db/pool.js';

export type NotificationType =
  | 'match.joined'
  | 'match.cancelled'
  | 'match.reminder'
  | 'match.spot_available'
  | 'match.full'
  | 'payment.pix_claimed'
  | 'payment.pix_confirmed'
  | 'payment.confirmed'
  | 'reward.granted'
  | 'reward.near'
  | 'waitlist.accept'
  | 'system';

export async function notifyPlayer(params: {
  playerId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: unknown;
}): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (player_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.playerId, params.type, params.title, params.body ?? null, JSON.stringify(params.data ?? {})],
  );
}

export async function notifyAdmin(params: {
  adminUserId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: unknown;
}): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (admin_user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.adminUserId, params.type, params.title, params.body ?? null, JSON.stringify(params.data ?? {})],
  );
}

export async function listPlayerNotifications(playerId: string, unreadOnly = false): Promise<unknown[]> {
  const { rows } = await pool.query(
    `SELECT id, type, title, body, data, read_at, created_at
       FROM notifications
      WHERE player_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
      ORDER BY created_at DESC
      LIMIT 50`,
    [playerId],
  );
  return rows;
}

export async function markPlayerNotificationRead(notificationId: string, playerId: string): Promise<void> {
  await pool.query(
    `UPDATE notifications SET read_at = now()
      WHERE id = $1 AND player_id = $2 AND read_at IS NULL`,
    [notificationId, playerId],
  );
}
