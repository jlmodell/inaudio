import { cn } from '@renderer/lib/cn';

/** The Inaudio mark: an "i" whose stem is a microphone capsule, with pickup arc and sound ticks. Kept in sync with assets/logo.svg. */
export function LogoMark({ className, title = 'Inaudio' }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title}
      className={cn('logo-mark shrink-0', className)}
    >
      <circle className="logo-dot" cx="32" cy="9" r="3.25" fill="currentColor" stroke="none" />
      <rect className="logo-capsule" x="25" y="17" width="14" height="24" rx="7" pathLength={1} />
      <path className="logo-arc" d="M16 29v1a16 16 0 0 0 32 0v-1" pathLength={1} />
      <path className="logo-stand" d="M32 46v10" pathLength={1} />
      <path className="logo-tick logo-tick-l" d="M7 25v10" pathLength={1} />
      <path className="logo-tick logo-tick-r" d="M57 25v10" pathLength={1} />
    </svg>
  );
}

export function Wordmark({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <div className={cn('logo-wordmark flex items-center gap-2.5', className)}>
      <LogoMark className="size-9 text-accent" />
      {!collapsed && <span className="text-lg font-semibold tracking-tight">Inaudio</span>}
    </div>
  );
}
