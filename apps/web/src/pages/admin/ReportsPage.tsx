import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { ErrorState, PageLoader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBRL } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, LayoutGrid, Medal, TrendingUp } from 'lucide-react';
import { useState } from 'react';

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  return { from, to: now.toISOString().slice(0, 10) };
}

export function ReportsPage() {
  const [range, setRange] = useState(() => monthRange());

  const financial = useQuery({
    queryKey: ['report-financial', range],
    queryFn: () => api(`/api/reports/financial?from=${range.from}&to=${range.to}`),
  });
  const players = useQuery({
    queryKey: ['report-players', range],
    queryFn: () => api(`/api/reports/players?from=${range.from}&to=${range.to}`),
  });
  const reservations = useQuery({
    queryKey: ['report-reservations', range],
    queryFn: () => api(`/api/reports/reservations?from=${range.from}&to=${range.to}`),
  });
  const loyalty = useQuery({ queryKey: ['report-loyalty'], queryFn: () => api('/api/reports/loyalty') });

  if (financial.isLoading || players.isLoading || reservations.isLoading || loyalty.isLoading)
    return <PageLoader />;
  if (financial.isError || players.isError) return <ErrorState message="Erro ao carregar relatórios" />;

  const fin = financial.data as {
    totalCents: number;
    receivedCents: number;
    pendingCents: number;
    byMethod: Array<{ status: string; qty: number; total: number }>;
  };
  const pl = players.data as {
    total: number;
    newPlayers: number;
    frequent: Array<{ id: string; name: string; phone: string; participations: number; spent: number }>;
  };
  const res = reservations.data as {
    byCourt: Array<{ name: string; matches: number }>;
    bySport: Array<{ name: string; matches: number }>;
    byHour: Array<{ hour: number; matches: number }>;
  };
  const loy = loyalty.data as {
    granted: Array<{ name: string; granted: number }>;
    used: Array<{ name: string; used: number }>;
    eligible: Array<{ id: string; name: string; phone: string; xp: number; month_matches: number }>;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Relatórios</h1>
          <p className="text-sm text-slate-500">Visão financeira e de operação</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-slate-400">até</span>
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="mb-2 inline-flex rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
            <TrendingUp className="size-5" />
          </div>
          <p className="text-lg font-bold text-slate-800">{formatBRL(fin.receivedCents)}</p>
          <p className="text-xs text-slate-500">Recebido no período</p>
        </Card>
        <Card className="p-4">
          <div className="mb-2 inline-flex rounded-lg bg-amber-50 p-2.5 text-amber-600">
            <BarChart3 className="size-5" />
          </div>
          <p className="text-lg font-bold text-slate-800">{formatBRL(fin.pendingCents)}</p>
          <p className="text-xs text-slate-500">Pendente</p>
        </Card>
        <Card className="p-4">
          <div className="mb-2 inline-flex rounded-lg bg-blue-50 p-2.5 text-blue-600">
            <BarChart3 className="size-5" />
          </div>
          <p className="text-lg font-bold text-slate-800">{formatBRL(fin.totalCents)}</p>
          <p className="text-xs text-slate-500">Total esperado</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Receita por forma de pagamento" />
          <CardContent className="space-y-2">
            {fin.byMethod.length === 0 ? (
              <p className="text-sm text-slate-400">Sem dados.</p>
            ) : (
              fin.byMethod.map((m) => (
                <div
                  key={m.status}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"
                >
                  <span className="text-sm text-slate-600">{m.status}</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-800">{formatBRL(m.total)}</p>
                    <p className="text-xs text-slate-400">{m.qty} pagamentos</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Jogadores"
            subtitle={`${pl.total} no total · ${pl.newPlayers} novos no período`}
          />
          <CardContent className="space-y-2">
            {pl.frequent.length === 0 ? (
              <p className="text-sm text-slate-400">Sem dados.</p>
            ) : (
              pl.frequent.slice(0, 8).map((f, i) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-xs font-bold',
                        i < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{f.name}</p>
                      <p className="text-xs text-slate-400">{f.participations} participações</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{formatBRL(f.spent)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Ocupação por quadra" />
          <CardContent className="space-y-2">
            {res.byCourt.length === 0 ? (
              <p className="text-sm text-slate-400">Sem dados.</p>
            ) : (
              res.byCourt.map((c) => (
                <div key={c.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm text-slate-600">
                    <LayoutGrid className="size-3.5" /> {c.name}
                  </span>
                  <Badge tone="blue">{c.matches} partidas</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Por esporte" />
          <CardContent className="space-y-2">
            {res.bySport.length === 0 ? (
              <p className="text-sm text-slate-400">Sem dados.</p>
            ) : (
              res.bySport.map((s) => (
                <div key={s.name} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{s.name}</span>
                  <Badge tone="blue">{s.matches} partidas</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Horários mais alugados" />
          <CardContent className="space-y-2">
            {res.byHour.length === 0 ? (
              <p className="text-sm text-slate-400">Sem dados.</p>
            ) : (
              res.byHour.map((h) => (
                <div key={h.hour} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{String(h.hour).padStart(2, '0')}h</span>
                  <Badge tone="blue">{h.matches} partidas</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader title="Fidelidade" subtitle="Top jogadores por pontos" />
        <CardContent className="space-y-2">
          {loy.eligible.length === 0 ? (
            <p className="text-sm text-slate-400">Sem dados.</p>
          ) : (
            loy.eligible.slice(0, 10).map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <Medal className="size-4 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{e.name}</p>
                    <p className="text-xs text-slate-400">{e.month_matches} partidas este mês</p>
                  </div>
                </div>
                <Badge tone="purple">{e.xp} pts</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
