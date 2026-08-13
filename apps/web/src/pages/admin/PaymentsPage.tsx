import { Badge, statusLabel, statusTone } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatBRL, formatDateBR, formatDateTime } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CheckCircle2, CreditCard, Hourglass, Search } from 'lucide-react';
import { useState } from 'react';

interface PaymentRow {
  id: string;
  match_id: string;
  player_name: string;
  player_phone: string;
  method: string;
  status: string;
  amount_cents: number;
  pix_reference: string | null;
  created_at: string;
  confirmed_at: string | null;
  claimed_at: string | null;
  match_code: string;
  match_date: string;
  start_time: string;
  court_name: string;
  sport_name: string;
  confirmation_admin: string | null;
  confirmation_method: string | null;
  confirmation_date: string | null;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pending', label: 'Pendente' },
  { value: 'pix_initiated', label: 'PIX gerado' },
  { value: 'pix_claimed_paid', label: 'PIX a confirmar' },
  { value: 'pix_confirmed', label: 'PIX confirmado' },
  { value: 'pay_at_court', label: 'Pagar na quadra' },
  { value: 'paid_cash', label: 'Dinheiro' },
  { value: 'paid_card', label: 'Cartão' },
  { value: 'paid_manual_pix', label: 'PIX manual' },
  { value: 'cancelled', label: 'Cancelado' },
];

export function PaymentsPage() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<{ payments: PaymentRow[]; count: number }>({
    queryKey: ['payments', status, search],
    queryFn: () =>
      api(
        `/api/admin/payments?status=${status}${search.trim() ? `&query=${encodeURIComponent(search.trim())}` : ''}`,
      ),
  });

  const summary = (data?.payments ?? []).reduce(
    (acc, p) => {
      acc.received += ['pix_confirmed', 'paid_cash', 'paid_card', 'paid_manual_pix'].includes(p.status)
        ? p.amount_cents
        : 0;
      acc.pending += ['pending', 'pix_initiated', 'pix_claimed_paid', 'pay_at_court'].includes(p.status)
        ? p.amount_cents
        : 0;
      return acc;
    },
    { received: 0, pending: 0 },
  );

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState message="Erro ao carregar pagamentos" onRetry={() => refetch()} />;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Pagamentos</h1>
          <p className="text-sm text-slate-500">{data?.count ?? 0} pagamentos</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="mb-2 inline-flex rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
            <Banknote className="size-5" />
          </div>
          <p className="text-lg font-bold text-slate-800">{formatBRL(summary.received)}</p>
          <p className="text-xs text-slate-500">Recebido</p>
        </Card>
        <Card className="p-4">
          <div className="mb-2 inline-flex rounded-lg bg-amber-50 p-2.5 text-amber-600">
            <Hourglass className="size-5" />
          </div>
          <p className="text-lg font-bold text-slate-800">{formatBRL(summary.pending)}</p>
          <p className="text-xs text-slate-500">A receber</p>
        </Card>
        <Card className="hidden p-4 md:block">
          <div className="mb-2 inline-flex rounded-lg bg-blue-50 p-2.5 text-blue-600">
            <CheckCircle2 className="size-5" />
          </div>
          <p className="text-lg font-bold text-slate-800">
            {data?.payments.filter((p) =>
              ['pix_confirmed', 'paid_cash', 'paid_card', 'paid_manual_pix'].includes(p.status),
            ).length ?? 0}
          </p>
          <p className="text-xs text-slate-500">Confirmados</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Jogador, telefone ou referência PIX..."
            className="w-80 pl-9"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-52">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {data?.payments.length === 0 ? (
        <Card>
          <EmptyState icon={<CreditCard className="size-6" />} title="Nenhum pagamento encontrado" />
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                  <th className="px-4 py-3 font-medium">Jogador</th>
                  <th className="px-4 py-3 font-medium">Partida</th>
                  <th className="px-4 py-3 font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {data?.payments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{p.player_name}</p>
                      <p className="text-xs text-slate-400">{p.player_phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-700">
                        {p.sport_name} · {p.court_name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {formatDateBR(p.match_date)} {p.start_time.slice(0, 5)} · {p.match_code}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{formatBRL(p.amount_cents)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone[p.status as keyof typeof statusTone] ?? 'slate'}>
                        {statusLabel[p.status] ?? p.status}
                      </Badge>
                      {p.pix_reference ? (
                        <p className="mt-1 font-mono text-[10px] text-slate-400">{p.pix_reference}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDateTime(p.confirmed_at ?? p.created_at)}
                      {p.confirmation_admin ? (
                        <p className="text-[10px] text-slate-400">por {p.confirmation_admin}</p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
