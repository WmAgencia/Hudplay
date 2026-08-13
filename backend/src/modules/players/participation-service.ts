import { hashPassword } from '../../auth/passwords.js';
import { type PoolClient, pool, withTransaction } from '../../db/pool.js';
import { AppError, ConflictError, NotFoundError } from '../../lib/errors.js';
import { normalizePhone } from '../../lib/ids.js';
import { cancelPayment, createPixPayment } from '../../payments/provider.js';
import { getMatchById } from '../matches/matches-service.js';
import { notifyPlayer } from '../notifications/notifications-service.js';
import { getReservationSettings } from '../settings/settings-service.js';

export async function findOrCreatePlayer(params: {
  name: string;
  phone: string;
  photoUrl?: string;
  password?: string;
}): Promise<{ id: string; name: string; created: boolean }> {
  const phone = normalizePhone(params.phone);
  if (phone.length < 8) throw new AppError('Telefone inválido');

  const { rows } = await pool.query<{ id: string; name: string; password_hash: string | null }>(
    'SELECT id, name, password_hash FROM players WHERE phone = $1',
    [phone],
  );
  if (rows[0]) {
    // Atualiza dados se necessário (nome mais recente, senha opcional)
    await pool.query(
      'UPDATE players SET name = $2, photo_url = COALESCE($3, photo_url), updated_at = now() WHERE id = $1',
      [rows[0].id, params.name.trim(), params.photoUrl ?? null],
    );
    return { id: rows[0].id, name: rows[0].name, created: false };
  }

  const passwordHash = params.password ? await hashPassword(params.password) : null;
  const { rows: created } = await pool.query<{ id: string; name: string }>(
    `INSERT INTO players (name, phone, password_hash, photo_url)
     VALUES ($1, $2, $3, $4) RETURNING id, name`,
    [params.name.trim(), phone, passwordHash, params.photoUrl ?? null],
  );
  return { id: created[0]!.id, name: created[0]!.name, created: true };
}

export type JoinPaymentMethod = 'pix' | 'pay_at_court';

/**
 * Entrada em partida com controle de concorrência.
 * Garante atomicamente que nunca ultrapasse players_max (impede 19/18).
 * Se a partida estiver cheia, insere na lista de espera.
 */
