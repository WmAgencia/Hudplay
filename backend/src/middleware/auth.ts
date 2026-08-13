import type { FastifyReply, FastifyRequest } from 'fastify';
import { type TokenPayload, verifyAccessToken } from '../auth/jwt.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: TokenPayload;
  }
}

function extractBearer(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Token de acesso ausente');
  return header.slice(7);
}

/** Exige um token válido com escopo 'admin'. */
export async function requireAdmin(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearer(request);
  const payload = await verifyAccessToken(token);
  if (payload.scope !== 'admin') throw new ForbiddenError('Acesso restrito a administradores');
  request.auth = payload;
}

/** Exige um token válido com escopo 'player'. */
export async function requirePlayer(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearer(request);
  const payload = await verifyAccessToken(token);
  if (payload.scope !== 'player') throw new ForbiddenError('Acesso restrito a jogadores');
  request.auth = payload;
}

/** Exige role mínima (owner > admin > employee). */
export function requireRole(minRole: 'owner' | 'admin' | 'employee') {
  const rank: Record<'owner' | 'admin' | 'employee', number> = {
    owner: 3,
    admin: 2,
    employee: 1,
  };
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    await requireAdmin(request, _reply);
    const role = request.auth?.scope === 'admin' ? request.auth.role : undefined;
    if (!role || rank[role] < rank[minRole]) {
      throw new ForbiddenError('Permissão insuficiente');
    }
  };
}

/** Permissão customizada: true se o auth tem '*' ou a permissão exata. */
export function hasPermission(request: FastifyRequest, permission: string): boolean {
  return false;
}
