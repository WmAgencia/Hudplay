import { pool, withTransaction } from '../../db/pool.js';
import { NotFoundError } from '../../lib/errors.js';
import { generateRewardCode } from '../../lib/ids.js';
import { notifyPlayer } from '../notifications/notifications-service.js';
import { getSettings } from '../settings/settings-service.js';

/**
 * Motor de fidelidade. Conta participações confirmadas no período configurado
 * e concede recompensas quando a regra é atingida. Registra XP (pontos) no
 * ledger player_points quando habilitado.
 */
export async function processLoyaltyForMatch(matchId: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.loyalty.enabled) return;

  const match = await pool.query<{ id: string; title: string }>(
    'SELECT id, title FROM matches WHERE id = $1',
    [matchId],
  );
  if (!match.rows[0]) throw new NotFoundError('Partida não encontrada');

  const rules = await pool.query<{
    id: string;
    name: string;
    required_matches: number;
    period: 'week' | 'month' | 'all_time';
    reward_id: string | null;
    max_uses: number | null;
    valid_until: string | null;
  }>('SELECT * FROM loyalty_rules WHERE active = true');

  const participants = await pool.query<{ player_id: string }>(
    `SELECT DISTINCT player_id FROM match_players WHERE match_id = $1 AND status = 'confirmed'`,
    [matchId],
  );

  for (const rule of rules.rows) {
    for (const participant of participants.rows) {
      await evaluateRuleForPlayer(
        rule,
        participant.player_id,
        match.rows[0].title,
        settings.loyalty.pointsEnabled,
      );
    }
  }

  if (settings.loyalty.pointsEnabled) {
    for (const participant of participants.rows) {
      await awardParticipationXp(participant.player_id, matchId, settings.loyalty);
    }
  }
}

async function evaluateRuleForPlayer(
  rule: {
    id: string;
    name: string;
    required_matches: number;
    period: 'week' | 'month' | 'all_time';
    reward_id: string | null;
    max_uses: number | null;
    valid_until: string | null;
  },
  playerId: string,
  matchTitle: string,
  pointsEnabled: boolean,
): Promise<void> {
  const periodStart = getPeriodStart(rule.period);

  const { rows: countRows } = await pool.query<{ c: string }>(
    `SELECT count(DISTINCT mp.match_id)::text AS c
       FROM match_players mp
       JOIN matches m ON m.id = mp.match_id
      WHERE mp.player_id = $1 AND mp.status = 'confirmed'
        AND m.status = 'completed'
        AND m.match_date >= $2::date
        ${rule.period === 'all_time' ? '' : `AND m.match_date < (date_trunc(${periodStart}, now()) + interval '1 period')::date`}`,
    [playerId, periodStart],
  );
  const participations = Number(countRows[0]?.c ?? 0);

  if (participations >= rule.required_matches) {
    // Quantas já concedeu para esta regra no período?
    const { rows: grantedRows } = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM player_rewards
        WHERE player_id = $1 AND rule_id = $2 AND granted_at >= $3`,
      [playerId, rule.id, periodStart],
    );
    const granted = Number(grantedRows[0]?.c ?? 0);

    if (rule.max_uses !== null && granted >= rule.max_uses) return;
    if (rule.valid_until && rule.valid_until < new Date().toISOString().slice(0, 10)) return;

    // Concede
    const code = generateRewardCode();
    await pool.query(
      `INSERT INTO player_rewards (player_id, reward_id, rule_id, code, status)
       VALUES ($1, $2, $3, $4, 'granted')`,
      [playerId, rule.reward_id, rule.id, code],
    );
    await notifyPlayer({
      playerId,
      type: 'reward.granted',
      title: 'Recompensa liberada! 🎁',
      body: `${rule.name} — código ${code}`,
      data: { ruleId: rule.id, code },
    });
  }
}

function getPeriodStart(period: 'week' | 'month' | 'all_time'): string {
  const now = new Date();
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }
  if (period === 'week') {
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().slice(0, 10);
  }
  return '1970-01-01';
}

async function awardParticipationXp(
  playerId: string,
  matchId: string,
  loyalty: { participationXp: number; earlyPaymentXp: number; streak5MatchesXp: number },
): Promise<void> {
  // Já pontuou nesta partida?
  const existing = await pool.query(
    "SELECT id FROM player_points WHERE player_id = $1 AND match_id = $2 AND reason = 'participacao'",
    [playerId, matchId],
  );
  if (existing.rows.length > 0) return;

  await pool.query(
    `INSERT INTO player_points (player_id, match_id, points, reason)
     VALUES ($1, $2, $3, 'participacao')`,
    [playerId, matchId, loyalty.participationXp],
  );

  // Streak de 5 partidas
  const streak = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM player_points WHERE player_id = $1 AND reason = 'participacao'`,
    [playerId],
  );
  if (Number(streak.rows[0]?.c ?? 0) % 5 === 0) {
    await pool.query(
      `INSERT INTO player_points (player_id, match_id, points, reason)
       VALUES ($1, $2, $3, 'streak_5')`,
      [playerId, matchId, loyalty.streak5MatchesXp],
    );
  }

  await pool.query('UPDATE players SET points = points + $2 WHERE id = $1', [
    playerId,
    loyalty.participationXp,
  ]);
}

