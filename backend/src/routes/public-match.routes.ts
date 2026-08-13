import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { signAccessToken } from '../auth/jwt.js';
import { pool } from '../db/pool.js';
import { NotFoundError } from '../lib/errors.js';
import { requirePlayer } from '../middleware/auth.js';
import { getMatchByCode } from '../modules/matches/matches-service.js';
import {
  acceptWaitlistSpot,
  declineWaitlistSpot,
  joinMatch,
  leaveMatch,
} from '../modules/players/participation-service.js';
import { getSettings } from '../modules/settings/settings-service.js';
import { claimPixPaid } from '../payments/provider.js';

const joinSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(8),
  photoUrl: z.string().url().optional(),
  paymentMethod: z.enum(['pix', 'pay_at_court']),
  password: z.string().min(6).max(72).optional(),
});

export async function publicMatchRoutes(app: FastifyInstance): Promise<void> {
  // Página pública da partida (sem autenticação)
  app.get('/api/public/matches/:code', async (request) => {
    const { code } = z.object({ code: z.string().min(4).max(20) }).parse(request.params);
    const match = await getMatchByCode(code);
    if (!match) throw new NotFoundError('Partida não encontrada');

    const settings = await getSettings();

    const players = await pool.query(
      `SELECT mp.position, mp.status AS participation_status,
              p.name, p.photo_url,
              pay.status AS payment_status, pay.method AS payment_method
         FROM match_players mp
         JOIN players p ON p.id = mp.player_id
         LEFT JOIN payments pay ON pay.match_id = mp.match_id AND pay.player_id = p.id
        WHERE mp.match_id = $1 AND mp.status IN ('confirmed', 'pending')
        ORDER BY mp.position ASC`,
      [match.id],
    );

    const waitlist = await pool.query(
      `SELECT wl.position, wl.status, p.name
         FROM waiting_list wl JOIN players p ON p.id = wl.player_id
        WHERE wl.match_id = $1 AND wl.status = 'waiting'
        ORDER BY wl.position ASC`,
      [match.id],
    );

    const confirmedCount = players.rows.filter(
      (p: { participation_status: string }) => p.participation_status === 'confirmed',
    ).length;
    const full = confirmedCount >= (match.players_max as number);

    return {
      match: {
        code,
        title: match.title,
        sport: { name: match.sport_name, icon: match.sport_icon },
        court: { name: match.court_name, color: match.court_color },
        date: match.match_date,
        startTime: match.start_time,
        endTime: match.end_time,
        pricePerPlayerCents: match.price_per_player_cents,
        status: match.status,
        playersMax: match.players_max,
        confirmedCount,
        full,
        organizerName: match.organizer_name,
      },
      company: settings.company,
      appearance: settings.appearance,
      paymentInfo: {
        pixAvailable: Boolean(settings.payments.pixKey),
        pixInstructions: settings.payments.pixInstructions,
        payAtCourtInstructions: settings.payments.payAtCourtInstructions,
      },
      players: players.rows,
      waitlist: waitlist.rows,
    };
  });

  // Entrar na partida (página pública)
  app.post('/api/public/matches/:code/join', async (request, reply) => {
    const { code } = z.object({ code: z.string().min(4).max(20) }).parse(request.params);
    const body = joinSchema.parse(request.body);

    const result = await joinMatch({
      matchCode: code,
      name: body.name,
      phone: body.phone,
      photoUrl: body.photoUrl,
      paymentMethod: body.paymentMethod,
      password: body.password,
    });

    // Emite token de jogador para ações posteriores (claim PIX, sair, perfil)
    const accessToken = await signAccessToken({
      sub: result.playerId as string,
      scope: 'player',
      name: body.name,
    });

    return reply.status(201).send({ ...result, accessToken });
  });

  // Jogador informa que pagou o PIX (aguarda confirmação do proprietário)
  app.post('/api/player/payments/:paymentId/claim-paid', { preHandler: requirePlayer }, async (request) => {
    const { paymentId } = z.object({ paymentId: z.string().uuid() }).parse(request.params);
    if (request.auth?.scope !== 'player') return;
    const status = await claimPixPaid(paymentId, request.auth.sub);
    return { status };
  });

  // Jogador sai da partida
  app.post('/api/player/matches/:code/leave', { preHandler: requirePlayer }, async (request) => {
    const { code } = z.object({ code: z.string().min(4).max(20) }).parse(request.params);
    if (request.auth?.scope !== 'player') return;
    await leaveMatch({ matchCode: code, playerId: request.auth.sub });
    return { ok: true };
  });

  // Aceitar vaga da fila
  app.post(
    '/api/player/matches/:code/waitlist/accept',
    { preHandler: requirePlayer },
    async (request, reply) => {
      const { code } = z.object({ code: z.string().min(4).max(20) }).parse(request.params);
      if (request.auth?.scope !== 'player') return;
      const body = z.object({ paymentMethod: z.enum(['pix', 'pay_at_court']) }).parse(request.body);
      const result = await acceptWaitlistSpot({
        matchCode: code,
        playerId: request.auth.sub,
        paymentMethod: body.paymentMethod,
      });
      return reply.send(result);
    },
  );

  // Recusar vaga da fila
  app.post('/api/player/matches/:code/waitlist/decline', { preHandler: requirePlayer }, async (request) => {
    const { code } = z.object({ code: z.string().min(4).max(20) }).parse(request.params);
    if (request.auth?.scope !== 'player') return;
    await declineWaitlistSpot({ matchCode: code, playerId: request.auth.sub });
    return { ok: true };
  });
}
