import { getAccessToken } from '@/lib/api';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

export function RequireAuth() {
  const location = useLocation();
  const token = getAccessToken();
  if (!token) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
