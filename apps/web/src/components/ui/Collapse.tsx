import { cn } from '@/lib/cn';
import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';

interface CollapseProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function Collapse({ title, children, defaultOpen = false }: CollapseProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {title}
        <ChevronDown className={cn('size-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className="border-t border-slate-100 p-4">{children}</div> : null}
    </div>
  );
}