export async function joinMatch(params: {
  matchCode: string;
  name: string;
  phone: string;
  photoUrl?: string;
  paymentMethod: JoinPaymentMethod;
  password?: string;
}): Promise<Record<string, unknown>> {
  return withTransaction(async (client) => {
    const { rows: matchRows } = await client.query<{
      id: string;
      code: string;
      title: string;
      players_max: number;
      price_per_player_cents: number;
      status: string;
      court_name: string;
    }>(
      `SELECT m.id, m.code, m.title, m.players_max, m.price_per_player_cents, m.status,
              c.name AS court_name
         FROM matches m JOIN courts c ON c.id = m.court_id
        WHERE m.code = $1 FOR UPDATE`,
      [params.matchCode],
    );
    const match = matchRows[0];
    if (!match) throw new NotFoundError('Partida não encontrada');
    if (match.status !== 'scheduled' && match.status !== 'in_progress') {
      throw new ConflictError('Esta partida não está mais aceitando jogadores');
    }

    const player = await findOrCreatePlayer({
      name: params.name,
      phone: params.phone,
      photoUrl: params.photoUrl,
      password: params.password,
    });

    // Duplicidade: já participante?
    const existing = await client.query(
      'SELECT id FROM match_players WHERE match_id = $1 AND player_id = $2',
      [match.id, player.id],
    );
    if (existing.rows.length > 0) {
      throw new ConflictError('Você já está nesta partida', 'ALREADY_JOINED');
    }

    const { rows: countRows } = await client.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM match_players
        WHERE match_id = $1 AND status IN ('confirmed','pending')`,
      [match.id],
    );
    const occupied = Number(countRows[0]?.c ?? 0);
    const isFull = occupied >= match.players_max;

    if (isFull) {
      // Entra na lista de espera
      const wl = await client.query<{ position: number }>(
        'SELECT COALESCE(max(position), 0) + 1 AS position FROM waiting_list WHERE match_id = $1',
        [match.id],
      );
      const position = wl.rows[0]?.position ?? 1;
      await client.query(
        `INSERT INTO waiting_list (match_id, player_id, position)
         VALUES ($1, $2, $3) ON CONFLICT (match_id, player_id) DO NOTHING`,
        [match.id, player.id, position],
      );
      return {
        kind: 'waitlist',
        matchId: match.id,
        playerId: player.id,
        position,
        title: match.title,
        message: 'Partida lotada. Você entrou na lista de espera.',
      };
    }

    // Vaga disponível — insere participante
    const pos = await client.query<{ position: number }>(
      'SELECT COALESCE(max(position), 0) + 1 AS position FROM match_players WHERE match_id = $1',
      [match.id],
    );
    const matchPlayer = await client.query<{ id: string }>(
      `INSERT INTO match_players (match_id, player_id, status, position)
       VALUES ($1, $2, 'confirmed', $3) RETURNING id`,
      [match.id, player.id, pos.rows[0]?.position ?? 1],
    );

    // Pagamento
    let payment: Record<string, unknown> | null = null;
    if (params.paymentMethod === 'pix') {
      const pix = await createPixPayment({
        matchId: match.id,
        playerId: player.id,
        matchCode: match.code,
        amountCents: match.price_per_player_cents,
      });
      payment = { ...pix, amountCents: match.price_per_player_cents };
    } else {
      await client.query(
        `INSERT INTO payments (match_id, player_id, method, status, amount_cents)
         VALUES ($1, $2, 'pay_at_court', 'pay_at_court', $3)
         ON CONFLICT (match_id, player_id) DO UPDATE
           SET method = 'pay_at_court', status = 'pay_at_court', amount_cents = $3,
               claimed_at = NULL, confirmed_at = NULL, cancelled_at = NULL, updated_at = now()`,
        [match.id, player.id, match.price_per_player_cents],
      );
      payment = { status: 'pay_at_court', amountCents: match.price_per_player_cents };
    }

    await notifyPlayer({
      playerId: player.id,
      type: 'match.joined',
      title: 'Você entrou na partida',
      body: `${match.title} — ${match.court_name}`,
      data: { matchId: match.id, matchCode: match.code },
    });

    return {
      kind: 'joined',
      matchId: match.id,
      matchCode: match.code,
      matchPlayerId: matchPlayer.rows[0]!.id,
      playerId: player.id,
      title: match.title,
      payment,
      message: 'Você está confirmado na partida.',
    };
  });
}

/** Jogador sai de uma partida (libera vaga / dispara fila). */
export async function leaveMatch(params: { matchCode: string; playerId: string }): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string; title: string }>(
      `SELECT m.id, m.title FROM matches m WHERE m.code = $1 FOR UPDATE`,
      [params.matchCode],
    );
    const match = rows[0];
    if (!match) throw new NotFoundError('Partida não encontrada');

    const mp = await client.query<{ id: string }>(
      `SELECT id FROM match_players WHERE match_id = $1 AND player_id = $2 AND status = 'confirmed'`,
      [match.id, params.playerId],
    );
    if (mp.rows.length === 0) return;

    await client.query(`UPDATE match_players SET status = 'cancelled' WHERE id = $1`, [mp.rows[0]!.id]);
    await cancelPaymentRow(client, match.id, params.playerId);

    await notifyPlayer({
      playerId: params.playerId,
      type: 'match.cancelled',
      title: 'Você saiu da partida',
      body: match.title,
      data: { matchId: match.id },
    });

    // Promove o primeiro da fila
    await promoteFromWaitlist(client, match.id);
  });
}

async function cancelPaymentRow(client: PoolClient, matchId: string, playerId: string): Promise<void> {
  await client.query(
    `UPDATE payments SET status = 'cancelled', cancelled_at = now(), updated_at = now()
      WHERE match_id = $1 AND player_id = $2
        AND status IN ('pending','pix_initiated','pix_claimed_paid','pay_at_court')`,
    [matchId, playerId],
  );
}

export async function removePlayerFromMatch(params: { matchId: string; playerId: string }): Promise<void> {
  await withTransaction(async (client) => {
    const match = await client.query<{ id: string; title: string }>(
      'SELECT id, title FROM matches WHERE id = $1 FOR UPDATE',
      [params.matchId],
    );
    if (!match.rows[0]) throw new NotFoundError('Partida não encontrada');

    await client.query(
      `UPDATE match_players SET status = 'cancelled' WHERE match_id = $1 AND player_id = $2`,
      [params.matchId, params.playerId],
    );
    await cancelPaymentRow(client, params.matchId, params.playerId);
    await client.query(
      `DELETE FROM waiting_list WHERE match_id = $1 AND player_id = $2 AND status = 'waiting'`,
      [params.matchId, params.playerId],
    );
    await notifyPlayer({
      playerId: params.playerId,
      type: 'match.cancelled',
      title: 'Você saiu da partida',
      body: match.rows[0].title,
      data: { matchId: params.matchId },
    });
    await promoteFromWaitlist(client, params.matchId);
  });
}

/**
 * Promove o primeiro jogador da lista de espera quando uma vaga é liberada.
 * Envia notificação com prazo para aceitar.
 */
export async function promoteFromWaitlist(client: PoolClient, matchId: string): Promise<void> {
  const settings = await getReservationSettings();
  const acceptMinutes = settings.waitlistAcceptMinutes;

  const { rows } = await client.query<{
    id: string;
    player_id: string;
    title: string;
    code: string;
  }>(
    `SELECT wl.id, wl.player_id, m.title, m.code
       FROM waiting_list wl
       JOIN matches m ON m.id = wl.match_id
      WHERE wl.match_id = $1 AND wl.status = 'waiting'
      ORDER BY wl.position ASC
      LIMIT 1`,
    [matchId],
  );
  const next = rows[0];
  if (!next) return;

  const deadline = new Date(Date.now() + acceptMinutes * 60_000);
  await client.query(
    `UPDATE waiting_list SET status = 'invited', invited_at = now(), deadline_at = $2 WHERE id = $1`,
    [next.id, deadline],
  );
  await client.query(
    `INSERT INTO notifications (player_id, type, title, body, data)
     VALUES ($1, 'waitlist.accept', $2, $3, $4)`,
    [
      next.player_id,
      'Uma vaga foi liberada!',
      `Você tem prioridade para ocupar a vaga em "${next.title}". Aproveite em até ${acceptMinutes} minutos.`,
      JSON.stringify({ matchId, matchCode: next.code, deadline: deadline.toISOString() }),
    ],
  );
}

/** Jogador da fila aceita a vaga (volta ao fluxo de pagamento). */
export async function acceptWaitlistSpot(params: {
  matchCode: string;
  playerId: string;
  paymentMethod: JoinPaymentMethod;
}): Promise<Record<string, unknown>> {
  return withTransaction(async (client) => {
    const match = await client.query<{
      id: string;
      code: string;
      title: string;
      players_max: number;
      price_per_player_cents: number;
      status: string;
    }>(
      `SELECT id, code, title, players_max, price_per_player_cents, status FROM matches WHERE code = $1 FOR UPDATE`,
      [params.matchCode],
    );
    if (!match.rows[0]) throw new NotFoundError('Partida não encontrada');

    const wl = await client.query<{ id: string; status: string; deadline_at: Date | null }>(
      `SELECT id, status, deadline_at FROM waiting_list
        WHERE match_id = $1 AND player_id = $2 AND status IN ('waiting','invited') FOR UPDATE`,
      [match.rows[0].id, params.playerId],
    );
    if (!wl.rows[0]) throw new ConflictError('Você não está na lista de espera desta partida');

    if (
      wl.rows[0].status === 'invited' &&
      wl.rows[0].deadline_at &&
      new Date(wl.rows[0].deadline_at) < new Date()
    ) {
      throw new ConflictError('Prazo para aceitar a vaga expirou', 'WAITLIST_EXPIRED');
    }

    const { rows: countRows } = await client.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM match_players
        WHERE match_id = $1 AND status IN ('confirmed','pending')`,
      [match.rows[0].id],
    );
    const occupied = Number(countRows[0]?.c ?? 0);
    if (occupied >= match.rows[0].players_max) {
      throw new ConflictError('A vaga já foi ocupada por outro jogador', 'SPOT_GONE');
    }

    // Transforma fila em participante
    await client.query(`UPDATE waiting_list SET status = 'accepted' WHERE id = $1`, [wl.rows[0].id]);
    const pos = await client.query<{ position: number }>(
      'SELECT COALESCE(max(position), 0) + 1 AS position FROM match_players WHERE match_id = $1',
      [match.rows[0].id],
    );
    await client.query(
      `INSERT INTO match_players (match_id, player_id, status, position)
       VALUES ($1, $2, 'confirmed', $3)`,
      [match.rows[0].id, params.playerId, pos.rows[0]?.position ?? 1],
    );

    let payment: Record<string, unknown> | null = null;
    if (params.paymentMethod === 'pix') {
      const pix = await createPixPayment({
        matchId: match.rows[0].id,
        playerId: params.playerId,
        matchCode: match.rows[0].code,
        amountCents: match.rows[0].price_per_player_cents,
      });
      payment = { ...pix, amountCents: match.rows[0].price_per_player_cents };
    } else {
      await client.query(
        `INSERT INTO payments (match_id, player_id, method, status, amount_cents)
         VALUES ($1, $2, 'pay_at_court', 'pay_at_court', $3)
         ON CONFLICT (match_id, player_id) DO UPDATE
           SET method = 'pay_at_court', status = 'pay_at_court', amount_cents = $3,
               claimed_at = NULL, confirmed_at = NULL, cancelled_at = NULL, updated_at = now()`,
        [match.rows[0].id, params.playerId, match.rows[0].price_per_player_cents],
      );
      payment = { status: 'pay_at_court', amountCents: match.rows[0].price_per_player_cents };
    }

    return {
      kind: 'joined',
      matchId: match.rows[0].id,
      matchCode: match.rows[0].code,
      playerId: params.playerId,
      title: match.rows[0].title,
      payment,
      message: 'Vaga confirmada. Conclua o pagamento.',
    };
  });
}

/** Declina da vaga oferecida (fila). */
export async function declineWaitlistSpot(params: { matchCode: string; playerId: string }): Promise<void> {
  await pool.query(
    `UPDATE waiting_list SET status = 'declined' WHERE match_id = (SELECT id FROM matches WHERE code = $1) AND player_id = $2 AND status = 'invited'`,
    [params.matchCode, params.playerId],
  );
}
