import argon2 from 'argon2';
import { logger } from '../lib/logger.js';
import { pool } from './pool.js';

/**
 * Seed de demonstração para o primeiro cliente (Hudplay).
 * Idempotente: só insere dados quando as tabelas estão vazias.
 */
export async function seed(): Promise<void> {
  const { rows } = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM settings');
  if (Number(rows[0]?.count) > 0) {
    logger.info('Seed já aplicado — pulando');
    return;
  }

  const passwordHash = await argon2.hash('hudplay123');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Admin proprietário
    await client.query(
      `INSERT INTO admin_users (name, email, password_hash, role, permissions)
       VALUES ($1, $2, $3, 'owner', $4)`,
      ['Proprietário Hudplay', 'admin@hudplay.com.br', passwordHash, JSON.stringify(['*'])],
    );

    // Esportes
    const sports = [
      ['Vôlei', 'volleyball', 2, 10, 18, '6 jogadores em quadra por time.'],
      ['Futsal', 'futbol', 4, 12, 18, '5 jogadores por time, incluindo goleiro.'],
      ['Handebol', 'handball', 4, 12, 18, '7 jogadores por time.'],
    ];
    for (const [name, icon, min, rec, max, rules] of sports) {
      await client.query(
        `INSERT INTO sports (name, icon, min_players, recommended_players, max_players, rules, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [name, icon, min, rec, max, rules, 0],
      );
    }

    // Quadra
    await client.query(
      `INSERT INTO courts (name, description, capacity, price_per_hour_cents, color)
       VALUES ($1, $2, $3, $4, $5)`,
      ['Quadra Principal', 'Quadra poliesportiva coberta.', 20, 12000, '#16a34a'],
    );

    // Permite os 3 esportes na quadra
    const courtSports = await client.query(
      `SELECT c.id AS court_id, s.id AS sport_id
         FROM courts c, sports s
        WHERE c.name = 'Quadra Principal'`,
    );
    for (const cs of courtSports.rows) {
      await client.query('INSERT INTO court_sports (court_id, sport_id) VALUES ($1, $2)', [
        cs.court_id,
        cs.sport_id,
      ]);
    }

    // Horários padrão (todos os dias 06:00–23:00)
    for (let dow = 0; dow < 7; dow++) {
      await client.query(
        `INSERT INTO schedules (court_id, day_of_week, start_time, end_time)
         VALUES ((SELECT id FROM courts LIMIT 1), $1, '06:00', '23:00')`,
        [dow],
      );
    }

    // Preços por faixa de dia
    const priceRows = [
      [1, 4, '18:00', '23:00', 12000], // seg-qui à noite
      [5, 5, '18:00', '23:00', 13000], // sexta à noite
      [6, 6, '06:00', '23:00', 16000], // sábado
      [0, 0, '06:00', '23:00', 16000], // domingo
    ];
    for (const [dowFrom, dowTo, start, end, price] of priceRows) {
      for (let dow = dowFrom as number; dow <= (dowTo as number); dow++) {
        await client.query(
          `INSERT INTO prices (court_id, day_of_week, start_time, end_time, price_per_hour_cents)
           VALUES ((SELECT id FROM courts LIMIT 1), $1, $2, $3, $4)`,
          [dow, start, end, price],
        );
      }
    }

    // Settings (Hudplay / Jardim Europa — Sorocaba)
    await client.query(`INSERT INTO settings (id, data) VALUES (1, $1)`, [
      JSON.stringify({
        company: {
          name: 'Hudplay',
          tagline: 'Jardim Europa — Sorocaba',
          phone: '',
          address: 'Jardim Europa, Sorocaba — SP',
          social: {},
          description: 'Arena de quadras esportivas.',
        },
        appearance: {
          primaryColor: '#16a34a',
          secondaryColor: '#111827',
          logoUrl: '',
          favicon: '',
        },
        payments: {
          pixKey: '',
          pixKeyType: '',
          pixInstructions: 'Envie o PIX com a referência exibida para identificar seu pagamento.',
          payAtCourtInstructions: 'Pagamento presencial na recepção antes do início da partida.',
        },
        reservations: {
          minAdvanceMinutes: 60,
          maxAdvanceDays: 30,
          cancellationPolicy: 'Cancelamento sem custo até 2 horas antes.',
          toleranceMinutes: 15,
          defaultCapacity: 18,
          waitlistAcceptMinutes: 30,
        },
        loyalty: {
          enabled: true,
          pointsEnabled: true,
          participationXp: 100,
          createMatchXp: 50,
          earlyPaymentXp: 20,
          streak5MatchesXp: 500,
        },
      }),
    ]);

    await client.query('COMMIT');
    logger.info('Seed de demonstração aplicado (Hudplay)');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const isDirectRun =
  process.argv[1] && (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));

if (isDirectRun) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error(err, 'Seed falhou');
      process.exit(1);
    });
}
