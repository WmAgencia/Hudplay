import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const BASE = 'C:\\Users\\junin\\AppData\\Local\\Temp\\opencode\\hudplay-pg';
const LOG = 'C:\\Users\\junin\\AppData\\Local\\Temp\\opencode\\hudplay-pg-node.log';
const PORT = 5433;
const DB = 'hudplay';
const dataDir = path.join(BASE, 'data');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  appendFileSync(LOG, line + '\n');
  console.log(line);
}

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    binaryDir: `${BASE}\\bin`,
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    persistent: true,
    onLog: (m) => appendFileSync(LOG, `[pg] ${m}`),
    onError: (e) => appendFileSync(LOG, `[pg-err] ${e}\n`),
  });

  const alreadyInit = existsSync(path.join(dataDir, 'PG_VERSION'));

  if (alreadyInit) {
    log('cluster já inicializado — pulando initdb');
  } else {
    log('rodando initdb...');
    await pg.initialise();
    log('initdb ok');
  }

  log('iniciando postgres...');
  await pg.start();
  log('postgres pronto');

  const client = new Client({
    host: 'localhost',
    port: PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT 1 FROM pg_database WHERE datname = '${DB}'`);
    if (rows.length === 0) {
      await client.query(`CREATE DATABASE ${DB}`);
      log(`database '${DB}' criada`);
    } else {
      log(`database '${DB}' já existe`);
    }
  } finally {
    await client.end();
  }

  log(`PRONTO: postgres://postgres:postgres@localhost:${PORT}/${DB}`);
  setInterval(() => {}, 60_000);
}

main().catch((err) => {
  appendFileSync(LOG, `[FATAL] ${err && err.stack ? err.stack : err}\n`);
  console.error(err);
  process.exit(1);
});