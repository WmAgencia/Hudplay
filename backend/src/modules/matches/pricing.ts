import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/errors.js';
import { perPlayerPrice } from '../../lib/money.js';

/**
 * Calcula o preço por hora da quadra para uma data/horário/esporte.
 *
 * Resolução: override de `prices` (mais específico vence: mesmo esporte →
 * sem esporte) → preço padrão da quadra.
 */
export async function getPricePerHourCents(params: {
  courtId: string;
  sportId: string | null;
  date: Date | string;
  startTime: string;
  endTime: string;
}): Promise<number> {
  const date = typeof params.date === 'string' ? new Date(`${params.date}T00:00:00`) : params.date;
  const dow = date.getDay();

  const { rows } = await pool.query<{ price_per_hour_cents: number; sport_id: string | null }>(
    `SELECT sport_id, price_per_hour_cents
       FROM prices
      WHERE court_id = $1 AND day_of_week = $2
        AND start_time <= $3::time AND end_time >= $4::time
      ORDER BY (sport_id IS NULL) ASC, start_time DESC
      LIMIT 1`,
    [params.courtId, dow, params.startTime, params.endTime],
  );

  const match = rows[0];
  if (match && (!params.sportId || match.sport_id === null || match.sport_id === params.sportId)) {
    return match.price_per_hour_cents;
  }

  const court = await pool.query<{ price_per_hour_cents: number }>(
    'SELECT price_per_hour_cents FROM courts WHERE id = $1',
    [params.courtId],
  );
  if (court.rows.length === 0) {
    throw new AppError('Quadra não encontrada', { statusCode: 404 });
  }
  return court.rows[0]!.price_per_hour_cents;
}

/** Calcula o valor total e por jogador de uma partida. */
export async function computeMatchValue(params: {
  courtId: string;
  sportId: string;
  date: string;
  startTime: string;
  endTime: string;
  players: number;
}): Promise<{ totalCents: number; perPlayerCents: number; perPlayerBrl: number }> {
  const hours = diffHours(params.startTime, params.endTime);
  if (hours <= 0) {
    throw new AppError('Horário final deve ser após o inicial', { code: 'INVALID_TIME_RANGE' });
  }

  const pricePerHour = await getPricePerHourCents({
    courtId: params.courtId,
    sportId: params.sportId,
    date: params.date,
    startTime: params.startTime,
    endTime: params.endTime,
  });

  const totalCents = Math.round(pricePerHour * hours);
  const perPlayerBrl = perPlayerPrice(totalCents, params.players);
  const perPlayerCents = Math.round(perPlayerBrl * 100);
  return { totalCents, perPlayerCents, perPlayerBrl };
}

function diffHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh! - sh! + (em! - sm!) / 60;
}

export function diffMinutes(start: string, end: string): number {
  return Math.round(diffHours(start, end) * 60);
}

/** Verifica se dois intervalos de horário se sobrepõem no mesmo dia/quadra. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}
