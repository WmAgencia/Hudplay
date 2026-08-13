export type Role = 'owner' | 'admin' | 'employee';

export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export type PaymentStatus =
  | 'pending'
  | 'pix_initiated'
  | 'pix_claimed_paid'
  | 'pix_confirmed'
  | 'pay_at_court'
  | 'paid_cash'
  | 'paid_card'
  | 'paid_manual_pix'
  | 'cancelled'
  | 'refunded';

export type PaymentMethod = 'pix' | 'pay_at_court';

export type ParticipationStatus = 'pending' | 'confirmed' | 'cancelled' | 'no_show';

export type WaitlistStatus = 'waiting' | 'invited' | 'accepted' | 'declined' | 'expired';

export type RewardType =
  | 'free_hours'
  | 'discount'
  | 'credit'
  | 'drink'
  | 'food'
  | 'product'
  | 'gift'
  | 'other';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: string[];
  active: boolean;
}

export interface Player {
  id: string;
  name: string;
  phone: string;
  email?: string;
  photoUrl?: string;
  points: number;
  status: 'active' | 'blocked';
}

export interface Sport {
  id: string;
  name: string;
  icon?: string;
  imageUrl?: string;
  minPlayers: number;
  recommendedPlayers: number;
  maxPlayers: number;
  rules?: string;
  active: boolean;
}

export interface Court {
  id: string;
  name: string;
  description?: string;
  photoUrl?: string;
  capacity: number;
  pricePerHourCents: number;
  color?: string;
  status: 'active' | 'inactive';
  sports: Array<{ id: string; name: string; icon?: string; maxPlayers: number }>;
}

export interface Match {
  id: string;
  code: string;
  title: string;
  courtId: string;
  sportId: string;
  matchDate: string;
  startTime: string;
  endTime: string;
  playersMax: number;
  pricePerPlayerCents: number;
  totalValueCents: number;
  status: MatchStatus;
  organizerName?: string;
  confirmedCount: number;
  waitCount: number;
}

export interface MatchPlayer {
  matchPlayerId: string;
  playerId: string;
  name: string;
  phone: string;
  photoUrl?: string;
  position: number;
  participationStatus: ParticipationStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  amountCents?: number;
}

export interface PublicMatch {
  code: string;
  title: string;
  sport: { name: string; icon?: string };
  court: { name: string; color?: string };
  date: string;
  startTime: string;
  endTime: string;
  pricePerPlayerCents: number;
  status: MatchStatus;
  playersMax: number;
  confirmedCount: number;
  full: boolean;
  organizerName?: string;
}

export interface AppSettings {
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
  payments: {
    pixKey: string;
    pixKeyType: string;
    pixInstructions: string;
    payAtCourtInstructions: string;
  };
  reservations: {
    minAdvanceMinutes: number;
    maxAdvanceDays: number;
    cancellationPolicy: string;
    toleranceMinutes: number;
    defaultCapacity: number;
    waitlistAcceptMinutes: number;
  };
  loyalty: {
    enabled: boolean;
    pointsEnabled: boolean;
    participationXp: number;
    createMatchXp: number;
    earlyPaymentXp: number;
    streak5MatchesXp: number;
  };
}
