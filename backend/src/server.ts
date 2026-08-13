import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { allowedOrigins, env } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';

import { adminAuthRoutes } from './routes/admin-auth.routes.js';
import { adminUsersRoutes, loyaltyRoutes } from './routes/admin-users.routes.js';
import { courtsRoutes } from './routes/courts.routes.js';
import { matchesRoutes } from './routes/matches.routes.js';
import { paymentsRoutes } from './routes/payments.routes.js';
import { playerAuthRoutes } from './routes/player-auth.routes.js';
import { playerRoutes } from './routes/player.routes.js';
import { publicMatchRoutes } from './routes/public-match.routes.js';
import { reportsRoutes } from './routes/reports.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { sportsRoutes } from './routes/sports.routes.js';

export async function buildApp(opts: { autoMigrate?: boolean } = {}): Promise<ReturnType<typeof Fastify>> {
  if (opts.autoMigrate) {
    await runMigrations();
  }

  const app = Fastify({
    logger: false, // usamos pino próprio
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
  });

  app.setErrorHandler(errorHandler);

  await app.register(cors, {
    origin: allowedOrigins === '*' ? true : allowedOrigins,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: [],
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'hudplay', time: new Date().toISOString() }));

  // Rotas
  await app.register(adminAuthRoutes);
  await app.register(playerAuthRoutes);
  await app.register(settingsRoutes);
  await app.register(sportsRoutes);
  await app.register(courtsRoutes);
  await app.register(matchesRoutes);
  await app.register(publicMatchRoutes);
  await app.register(playerRoutes);
  await app.register(adminUsersRoutes);
  await app.register(loyaltyRoutes);
  await app.register(reportsRoutes);
  await app.register(paymentsRoutes);

  return app;
}

const isDirectRun =
  process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isDirectRun) {
  const app = await buildApp({ autoMigrate: true });
  app.listen({ port: env.PORT, host: env.HOST }, (err: Error | null) => {
    if (err) {
      logger.error(err, 'Falha ao iniciar servidor');
      process.exit(1);
    }
    logger.info(`Hudplay backend rodando em http://${env.HOST}:${env.PORT}`);
  });
}

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});
