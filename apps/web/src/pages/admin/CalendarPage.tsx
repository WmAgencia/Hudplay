import { Card } from '@/components/ui/Card';
import { EmptyState, PageLoader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatTime, weekdayName } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MatchDetailModal } from './MatchDetailModal';

interface Event {
  id: string;
  title: string;
  match_date: string;
  start_time: string;
  end_time: string;
  status: string;
  players_max: number;
  court_name: string;
  court_color: string | null;
  sport_name: string;
  confirmed: number;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function CalendarPage() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const weekStart = useMemo(() => {
    const d = addDays(anchor, -anchor.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }, [anchor]);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const { data, isLoading } = useQuery<{ events: Event[] }>({
    queryKey: ['calendar', iso(weekStart), iso(weekEnd)],
    queryFn: () => api(`/api/matches/calendar?from=${iso(weekStart)}&to=${iso(weekEnd)}`),
  });

  const byDay = useMemo(() => {
    const map: Record<string, Event[]> = {};
    for (const e of data?.events ?? []) {
      map[e.match_date] ??= [];
      map[e.match_date]!.push(e);
    }
    return map;
  }, [data]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Calendário</h1>
          <p className="text-sm text-slate-500">
            Semana de {formatDay(weekStart)} a {formatDay(weekEnd)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor(addDays(anchor, -7))}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(new Date())}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setAnchor(addDays(anchor, 7))}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((d, i) => {
            const key = iso(d);
            const events = byDay[key] ?? [];
            const isToday = key === iso(new Date());
            return (
              <Card key={key} className={cn('min-h-40', isToday && 'ring-2 ring-emerald-500')}>
                <div
                  className={cn(
                    'border-b px-3 py-2',
                    isToday ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100',
                  )}
                >
                  <p className="text-xs font-semibold text-slate-700">{weekdayName(i)}</p>
                  <p className={cn('text-xs', isToday ? 'text-emerald-600' : 'text-slate-400')}>
                    {String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}
                  </p>
                </div>
                <div className="space-y-1.5 p-2">
                  {events.length === 0 ? (
                    <p className="px-1 py-2 text-center text-[10px] text-slate-300">—</p>
                  ) : (
                    events.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => setSelectedId(e.id)}
                        className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-slate-50"
                        style={{ background: `${e.court_color ?? '#64748b'}14` }}
                      >
                        <p className="flex items-center justify-between gap-1">
                          <span
                            className="truncate text-[11px] font-semibold"
                            style={{ color: e.court_color ?? '#334155' }}
                          >
                            {formatTime(e.start_time)}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500">
                            {e.confirmed}/{e.players_max}
                          </span>
                        </p>
                        <p className="truncate text-[11px] text-slate-600">{e.title}</p>
                      </button>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {data && data.events.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays className="size-6" />}
            title="Nenhuma partida nesta semana"
            subtitle="Crie partidas em Partidas > Nova partida"
          />
        </Card>
      ) : null}

      {selectedId ? (
        <MatchDetailModal matchId={selectedId} onClose={() => setSelectedId(null)} onChanged={() => {}} />
      ) : null}
    </div>
  );
}

function formatDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
