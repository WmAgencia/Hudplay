import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import { getSettings, updateSettings } from '../modules/settings/settings-service.js';

const settingsPatch = z.object({
  company: z
    .object({
      name: z.string().min(1).optional(),
      tagline: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      social: z.record(z.string()).optional(),
      description: z.string().optional(),
    })
    .optional(),
  appearance: z
    .object({
      primaryColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      secondaryColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      logoUrl: z.string().optional(),
      favicon: z.string().optional(),
    })
    .optional(),
  payments: z
    .object({
      pixKey: z.string().optional(),
      pixKeyType: z.string().optional(),
      pixInstructions: z.string().optional(),
      payAtCourtInstructions: z.string().optional(),
    })
    .optional(),
  reservations: z
    .object({
      minAdvanceMinutes: z.number().int().min(0).optional(),
      maxAdvanceDays: z.number().int().min(1).optional(),
      cancellationPolicy: z.string().optional(),
      toleranceMinutes: z.number().int().min(0).optional(),
      defaultCapacity: z.number().int().min(1).optional(),
      waitlistAcceptMinutes: z.number().int().min(1).optional(),
    })
    .optional(),
  loyalty: z
    .object({
      enabled: z.boolean().optional(),
      pointsEnabled: z.boolean().optional(),
      participationXp: z.number().int().min(0).optional(),
      createMatchXp: z.number().int().min(0).optional(),
      earlyPaymentXp: z.number().int().min(0).optional(),
      streak5MatchesXp: z.number().int().min(0).optional(),
    })
    .optional(),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', { preHandler: requireAdmin }, async () => {
    const settings = await getSettings();
    return { settings };
  });

  app.put('/api/settings', { preHandler: requireRole('owner') }, async (request, reply) => {
    const patch = settingsPatch.parse(request.body);
    const settings = await updateSettings(patch);
    await audit(request, 'settings.update', 'settings', '1', { keys: Object.keys(patch) });
    return reply.send({ settings });
  });
}
