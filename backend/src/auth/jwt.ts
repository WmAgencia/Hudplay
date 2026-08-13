import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../lib/errors.js';

export type AdminTokenPayload = {
  sub: string;
  role: 'owner' | 'admin' | 'employee';
  scope: 'admin';
  name: string;
};

export type PlayerTokenPayload = {
  sub: string;
  scope: 'player';
  name: string;
};

export type TokenPayload = AdminTokenPayload | PlayerTokenPayload;

function parseTtl(ttl: string): number {
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

function ttlToTimestamp(ttl: string): number {
  return Math.floor(Date.now() / 1000) + parseTtl(ttl);
}

export async function signAccessToken(payload: {
  sub: string;
  scope: 'admin' | 'player';
  role?: 'owner' | 'admin' | 'employee';
  name?: string;
}): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('hudplay')
    .setAudience('hudplay-client')
    .setExpirationTime(ttlToTimestamp(env.JWT_ACCESS_TTL))
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
}

export async function signRefreshToken(
  subject: string,
  scope: 'admin' | 'player',
  tokenId: string,
): Promise<string> {
  return new SignJWT({ scope, jti: tokenId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuedAt()
    .setIssuer('hudplay')
    .setAudience('hudplay-client')
    .setExpirationTime(ttlToTimestamp(env.JWT_REFRESH_TTL))
    .sign(new TextEncoder().encode(env.JWT_REFRESH_SECRET));
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.JWT_ACCESS_SECRET), {
      issuer: 'hudplay',
      audience: 'hudplay-client',
    });
    const scope = payload.scope;
    if (scope === 'admin') {
      return {
        sub: payload.sub as string,
        role: payload.role as 'owner' | 'admin' | 'employee',
        scope,
        name: payload.name as string,
      };
    }
    if (scope === 'player') {
      return {
        sub: payload.sub as string,
        scope,
        name: payload.name as string,
      };
    }
    throw new UnauthorizedError('Token inválido');
  } catch {
    throw new UnauthorizedError('Sessão expirada ou inválida');
  }
}

export async function verifyRefreshToken(
  token: string,
): Promise<{ sub: string; scope: 'admin' | 'player'; tokenId: string }> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.JWT_REFRESH_SECRET), {
      issuer: 'hudplay',
      audience: 'hudplay-client',
    });
    const scope = payload.scope === 'player' ? 'player' : 'admin';
    const tokenId = payload.jti as string;
    if (!tokenId || !payload.sub) throw new UnauthorizedError('Refresh token inválido');
    return { sub: payload.sub, scope, tokenId };
  } catch {
    throw new UnauthorizedError('Sessão expirada ou inválida');
  }
}
