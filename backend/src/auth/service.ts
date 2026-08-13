import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { UnauthorizedError } from '../lib/errors.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './jwt.js';

/**
 * Emite um par access + refresh. Persiste o refresh token (revogável e rotativo)
 * na tabela refresh_tokens.
 */
export async function issueTokens(
  subjectId: string,
  scope: 'admin' | 'player',
  payload: { role?: 'owner' | 'admin' | 'employee'; name?: string },
  userAgent?: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const tokenId = randomUUID();
  const accessToken = await signAccessToken({
    sub: subjectId,
    scope,
    ...(payload.role ? { role: payload.role } : {}),
    ...(payload.name ? { name: payload.name } : {}),
  } as { sub: string; scope: 'admin' | 'player'; role?: 'owner' | 'admin' | 'employee'; name?: string });

  const refreshToken = await signRefreshToken(subjectId, scope, tokenId);
  const expiresAt = new Date(Date.now() + parseTtlSeconds(env.JWT_REFRESH_TTL) * 1000);

  await pool.query(
    `INSERT INTO refresh_tokens (subject_id, scope, token_id, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [subjectId, scope, tokenId, expiresAt, userAgent ?? null],
  );

  return { accessToken, refreshToken, expiresIn: parseTtlSeconds(env.JWT_ACCESS_TTL) };
}

/**
 * Rotaciona o refresh token: revoga o antigo e emite um novo par.
 * Retorna null se o token não for válido/ativo.
 */
export async function rotateRefreshToken(
  refreshToken: string,
  scope: 'admin' | 'player',
  freshSubject: { sub: string; role?: 'owner' | 'admin' | 'employee'; name?: string },
  userAgent?: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number } | null> {
  const payload = await verifyRefreshToken(refreshToken);
  if (payload.scope !== scope) return null;
  if (payload.sub !== freshSubject.sub) return null;

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM refresh_tokens
      WHERE token_id = $1 AND revoked = false AND expires_at > now()
      LIMIT 1`,
    [payload.tokenId],
  );
  if (rows.length === 0) return null;

  const newTokenId = randomUUID();
  const accessToken = await signAccessToken({
    sub: payload.sub,
    scope,
    ...(scope === 'admin' && freshSubject.role ? { role: freshSubject.role } : {}),
    ...(freshSubject.name ? { name: freshSubject.name } : {}),
  } as { sub: string; scope: 'admin' | 'player'; role?: 'owner' | 'admin' | 'employee'; name?: string });

  const refresh = await signRefreshToken(payload.sub, scope, newTokenId);
  const expiresAt = new Date(Date.now() + parseTtlSeconds(env.JWT_REFRESH_TTL) * 1000);

  await pool.query(`UPDATE refresh_tokens SET revoked = true, replaced_by = $2 WHERE token_id = $1`, [
    payload.tokenId,
    newTokenId,
  ]);
  await pool.query(
    `INSERT INTO refresh_tokens (subject_id, scope, token_id, expires_at, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [payload.sub, scope, newTokenId, expiresAt, userAgent ?? null],
  );

  return { accessToken, refreshToken: refresh, expiresIn: parseTtlSeconds(env.JWT_ACCESS_TTL) };
}

export async function revokeRefreshToken(tokenId: string): Promise<void> {
  await pool.query('UPDATE refresh_tokens SET revoked = true WHERE token_id = $1', [tokenId]);
}

export async function revokeAllForSubject(subjectId: string, scope: 'admin' | 'player'): Promise<void> {
  await pool.query('UPDATE refresh_tokens SET revoked = true WHERE subject_id = $1 AND scope = $2', [
    subjectId,
    scope,
  ]);
}

function parseTtlSeconds(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 15 * 60;
  const value = Number(match[1]);
  switch (match[2]) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 15 * 60;
  }
}

export async function loginAdmin(
  email: string,
  password: string,
  userAgent?: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    role: 'owner' | 'admin' | 'employee';
    password_hash: string;
    active: boolean;
  }>('SELECT id, name, role, password_hash, active FROM admin_users WHERE email = $1', [
    email.toLowerCase().trim(),
  ]);

  const admin = rows[0];
  if (!admin || !admin.active) throw new UnauthorizedError('Credenciais inválidas');

  const { verifyPassword } = await import('./passwords.js');
  const ok = await verifyPassword(admin.password_hash, password);
  if (!ok) throw new UnauthorizedError('Credenciais inválidas');

  return issueTokens(admin.id, 'admin', { role: admin.role, name: admin.name }, userAgent);
}

export async function loginPlayer(
  phone: string,
  password: string,
  userAgent?: string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const { rows } = await pool.query<{
    id: string;
    name: string;
    password_hash: string | null;
    status: string;
  }>('SELECT id, name, password_hash, status FROM players WHERE phone = $1', [phone]);

  const player = rows[0];
  if (!player || player.status !== 'active') throw new UnauthorizedError('Conta não encontrada');
  if (!player.password_hash) throw new UnauthorizedError('Defina uma senha no aplicativo para entrar');

  const { verifyPassword } = await import('./passwords.js');
  const ok = await verifyPassword(player.password_hash, password);
  if (!ok) throw new UnauthorizedError('Credenciais inválidas');

  return issueTokens(player.id, 'player', { name: player.name }, userAgent);
}
