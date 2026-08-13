import { Badge, statusLabel, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { ErrorState, PageLoader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatBRL, formatDateBR, formatTime, todayIso } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CalendarDays, Clock, Hourglass, Trophy, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DashboardData {
  today: { matches: number; confirmedPlayers: number; receivedCents: number };
  pendingCents: number;
  totalPotentialCents: number;
  charts: {
    bySport: Array<{ name: string; value: number }>;
    byHour: Array<{ hour: number; value: number }>;
    byDay: Array<{ date: string; value: number }>;
  };
  upcoming: Array<{
    id: string;
    title: string;
    match_date: string;
    start_time: string;
    end_time: string;
    status: string;
    sport_name: string;
    court_name: string;
    price_per_player_cents: number;
    total_value_cents: number;
    confirmed: number;
    players_max: number;
  }>;
}

function MiniBar({ data }: { data: Array<{ name: string; value: number }> }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.name} className="flex items-center gap-2">
          <span className="w-24 truncate text-xs text-slate-600">{d.name}</span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded bg-emerald-500"
              style={{ width: `${Math.round((d.value / max) * 100)}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs font-medium text-slate-500">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api('/api/dashboard'),
  });

  if (isLoading) return <PageLoader />;
  if (isError)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Erro ao carregar'}
        onRetry={() => refetch()}
      />
    );
  if (!data) return null;

  const stats = [
    {
      label: 'Partidas hoje',
      value: String(data.today.matches),
      icon: CalendarDays,
      tone: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Jogadores confirmados hoje',
      value: String(data.today.confirmedPlayers),
      icon: Users,
      tone: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Recebido hoje',
      value: formatBRL(data.today.receivedCents),
      icon: Banknote,
      tone: 'text-green-600 bg-green-50',
    },
    {
      label: 'A receber',
      value: formatBRL(data.pendingCents),
      icon: Hourglass,
      tone: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Potencial total',
      value: formatBRL(data.totalPotentialCents),
      icon: Trophy,
      tone: 'text-purple-600 bg-purple-50',
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">{formatDateBR(todayIso())}</p>
        </div>
        <Link to="/admin/partidas">
          <Button icon={<Trophy className="size-4" />}>Nova partida</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className={`mb-3 inline-flex rounded-lg p-2.5 ${s.tone}`}>
              <s.icon className="size-5" />
            </div>
            <p className="text-lg font-bold text-slate-800">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Próximas partidas" subtitle="Agendadas e em andamento" />
          <CardContent className="space-y-3">
            {data.upcoming.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Nenhuma partida agendada.</p>
            ) : (
              data.upcoming.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-3 hover:border-emerald-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 flex-col items-center justify-center rounded-lg bg-slate-800 text-white">
                      <span className="text-[10px] uppercase leading-none text-slate-300">
                        {formatDateBR(m.match_date).slice(0, 2)}
                      </span>
                      <span className="text-sm font-bold">{formatDateBR(m.match_date).slice(3)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{m.title}</p>
                      <p className="text-xs text-slate-500">
                        {m.sport_name} · {m.court_name}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="size-3" /> {formatTime(m.start_time)}–{formatTime(m.end_time)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge tone={statusTone[m.status as keyof typeof statusTone] ?? 'slate'}>
                      {statusLabel[m.status] ?? m.status}
                    </Badge>
                    <p className="mt-1 text-xs font-medium text-slate-600">
                      {m.confirmed}/{m.players_max}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Por esporte" />
            <CardContent>
              {data.charts.bySport.length ? (
                <MiniBar data={data.charts.bySport} />
              ) : (
                <p className="text-sm text-slate-400">Sem dados.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Horários mais procurados" />
            <CardContent>
              {data.charts.byHour.length ? (
                <div className="flex flex-wrap gap-2">
                  {data.charts.byHour.map((h) => (
                    <span
                      key={h.hour}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                    >
                      {String(h.hour).padStart(2, '0')}h · {h.value}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Sem dados.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
