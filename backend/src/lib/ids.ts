import { randomBytes, randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Gera um código curto e único para links públicos de partida (ex.: ABC123). */
export function generateMatchCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Gera um código alfanumérico de recompensa. */
export function generateRewardCode(): string {
  return `HUD-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** Gera uma referência PIX única para conciliação manual (ex.: HUD-ABC123-7FK2). */
export function generatePixReference(matchCode: string): string {
  return `HUD-${matchCode}-${randomInt(1000, 9999)}`;
}

/** Normaliza telefone: remove tudo exceto dígitos. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
