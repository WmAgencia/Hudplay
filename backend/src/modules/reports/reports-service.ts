import { pool } from '../../db/pool.js';

export async function getDashboard(): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().slice(0, 10);

  const [todayMatches, todayConfirmed, received, pending, totals, bySport, byHour, byDay, upcoming] =
    await Promise.all([
      pool.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM matches WHERE match_date = $1::date AND status <> 'cancelled'`,
        [today],
      ),
      pool.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM match_players mp
          JOIN matches m ON m.id = mp.match_id
         WHERE m.match_date = $1::date AND mp.status = 'confirmed'`,
        [today],
      ),
      pool.query<{ c: string }>(
        `SELECT COALESCE(sum(amount_cents),0)::text AS c FROM payments
          WHERE status IN ('pix_confirmed','paid_cash','paid_card','paid_manual_pix')
            AND confirmed_at::date = $1::date`,
        [today],
      ),
      pool.query<{ c: string }>(
        `SELECT COALESCE(sum(amount_cents),0)::text AS c FROM payments
          WHERE status IN ('pending','pix_initiated','pix_claimed_paid','pay_at_court')`,
        [],
      ),
      pool.query<{ c: string }>(
        `SELECT COALESCE(sum(total_value_cents),0)::text AS c FROM matches WHERE status <> 'cancelled'`,
        [],
      ),
      pool.query(
        `SELECT s.name, count(*)::int AS value FROM matches m
           JOIN sports s ON s.id = m.sport_id
          WHERE m.status <> 'cancelled'
          GROUP BY s.name ORDER BY value DESC`,
      ),
      pool.query(
        `SELECT extract(hour FROM start_time)::int AS hour, count(*)::int AS value
           FROM matches WHERE status <> 'cancelled' GROUP BY 1 ORDER BY value DESC LIMIT 5`,
      ),
      pool.query(
        `SELECT to_char(match_date, 'YYYY-MM-DD') AS date, count(*)::int AS value
           FROM matches WHERE status <> 'cancelled' AND match_date >= now()::date - 30
           GROUP BY 1 ORDER BY 1`,
      ),
      pool.query(
        `SELECT m.id, m.title, m.match_date, m.start_time, m.end_time, m.status,
                s.name AS sport_name, c.name AS court_name, m.price_per_player_cents,
                m.total_value_cents,
                (SELECT count(*) FROM match_players mp WHERE mp.match_id = m.id AND mp.status = 'confirmed') AS confirmed,
                m.players_max
           FROM matches m JOIN sports s ON s.id = m.sport_id JOIN courts c ON c.id = m.court_id
          WHERE m.match_date >= $1::date AND m.status IN ('scheduled','in_progress')
          ORDER BY m.match_date ASC, m.start_time ASC LIMIT 10`,
        [today],
      ),
    ]);

  return {
    today: {
      matches: Number(todayMatches.rows[0]?.c ?? 0),
      confirmedPlayers: Number(todayConfirmed.rows[0]?.c ?? 0),
      receivedCents: Number(received.rows[0]?.c ?? 0),
    },
    pendingCents: Number(pending.rows[0]?.c ?? 0),
    totalPotentialCents: Number(totals.rows[0]?.c ?? 0),
    charts: {
      bySport: bySport.rows,
      byHour: byHour.rows,
      byDay: byDay.rows,
    },
    upcoming: upcoming.rows,
  };
}

export async function getFinancialReport(params: { from?: string; to?: string }): Promise<
  Record<string, unknown>
> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (params.from) {
    values.push(params.from);
    where.push(`confirmed_at::date >= $${values.length}::date`);
  }
  if (params.to) {
    values.push(params.to);
    where.push(`confirmed_at::date <= $${values.length}::date`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const byMethod = await pool.query(
    `SELECT status, count(*)::int AS qty, COALESCE(sum(amount_cents),0)::bigint AS total
       FROM payments ${whereSql}
      GROUP BY status ORDER BY total DESC`,
    values,
  );
  const total = await pool.query(
    `SELECT COALESCE(sum(amount_cents),0)::bigint AS total,
            COALESCE(sum(amount_cents) FILTER (WHERE status IN ('pix_confirmed','paid_cash','paid_card','paid_manual_pix')),0)::bigint AS received,
            COALESCE(sum(amount_cents) FILTER (WHERE status IN ('pending','pix_initiated','pix_claimed_paid','pay_at_court')),0)::bigint AS pending
       FROM payments ${whereSql}`,
    values,
  );

  return {
    totalCents: total.rows[0]?.total ?? 0,
    receivedCents: total.rows[0]?.received ?? 0,
    pendingCents: total.rows[0]?.pending ?? 0,
    byMethod: byMethod.rows,
  };
}

export async function getPlayersReport(params: { from?: string; to?: string }): Promise<
  Record<string, unknown>
> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE created_at >= $1::date)::int AS new_players
       FROM players`,
    [params.from ?? '1970-01-01'],
  );

  const frequent = await pool.query(
    `SELECT p.id, p.name, p.phone, count(mp.id)::int AS participations, sum(pa.amount_cents)::bigint AS spent
       FROM players p
       LEFT JOIN match_players mp ON mp.player_id = p.id AND mp.status = 'confirmed'
       LEFT JOIN payments pa ON pa.match_id = mp.match_id AND pa.player_id = p.id
                               AND pa.status IN ('pix_confirmed','paid_cash','paid_card','paid_manual_pix')
      GROUP BY p.id, p.name, p.phone
      ORDER BY participations DESC
      LIMIT 25`,
  );

  return {
    total: rows[0]?.total ?? 0,
    newPlayers: rows[0]?.new_players ?? 0,
    frequent: frequent.rows,
  };
}

export async function getReservationsReport(params: { from?: string; to?: string }): Promise<
  Record<string, unknown>
> {
  const values: unknown[] = [];
  const where: string[] = [];
  if (params.from) {
    values.push(params.from);
    where.push(`m.match_date >= $${values.length}::date`);
  }
  if (params.to) {
    values.push(params.to);
    where.push(`m.match_date <= $${values.length}::date`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const byCourt = await pool.query(
    `SELECT c.name, count(m.id)::int AS matches FROM matches m JOIN courts c ON c.id = m.court_id
       ${whereSql} GROUP BY c.name ORDER BY matches DESC`,
    values,
  );
  const bySport = await pool.query(
    `SELECT s.name, count(m.id)::int AS matches FROM matches m JOIN sports s ON s.id = m.sport_id
       ${whereSql} GROUP BY s.name ORDER BY matches DESC`,
    values,
  );
  const byHour = await pool.query(
    `SELECT extract(hour FROM m.start_time)::int AS hour, count(*)::int AS matches
       FROM matches m ${whereSql} GROUP BY 1 ORDER BY 1`,
    values,
  );

  return { byCourt: byCourt.rows, bySport: bySport.rows, byHour: byHour.rows };
}

export async function getLoyaltyReport(): Promise<Record<string, unknown>> {
  const [granted, used, eligible] = await Promise.all([
    pool.query(
      `SELECT r.name, count(pr.id)::int AS granted FROM player_rewards pr
         LEFT JOIN rewards r ON r.id = pr.reward_id GROUP BY r.name ORDER BY granted DESC`,
    ),
    pool.query(
      `SELECT r.name, count(pr.id)::int AS used FROM player_rewards pr
         LEFT JOIN rewards r ON r.id = pr.reward_id
        WHERE pr.status = 'used' GROUP BY r.name ORDER BY used DESC`,
    ),
    pool.query(
      `SELECT p.id, p.name, p.phone, sum(pp.points)::int AS xp,
              (SELECT count(DISTINCT mp.match_id) FROM match_players mp JOIN matches m ON m.id=mp.match_id
                WHERE mp.player_id = p.id AND mp.status='confirmed' AND m.status='completed'
                  AND m.match_date >= date_trunc('month', now())::date) AS month_matches
         FROM players p LEFT JOIN player_points pp ON pp.player_id = p.id
        GROUP BY p.id, p.name, p.phone
        ORDER BY xp DESC LIMIT 20`,
    ),
  ]);

  return { granted: granted.rows, used: used.rows, eligible: eligible.rows };
}
