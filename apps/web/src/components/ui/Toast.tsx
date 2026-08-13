import { cn } from '@/lib/cn';
import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { type ReactNode, createContext, useCallback, useContext, useState } from 'react';

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };

const ToastContext = createContext<{
  toast: (message: string, type?: Toast['type']) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg animate-fade-in',
              t.type === 'success' && 'border-emerald-200',
              t.type === 'error' && 'border-red-200',
              t.type === 'info' && 'border-slate-200',
            )}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : null}
            {t.type === 'error' ? <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" /> : null}
            {t.type === 'info' ? <Info className="mt-0.5 size-4 shrink-0 text-slate-500" /> : null}
            <p className="text-sm text-slate-700">{t.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
