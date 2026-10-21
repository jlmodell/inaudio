import type { ReactNode } from 'react';
import { BookOpenText, Settings } from 'lucide-react';
import { Wordmark } from '@renderer/components/brand/logo';
import { cn } from '@renderer/lib/cn';

export type WebRoute = 'read-aloud' | 'settings';

const NAV: { id: WebRoute; label: string; icon: typeof BookOpenText }[] = [
  { id: 'read-aloud', label: 'Read aloud', icon: BookOpenText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Shell({
  route,
  onNavigate,
  children,
}: {
  route: WebRoute;
  onNavigate(route: WebRoute): void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[920px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Wordmark />
          <nav className="flex flex-wrap gap-1" aria-label="Inaudio">
            {NAV.map((item) => {
              const Icon = item.icon;
              const current = route === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-[6px] px-3 text-sm font-medium',
                    current ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-sunken hover:text-ink',
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[920px] flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
