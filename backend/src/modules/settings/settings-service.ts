import { pool } from '../../db/pool.js';
import { AppError, NotFoundError } from '../../lib/errors.js';

export type SettingPayment = {
  pixKey: string;
  pixKeyType: string;
  pixInstructions: string;
  payAtCourtInstructions: string;
};

export type SettingReservations = {
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  cancellationPolicy: string;
  toleranceMinutes: number;
  defaultCapacity: number;
  waitlistAcceptMinutes: number;
};

export type SettingLoyalty = {
  enabled: boolean;
  pointsEnabled: boolean;
  participationXp: number;
  createMatchXp: number;
  earlyPaymentXp: number;
  streak5MatchesXp: number;
};

export type AppSettings = {
  company: {
    name: string;
    tagline: string;
    phone: string;
    address: string;
    social: Record<string, string>;
    description: string;
  };
  appearance: {
    primaryColor: string;
    secondaryColor: string;
    logoUrl: string;
    favicon: string;
  };
  payments: SettingPayment;
  reservations: SettingReservations;
  loyalty: SettingLoyalty;
};

const DEFAULTS: AppSettings = {
  company: {
    name: 'Hudplay',
    tagline: '',
    phone: '',
    address: '',
    social: {},
    description: '',
  },
  appearance: { primaryColor: '#16a34a', secondaryColor: '#111827', logoUrl: '', favicon: '' },
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
};

function mergeSettings(stored: Partial<AppSettings> | null): AppSettings {
  const base = structuredClone(DEFAULTS);
  if (!stored) return base;
  const merged: Record<string, unknown> = { ...(base as object) };
  for (const key of Object.keys(merged)) {
    const storedVal = (stored as Record<string, unknown>)[key];
    if (storedVal && typeof storedVal === 'object' && !Array.isArray(storedVal)) {
      const current = merged[key];
      merged[key] = {
        ...(typeof current === 'object' && current ? (current as object) : {}),
        ...(storedVal as object),
      };
    }
  }
  return merged as unknown as AppSettings;
}

export async function getSettings(): Promise<AppSettings> {
  const { rows } = await pool.query<{ data: AppSettings }>('SELECT data FROM settings WHERE id = 1');
  if (rows.length === 0) return structuredClone(DEFAULTS);
  return mergeSettings(rows[0]?.data ?? null);
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export async function updateSettings(patch: DeepPartial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = mergeSettings(deepMerge(current, patch) as AppSettings);
  await pool.query(
    `INSERT INTO settings (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
    [JSON.stringify(next)],
  );
  return next;
}

function deepMerge<T extends object>(target: T, patch: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...(target as object) };
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const patchVal = patch[key];
    const targetVal = target[key];
    if (
      patchVal !== undefined &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal) &&
      targetVal !== undefined &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      out[key as string] = deepMerge(targetVal as object, patchVal as object);
    } else if (patchVal !== undefined) {
      out[key as string] = patchVal;
    }
  }
  return out as unknown as T;
}

export async function getPaymentSettings(): Promise<SettingPayment> {
  const s = await getSettings();
  return s.payments;
}

export async function getReservationSettings(): Promise<SettingReservations> {
  const s = await getSettings();
  return s.reservations;
}

export async function requirePaymentSettings(): Promise<SettingPayment> {
  const p = await getPaymentSettings();
  if (!p.pixKey) {
    throw new AppError('Chave PIX não configurada. Configure em Configurações → Pagamentos.', {
      statusCode: 503,
      code: 'PIX_KEY_NOT_CONFIGURED',
    });
  }
  return p;
}
