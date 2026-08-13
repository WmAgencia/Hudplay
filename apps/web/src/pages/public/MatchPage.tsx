import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { ErrorState, PageLoader } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api, setTokens } from '@/lib/api';
import { formatBRL, formatDateLong, formatTime } from '@/lib/format';
import { ArrowLeft, CheckCircle2, Clock, Copy, LogIn, Send, Trophy, Users, Zap } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

interface PublicMatchData {
  match: {
    code: string;
    title: string;
    sport: { name: string; icon: string | null };
    court: { name: string; color: string | null };
    date: string;
    startTime: string;
    endTime: string;
    pricePerPlayerCents: number;
    status: string;
    playersMax: number;
    confirmedCount: number;
    full: boolean;
    organizerName: string | null;
  };
  company: { name: string; tagline: string; phone: string; address: string; description: string };
  appearance: { primaryColor: string; secondaryColor: string; logoUrl: string };
  paymentInfo: { pixAvailable: boolean; pixInstructions: string; payAtCourtInstructions: string };
  players: Array<{
    position: number;
    participation_status: string;
    name: string;
    photo_url: string | null;
    payment_status: string | null;
    payment_method: string | null;
  }>;
  waitlist: Array<{ position: number; status: string; name: string }>;
}

type JoinResult =
  | {
      kind: 'joined';
      accessToken: string;
      playerId: string;
      matchPlayerId: string;
      payment: {
        paymentId: string | null;
        status: string;
        pixKey?: string;
        pixKeyType?: string;
        pixReference?: string;
        instructions?: string;
        amountCents: number;
      } | null;
      message: string;
    }
  | {
      kind: 'waitlist';
      accessToken: string;
      playerId: string;
      position: number;
      message: string;
    };

