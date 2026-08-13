const ACCESS_KEY = 'hud_access';
const REFRESH_KEY = 'hud_refresh';
const ADMIN_USER_KEY = 'hud_admin_user';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
}
export function setAdminUser(user: unknown): void {
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
}
export function getAdminUser(): unknown | null {
  const raw = localStorage.getItem(ADMIN_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type ApiScope = 'admin' | 'player';

async function refreshTokens(scope: ApiScope = 'admin'): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  const endpoint = scope === 'player' ? '/api/player/auth/refresh' : '/api/auth/refresh';
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  setTokens(data.accessToken, data.refreshToken);
  return true;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  scope?: ApiScope;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const scope = options.scope ?? 'admin';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (options.auth !== false) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const doFetch = async (): Promise<Response> =>
    fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let res = await doFetch();

  if (res.status === 401 && options.auth !== false) {
    const ok = await refreshTokens(scope);
    if (ok) {
      headers.Authorization = `Bearer ${getAccessToken()}`;
      res = await doFetch();
    } else if (scope === 'admin') {
      clearTokens();
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin/login';
      }
    }
  }

  if (!res.ok) {
    let message = 'Erro na requisição';
    let code: string | undefined;
    try {
      const data = (await res.json()) as {
        error?: { message?: string; code?: string };
      };
      message = data.error?.message ?? message;
      code = data.error?.code;
    } catch {
      /* corpo não é json */
    }
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
