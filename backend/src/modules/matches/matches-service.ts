import type { FastifyRequest } from 'fastify';
import { pool } from '../../db/pool.js';
import { withTransaction } from '../../db/pool.js';
import { audit } from '../../lib/audit.js';
import { AppError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { generateMatchCode } from '../../lib/ids.js';
import { getReservationSettings } from '../settings/settings-service.js';
import { computeMatchValue, overlaps } from './pricing.js';

export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export async function getMatchByCode(code: string): Promise<Record<string, unknown>> {
  const { rows } = await pool.query(
    `SELECT m.*, c.name AS court_name, c.color AS court_color, s.name AS sport_name,
            s.icon AS sport_icon
       FROM matches m
       JOIN courts c ON c.id = m.court_id
       JOIN sports s ON s.id = m.sport_id
      WHERE m.code = $1`,
    [code],
  );
  return rows[0] ?? null;
}

export async function getMatchById(id: string): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query(
    `SELECT m.*, c.name AS court_name, c.color AS court_color, s.name AS sport_name,
            s.icon AS sport_icon
       FROM matches m
       JOIN courts c ON c.id = m.court_id
       JOIN sports s ON s.id = m.sport_id
      WHERE m.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function checkConflict(params: {
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  excludeMatchId?: string;
}): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT id FROM matches
      WHERE court_id = $1 AND match_date = $2 AND status <> 'cancelled'
        AND start_time < $4::time AND end_time > $3::time
        ${params.excludeMatchId ? 'AND id <> $5' : ''}
      LIMIT 1`,
    [
      params.courtId,
      params.date,
      params.startTime,
      params.endTime,
      ...(params.excludeMatchId ? [params.excludeMatchId] : []),
    ],
  );
  return rows.length > 0;
}

export async function createMatch(params: {
  courtId: string;
  sportId: string;
  date: string;
  startTime: string;
  endTime: string;
  playersMax: number;
  priceOverrideCents?: number | null;
  title?: string;
  notes?: string;
  organizerName?: string;
  createdBy: string;
}): Promise<Record<string, unknown>> {
  const settings = await getReservationSettings();

  const court = await pool.query<{ name: string; capacity: number }>(
    'SELECT name, capacity FROM courts WHERE id = $1',
    [params.courtId],
  );
  if (court.rows.length === 0) throw new NotFoundError('Quadra não encontrada');
  if (court.rows[0]!.capacity > 0 && params.playersMax > court.rows[0]!.capacity) {
    throw new ConflictError('Número de jogadores excede a capacidade da quadra');
  }

  const sport = await pool.query<{ name: string }>('SELECT name FROM sports WHERE id = $1', [params.sportId]);
  if (sport.rows.length === 0) throw new NotFoundError('Esporte não encontrado');

  const allowed = await pool.query('SELECT 1 FROM court_sports WHERE court_id = $1 AND sport_id = $2', [
    params.courtId,
    params.sportId,
  ]);
  if (allowed.rows.length === 0) {
    throw new ConflictError('Esporte não permitido nesta quadra');
  }

  const conflicting = await checkConflict({
    courtId: params.courtId,
    date: params.date,
    startTime: params.startTime,
    endTime: params.endTime,
  });
  if (conflicting) {
    throw new ConflictError('Já existe uma partida neste horário para esta quadra');
  }

  const value = await computeMatchValue({
    courtId: params.courtId,
    sportId: params.sportId,
    date: params.date,
    startTime: params.startTime,
    endTime: params.endTime,
    players: params.playersMax,
  });

  const perPlayerCents = params.priceOverrideCents ?? value.perPlayerCents;

  const title =
    params.title ?? `${sport.rows[0]!.name} de ${weekdayName(new Date(`${params.date}T00:00:00`).getDay())}`;

  const code = await uniqueCode();

  const { rows } = await pool.query(
    `INSERT INTO matches (code, court_id, sport_id, title, match_date, start_time, end_time,
                          players_max, price_per_player_cents, total_value_cents, status,
                          created_by, organizer_name, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'scheduled',$11,$12,$13)
     RETURNING *`,
    [
      code,
      params.courtId,
      params.sportId,
      title,
      params.date,
      params.startTime,
      params.endTime,
      params.playersMax,
      perPlayerCents,
      value.totalCents,
      params.createdBy,
      params.organizerName ?? null,
      params.notes ?? null,
    ],
  );
  return rows[0]!;
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateMatchCode(6);
    const existing = await pool.query('SELECT 1 FROM matches WHERE code = $1', [code]);
    if (existing.rows.length === 0) return code;
  }
  throw new AppError('Não foi possível gerar um código único', { statusCode: 500 });
}

