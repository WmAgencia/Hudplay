import { Badge, statusLabel, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBRL, formatDateBR, formatTime, todayIso } from '@/lib/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trophy } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { MatchDetailModal } from './MatchDetailModal';

interface MatchRow {
  id: string;
  code: string;
  title: string;
  match_date: string;
  start_time: string;
  end_time: string;
  status: string;
  players_max: number;
  price_per_player_cents: number;
  total_value_cents: number;
  court_name: string;
  court_color: string | null;
  sport_name: string;
  sport_icon: string | null;
  confirmed_count: number;
  wait_count: number;
  notes: string | null;
}

interface Court {
  id: string;
  name: string;
  capacity: number;
}
interface Sport {
  id: string;
  name: string;
  min_players: number;
  recommended_players: number;
  max_players: number;
}

const STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'scheduled', label: 'Agendadas' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'completed', label: 'Concluídas' },
  { value: 'cancelled', label: 'Canceladas' },
];

export function MatchesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailMatchId, setDetailMatchId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MatchRow | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<{ rows: MatchRow[]; total: number }>({
    queryKey: ['matches', status],
    queryFn: () => api(`/api/matches?limit=200${status ? `&status=${status}` : ''}`),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.rows;
    const q = search.toLowerCase();
    return data.rows.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.court_name.toLowerCase().includes(q) ||
        m.sport_name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q),
    );
  }, [data, search]);

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api(`/api/matches/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      toast('Partida cancelada');
      setCancelTarget(null);
      qc.invalidateQueries({ queryKey: ['matches'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Erro', 'error'),
  });

  if (isLoading) return <PageLoader />;
  if (isError)
    return <ErrorState message={error instanceof Error ? error.message : 'Erro'} onRetry={() => refetch()} />;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Partidas</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} partidas no total</p>
        </div>
        <Button icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
          Nova partida
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar partida, quadra, esporte..."
            className="w-72 pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                status === f.value
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="size-6" />}
            title="Nenhuma partida encontrada"
            subtitle="Crie a primeira partida para começar a receber jogadores"
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <Card
              key={m.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <button
                type="button"
                onClick={() => setDetailMatchId(m.id)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                <div
                  className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg text-white"
                  style={{ background: m.court_color ?? '#1f2937' }}
                >
                  <span className="text-[10px] uppercase leading-none opacity-80">
                    {formatDateBR(m.match_date).slice(0, 2)}
                  </span>
                  <span className="text-sm font-bold">{formatDateBR(m.match_date).slice(3)}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">{m.title}</p>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">
                      {m.code}
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {m.sport_name} · {m.court_name} · {formatTime(m.start_time)}–{formatTime(m.end_time)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatBRL(m.price_per_player_cents)}/jogador · {formatBRL(m.total_value_cents)} total
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                <Badge tone={statusTone[m.status as keyof typeof statusTone] ?? 'slate'}>
                  {statusLabel[m.status] ?? m.status}
                </Badge>
                <p className="text-xs font-medium text-slate-600">
                  {m.confirmed_count}/{m.players_max}
                  {m.wait_count > 0 ? ` · ${m.wait_count} na fila` : ''}
                </p>
              </div>
              {m.status === 'scheduled' || m.status === 'in_progress' ? (
                <Button variant="ghost" size="sm" onClick={() => setCancelTarget(m)}>
                  Cancelar
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {createOpen ? (
        <CreateMatchModal
          open
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            qc.invalidateQueries({ queryKey: ['matches'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      ) : null}

      {detailMatchId ? (
        <MatchDetailModal
          matchId={detailMatchId}
          onClose={() => setDetailMatchId(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ['matches'] });
            qc.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancelar partida"
        message={`Tem certeza que deseja cancelar "${cancelTarget?.title}"? Jogadores serão notificados e pagamentos pendentes serão cancelados.`}
        confirmLabel="Cancelar partida"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}

function CreateMatchModal({
  open,
  onClose,
  onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: courts } = useQuery<{ courts: Court[] }>({
    queryKey: ['courts-admin'],
    queryFn: () => api('/api/courts/admin'),
  });
  const { data: sports } = useQuery<{ sports: Sport[] }>({
    queryKey: ['sports-admin'],
    queryFn: () => api('/api/sports/admin'),
  });

  const [courtId, setCourtId] = useState('');
  const [sportId, setSportId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('21:00');
  const [playersMax, setPlayersMax] = useState('18');
  const [title, setTitle] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api<{ match: { id: string; code: string } }>('/api/matches', {
        method: 'POST',
        body: {
          courtId,
          sportId,
          date,
          startTime,
          endTime,
          playersMax: Number(playersMax),
          title: title || undefined,
        },
      }),
    onSuccess: (data) => {
      toast(`Partida criada! Código ${data.match.code}`);
      qc.invalidateQueries({ queryKey: ['matches'] });
      onCreated();
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Erro ao criar', 'error'),
  });

  const selectedSport = sports?.sports.find((s) => s.id === sportId);
  const maxForSport = selectedSport?.max_players ?? Number(playersMax);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!courtId || !sportId) return;
    if (startTime >= endTime) {
      toast('Horário inválido', 'error');
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova partida"
      subtitle="O valor por jogador é calculado automaticamente"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending} icon={<Trophy className="size-4" />}>
            Criar partida
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Quadra" value={courtId} onChange={(e) => setCourtId(e.target.value)} required>
          <option value="">Selecione...</option>
          {courts?.courts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.capacity} vagas)
            </option>
          ))}
        </Select>
        <Select label="Esporte" value={sportId} onChange={(e) => setSportId(e.target.value)} required>
          <option value="">Selecione...</option>
          {sports?.sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (máx. {s.max_players})
            </option>
          ))}
        </Select>
        <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Início"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
          <Input
            label="Fim"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </div>
        <Input
          label="Número de jogadores"
          type="number"
          min={1}
          max={maxForSport}
          value={playersMax}
          onChange={(e) => setPlayersMax(e.target.value)}
          hint={selectedSport ? `Máximo do esporte: ${maxForSport}` : undefined}
          required
        />
        <Input
          label="Título (opcional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Vôlei de Sábado"
        />
      </div>
      {mutation.error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{mutation.error.message}</p>
      ) : null}
    </Modal>
  );
}
