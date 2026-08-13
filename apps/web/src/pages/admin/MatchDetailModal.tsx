import { Badge, statusLabel, statusTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageLoader } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatBRL, formatDateBR, formatTime } from '@/lib/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Trophy, UserPlus } from 'lucide-react';
import { useState } from 'react';

interface Detail {
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
  sport_name: string;
  notes: string | null;
  players: Array<{
    match_player_id: string;
    player_id: string;
    name: string;
    phone: string;
    participation_status: string;
    position: number;
    payment_id: string | null;
    payment_status: string | null;
    payment_method: string | null;
    amount_cents: number | null;
    pix_reference: string | null;
    claimed_at: string | null;
    confirmed_method: string | null;
  }>;
  waitlist: Array<{ id: string; position: number; status: string; name: string; phone: string }>;
  stats: {
    confirmed: number;
    totalValue: number;
    received: number;
    pending: number;
    full: boolean;
    available: number;
  };
}

const paidStatuses = ['pix_confirmed', 'paid_cash', 'paid_card', 'paid_manual_pix'];

export function MatchDetailModal({
  matchId,
  onClose,
  onChanged,
}: { matchId: string; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [removeTarget, setRemoveTarget] = useState<{
    kind: 'player' | 'guest';
    id: string;
    name: string;
  } | null>(null);
  const [payTarget, setPayTarget] = useState<{ playerId: string; name: string } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<Detail>({
    queryKey: ['match-detail', matchId],
    queryFn: () => api(`/api/matches/${matchId}`),
    enabled: !!matchId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['match-detail', matchId] });
    onChanged();
  };

  const markPaid = useMutation({
    mutationFn: ({ playerId, method }: { playerId: string; method: string }) =>
      api(`/api/matches/${matchId}/players/${playerId}/mark-paid`, { method: 'POST', body: { method } }),
    onSuccess: () => {
      toast('Pagamento confirmado');
      setPayTarget(null);
      invalidate();
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Erro', 'error'),
  });

  const rejectPix = useMutation({
    mutationFn: (playerId: string) =>
      api(`/api/matches/${matchId}/players/${playerId}/reject-pix`, { method: 'POST' }),
    onSuccess: () => {
      toast('Pagamento PIX rejeitado');
      invalidate();
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Erro', 'error'),
  });

  const removePlayer = useMutation({
    mutationFn: (playerId: string) =>
      api(`/api/matches/${matchId}/players/${playerId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Jogador removido');
      setRemoveTarget(null);
      invalidate();
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Erro', 'error'),
  });

  const addGuest = useMutation({
    mutationFn: () =>
      api(`/api/matches/${matchId}/guests`, {
        method: 'POST',
        body: { name: guestName, phone: guestPhone || undefined },
      }),
    onSuccess: () => {
      toast('Convidado adicionado');
      setGuestOpen(false);
      setGuestName('');
      setGuestPhone('');
      invalidate();
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Erro', 'error'),
  });

  const removeGuest = useMutation({
    mutationFn: (guestId: string) => api(`/api/matches/${matchId}/guests/${guestId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast('Convidado removido');
      setRemoveTarget(null);
      invalidate();
    },
    onError: (e) => toast(e instanceof Error ? e.message : 'Erro', 'error'),
  });

  const copyLink = () => {
    const url = `${window.location.origin}/partida/${data?.code}`;
    navigator.clipboard.writeText(url).catch(() => {});
    toast('Link copiado!');
  };

  if (isLoading)
    return (
      <Modal open onClose={onClose} title="Partida">
        <PageLoader />
      </Modal>
    );
  if (isError || !data) {
    return (
      <Modal open onClose={onClose} title="Partida">
        <div className="py-8 text-center">
          <p className="text-sm text-slate-500">Erro ao carregar a partida.</p>
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={data.title}
      subtitle={`${data.sport_name} · ${data.court_name}`}
      size="lg"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-slate-800 px-3 py-2 text-center text-white">
              <p className="text-[10px] uppercase opacity-70">{formatDateBR(data.match_date).slice(0, 2)}</p>
              <p className="text-sm font-bold">{formatDateBR(data.match_date).slice(3)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">
                {formatTime(data.start_time)} – {formatTime(data.end_time)}
              </p>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                Código <span className="font-mono font-semibold">{data.code}</span>
                <button
                  type="button"
                  onClick={copyLink}
                  className="ml-1 rounded p-0.5 text-slate-400 hover:text-emerald-600"
                >
                  <Copy className="size-3.5" />
                </button>
              </p>
            </div>
          </div>
          <div className="text-right">
            <Badge tone={statusTone[data.status as keyof typeof statusTone] ?? 'slate'}>
              {statusLabel[data.status] ?? data.status}
            </Badge>
            <p className="mt-1 text-xs text-slate-500">
              {data.stats.confirmed}/{data.players_max} confirmados ·{' '}
              {data.stats.full ? 'Quadra cheia' : `${data.stats.available} vagas`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-slate-100 p-3 text-center">
            <p className="text-base font-bold text-slate-800">{formatBRL(data.price_per_player_cents)}</p>
            <p className="text-xs text-slate-500">por jogador</p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-center">
            <p className="text-base font-bold text-emerald-700">{formatBRL(data.stats.received)}</p>
            <p className="text-xs text-emerald-600">recebido</p>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-center">
            <p className="text-base font-bold text-amber-700">{formatBRL(data.stats.pending)}</p>
            <p className="text-xs text-amber-600">a receber</p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700">Jogadores ({data.players.length})</h4>
          </div>
          {data.players.length === 0 ? (
            <EmptyState
              icon={<Trophy className="size-5" />}
              title="Nenhum jogador ainda"
              subtitle="Compartilhe o link para os jogadores se inscreverem"
            />
          ) : (
            <div className="space-y-2">
              {data.players.map((p) => (
                <div
                  key={p.match_player_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-2.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-slate-700 text-sm font-bold text-white">
                      {p.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">
                        {p.participation_status === 'confirmed' ? `#${p.position}` : 'Confirmando'}
                        {p.payment_method ? ` · ${p.payment_method === 'pix' ? 'PIX' : 'na quadra'}` : ''}
                        {p.amount_cents != null ? ` · ${formatBRL(p.amount_cents)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.payment_status ? (
                      <Badge tone={statusTone[p.payment_status as keyof typeof statusTone] ?? 'slate'}>
                        {statusLabel[p.payment_status] ?? p.payment_status}
                      </Badge>
                    ) : null}
                    {!paidStatuses.includes(p.payment_status ?? '') && data.status !== 'cancelled' ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPayTarget({ playerId: p.player_id, name: p.name })}
                        >
                          Confirmar pagamento
                        </Button>
                        {p.payment_status === 'pix_claimed_paid' ? (
                          <Button size="sm" variant="ghost" onClick={() => rejectPix.mutate(p.player_id)}>
                            Rejeitar PIX
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500"
                          onClick={() => setRemoveTarget({ kind: 'player', id: p.player_id, name: p.name })}
                        >
                          Remover
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {data.waitlist.length > 0 ? (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-700">
              Lista de espera ({data.waitlist.length})
            </h4>
            <div className="space-y-2">
              {data.waitlist.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/50 p-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-7 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                      {w.position}
                    </span>
                    <p className="text-sm font-medium text-slate-800">{w.name}</p>
                  </div>
                  <Badge tone="amber">{statusLabel[w.status] ?? w.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {data.notes ? (
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">Observações</p>
            <p className="text-sm text-slate-700">{data.notes}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setGuestOpen(true)} icon={<UserPlus className="size-4" />}>
            Convidado
          </Button>
          <Button variant="ghost" onClick={copyLink} icon={<Copy className="size-4" />}>
            Copiar link
          </Button>
        </div>
      </div>

      <Modal open={guestOpen} onClose={() => setGuestOpen(false)} title="Adicionar convidado">
        <div className="space-y-4">
          <Input
            label="Nome"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Nome do convidado"
          />
          <Input
            label="Telefone (opcional)"
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            placeholder="(15) 99999-9999"
          />
          <Button
            className="w-full"
            onClick={() => guestName.trim() && addGuest.mutate()}
            loading={addGuest.isPending}
          >
            Adicionar
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        title="Confirmar pagamento"
        subtitle={payTarget?.name}
      >
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={() => markPaid.mutate({ playerId: payTarget!.playerId, method: 'cash' })}
            loading={markPaid.isPending}
          >
            Dinheiro
          </Button>
          <Button
            variant="outline"
            onClick={() => markPaid.mutate({ playerId: payTarget!.playerId, method: 'card' })}
            loading={markPaid.isPending}
          >
            Cartão
          </Button>
          <Button
            variant="outline"
            className="col-span-2"
            onClick={() => markPaid.mutate({ playerId: payTarget!.playerId, method: 'manual_pix' })}
            loading={markPaid.isPending}
          >
            PIX (transferido)
          </Button>
        </div>
        <p className={cn('mt-3 text-xs text-slate-400')}>
          A confirmação fica registrada com data, método e responsável.
        </p>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        title={removeTarget?.kind === 'player' ? 'Remover jogador' : 'Remover convidado'}
        message={`Remover "${removeTarget?.name}"? ${removeTarget?.kind === 'player' ? 'Se houver fila de espera, o primeiro será convidado automaticamente.' : ''}`}
        confirmLabel="Remover"
        loading={removePlayer.isPending || removeGuest.isPending}
        onConfirm={() => {
          if (!removeTarget) return;
          if (removeTarget.kind === 'player') removePlayer.mutate(removeTarget.id);
          else removeGuest.mutate(removeTarget.id);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </Modal>
  );
}