function weekdayName(dow: number): string {
  return ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][dow]!;
}

export async function cancelMatch(id: string): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ status: string; title: string }>(
      'SELECT status, title FROM matches WHERE id = $1 FOR UPDATE',
      [id],
    );
    const match = rows[0];
    if (!match) throw new NotFoundError('Partida não encontrada');
    if (match.status === 'completed') throw new ConflictError('Partida concluída não pode ser cancelada');

    await client.query(`UPDATE matches SET status = 'cancelled', updated_at = now() WHERE id = $1`, [id]);
    // Notifica participantes confirmados
    const participants = await client.query<{ player_id: string }>(
      'SELECT player_id FROM match_players WHERE match_id = $1 AND status IN ($2)',
      [id, 'confirmed'],
    );
    for (const p of participants.rows) {
      await client.query(
        `INSERT INTO notifications (player_id, type, title, body, data)
         VALUES ($1, 'match.cancelled', $2, $3, '{}')`,
        [p.player_id, 'Partida cancelada', `A partida ${match.title} foi cancelada.`],
      );
    }
    await client.query(
      `UPDATE payments SET status = 'cancelled', cancelled_at = now(), updated_at = now()
        WHERE match_id = $1 AND status IN ('pending','pix_initiated','pix_claimed_paid','pay_at_court')`,
      [id],
    );
  });
}

export async function completeMatch(id: string): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ status: string }>(
      'SELECT status FROM matches WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!rows[0]) throw new NotFoundError('Partida não encontrada');
    if (rows[0]!.status === 'cancelled') throw new ConflictError('Partida cancelada não pode ser concluída');
    await client.query(`UPDATE matches SET status = 'completed', updated_at = now() WHERE id = $1`, [id]);
  });
}

