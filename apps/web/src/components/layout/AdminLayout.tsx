import { clearTokens, getAccessToken } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Settings,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const nav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/calendario', label: 'Calendário', icon: CalendarDays },
  { to: '/admin/partidas', label: 'Partidas', icon: Trophy },
  { to: '/admin/quadras', label: 'Quadras', icon: LayoutGrid },
  { to: '/admin/jogadores', label: 'Jogadores', icon: Users },
  { to: '/admin/pagamentos', label: 'Pagamentos', icon: CreditCard },
  { to: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/admin/config', label: 'Configurações', icon: Settings },
];

export function AdminLayout() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getAccessToken()) {
      navigate('/admin/login', { replace: true });
    }
  }, [navigate]);

  const logout = () => {
    clearTokens();
    navigate('/admin/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Zap className="size-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Hudplay</p>
            <p className="text-xs text-slate-400">Gestão de quadras</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              <item.icon className="size-4.5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="size-4.5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Navegação inferior (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex justify-around border-t border-slate-200 bg-white py-1.5 md:hidden">
        {nav.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium',
                isActive ? 'text-emerald-600' : 'text-slate-400',
              )
            }
          >
            <item.icon className="size-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
