import { Captions, Mic, PictureInPicture2 } from 'lucide-react';
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

export function MicrophoneScene() {
  return (
    <span className="absolute inset-0 grid place-items-center">
      <span className="hero-ring absolute size-24 rounded-full border-2 border-accent/40" />
      <span className="hero-ring absolute size-24 rounded-full border-2 border-accent/40" style={{ animationDelay: '0.9s' }} />
      <span className="relative grid size-20 place-items-center rounded-full bg-accent text-on-accent shadow-[0_12px_30px_rgb(47_91_234/0.35)]">
        <Mic className="size-8" />
      </span>
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

export function LiveScene() {
  return (
    <span className="absolute inset-0">
      <Window className="hero-float top-8 left-1/2 w-[300px] -translate-x-1/2">
        <span className="flex h-[30px] items-center gap-2 border-b border-line px-3">
          <span className="hero-dot size-[7px] rounded-full bg-record" />
          <span className="block h-1.5 w-16 rounded-full bg-line-strong" />
          <span className="ml-auto flex h-3 items-end gap-0.5">
            {[0, 1, 2, 3].map((index) => (
              <span key={index} className="hero-bar block w-[3px] rounded-[1px] bg-record" style={{ animationDelay: `${index * 120}ms` }} />
            ))}
          </span>
        </span>
        <Lines widths={['92%', '80%', '55%']} faintLast />
      </Window>
      <Bars className="absolute bottom-6 left-12 opacity-50" count={5} />
      <span className="absolute right-12 bottom-8 grid size-9 place-items-center rounded-full bg-surface text-accent shadow-sm">
        <Captions className="size-4" />
      </span>
    </span>
  );
}

export function OverlayScene() {
  return (
    <span className="absolute inset-0">
      <span className="absolute inset-x-10 top-7 bottom-0 rounded-t-[10px] border border-line bg-surface/70" />
      <span className="hero-rise absolute bottom-8 left-1/2 flex h-10 -translate-x-1/2 items-center gap-2.5 rounded-full border border-line bg-surface px-4 shadow-[0_8px_22px_rgb(0_0_0/0.16)]">
        <span className="hero-dot size-2 rounded-full bg-record" />
        <span className="text-[12px] font-medium text-ink">Listening</span>
        <span className="flex h-3.5 items-end gap-0.5">
          {[0, 1, 2, 3, 4].map((index) => (
            <span key={index} className="hero-bar block w-[3px] rounded-[1px] bg-record" style={{ animationDelay: `${index * 100}ms` }} />
          ))}
        </span>
      </span>
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
      <Window className="hero-float-late top-16 right-14 w-[200px] rounded-[6px]">
        <span className="flex h-[26px] items-center gap-1.5 border-b border-line px-2.5">
          <span className="hero-dot size-[6px] rounded-full bg-record" />
          <PictureInPicture2 className="size-3 text-faint" />
        </span>
        <Lines widths={['90%', '60%']} faintLast />
      </Window>
    </span>
  );
}