export async function listMatches(params: {
  from?: string;
  to?: string;
  status?: string;
  sportId?: string;
  courtId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: unknown[]; total: number }> {
  const where: string[] = [];
  const values: unknown[] = [];

  if (params.from) {
    values.push(params.from);
    where.push(`m.match_date >= $${values.length}`);
  }
  if (params.to) {
    values.push(params.to);
    where.push(`m.match_date <= $${values.length}`);
  }
  if (params.status) {
    values.push(params.status);
    where.push(`m.status = $${values.length}`);
  }
  if (params.sportId) {
    values.push(params.sportId);
    where.push(`m.sport_id = $${values.length}`);
  }
  if (params.courtId) {
    values.push(params.courtId);
    where.push(`m.court_id = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const countQuery = await pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM matches m ${whereSql}`,
    values,
  );
  const listQuery = await pool.query(
    `SELECT m.*, c.name AS court_name, c.color AS court_color, s.name AS sport_name, s.icon AS sport_icon,
            (SELECT count(*) FROM match_players mp WHERE mp.match_id = m.id AND mp.status = 'confirmed') AS confirmed_count,
            (SELECT count(*) FROM waiting_list wl WHERE wl.match_id = m.id AND wl.status = 'waiting') AS wait_count
       FROM matches m
       JOIN courts c ON c.id = m.court_id
       JOIN sports s ON s.id = m.sport_id
       ${whereSql}
      ORDER BY m.match_date ASC, m.start_time ASC
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  );

  return { rows: listQuery.rows, total: Number(countQuery.rows[0]?.total ?? 0) };
}

export async function getMatchDetail(id: string): Promise<Record<string, unknown>> {
  const match = await getMatchById(id);
  if (!match) throw new NotFoundError('Partida não encontrada');

  const players = await pool.query(
    `SELECT mp.id AS match_player_id, mp.status AS participation_status, mp.position, mp.joined_at,
            p.id AS player_id, p.name, p.phone, p.photo_url,
            pay.id AS payment_id, pay.status AS payment_status, pay.method AS payment_method,
            pay.amount_cents, pay.pix_reference, pay.claimed_at, pay.confirmed_at,
            pc.method AS confirmed_method, pc.confirmed_by, pc.occurred_at AS confirmed_at_by
       FROM match_players mp
       JOIN players p ON p.id = mp.player_id
       LEFT JOIN payments pay ON pay.match_id = mp.match_id AND pay.player_id = p.id
       LEFT JOIN payment_confirmations pc ON pc.payment_id = pay.id
      WHERE mp.match_id = $1
      ORDER BY mp.position ASC`,
    [id],
  );

  const waitlist = await pool.query(
    `SELECT wl.id, wl.position, wl.status, wl.invited_at, wl.deadline_at, p.name, p.phone
       FROM waiting_list wl
       JOIN players p ON p.id = wl.player_id
      WHERE wl.match_id = $1
      ORDER BY wl.position ASC`,
    [id],
  );

  const guests = await pool.query(
    `SELECT g.*, p.name AS player_name FROM guests g
       LEFT JOIN players p ON p.id = g.player_id
      WHERE g.match_id = $1 ORDER BY g.created_at ASC`,
    [id],
  );

  const confirmed = (players.rows as { participation_status: string }[]).filter(
    (p) => p.participation_status === 'confirmed',
  ).length;
  const full = confirmed >= (match.players_max as number);

  return {
    ...match,
    players: players.rows,
    waitlist: waitlist.rows,
    guests: guests.rows,
    stats: {
      confirmed,
      totalValue: match.total_value_cents,
      received: sumPaid(players.rows as { payment_status: string; amount_cents: number }[]),
      pending: sumPending(players.rows as { payment_status: string; amount_cents: number }[]),
      full,
      available: Math.max(0, (match.players_max as number) - confirmed),
    },
  };
}

function sumPaid(rows: { payment_status: string; amount_cents: number }[]): number {
  const paid = ['pix_confirmed', 'paid_cash', 'paid_card', 'paid_manual_pix'];
  return rows.filter((r) => paid.includes(r.payment_status)).reduce((acc, r) => acc + r.amount_cents, 0);
}

function sumPending(rows: { payment_status: string; amount_cents: number }[]): number {
  const pending = ['pending', 'pix_initiated', 'pix_claimed_paid', 'pay_at_court'];
  return rows.filter((r) => pending.includes(r.payment_status)).reduce((acc, r) => acc + r.amount_cents, 0);
}

export async function updateMatch(
  id: string,
  patch: {
    title?: string;
    playersMax?: number;
    priceOverrideCents?: number | null;
    notes?: string;
    status?: MatchStatus;
  },
): Promise<void> {
  const match = await getMatchById(id);
  if (!match) throw new NotFoundError('Partida não encontrada');

  if (patch.status === 'cancelled') {
    await cancelMatch(id);
    return;
  }

  const values: unknown[] = [];
  const sets: string[] = [];

  if (patch.title !== undefined) {
    values.push(patch.title);
    sets.push(`title = $${values.length}`);
  }
  if (patch.playersMax !== undefined) {
    values.push(patch.playersMax);
    sets.push(`players_max = $${values.length}`);
  }
  if (patch.priceOverrideCents !== undefined) {
    values.push(patch.priceOverrideCents);
    sets.push(`price_per_player_cents = $${values.length}`);
  }
  if (patch.notes !== undefined) {
    values.push(patch.notes);
    sets.push(`notes = $${values.length}`);
  }
  if (patch.status && ['scheduled', 'in_progress', 'completed', 'cancelled'].includes(patch.status)) {
    values.push(patch.status);
    sets.push(`status = $${values.length}`);
  }

  if (sets.length === 0) return;

  values.push(id);
  await pool.query(
    `UPDATE matches SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
    values,
  );
}

export async function logMatchAudit(
  request: FastifyRequest,
  action: Parameters<typeof audit>[1],
  matchId: string,
  details?: unknown,
): Promise<void> {
  await audit(request, action, 'match', matchId, details);
}