export async function awardCreateMatchXp(adminUserId: string, playerId: string | null): Promise<void> {
  const settings = await getSettings();
  if (!settings.loyalty.pointsEnabled || !playerId) return;
  await pool.query(`INSERT INTO player_points (player_id, points, reason) VALUES ($1, $2, 'criar_partida')`, [
    playerId,
    settings.loyalty.createMatchXp,
  ]);
}

export async function listPlayerRewards(playerId: string): Promise<unknown[]> {
  const { rows } = await pool.query(
    `SELECT pr.id, pr.code, pr.status, pr.granted_at, pr.used_at, pr.expires_at,
            r.name AS reward_name, r.type AS reward_type, r.value AS reward_value,
            lr.name AS rule_name, lr.description AS rule_description
       FROM player_rewards pr
       LEFT JOIN rewards r ON r.id = pr.reward_id
       LEFT JOIN loyalty_rules lr ON lr.id = pr.rule_id
      WHERE pr.player_id = $1
      ORDER BY pr.granted_at DESC`,
    [playerId],
  );
  return rows;
}

export async function listRewardsCatalog(): Promise<unknown[]> {
  const { rows } = await pool.query(`SELECT id, name, type, value, active FROM rewards ORDER BY name ASC`);
  return rows;
}

export async function useReward(params: {
  rewardId: string;
  adminUserId: string;
}): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `UPDATE player_rewards SET status = 'used', used_at = now(), used_by = $2
        WHERE id = $1 AND status = 'granted' RETURNING id`,
      [params.rewardId, params.adminUserId],
    );
    if (rows.length === 0) {
      const notFound = await client.query('SELECT id FROM player_rewards WHERE id = $1', [params.rewardId]);
      if (notFound.rows.length === 0) throw new NotFoundError('Recompensa não encontrada');
    }
  });
}

export async function countPlayerProgress(
  playerId: string,
  period: 'month',
): Promise<{ count: number; nextRule: unknown | null }> {
  const rules = await pool.query(
    `SELECT * FROM loyalty_rules WHERE active = true ORDER BY required_matches ASC`,
  );
  const start = getPeriodStart(period);
  const { rows } = await pool.query<{ c: string }>(
    `SELECT count(DISTINCT mp.match_id)::text AS c
       FROM match_players mp JOIN matches m ON m.id = mp.match_id
      WHERE mp.player_id = $1 AND mp.status = 'confirmed' AND m.status = 'completed'
        AND m.match_date >= $2::date`,
    [playerId, start],
  );
  const count = Number(rows[0]?.c ?? 0);
  const nextRule =
    (rules.rows as Array<{ required_matches: number }>).find((r) => count < r.required_matches) ?? null;
  return { count, nextRule };
}
