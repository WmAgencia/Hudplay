import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export async function errorHandler(
  err: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (err instanceof AppError) {
    reply.status(err.statusCode).send({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Erro de validação Zod -> 422
  const zodErr = err as { name?: string; issues?: Array<{ message: string }> };
  if (zodErr?.name === 'ZodError') {
    reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: zodErr.issues?.map((i) => i.message) ?? [],
      },
    });
    return;
  }

  // Constraint violation do Postgres
  const pgErr = err as { code?: string; detail?: string; constraint?: string };
  if (pgErr?.code === '23505') {
    reply.status(409).send({
      error: {
        code: 'DUPLICATE',
        message: 'Registro duplicado',
        details: pgErr.detail ?? pgErr.constraint,
      },
    });
    return;
  }
  if (pgErr?.code === '23503') {
    reply.status(409).send({
      error: { code: 'FOREIGN_KEY', message: 'Registro referenciado não existe' },
    });
    return;
  }
  if (pgErr?.code === '23514') {
    reply.status(422).send({
      error: { code: 'CHECK_CONSTRAINT', message: 'Valor fora das regras permitidas' },
    });
    return;
  }

  logger.error({ err, url: request.url }, 'Erro não tratado');
  reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
  });
}
