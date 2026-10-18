import { AlertTriangle, ArrowDownToLine, CheckCircle2, Download, Loader2, RefreshCw, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Settings } from '@shared/domain/settings';
import type { UpdateStatus } from '@shared/domain/update';
import { LogoMark } from '@renderer/components/brand/logo';
import { Button } from '@renderer/components/ui/button';
import { Notice, Row, Section } from '@renderer/components/ui/layout';
import { Switch } from '@renderer/components/ui/switch';
import { cn } from '@renderer/lib/cn';
import { formatBytes } from '@renderer/lib/format';
import type { useUpdateActions } from '@renderer/lib/queries';

type Actions = ReturnType<typeof useUpdateActions>;

function when(epochMs: number | undefined): string {
  if (!epochMs) return 'Not yet';
  const date = new Date(epochMs);
  const today = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return date.toDateString() === today.toDateString() ? `Today at ${time}` : `${date.toLocaleDateString()} at ${time}`;
}

function released(date: string | undefined): string {
  if (!date) return '';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '' : `Released ${parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

function remaining(status: UpdateStatus): string {
  const { transferred, total, bytesPerSecond } = status;
  if (!total || transferred === undefined || !bytesPerSecond) return '';
  const seconds = Math.max(0, Math.round((total - transferred) / bytesPerSecond));
  return seconds < 60 ? `about ${Math.max(1, seconds)} s left` : `about ${Math.round(seconds / 60)} min left`;
}

/** The download bar: it fills with progress, and a sheen runs along it while bytes arrive. */
function DownloadBar({ progress }: { progress: number }) {
  return (
    <div
      role="progressbar"
      aria-label="Download progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      className="h-2 overflow-hidden rounded-full bg-line"
    >
      <div className="update-fill relative h-full overflow-hidden rounded-full bg-accent" style={{ width: `${Math.max(2, progress)}%` }}>
        <span aria-hidden className="update-sheen absolute inset-y-0 w-10 bg-white/35" />
      </div>
    </div>
  );
}

function Hero({ icon, title, detail, trailing, children, tone = 'neutral' }: { icon: ReactNode; title: string; detail: ReactNode; trailing?: ReactNode; children?: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'danger' }) {
  return (
    <section aria-live="polite" className="grid gap-4 rounded-[12px] border border-line bg-sunken p-5">
      <div className="flex items-center gap-3.5">
        <span
          aria-hidden
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-[12px] border border-line bg-surface',
            tone === 'accent' && 'text-accent',
            tone === 'success' && 'text-success',
            tone === 'danger' && 'text-danger',
          )}
        >
          {icon}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-base font-semibold">{title}</span>
          <span className="text-sm text-muted">{detail}</span>
        </div>
        {trailing}
      </div>
      {children}
    </section>
  );
}

/** The state of the newest release, with what it brings. Shown while automatic updates are on. */
function UpdateHero({ status, actions }: { status: UpdateStatus; actions: Actions }) {
  const next = status.availableVersion;
  const current = status.currentVersion;
  if (status.state === 'downloading') {
    const progress = status.progress ?? 0;
    return (
      <Hero
        tone="accent"
        icon={<ArrowDownToLine className="update-nudge size-6" />}
        title={`Downloading Inaudio ${next ?? ''}`.trim()}
        detail={`You are on ${current}. Keep working; it installs when you restart.`}
        trailing={<span className="font-mono text-2xl font-semibold text-accent tabular-nums">{Math.round(progress)}%</span>}
      >
        <DownloadBar progress={progress} />
        <div className="flex justify-between gap-4 text-xs text-muted tabular-nums">
          <span>{status.total ? `${formatBytes(status.transferred ?? 0)} of ${formatBytes(status.total)}` : 'Starting the download…'}</span>
          <span>{status.bytesPerSecond ? `${formatBytes(status.bytesPerSecond)}/s · ${remaining(status)}` : ''}</span>
        </div>
      </Hero>
    );
  }
  if (status.state === 'downloaded') {
    return (
      <Hero
        tone="accent"
        icon={<RotateCw className="size-6" />}
        title={`Inaudio ${next ?? ''} is ready`.trim()}
        detail="Restart to finish updating. Anything you are recording is stopped and saved first."
        trailing={
          <Button variant="primary" onClick={() => actions.install.mutate()} disabled={actions.install.isPending}>
            <RotateCw /> Restart to update
          </Button>
        }
      />
    );
  }
  if (status.state === 'available') {
    return (
      <Hero
        tone="accent"
        icon={<Download className="size-6" />}
        title={`Inaudio ${next ?? ''} is available`.trim()}
        detail={`You are on ${current}.`}
        trailing={
          <Button variant="primary" onClick={() => actions.download.mutate()} disabled={actions.download.isPending}>
            <Download /> Download
          </Button>
        }
      />
    );
  }
  if (status.state === 'checking') {
    return <Hero icon={<Loader2 className="size-6 animate-spin text-accent" />} title="Checking for updates…" detail={`You are on ${current}.`} />;
  }
  if (status.state === 'error') {
    return (
      <Hero
        tone="danger"
        icon={<AlertTriangle className="size-6" />}
        title="The update check failed"
        detail={status.error ?? 'Try again in a moment.'}
        trailing={
          <Button onClick={() => actions.check.mutate()} disabled={actions.check.isPending}>
            <RefreshCw /> Try again
          </Button>
        }
      />
    );
  }
  if (status.state === 'unavailable') {
    return <Hero icon={<LogoMark className="size-8" />} title={`Inaudio ${current}`} detail="This is a development build. Updates are available in installed builds." />;
  }
  return (
    <Hero
      tone="success"
      icon={<CheckCircle2 className="size-6" />}
      title={status.state === 'up-to-date' ? `Inaudio ${current} is up to date` : `Inaudio ${current}`}
      detail={status.state === 'up-to-date' ? 'You have the newest release.' : 'Inaudio checks for signed updates on its own.'}
    />
  );
}

export function UpdateSection({
  status,
  updates,
  actions,
  onChange,
}: {
  status: UpdateStatus | undefined;
  updates: Settings['updates'];
  actions: Actions;
  onChange(patch: Partial<Settings['updates']>): void;
}) {
  const notes = status?.releaseNotes;
  const next = status?.availableVersion;
  const showNotes = updates.checkAutomatically && notes && next && next !== status?.currentVersion;
  return (
    <Section id="settings-updates">
      {updates.checkAutomatically && status && (
        <div className="grid gap-5 pb-5">
          <UpdateHero status={status} actions={actions} />
          {showNotes && (
            <div className="grid gap-2">
              <h3 className="text-sm font-semibold tracking-wide text-faint uppercase">
                {status.releaseName && status.releaseName !== next ? status.releaseName : `What’s new in ${next}`}
              </h3>
              <p data-selectable className="m-0 text-sm leading-relaxed whitespace-pre-wrap">
                {notes}
              </p>
              {released(status.releaseDate) && <span className="text-xs text-faint">{released(status.releaseDate)}</span>}
            </div>
          )}
        </div>
      )}
      {!updates.checkAutomatically && (
        <div className="pb-4">
          <Notice tone="neutral">Automatic updates are off. Check now and then, or turn them back on below.</Notice>
        </div>
      )}
      <Row label="Automatic updates" description="Check for updates on their own and show progress here and in the title bar.">
        <Switch
          aria-label="Check for updates automatically"
          checked={updates.checkAutomatically}
          onCheckedChange={(checkAutomatically) => onChange({ checkAutomatically })}
        />
      </Row>
      <Row label="Background downloads" description="Download signed updates without interrupting your work.">
        <Switch
          aria-label="Download updates automatically"
          checked={updates.downloadAutomatically}
          onCheckedChange={(downloadAutomatically) => onChange({ downloadAutomatically })}
        />
      </Row>
      <Row label="Last checked" description={when(status?.checkedAt)}>
        {status?.state === 'downloaded' && !updates.checkAutomatically ? (
          <Button size="sm" onClick={() => actions.install.mutate()} disabled={actions.install.isPending}>
            <RotateCw /> Restart to update
          </Button>
        ) : status?.state === 'available' && !updates.checkAutomatically ? (
          <Button size="sm" onClick={() => actions.download.mutate()} disabled={actions.download.isPending}>
            <Download /> Download {next}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => actions.check.mutate()}
            disabled={actions.check.isPending || status?.state === 'unavailable' || status?.state === 'checking' || status?.state === 'downloading'}
          >
            <RefreshCw /> Check now
          </Button>
        )}
      </Row>
      <Row label="Current version" description={`Inaudio ${status?.currentVersion ?? ''}`.trim()} />
    </Section>
  );
}
