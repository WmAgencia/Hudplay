import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, setAdminUser, setTokens } from '@/lib/api';
import { Zap } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api<{
        accessToken: string;
        refreshToken: string;
        user: { id: string; name: string; email: string; role: string };
      }>('/api/auth/login', { method: 'POST', body: { email, password } });
      setTokens(data.accessToken, data.refreshToken);
      setAdminUser(data.user);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar');
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
            <p className="text-sm text-slate-400">Painel do proprietário</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
          <Input
            label="E-mail"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@hudplay.com.br"
          />
          <Input
            label="Senha"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Entrar
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">
          Primeiro acesso: admin@hudplay.com.br · senha hudplay123 (troque após entrar)
        </p>
      </div>
    </div>
  );
}
