import { AlertTriangle, ArrowDownToLine, CheckCircle2, Download, Loader2, RefreshCw, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Settings } from '@shared/domain/settings';
import { fetchedAgo, ReleaseBlocks, releaseDate } from '@renderer/features/tour/whats-new';
import { useReleaseNotes } from '@renderer/lib/queries';
import { useUi } from '@renderer/stores/ui-store';
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

/**
 * What's new, live from GitHub: the release on its way if there is one, else the installed
 * one. A preview here; the whole history opens in the release notes drawer.
 */
function LiveNotes({ status }: { status: UpdateStatus }) {
  const notes = useReleaseNotes();
  const openNotes = useUi((s) => s.setReleaseNotes);
  const target = status.availableVersion && status.availableVersion !== status.currentVersion ? status.availableVersion : status.currentVersion;
  const note = notes.data?.releases.find((release) => release.version === target);
  const fallback = !note && target === status.availableVersion ? status.releaseNotes : undefined;
  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-sm font-semibold tracking-wide text-faint uppercase">What’s new in {target}</h3>
        <span className="text-xs text-faint">
          {notes.load.isPending || notes.isFetching
            ? 'Checking GitHub…'
            : notes.data?.fetchedAt
              ? `From GitHub · ${fetchedAgo(notes.data.fetchedAt)}`
              : ''}
        </span>
      </div>
      {note ? (
        <>
          <ReleaseBlocks blocks={note.blocks} limit={8} />
          {releaseDate(note) && <span className="text-xs text-faint">Released {releaseDate(note)}</span>}
        </>
      ) : fallback ? (
        <p data-selectable className="m-0 text-sm leading-relaxed whitespace-pre-wrap">
          {fallback}
        </p>
      ) : notes.data?.error ? (
        <Notice tone="warning">{notes.data.error}</Notice>
      ) : notes.isLoading ? (
        <p className="m-0 text-sm text-muted">Loading release notes…</p>
      ) : (
        <p className="m-0 text-sm text-muted">No release notes for {target} yet.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => openNotes(true)}>
          Read all release notes
        </Button>
        <Button size="sm" variant="ghost" onClick={() => notes.load.mutate()} disabled={notes.load.isPending}>
          <RefreshCw className={notes.load.isPending ? 'animate-spin' : undefined} /> Refresh
        </Button>
      </div>
    </div>
  );
}

export function UpdateSection({
  status,
  updates,
  announcements,
  actions,
  onChange,
  onAnnouncements,
}: {
  status: UpdateStatus | undefined;
  updates: Settings['updates'];
  announcements: Settings['announcements'];
  actions: Actions;
  onChange(patch: Partial<Settings['updates']>): void;
  onAnnouncements(patch: Partial<Settings['announcements']>): void;
}) {
  const showWhatsNew = useUi((s) => s.setWhatsNew);
  const openNotes = useUi((s) => s.setReleaseNotes);
  return (
    <Section id="settings-updates">
      {updates.checkAutomatically && status && (
        <div className="grid gap-5 pb-5">
          <UpdateHero status={status} actions={actions} />
          <LiveNotes status={status} />
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
            <Download /> Download {status.availableVersion}
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
      <Row
        id="settings-whats-new"
        label="Show what’s new after an update"
        description="Once per version, at a quiet moment, never while you dictate or record."
      >
        <Button size="sm" variant="ghost" onClick={() => showWhatsNew(true)}>
          Show now
        </Button>
        <Switch
          aria-label="Show what’s new after an update"
          checked={announcements.whatsNew}
          onCheckedChange={(whatsNew) => onAnnouncements({ whatsNew })}
        />
      </Row>
      <Row label="Current version" description={`Inaudio ${status?.currentVersion ?? ''}`.trim()}>
        {!updates.checkAutomatically && (
          <Button size="sm" variant="ghost" onClick={() => openNotes(true)}>
            Release notes
          </Button>
        )}
      </Row>
    </Section>
  );
}
