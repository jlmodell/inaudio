import * as SeparatorPrimitive from '@radix-ui/react-separator';
import type { ReactNode } from 'react';
import { cn } from '@renderer/lib/cn';

/** Page header: title, one-line description, optional actions. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-6 pb-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Separator({ className }: { className?: string }) {
  return <SeparatorPrimitive.Root className={cn('h-px w-full bg-line', className)} />;
}

/**
 * A group of rows separated by hairlines; no card chrome. Without a title it is the whole of a
 * page whose header already names it.
 */
export function Section({ title, description, children, className, id }: { title?: string; description?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('grid scroll-mt-6 gap-1 py-6 first:pt-0', className)}>
      {title && <h2 className="text-sm font-semibold tracking-wide text-faint uppercase">{title}</h2>}
      {description && <p className="text-sm text-muted">{description}</p>}
      <div className={cn('divide-y divide-line', title && 'mt-3')}>{children}</div>
    </section>
  );
}

/** One setting: label and description on the left, control on the right. */
export function Row({ label, description, children, htmlFor, id }: { label: ReactNode; description?: ReactNode; children?: ReactNode; htmlFor?: string; id?: string }) {
  return (
    <div id={id} className="scroll-mt-6 flex min-h-[54px] items-center justify-between gap-6 py-3">
      <div className="grid gap-0.5">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

export function Kbd({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key, i) => (
        <kbd key={`${key}-${i}`} className="min-w-6 rounded-md bg-sunken px-1.5 py-0.5 text-center font-mono text-xs text-ink shadow-[inset_0_-1px_0_var(--line-strong)]">
          {key}
        </kbd>
      ))}
    </span>
  );
}

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'record';
const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  record: 'bg-record-soft text-record',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium', TONES[tone], className)}>{children}</span>;
}

export function StatusDot({ tone }: { tone: Tone }) {
  const color = { neutral: 'bg-faint', accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', record: 'bg-record' }[tone];
  return <span aria-hidden className={cn('inline-block size-2 rounded-full', color)} />;
}

export function Notice({ tone = 'warning', children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  return (
    <div role="status" className={cn('flex items-start justify-between gap-4 rounded-lg px-4 py-3 text-sm', TONES[tone])}>
      <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
