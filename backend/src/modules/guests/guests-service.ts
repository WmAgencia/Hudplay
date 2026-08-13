import { pool } from '../../db/pool.js';
import { AppError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { normalizePhone } from '../../lib/ids.js';

export async function addGuest(params: {
  matchId: string;
  name: string;
  phone?: string;
}): Promise<Record<string, unknown>> {
  const phone = params.phone ? normalizePhone(params.phone) : null;
  if (phone) {
    const dup = await pool.query(
      'SELECT id FROM guests WHERE match_id = $1 AND phone = $2 AND status <> $3',
      [params.matchId, phone, 'removed'],
    );
    if (dup.rows.length > 0) throw new ConflictError('Convidado com este telefone já foi adicionado');
  }

  const { rows } = await pool.query<Record<string, unknown>>(
    `INSERT INTO guests (match_id, name, phone, status) VALUES ($1, $2, $3, 'invited')
     RETURNING id, name, phone, status, created_at`,
    [params.matchId, params.name.trim(), phone],
  );
  return rows[0]!;
}

export async function removeGuest(matchId: string, guestId: string): Promise<void> {
  const { rows } = await pool.query(
    `UPDATE guests SET status = 'removed' WHERE id = $1 AND match_id = $2 RETURNING id`,
    [guestId, matchId],
  );
  if (rows.length === 0) throw new NotFoundError('Convidado não encontrado');
}

export async function listGuests(matchId: string): Promise<unknown[]> {
  const { rows } = await pool.query(
    `SELECT g.*, p.name AS player_name FROM guests g
       LEFT JOIN players p ON p.id = g.player_id
      WHERE g.match_id = $1 AND g.status <> 'removed'
      ORDER BY g.created_at ASC`,
    [matchId],
  );
  return rows;
}

/** Converte um convidado em jogador confirmado (guests -> match_players). */
export async function convertGuestToPlayer(params: {
  matchId: string;
  guestId: string;
  playerId: string;
}): Promise<void> {
  const guest = await pool.query(
    `SELECT g.*, m.players_max FROM guests g JOIN matches m ON m.id = g.match_id
      WHERE g.id = $1 AND g.match_id = $2 AND g.status <> 'removed'`,
    [params.guestId, params.matchId],
  );
  if (guest.rows.length === 0) throw new NotFoundError('Convidado não encontrado');

  const already = await pool.query('SELECT id FROM match_players WHERE match_id = $1 AND player_id = $2', [
    params.matchId,
    params.playerId,
  ]);
  if (already.rows.length > 0) throw new ConflictError('Jogador já participa da partida');

  await pool.query(`UPDATE guests SET player_id = $1, status = 'confirmed' WHERE id = $2`, [
    params.playerId,
    params.guestId,
  ]);
}
