import { cn } from '@/lib/cn';
import { type ReactNode } from 'react';

type BadgeTone = 'green' | 'amber' | 'red' | 'slate' | 'blue' | 'purple';

export function Badge({
  tone = 'slate',
  children,
  className,
}: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  const tones: Record<BadgeTone, string> = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    purple: 'bg-purple-50 text-purple-700 ring-purple-200',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const statusTone = {
  scheduled: 'blue',
  in_progress: 'purple',
  completed: 'green',
  cancelled: 'red',
  pending: 'amber',
  confirmed: 'green',
  no_show: 'red',
  pay_at_court: 'amber',
  paid_cash: 'green',
  paid_card: 'green',
  paid_manual_pix: 'green',
  pix_confirmed: 'green',
  pix_initiated: 'blue',
  pix_claimed_paid: 'amber',
  waitlist: 'slate',
} as const;

export const statusLabel: Record<string, string> = {
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  pending: 'Pendente',
  confirmed: 'Confirmado',
  no_show: 'Não compareceu',
  pay_at_court: 'Pagar na quadra',
  paid_cash: 'Pago em dinheiro',
  paid_card: 'Pago no cartão',
  paid_manual_pix: 'Pago no PIX',
  pix_confirmed: 'PIX confirmado',
  pix_initiated: 'PIX gerado',
  pix_claimed_paid: 'PIX a confirmar',
  waiting: 'Na fila',
};
