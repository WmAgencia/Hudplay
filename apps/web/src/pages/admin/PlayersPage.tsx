import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { api } from '@/lib/api';
import { formatBRL, formatDateBR } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { Medal, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

interface PlayerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  photo_url: string | null;
  points: number;
  status: string;
  created_at: string;
  total_matches: number;
  month_matches: number;
  total_spent_cents: number;
}

export function PlayersPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<{ players: PlayerRow[] }>({
    queryKey: ['players', search],
    queryFn: () =>
      api(`/api/players?limit=100${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ''}`),
  });

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.players].sort((a, b) => b.points - a.points || b.total_matches - a.total_matches);
  }, [data]);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState message="Erro ao carregar jogadores" onRetry={() => refetch()} />;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Jogadores</h1>
          <p className="text-sm text-slate-500">{data?.players.length ?? 0} jogadores</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-72 pl-9"
          />
        </div>
      </div>

      {sorted.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-6" />}
            title="Nenhum jogador encontrado"
            subtitle="Os jogadores aparecem aqui quando se inscrevem nas partidas"
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p, idx) => (
            <button key={p.id} type="button" onClick={() => setSelectedId(p.id)} className="text-left">
              <Card className="p-4 transition-shadow hover:shadow-md">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name} className="size-11 rounded-full object-cover" />
                    ) : (
                      <div className="flex size-11 items-center justify-center rounded-full bg-slate-700 text-lg font-bold text-white">
                        {p.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    {idx === 0 && p.total_matches > 0 ? (
                      <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-amber-400 text-white">
                        <Medal className="size-3" />
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{p.name}</p>
                    <p className="truncate text-xs text-slate-400">{p.phone}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {p.total_matches} partidas · {formatBRL(p.total_spent_cents)} gastos
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                  <Badge tone="purple">
                    <Medal className="size-3" /> {p.points} pts
                  </Badge>
                  <span className="text-xs text-slate-400">
                    Desde {formatDateBR(p.created_at.slice(0, 10))}
                  </span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {selectedId ? <PlayerDetailModal playerId={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}

interface PlayerDetail {
  player: PlayerRow & { notes: string | null };
  matches: Array<{
    id: string;
    code: string;
    title: string;
    match_date: string;
    start_time: string;
    end_time: string;
    status: string;
    sport_name: string;
    court_name: string;
    participation_status: string;
    payment_status: string | null;
  }>;
  rewards: Array<{ id: string; reward_id: string; name: string; status: string; used_at: string | null }>;
}

function PlayerDetailModal({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<PlayerDetail>({
    queryKey: ['player-detail', playerId],
    queryFn: () => api(`/api/players/${playerId}`),
  });

  return (
    <Modal open onClose={onClose} title="Perfil do jogador" size="lg">
      {isLoading || !data ? (
        <PageLoader />
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            {data.player.photo_url ? (
              <img
                src={data.player.photo_url}
                alt={data.player.name}
                className="size-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-16 items-center justify-center rounded-full bg-slate-700 text-2xl font-bold text-white">
                {data.player.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold text-slate-800">{data.player.name}</h3>
              <p className="text-sm text-slate-500">{data.player.phone}</p>
              {data.player.email ? <p className="text-sm text-slate-500">{data.player.email}</p> : null}
              <div className="mt-1.5 flex gap-2">
                <Badge tone="purple">{data.player.points} pts</Badge>
                <Badge tone={data.player.status === 'active' ? 'green' : 'red'}>
                  {data.player.status === 'active' ? 'Ativo' : 'Bloqueado'}
                </Badge>
              </div>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-700">Histórico de partidas</h4>
            {data.matches.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma participação.</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {data.matches.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{m.title}</p>
                      <p className="text-xs text-slate-400">
                        {formatDateBR(m.match_date)} · {m.sport_name} · {m.court_name}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={m.participation_status === 'confirmed' ? 'green' : 'slate'}>
                        {m.participation_status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                      </Badge>
                      {m.payment_status ? <Badge tone="blue">{m.payment_status}</Badge> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-700">Recompensas</h4>
            {data.rewards.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma recompensa.</p>
            ) : (
              <div className="space-y-2">
                {data.rewards.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-purple-100 bg-purple-50/50 p-2.5"
                  >
                    <p className="text-sm font-medium text-slate-800">{r.name}</p>
                    <Badge tone={r.status === 'used' ? 'slate' : 'green'}>
                      {r.status === 'used' ? 'Usada' : 'Disponível'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
