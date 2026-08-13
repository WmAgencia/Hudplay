import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET deve ter ao menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET deve ter ao menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  ALLOWED_ORIGINS: z.string().default('*'),
  PIX_PROVIDER: z.string().default('manual'),
  PIX_DEFAULT_KEY: z.string().optional().default(''),
  PIX_DEFAULT_KEY_TYPE: z.string().optional().default(''),
  PUBLIC_BASE_URL: z.string().default('http://localhost:5173'),
  LOYALTY_POINTS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

const isTest = process.env.NODE_ENV === 'test';

const testEnv = {
  NODE_ENV: 'test' as const,
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://test:test@localhost:5432/hudplay_test',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-at-least-32-chars-long!!',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-at-least-32-chars-long!',
};

const parsed = isTest
  ? envSchema.safeParse({ ...process.env, ...testEnv })
  : envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Variáveis de ambiente inválidas:');
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTestEnv = env.NODE_ENV === 'test';

export const allowedOrigins =
  env.ALLOWED_ORIGINS === '*' ? '*' : env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
