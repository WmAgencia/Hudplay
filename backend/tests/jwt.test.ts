import { describe, expect, it } from 'vitest';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../src/auth/jwt.js';

describe('JWT', () => {
  it('access token válido expira no futuro e verifica', async () => {
    const token = await signAccessToken({
      sub: 'admin-1',
      scope: 'admin',
      role: 'owner',
      name: 'Admin',
    });
    const payload = verifyAccessToken(token);
    const { exp } = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'),
    );
    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    await expect(payload).resolves.toMatchObject({ sub: 'admin-1', scope: 'admin', role: 'owner' });
  });

  it('access token expirado é rejeitado', async () => {
    const token = await signAccessToken({
      sub: 'admin-1',
      scope: 'admin',
      role: 'owner',
      name: 'Admin',
    });
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf-8'));
    const expired = `${h}.${Buffer.from(JSON.stringify({ ...payload, exp: 1 })).toString('base64url')}.${s}`;
    await expect(verifyAccessToken(expired)).rejects.toThrow('Sessão expirada ou inválida');
  });

  it('refresh token expira no futuro', async () => {
    const token = await signRefreshToken('admin-1', 'admin', 'jti-1');
    const { exp } = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf-8'),
    );
    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    await expect(verifyRefreshToken(token)).resolves.toMatchObject({
      sub: 'admin-1',
      scope: 'admin',
      tokenId: 'jti-1',
    });
  });
});