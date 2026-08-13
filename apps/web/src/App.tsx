import { AdminLayout } from '@/components/layout/AdminLayout';
import { ToastProvider } from '@/components/ui/Toast';
import { CalendarPage } from '@/pages/admin/CalendarPage';
import { CourtsPage } from '@/pages/admin/CourtsPage';
import { DashboardPage } from '@/pages/admin/DashboardPage';
import { LoginPage } from '@/pages/admin/LoginPage';
import { MatchesPage } from '@/pages/admin/MatchesPage';
import { PaymentsPage } from '@/pages/admin/PaymentsPage';
import { PlayersPage } from '@/pages/admin/PlayersPage';
import { ReportsPage } from '@/pages/admin/ReportsPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { PlayerProfilePage } from '@/pages/player/PlayerProfilePage';
import { MatchPage } from '@/pages/public/MatchPage';
import { Navigate, Route, Routes } from 'react-router-dom';

export function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="calendario" element={<CalendarPage />} />
          <Route path="partidas" element={<MatchesPage />} />
          <Route path="quadras" element={<CourtsPage />} />
          <Route path="jogadores" element={<PlayersPage />} />
          <Route path="pagamentos" element={<PaymentsPage />} />
          <Route path="relatorios" element={<ReportsPage />} />
          <Route path="config" element={<SettingsPage />} />
        </Route>
        <Route path="/partida/:code" element={<MatchPage />} />
        <Route path="/jogador/:id" element={<PlayerProfilePage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </ToastProvider>
  );
}
