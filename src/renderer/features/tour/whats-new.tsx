import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { whatsNewSince, type ReleaseBlock, type ReleaseNote } from '@shared/update/release-markdown';
import { Billboard } from '@renderer/components/ui/billboard';
import { Button } from '@renderer/components/ui/button';
import { Drawer } from '@renderer/components/ui/drawer';
import { Badge, Notice } from '@renderer/components/ui/layout';
import { api } from '@renderer/lib/api';
import { useReleaseNotes, useSettings, useSystemStatus, useUpdateSettings, useUpdateStatus } from '@renderer/lib/queries';
import { useUi } from '@renderer/stores/ui-store';
import { WhatsNewScene } from './hero-scenes';

export function releaseDate(note: ReleaseNote): string {
  const date = new Date(note.publishedAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fetchedAgo(fetchedAt: number): string {
  if (!fetchedAt) return '';
  const minutes = Math.round((Date.now() - fetchedAt) / 60_000);
  return minutes < 1 ? 'just now' : minutes === 1 ? '1 minute ago' : minutes < 60 ? `${minutes} minutes ago` : 'over an hour ago';
}

/** Plain release blocks as a page: headings, then each run of items as one list. */
export function ReleaseBlocks({ blocks, limit }: { blocks: ReleaseBlock[]; limit?: number }) {
  const shown = limit === undefined ? blocks : blocks.slice(0, limit);
  const groups: (ReleaseBlock | ReleaseBlock[])[] = [];
  for (const block of shown) {
    const last = groups[groups.length - 1];
    if (block.kind === 'item' && Array.isArray(last)) last.push(block);
    else groups.push(block.kind === 'item' ? [block] : block);
  }
  if (!shown.length) return <p className="m-0 text-sm text-muted">No notes were written for this release.</p>;
  return (
    <div data-selectable className="grid gap-2 text-sm leading-relaxed">
      {groups.map((group, index) =>
        Array.isArray(group) ? (
          <ul key={index} className="m-0 grid list-disc gap-1 pl-5 marker:text-faint">
            {group.map((item, i) => (
              <li key={i}>{item.text}</li>
            ))}
          </ul>
        ) : group.kind === 'heading' ? (
          <p key={index} className="m-0 pt-1 text-[13px] font-semibold text-muted">
            {group.text}
          </p>
        ) : (
          <p key={index} className="m-0 text-muted">
            {group.text}
          </p>
        ),
      )}
    </div>
  );
}

/** Every recent release in full, live from GitHub. Long notes read here, not in a modal. */
export function ReleaseNotesDrawer() {
  const open = useUi((s) => s.releaseNotes);
  const setOpen = useUi((s) => s.setReleaseNotes);
  const notes = useReleaseNotes(open);
  const { data: status } = useSystemStatus();
  const { data: update } = useUpdateStatus();
  const releases = notes.data?.releases ?? [];
  const current = status?.appVersion;
  const pending = update?.availableVersion;
  const pendingLabel = update?.state === 'downloading' ? 'Downloading' : update?.state === 'downloaded' ? 'Ready to install' : update?.state === 'available' ? 'Available' : null;

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      title="Release notes"
      description="Live from GitHub Releases, shikki841/inaudio."
      headerActions={
        <button
          type="button"
          aria-label="Refresh release notes"
          title="Refresh"
          disabled={notes.load.isPending}
          onClick={() => notes.load.mutate()}
          className="grid size-8 shrink-0 place-items-center rounded-[6px] text-muted hover:bg-sunken hover:text-ink disabled:opacity-50"
        >
          <RefreshCw aria-hidden className={`size-4 ${notes.load.isPending ? 'animate-spin' : ''}`} />
        </button>
      }
      footer={
        <>
          <span className="flex-1 text-xs text-faint">
            {notes.data?.fetchedAt ? `Fetched ${fetchedAgo(notes.data.fetchedAt)} · last ${releases.length} releases` : ''}
          </span>
          <Button size="sm" onClick={() => void api.system.openLink('releases')}>
            <ExternalLink /> Open on GitHub
          </Button>
        </>
      }
    >
      <div className="grid gap-5 px-5 py-4">
        {notes.data?.error && (
          <Notice
            tone="warning"
            action={
              <Button size="sm" onClick={() => notes.load.mutate()} disabled={notes.load.isPending}>
                Try again
              </Button>
            }
          >
            {notes.data.error}
          </Notice>
        )}
        {notes.isLoading && <p className="m-0 text-sm text-muted">Loading release notes…</p>}
        {releases.map((release, index) => (
          <article key={release.url} className={`grid gap-2.5 ${index > 0 ? 'border-t border-line pt-5' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-base font-semibold">{release.version}</h3>
              {release.version === current && <Badge tone="success">Installed</Badge>}
              {release.version === pending && pendingLabel && <Badge tone="accent">{pendingLabel}</Badge>}
              <span className="ml-auto text-xs text-faint">{releaseDate(release)}</span>
            </div>
            <ReleaseBlocks blocks={release.blocks} />
          </article>
        ))}
      </div>
    </Drawer>
  );
}

/** Three shimmering lines while the notes are on their way. */
function LoadingLines() {
  return (
    <div aria-hidden className="grid gap-2.5 py-1">
      {['w-[92%]', 'w-[78%]', 'w-[85%]'].map((width) => (
        <span key={width} className={`skeleton h-3 rounded-full ${width}`} />
      ))}
    </div>
  );
}

/**
 * The what's-new billboard: once after an update, at a quiet moment, never while
 * Read Aloud is speaking. What it lists comes from GitHub as it opens: what changed since
 * the version last seen. Closing it remembers the version; "Don't show after updates"
 * turns it off, and the setting brings it back. It can always be opened from the sidebar.
 */
export function WhatsNewBillboard() {
  const open = useUi((s) => s.whatsNew);
  const setOpen = useUi((s) => s.setWhatsNew);
  const setNotes = useUi((s) => s.setReleaseNotes);
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const update = useUpdateSettings();
  const notes = useReleaseNotes(open);
  const [mute, setMute] = useState(false);
  // The version seen before this opening; closing moves it on, the list should not jump.
  const [seen, setSeen] = useState('');
  const version = status?.appVersion ?? '';
  useEffect(() => {
    if (open) setSeen(settings?.announcements.seenVersion ?? '');
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const releases = notes.data?.releases ?? [];
  const items = whatsNewSince(releases, version, seen === version ? '' : seen);
  const note = releases.find((release) => release.version === version);
  const versions = new Set(items.map((item) => item.version));
  const loading = !notes.data || ((notes.isFetching || notes.load.isPending) && !releases.length);
  const failed = !loading && !releases.length && !!notes.data?.error;
  // Say what the list is: this version's changes, changes since the last one seen, or the
  // latest changes from earlier releases when this one brought only chores.
  const onlyThisVersion = !items.length || items.every((item) => item.version === version);
  const tag = onlyThisVersion ? `New in ${version}` : seen && seen !== version ? `New since ${seen}` : 'Recent changes';

  const close = (next: boolean) => {
    if (next) return;
    setOpen(false);
    if (!settings) return;
    update.mutate({ announcements: { seenVersion: version, ...(mute ? { whatsNew: false } : {}) } });
  };

  return (
    <Billboard
      open={open}
      onOpenChange={close}
      label={`What's new in Inaudio ${version}`}
      hero={<WhatsNewScene />}
      title={
        <span className="grid gap-2">
          <span className="w-max rounded-[6px] bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">{tag}</span>
          <span>{note?.name && note.name !== `v${version}` && note.name !== version ? note.name : 'What’s new in Inaudio'}</span>
        </span>
      }
      footer={
        <>
          <label className="flex cursor-default items-center gap-2 text-[13px] text-muted select-none">
            <input
              type="checkbox"
              checked={mute}
              onChange={(event) => setMute(event.target.checked)}
              className="size-4 rounded-[6px] accent-[var(--accent)]"
            />
            Don’t show after updates
          </label>
          <span className="flex-1" />
          {failed ? (
            <Button onClick={() => notes.load.mutate()} disabled={notes.load.isPending}>
              <RefreshCw className={notes.load.isPending ? 'animate-spin' : undefined} /> Try again
            </Button>
          ) : (
            <Button
              onClick={() => {
                close(false);
                setNotes(true);
              }}
            >
              All changes
            </Button>
          )}
          <Button variant="primary" onClick={() => close(false)} autoFocus>
            {failed ? 'Close' : 'Got it'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <LoadingLines />
        ) : failed ? (
          <p className="m-0 text-sm leading-relaxed text-muted">The release notes could not be loaded from GitHub. Check your connection and try again.</p>
        ) : items.length ? (
          <ul className="m-0 grid list-none gap-2.5 p-0 text-sm leading-relaxed">
            {items.map((item) => (
              <li key={`${item.version}-${item.text}`} className="flex gap-2.5">
                <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">{item.text}</span>
                {versions.size > 1 && <span className="shrink-0 pt-0.5 text-xs text-faint tabular-nums">{item.version}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">No notes were written for Inaudio {version}.</p>
        )}
        <span className={`text-xs ${failed ? 'text-danger' : 'text-faint'}`}>
          {loading
            ? 'Checking GitHub Releases…'
            : failed
              ? notes.data?.error
              : `From GitHub · ${fetchedAgo(notes.data?.fetchedAt ?? 0)}${note && releaseDate(note) ? ` · released ${releaseDate(note)}` : ''}`}
        </span>
      </div>
    </Billboard>
  );
}

/** Opens the billboard once per new version, after the app has settled. */
export function useWhatsNewAfterUpdate(): void {
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const setOpen = useUi((s) => s.setWhatsNew);
  const shown = useRef(false);
  const due =
    !!settings?.onboardingComplete &&
    settings.announcements.whatsNew &&
    !!status?.appVersion &&
    settings.announcements.seenVersion !== status.appVersion;
  useEffect(() => {
    if (!due || shown.current) return;
    const timer = setTimeout(() => {
      shown.current = true;
      setOpen(true);
    }, 1_500);
    return () => clearTimeout(timer);
  }, [due, setOpen]);
}