export function MatchPage() {
  const { code = '' } = useParams();
  const { toast } = useToast();

  const [data, setData] = useState<PublicMatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'pay_at_court'>('pay_at_court');
  const [password, setPassword] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<JoinResult | null>(null);
  const [claimLoading, setClaimLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<PublicMatchData>(`/api/public/matches/${code}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Partida não encontrada');
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  const primary = data?.appearance.primaryColor ?? '#16a34a';

  const pct = useMemo(() => {
    if (!data) return 0;
    return Math.min(100, Math.round((data.match.confirmedCount / data.match.playersMax) * 100));
  }, [data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setJoining(true);
    try {
      const res = await api<JoinResult>(`/api/public/matches/${code}/join`, {
        method: 'POST',
        auth: false,
        body: {
          name,
          phone,
          paymentMethod,
          ...(password ? { password } : {}),
        },
      });
      setTokens(res.accessToken, '');
      setJoined(res);
      toast(res.message);
      void load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao entrar', 'error');
    } finally {
      setJoining(false);
    }
  };

  const claimPaid = async (paymentId?: string) => {
    if (!paymentId) return;
    setClaimLoading(true);
    try {
      await api(`/api/player/payments/${paymentId}/claim-paid`, { method: 'POST' });
      toast('Pagamento informado! O organizador vai confirmar em breve.', 'info');
      setJoined((j) =>
        j && j.kind === 'joined' && j.payment
          ? { ...j, payment: { ...j.payment, status: 'pix_claimed_paid' } }
          : j,
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro', 'error');
    } finally {
      setClaimLoading(false);
    }
  };

  const leave = async () => {
    try {
      await api(`/api/player/matches/${code}/leave`, { method: 'POST' });
      setJoined(null);
      toast('Você saiu da partida');
      void load();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro', 'error');
    }
  };

  if (loading) return <PageLoader />;
  if (error || !data) return <ErrorState message={error ?? 'Erro'} onRetry={load} />;

  return (
    <div className="min-h-screen bg-slate-50">
      <header
        className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur"
        style={{ background: `${primary}11` }}
      >
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {data.appearance.logoUrl ? (
              <img src={data.appearance.logoUrl} alt={data.company.name} className="size-7 rounded" />
            ) : (
              <div
                className="flex size-7 items-center justify-center rounded-lg text-white"
                style={{ background: primary }}
              >
                <Zap className="size-4" />
              </div>
            )}
            <p className="text-sm font-bold text-slate-800">{data.company.name}</p>
          </div>
          <span className="font-mono text-xs text-slate-400">#{data.match.code}</span>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 p-4 pb-16">
        <Card className="overflow-hidden">
          <div className="h-2 w-full" style={{ background: primary }} />
          <CardContent className="space-y-3 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: primary }}>
                  {data.match.sport.name}
                </p>
                <h1 className="text-xl font-bold text-slate-900">{data.match.title}</h1>
                {data.match.organizerName ? (
                  <p className="text-xs text-slate-500">Organizador: {data.match.organizerName}</p>
                ) : null}
              </div>
              <Badge
                tone={data.match.status === 'cancelled' ? 'red' : data.match.full ? 'amber' : 'green'}
                className="shrink-0"
              >
                {data.match.status === 'cancelled'
                  ? 'Cancelada'
                  : data.match.full
                    ? 'Lotada'
                    : 'Vagas disponíveis'}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 p-2">
                <Clock className="size-4 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-400">Horário</p>
                  <p className="text-xs font-semibold text-slate-700">
                    {formatTime(data.match.startTime)}–{formatTime(data.match.endTime)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 p-2">
                <Trophy className="size-4 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-400">Quadra</p>
                  <p className="truncate text-xs font-semibold text-slate-700">{data.match.court.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 p-2">
                <Users className="size-4 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-400">Preço</p>
                  <p className="text-xs font-bold" style={{ color: primary }}>
                    {formatBRL(data.match.pricePerPlayerCents)}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs capitalize text-slate-500">{formatDateLong(data.match.date)}</p>

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-600">
                  {data.match.confirmedCount}/{data.match.playersMax} confirmados
                </span>
                <span className="text-slate-400">{pct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: primary }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="mb-3 text-sm font-bold text-slate-800">Jogadores confirmados</h2>
            {data.players.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Seja o primeiro a entrar!</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {data.players.map((p) => (
                  <div
                    key={p.position}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 p-2"
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: primary }}
                    >
                      {p.position}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-700">{p.name}</p>
                      {p.payment_method ? (
                        <p className="text-[10px] text-slate-400">
                          {p.payment_method === 'pix' ? 'via PIX' : 'na quadra'}
                          {p.payment_status === 'pix_claimed_paid' ? ' · aguardando' : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {data.waitlist.length > 0 ? (
          <Card>
            <CardContent>
              <h2 className="mb-3 text-sm font-bold text-slate-800">Lista de espera</h2>
              <div className="space-y-2">
                {data.waitlist.map((w) => (
                  <div
                    key={w.position}
                    className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 p-2"
                  >
                    <span className="flex size-7 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-white">
                      {w.position}
                    </span>
                    <p className="truncate text-xs font-medium text-slate-700">{w.name}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!joined && data.match.status !== 'cancelled' ? (
          <Card>
            <CardContent className="space-y-4">
              <h2 className="text-sm font-bold text-slate-800">
                {data.match.full ? 'Entrar na lista de espera' : 'Garanta sua vaga'}
              </h2>
              <form onSubmit={submit} className="space-y-4">
                <Input
                  label="Nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  required
                />
                <Input
                  label="WhatsApp"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(15) 99999-9999"
                  required
                />
                {data.paymentInfo.pixAvailable ? (
                  <Select
                    label="Como vai pagar?"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as 'pix' | 'pay_at_court')}
                  >
                    <option value="pay_at_court">Pagar na quadra</option>
                    <option value="pix">PIX agora</option>
                  </Select>
                ) : null}
                <div>
                  <Input
                    label="Senha (opcional)"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Crie uma senha para sua conta"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Crie uma senha para consultar suas partidas depois.
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={joining}
                  style={{ background: primary }}
                >
                  {data.match.full ? (
                    <>
                      <Send className="size-4" /> Entrar na fila
                    </>
                  ) : (
                    <>
                      <LogIn className="size-4" /> Entrar na partida
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {joined && joined.kind === 'joined' ? (
          <Card className="border-emerald-200">
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Você está confirmado!</p>
                  <p className="text-xs text-slate-500">{joined.message}</p>
                </div>
              </div>

              {joined.payment?.status === 'pix_initiated' ? (
                <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                  <p className="text-sm font-semibold text-slate-800">Pague via PIX</p>
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Valor</p>
                      <p className="font-bold text-slate-800">{formatBRL(joined.payment.amountCents)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Chave PIX</p>
                      <p className="font-mono text-slate-800">{joined.payment.pixKey}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Referência (descrição do PIX)</p>
                      <button
                        type="button"
                        onClick={() =>
                          navigator.clipboard.writeText(joined.payment?.pixReference ?? '').catch(() => {})
                        }
                        className="inline-flex items-center gap-1 font-mono text-emerald-700"
                      >
                        {joined.payment.pixReference} <Copy className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  {joined.payment.instructions ? (
                    <p className="text-xs text-slate-500">{joined.payment.instructions}</p>
                  ) : null}
                  {joined.payment.status === 'pix_initiated' ? (
                    <Button
                      className="w-full"
                      variant="outline"
                      loading={claimLoading}
                      onClick={() => claimPaid(joined.payment?.paymentId ?? undefined)}
                    >
                      Já paguei — aguardando confirmação
                    </Button>
                  ) : null}
                  <p className="text-center text-[10px] text-slate-400">
                    O organizador confirma manualmente antes de liberar sua vaga definitiva.
                  </p>
                </div>
              ) : joined.payment?.status === 'pix_claimed_paid' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-800">Pagamento informado!</p>
                  <p className="mt-1 text-xs text-amber-700">
                    O organizador vai confirmar assim que verificar o extrato.
                  </p>
                </div>
              ) : joined.payment?.status === 'pay_at_court' ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium text-slate-700">
                    {data.paymentInfo.payAtCourtInstructions ||
                      'Leve dinheiro ou cartão — você paga na quadra.'}
                  </p>
                </div>
              ) : null}

              <Button variant="ghost" className="w-full text-slate-400" onClick={leave}>
                <ArrowLeft className="size-4" /> Sair da partida
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {joined && joined.kind === 'waitlist' ? (
          <Card className="border-amber-200">
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <Users className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Você está na fila!</p>
                  <p className="text-xs text-slate-500">Posição #{joined.position}</p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Se alguém sair, você é convidado automaticamente. Fique de olho no WhatsApp.
              </p>
              <Button variant="ghost" className="w-full text-slate-400" onClick={leave}>
                <ArrowLeft className="size-4" /> Sair da fila
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </main>

      <footer className="pb-4 text-center text-[10px] text-slate-300">
        <span className="inline-flex items-center gap-1">
          <Zap className="size-3" /> {data.company.name} · Hudplay
        </span>
      </footer>
    </div>
  );
}
