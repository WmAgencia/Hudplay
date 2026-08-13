import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api, clearTokens, getAccessToken, setTokens } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateBR, formatTime } from '@/lib/format';
import { Bell, CalendarDays, LogOut, Medal, Search, Zap } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface PlayerUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  photo_url: string | null;
  points: number;
  monthMatches: number;
  loyaltyEnabled: boolean;
  pointsEnabled: boolean;
  nextRewardProgress: number | null;
  rewards: Array<{ id: string; name: string; status: string }>;
}

interface MyMatch {
  id: string;
  code: string;
  title: string;
  match_date: string;
  start_time: string;
  end_time: string;
  status: string;
  court_name: string;
  sport_name: string;
  sport_icon: string | null;
  participation_status: string;
  payment_status: string | null;
  payment_method: string | null;
  confirmed: number;
  players_max: number;
}

export function PlayerProfilePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<PlayerUser | null>(null);
  const [matches, setMatches] = useState<MyMatch[]>([]);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; title: string; body: string; created_at: string; read: boolean }>
  >([]);
  const [view, setView] = useState<'matches' | 'rewards' | 'notifications'>('matches');
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (!getAccessToken()) {
        setNeedsLogin(true);
        setLoading(false);
        return;
      }
      try {
        const me = await api<{ user: PlayerUser | null }>('/api/player/me');
        if (!me.user) {
          setNeedsLogin(true);
        } else {
          setUser(me.user);
          const [m, n] = await Promise.all([
            api<{ matches: MyMatch[] }>('/api/player/me/matches'),
            api<{
              notifications: Array<{
                id: string;
                title: string;
                body: string;
                created_at: string;
                read: boolean;
              }>;
            }>('/api/player/me/notifications'),
          ]);
          setMatches(m.matches);
          setNotifications(n.notifications);
        }
      } catch {
        setNeedsLogin(true);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const logout = () => {
    clearTokens();
    setNeedsLogin(true);
    setUser(null);
    toast('Sessão encerrada', 'info');
  };

  if (loading) return <PageLoader />;

  if (needsLogin || !user) {
    return (
      <LoginView
        onSuccess={(u) => {
          setUser(u);
          setNeedsLogin(false);
        }}
      />
    );
  }

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Zap className="size-4" />
            </div>
            <p className="text-sm font-bold text-slate-800">Minha área</p>
          </div>
          <div className="flex items-center gap-2">
            {user.pointsEnabled ? (
              <Badge tone="purple">
                <Medal className="size-3" /> {user.points} pts
              </Badge>
            ) : null}
            <button
              type="button"
              onClick={logout}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 p-4 pb-16">
        <Card className="bg-gradient-to-br from-emerald-600 to-emerald-800 text-white">
          <CardContent className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {user.photo_url ? (
                <img
                  src={user.photo_url}
                  alt={user.name}
                  className="size-12 rounded-full object-cover ring-2 ring-white/30"
                />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-full bg-white/20 text-xl font-bold">
                  {user.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-bold">{user.name}</p>
                <p className="text-xs text-emerald-100">{user.phone}</p>
                <p className="mt-0.5 text-xs text-emerald-100">{user.monthMatches} partidas este mês</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {user.nextRewardProgress != null ? (
          <Card>
            <CardContent className="space-y-2">
              <p className="text-xs font-medium text-slate-600">
                Faltam {user.nextRewardProgress} partida(s) para a próxima recompensa
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-purple-500" style={{ width: '40%' }} />
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ['matches', `Partidas (${matches.length})`],
              ['rewards', `Recompensas (${user.rewards.length})`],
              ['notifications', `Avisos (${unread})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn(
                'rounded-lg py-2 text-xs font-medium',
                view === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'matches' ? (
          <div className="space-y-3">
            {matches.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-slate-400">Você ainda não participou de nenhuma partida.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/')}>
                    Encontrar partidas
                  </Button>
                </CardContent>
              </Card>
            ) : (
              matches.map((m) => (
                <Card key={m.id}>
                  <CardContent className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{m.title}</p>
                        <p className="text-xs text-slate-500">
                          {m.sport_name} · {m.court_name}
                        </p>
                      </div>
                      <Badge tone={m.participation_status === 'confirmed' ? 'green' : 'amber'}>
                        {m.participation_status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                      </Badge>
                    </div>
                    <p className="flex items-center gap-1 text-xs text-slate-400">
                      <CalendarDays className="size-3" /> {formatDateBR(m.match_date)} ·{' '}
                      {formatTime(m.start_time)}–{formatTime(m.end_time)}
                    </p>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                      <span className="text-xs text-slate-500">
                        {m.confirmed}/{m.players_max} confirmados
                      </span>
                      {m.payment_status ? <Badge tone="blue">{m.payment_status}</Badge> : null}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : null}

        {view === 'rewards' ? (
          <div className="space-y-2">
            {user.rewards.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-slate-400">Nenhuma recompensa ainda.</p>
                </CardContent>
              </Card>
            ) : (
              user.rewards.map((r) => (
                <Card key={r.id}>
                  <CardContent className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-800">{r.name}</p>
                    <Badge tone={r.status === 'used' ? 'slate' : 'green'}>
                      {r.status === 'used' ? 'Usada' : 'Disponível'}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : null}

        {view === 'notifications' ? (
          <div className="space-y-2">
            {notifications.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-sm text-slate-400">Nenhum aviso.</p>
                </CardContent>
              </Card>
            ) : (
              notifications.map((n) => (
                <Card key={n.id} className={cn(!n.read && 'border-emerald-200')}>
                  <CardContent className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                      <Bell className={cn('size-3.5', n.read ? 'text-slate-300' : 'text-emerald-500')} />
                    </div>
                    <p className="text-xs text-slate-500">{n.body}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function LoginView({ onSuccess }: { onSuccess: (u: PlayerUser) => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api<{ accessToken: string; refreshToken: string }>(
        mode === 'login' ? '/api/player/auth/login' : '/api/player/auth/register',
        {
          method: 'POST',
          auth: false,
          body: mode === 'login' ? { phone, password } : { name, phone, password },
        },
      );
      setTokens(res.accessToken, res.refreshToken);
      const me = await api<{ user: PlayerUser | null }>('/api/player/me');
      if (me.user) onSuccess(me.user);
      else navigate('/');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <Zap className="size-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Hudplay</h1>
            <p className="text-sm text-slate-400">Sua área de jogador</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 rounded-md py-1.5 text-xs font-medium',
                  mode === m ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500',
                )}
              >
                {m === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>
          {mode === 'register' ? (
            <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
          ) : null}
          <Input
            label="WhatsApp"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(15) 99999-9999"
            required
          />
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-4 flex w-full items-center justify-center gap-2 text-xs text-slate-400 hover:text-slate-200"
        >
          <Search className="size-3.5" /> Encontrar partida sem conta
        </button>
      </div>
    </div>
  );
}
