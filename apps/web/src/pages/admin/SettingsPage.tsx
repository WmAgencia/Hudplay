import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Collapse } from '@/components/ui/Collapse';
import { Input, Textarea } from '@/components/ui/Input';
import { ErrorState, PageLoader } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarClock, CreditCard, KeyRound, Medal, Palette, Save, Settings } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

interface SettingsData {
  settings: {
    company: {
      name: string;
      tagline: string;
      phone: string;
      address: string;
      description: string;
      social: Record<string, string>;
    };
    appearance: { primaryColor: string; secondaryColor: string; logoUrl: string; favicon: string };
    payments: { pixKey: string; pixKeyType: string; pixInstructions: string; payAtCourtInstructions: string };
    reservations: {
      minAdvanceMinutes: number;
      maxAdvanceDays: number;
      cancellationPolicy: string;
      toleranceMinutes: number;
      defaultCapacity: number;
      waitlistAcceptMinutes: number;
    };
    loyalty: {
      enabled: boolean;
      pointsEnabled: boolean;
      participationXp: number;
      createMatchXp: number;
      earlyPaymentXp: number;
      streak5MatchesXp: number;
    };
  };
}

export function SettingsPage() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<SettingsData>({
    queryKey: ['settings'],
    queryFn: () => api('/api/settings'),
  });

  const [form, setForm] = useState<SettingsData['settings'] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data.settings);
  }, [data, form]);

  if (isLoading) return <PageLoader />;
  if (isError) return <ErrorState message="Erro ao carregar configurações" onRetry={() => refetch()} />;
  if (!form) return null;

  const set = (section: keyof SettingsData['settings']) => (patch: Record<string, unknown>) => {
    setForm((f) => (f ? { ...f, [section]: { ...f[section], ...patch } } : f));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/api/settings', { method: 'PUT', body: form });
      toast('Configurações salvas');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleLoyalty = () => set('loyalty')({ pointsEnabled: !form.loyalty.pointsEnabled });

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-5 md:p-8">
      <div className="flex items-center gap-3">
        <Settings className="size-6 text-slate-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-800">Configurações</h1>
          <p className="text-sm text-slate-500">Dados da empresa, aparência e regras</p>
        </div>
      </div>

      <form onSubmit={save} className="space-y-4">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Building2 className="size-4" /> Empresa
              </span>
            }
          />
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nome"
                value={form.company.name}
                onChange={(e) => set('company')({ name: e.target.value })}
              />
              <Input
                label="Slogan"
                value={form.company.tagline}
                onChange={(e) => set('company')({ tagline: e.target.value })}
              />
              <Input
                label="Telefone"
                value={form.company.phone}
                onChange={(e) => set('company')({ phone: e.target.value })}
              />
              <Input
                label="Endereço"
                value={form.company.address}
                onChange={(e) => set('company')({ address: e.target.value })}
              />
            </div>
            <Textarea
              label="Descrição"
              value={form.company.description}
              onChange={(e) => set('company')({ description: e.target.value })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Palette className="size-4" /> Aparência
              </span>
            }
          />
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="color-primary" className="block text-xs font-medium text-slate-600">
                  Cor primária
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="color-primary"
                    type="color"
                    value={form.appearance.primaryColor}
                    onChange={(e) => set('appearance')({ primaryColor: e.target.value })}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300"
                  />
                  <Input
                    value={form.appearance.primaryColor}
                    onChange={(e) => set('appearance')({ primaryColor: e.target.value })}
                    className="w-32"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="color-secondary" className="block text-xs font-medium text-slate-600">
                  Cor secundária
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="color-secondary"
                    type="color"
                    value={form.appearance.secondaryColor}
                    onChange={(e) => set('appearance')({ secondaryColor: e.target.value })}
                    className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300"
                  />
                  <Input
                    value={form.appearance.secondaryColor}
                    onChange={(e) => set('appearance')({ secondaryColor: e.target.value })}
                    className="w-32"
                  />
                </div>
              </div>
            </div>
            <Input
              label="URL do logo"
              value={form.appearance.logoUrl}
              onChange={(e) => set('appearance')({ logoUrl: e.target.value })}
              placeholder="https://..."
            />
            <div
              className="flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 py-6"
              style={{ color: form.appearance.primaryColor }}
            >
              <span className="text-sm font-medium">
                Prévia da cor do sistema: {form.appearance.primaryColor}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CreditCard className="size-4" /> Pagamentos
              </span>
            }
          />
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Chave PIX"
                value={form.payments.pixKey}
                onChange={(e) => set('payments')({ pixKey: e.target.value })}
                placeholder="email@exemplo.com ou CPF/telefone"
              />
              <Input
                label="Tipo da chave"
                value={form.payments.pixKeyType}
                onChange={(e) => set('payments')({ pixKeyType: e.target.value })}
                placeholder="email, cpf, telefone, aleatoria"
              />
            </div>
            <Textarea
              label="Instruções do PIX"
              value={form.payments.pixInstructions}
              onChange={(e) => set('payments')({ pixInstructions: e.target.value })}
            />
            <Textarea
              label="Instruções para pagar na quadra"
              value={form.payments.payAtCourtInstructions}
              onChange={(e) => set('payments')({ payAtCourtInstructions: e.target.value })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <CalendarClock className="size-4" /> Reservas
              </span>
            }
          />
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Antecedência mínima (min)"
                type="number"
                min={0}
                value={String(form.reservations.minAdvanceMinutes)}
                onChange={(e) => set('reservations')({ minAdvanceMinutes: Number(e.target.value) })}
              />
              <Input
                label="Antecipação máxima (dias)"
                type="number"
                min={1}
                value={String(form.reservations.maxAdvanceDays)}
                onChange={(e) => set('reservations')({ maxAdvanceDays: Number(e.target.value) })}
              />
              <Input
                label="Capacidade padrão"
                type="number"
                min={1}
                value={String(form.reservations.defaultCapacity)}
                onChange={(e) => set('reservations')({ defaultCapacity: Number(e.target.value) })}
              />
            </div>
            <Input
              label="Tolerância (min)"
              type="number"
              min={0}
              value={String(form.reservations.toleranceMinutes)}
              onChange={(e) => set('reservations')({ toleranceMinutes: Number(e.target.value) })}
            />
            <Input
              label="Prazo para aceitar convite da fila (min)"
              type="number"
              min={1}
              value={String(form.reservations.waitlistAcceptMinutes)}
              onChange={(e) => set('reservations')({ waitlistAcceptMinutes: Number(e.target.value) })}
            />
            <Textarea
              label="Política de cancelamento"
              value={form.reservations.cancellationPolicy}
              onChange={(e) => set('reservations')({ cancellationPolicy: e.target.value })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Medal className="size-4" /> Fidelidade
              </span>
            }
            action={
              <button
                type="button"
                onClick={toggleLoyalty}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  form.loyalty.pointsEnabled ? 'bg-emerald-600' : 'bg-slate-300',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-5 rounded-full bg-white shadow transition-all',
                    form.loyalty.pointsEnabled ? 'left-[22px]' : 'left-0.5',
                  )}
                />
              </button>
            }
          />
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">
              Pontos (XP) por ações. Recompensas podem ser configuradas pelo proprietário.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="XP por participação"
                type="number"
                min={0}
                value={String(form.loyalty.participationXp)}
                onChange={(e) => set('loyalty')({ participationXp: Number(e.target.value) })}
              />
              <Input
                label="XP por criar partida"
                type="number"
                min={0}
                value={String(form.loyalty.createMatchXp)}
                onChange={(e) => set('loyalty')({ createMatchXp: Number(e.target.value) })}
              />
              <Input
                label="XP por pagamento antecipado"
                type="number"
                min={0}
                value={String(form.loyalty.earlyPaymentXp)}
                onChange={(e) => set('loyalty')({ earlyPaymentXp: Number(e.target.value) })}
              />
              <Input
                label="XP por 5 partidas seguidas"
                type="number"
                min={0}
                value={String(form.loyalty.streak5MatchesXp)}
                onChange={(e) => set('loyalty')({ streak5MatchesXp: Number(e.target.value) })}
              />
            </div>
          </CardContent>
        </Card>

        <Collapse title="Segurança da conta" defaultOpen={false}>
          <ChangePasswordSection />
        </Collapse>

        <div className="flex justify-end pb-8">
          <Button type="submit" size="lg" loading={saving} icon={<Save className="size-4" />}>
            Salvar configurações
          </Button>
        </div>
      </form>
    </div>
  );
}

function ChangePasswordSection() {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      toast('Senha alterada');
      setCurrent('');
      setNext('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao trocar senha', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="Senha atual"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <Input
          label="Nova senha"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={8}
        />
        <div className="flex items-end">
          <Button type="submit" variant="outline" loading={loading} icon={<KeyRound className="size-4" />}>
            Trocar senha
          </Button>
        </div>
      </div>
    </form>
  );
}
