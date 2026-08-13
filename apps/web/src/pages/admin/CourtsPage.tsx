import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBRL, weekdayName } from '@/lib/format';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LayoutGrid, Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';

interface CourtAdmin {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  price_per_hour_cents: number;
  color: string | null;
  status: string;
  sport_ids: string[] | null;
  schedules: Array<{
    id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    active: boolean;
  }> | null;
}

interface Sport {
  id: string;
  name: string;
  min_players: number;
  recommended_players: number;
  max_players: number;
  active: boolean;
}

export function CourtsPage() {
  const [tab, setTab] = useState<'courts' | 'sports'>('courts');
  const [courtModal, setCourtModal] = useState<{ open: boolean; court?: CourtAdmin }>({ open: false });
  const [sportModal, setSportModal] = useState<{ open: boolean; sport?: Sport }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: 'court' | 'sport';
    id: string;
    name: string;
  } | null>(null);
  const { toast } = useToast();

  const courts = useQuery<{ courts: CourtAdmin[] }>({
    queryKey: ['courts-admin'],
    queryFn: () => api('/api/courts/admin'),
  });
  const sports = useQuery<{ sports: Sport[] }>({
    queryKey: ['sports-admin'],
    queryFn: () => api('/api/sports/admin'),
  });

  const deleteMutation = useMutation({
    mutationFn: (t: { kind: 'court' | 'sport'; id: string }) =>
      api(`/api/${t.kind === 'court' ? 'courts' : 'sports'}/${t.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast(deleteTarget?.kind === 'court' ? 'Quadra excluída' : 'Esporte excluído');
      setDeleteTarget(null);
      (deleteTarget?.kind === 'court' ? courts : sports).refetch();
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Erro ao excluir', 'error'),
  });

  if (courts.isLoading || sports.isLoading) return <PageLoader />;
  if (courts.isError || sports.isError) return <ErrorState message="Erro ao carregar dados" />;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Quadras & Esportes</h1>
          <p className="text-sm text-slate-500">Gerencie suas quadras, esportes e horários</p>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(['courts', 'sports'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium',
              tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500',
            )}
          >
            {t === 'courts'
              ? `Quadras (${courts.data?.courts.length ?? 0})`
              : `Esportes (${sports.data?.sports.length ?? 0})`}
          </button>
        ))}
      </div>

      {tab === 'courts' ? (
        <>
          <div className="flex justify-end">
            <Button icon={<Plus className="size-4" />} onClick={() => setCourtModal({ open: true })}>
              Nova quadra
            </Button>
          </div>
          {courts.data?.courts.length === 0 ? (
            <Card>
              <EmptyState icon={<LayoutGrid className="size-6" />} title="Nenhuma quadra cadastrada" />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {courts.data?.courts.map((c) => (
                <Card key={c.id}>
                  <CardContent>
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-lg" style={{ background: c.color ?? '#1f2937' }} />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                          <p className="text-xs text-slate-500">
                            {formatBRL(c.price_per_hour_cents)}/hora · {c.capacity} vagas
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setCourtModal({ open: true, court: c })}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ kind: 'court', id: c.id, name: c.name })}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.sport_ids?.map((sid) => {
                        const s = sports.data?.sports.find((x) => x.id === sid);
                        return s ? (
                          <Badge key={sid} tone="blue">
                            {s.name}
                          </Badge>
                        ) : null;
                      })}
                      {!c.sport_ids || c.sport_ids.length === 0 ? (
                        <span className="text-xs text-slate-400">Nenhum esporte vinculado</span>
                      ) : null}
                    </div>
                    {c.schedules && c.schedules.length > 0 ? (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="mb-1.5 text-xs font-medium text-slate-500">Horários</p>
                        <div className="flex flex-wrap gap-1.5">
                          {c.schedules
                            .filter((s) => s.active)
                            .map((s) => (
                              <span
                                key={s.id}
                                className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
                              >
                                {weekdayName(s.day_of_week)} {s.start_time.slice(0, 5)}–
                                {s.end_time.slice(0, 5)}
                              </span>
                            ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex justify-end">
            <Button icon={<Plus className="size-4" />} onClick={() => setSportModal({ open: true })}>
              Novo esporte
            </Button>
          </div>
          {sports.data?.sports.length === 0 ? (
            <Card>
              <EmptyState icon={<LayoutGrid className="size-6" />} title="Nenhum esporte cadastrado" />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {sports.data?.sports.map((s) => (
                <Card key={s.id}>
                  <CardContent>
                    <div className="mb-2 flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                        <p className="text-xs text-slate-500">
                          {s.min_players}–{s.max_players} jogadores
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setSportModal({ open: true, sport: s })}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ kind: 'sport', id: s.id, name: s.name })}
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">Recomendado: {s.recommended_players}</p>
                    <Badge tone={s.active ? 'green' : 'slate'} className="mt-2">
                      {s.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <CourtModal
        open={courtModal.open}
        court={courtModal.court}
        sports={sports.data?.sports ?? []}
        onClose={() => setCourtModal({ open: false })}
        onSaved={() => {
          setCourtModal({ open: false });
          courts.refetch();
        }}
      />
      <SportModal
        open={sportModal.open}
        sport={sportModal.sport}
        onClose={() => setSportModal({ open: false })}
        onSaved={() => {
          setSportModal({ open: false });
          sports.refetch();
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Excluir ${deleteTarget?.kind === 'court' ? 'quadra' : 'esporte'}`}
        message={`Excluir "${deleteTarget?.name}"?`}
        confirmLabel="Excluir"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function CourtModal({
  open,
  court,
  sports,
  onClose,
  onSaved,
}: { open: boolean; court?: CourtAdmin; sports: Sport[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isEdit = !!court;
  const [name, setName] = useState(court?.name ?? '');
  const [capacity, setCapacity] = useState(String(court?.capacity ?? 18));
  const [price, setPrice] = useState(String((court?.price_per_hour_cents ?? 12000) / 100));
  const [color, setColor] = useState(court?.color ?? '#16a34a');
  const [description, setDescription] = useState(court?.description ?? '');
  const [sportIds, setSportIds] = useState<string[]>(court?.sport_ids ?? []);

  const mutation = useMutation({
    mutationFn: () =>
      api(isEdit ? `/api/courts/${court!.id}` : '/api/courts', {
        method: isEdit ? 'PUT' : 'POST',
        body: {
          name,
          capacity: Number(capacity),
          pricePerHourCents: Math.round(Number(price) * 100),
          color,
          description: description || null,
          sportIds,
          status: 'active',
        },
      }),
    onSuccess: () => {
      toast(isEdit ? 'Quadra atualizada' : 'Quadra criada');
      onSaved();
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Erro', 'error'),
  });

  const toggleSport = (id: string) => {
    setSportIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar quadra' : 'Nova quadra'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            {isEdit ? 'Salvar' : 'Criar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Quadra 1"
          required
        />
        <Input
          label="Preço por hora (R$)"
          type="number"
          step="0.01"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
        <Input
          label="Capacidade (vagas)"
          type="number"
          min={0}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          required
        />
        <Input
          label="Cor"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-10 p-1"
        />
      </div>
      <div className="mt-4">
        <Textarea
          label="Descrição (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-slate-600">Esportes permitidos</p>
        <div className="flex flex-wrap gap-2">
          {sports.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleSport(s.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                sportIds.includes(s.id)
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-slate-300 text-slate-500 hover:border-slate-400',
              )}
            >
              {s.name}
            </button>
          ))}
          {sports.length === 0 ? <p className="text-xs text-slate-400">Cadastre esportes primeiro.</p> : null}
        </div>
      </div>
      {mutation.error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{mutation.error.message}</p>
      ) : null}
    </Modal>
  );
}

function SportModal({
  open,
  sport,
  onClose,
  onSaved,
}: { open: boolean; sport?: Sport; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isEdit = !!sport;
  const [name, setName] = useState(sport?.name ?? '');
  const [minPlayers, setMinPlayers] = useState(String(sport?.min_players ?? 10));
  const [recommended, setRecommended] = useState(String(sport?.recommended_players ?? 12));
  const [maxPlayers, setMaxPlayers] = useState(String(sport?.max_players ?? 18));

  const mutation = useMutation({
    mutationFn: () =>
      api(isEdit ? `/api/sports/${sport!.id}` : '/api/sports', {
        method: isEdit ? 'PUT' : 'POST',
        body: {
          name,
          minPlayers: Number(minPlayers),
          recommendedPlayers: Number(recommended),
          maxPlayers: Number(maxPlayers),
          active: true,
        },
      }),
    onSuccess: () => {
      toast(isEdit ? 'Esporte atualizado' : 'Esporte criado');
      onSaved();
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Erro', 'error'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar esporte' : 'Novo esporte'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            {isEdit ? 'Salvar' : 'Criar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Vôlei"
          required
        />
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Mínimo"
            type="number"
            min={1}
            value={minPlayers}
            onChange={(e) => setMinPlayers(e.target.value)}
          />
          <Input
            label="Recomendado"
            type="number"
            min={1}
            value={recommended}
            onChange={(e) => setRecommended(e.target.value)}
          />
          <Input
            label="Máximo"
            type="number"
            min={1}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(e.target.value)}
          />
        </div>
      </div>
      {mutation.error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{mutation.error.message}</p>
      ) : null}
    </Modal>
  );
}
