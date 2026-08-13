import { cn } from '@/lib/cn';
import { Loader2 } from 'lucide-react';
import { type ReactNode } from 'react';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-emerald-600', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <Spinner className="size-7" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: { icon: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="rounded-full bg-slate-100 p-4 text-slate-400">{icon}</div>
      <div>
        <p className="text-sm font-medium text-slate-700">{title}</p>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="rounded-full bg-red-50 p-4 text-red-500">
        <span className="text-2xl">⚠</span>
      </div>
      <p className="max-w-md text-sm text-slate-600">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-emerald-600 hover:underline"
        >
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}
