import { LogoMark } from '@renderer/components/brand/logo';

/**
 * The animated heroes of the billboard modals: small illustrations drawn from the app's own
 * surfaces, moving gently and looping. They use only the theme tokens, so they follow light,
 * dark and the accent, and they hold still when animations are reduced or off.
 */

function Bars({ count = 7, className = '' }: { count?: number; className?: string }) {
  return (
    <span className={`flex h-10 items-end gap-1 ${className}`}>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="hero-bar block w-[5px] rounded-full bg-accent" style={{ animationDelay: `${index * 110}ms` }} />
      ))}
    </span>
  );
}

/** A small Inaudio window: the frame every scene builds on. */
function Window({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`absolute block overflow-hidden rounded-[10px] border border-line bg-surface shadow-[0_12px_32px_rgb(47_91_234/0.18)] dark:shadow-[0_12px_32px_rgb(0_0_0/0.5)] ${className}`}>
      {children}
    </span>
  );
}

function Lines({ widths, faintLast = false }: { widths: string[]; faintLast?: boolean }) {
  return (
    <span className="grid gap-2 p-3.5">
      {widths.map((width, index) => (
        <span
          key={index}
          className={`hero-type block h-[7px] rounded-full ${faintLast && index === widths.length - 1 ? 'bg-faint/60' : 'bg-ink/70'}`}
          style={{ width, animationDelay: `${index * 450}ms` }}
        />
      ))}
    </span>
  );
}

export function WelcomeScene() {
  return (
    <span className="absolute inset-0 grid place-items-center">
      <span className="hero-float grid size-24 place-items-center rounded-[22px] border border-line bg-surface text-accent shadow-[0_16px_40px_rgb(47_91_234/0.22)]">
        <LogoMark className="size-16" />
      </span>
      <Bars className="absolute bottom-7 left-14 opacity-60" />
      <Bars className="absolute top-8 right-16 opacity-40" count={5} />
    </span>
  );
}

export function ModelsScene() {
  return (
    <span className="absolute inset-0">
      <Window className="top-9 left-1/2 w-[300px] -translate-x-1/2">
        <span className="flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-[10px] bg-accent-soft text-accent">
            <LogoMark className="size-6" />
          </span>
          <span className="grid flex-1 gap-1.5">
            <span className="block h-2 w-3/5 rounded-full bg-ink/70" />
            <span className="block h-1.5 w-2/5 rounded-full bg-line-strong" />
          </span>
        </span>
        <span className="mx-4 mb-4 block h-2 overflow-hidden rounded-full bg-line">
          <span className="hero-fill block h-full rounded-full bg-accent" />
        </span>
      </Window>
      <span className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-surface px-3 py-1 text-[11px] font-semibold text-accent shadow-sm">On this computer · offline</span>
    </span>
  );
}

export function WhatsNewScene() {
  return (
    <span className="absolute inset-0">
      <Window className="hero-float top-9 left-14 w-[240px]">
        <Lines widths={['60%', '90%', '75%']} />
        <span className="mx-3.5 mb-3.5 block h-5 w-2/5 rounded-[6px] bg-accent" />
      </Window>
      <Window className="hero-float-late top-16 right-14 w-[200px]">
        <Lines widths={['90%', '70%', '40%']} faintLast />
      </Window>
    </span>
  );
}
