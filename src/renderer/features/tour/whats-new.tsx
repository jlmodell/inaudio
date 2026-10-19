import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { highlights, type ReleaseBlock, type ReleaseNote } from '@shared/update/release-markdown';
import { Billboard } from '@renderer/components/ui/billboard';
import { Button } from '@renderer/components/ui/button';
import { Drawer } from '@renderer/components/ui/drawer';
import { Badge, Notice } from '@renderer/components/ui/layout';
import { useLive } from '@renderer/features/live/live-store';
import { api } from '@renderer/lib/api';
import { useReleaseNotes, useSettings, useSystemStatus, useUpdateSettings, useUpdateStatus } from '@renderer/lib/queries';
import { useDictation } from '@renderer/stores/dictation-store';
import { useUi } from '@renderer/stores/ui-store';
import { WhatsNewScene } from './hero-scenes';

/** Used when the release notes cannot be fetched: what the latest work brought, in short. */
const BUILT_IN_HIGHLIGHTS = [
  'A floating live window shows the transcript as it is heard.',
  'History opens transcripts in a drawer, with rename, pin and export.',
  'Settings have their own sidebar, search and a richer Updates page.',
];

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
        {notes.data?.paused && !releases.length && (
          <Notice
            tone="neutral"
            action={
              <Button size="sm" onClick={() => notes.load.mutate()} disabled={notes.load.isPending}>
                Load release notes
              </Button>
            }
          >
            Automatic updates are off, so Inaudio does not contact GitHub on its own.
          </Notice>
        )}
        {notes.data?.error && <Notice tone="warning">{notes.data.error}</Notice>}
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

/**
 * The what's-new billboard: once after an update, at a quiet moment, never over dictation or
 * a live transcript. Closing it remembers the version; "Don't show after updates" turns it off,
 * and the setting brings it back. It can always be opened from the sidebar.
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
  const version = status?.appVersion ?? '';
  const note = notes.data?.releases.find((release) => release.version === version);
  const items = highlights(note);
  const shown = items.length ? items : BUILT_IN_HIGHLIGHTS;

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
          <span className="w-max rounded-[6px] bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">New in {version}</span>
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
              className="size-4 rounded accent-[var(--accent)]"
            />
            Don’t show after updates
          </label>
          <span className="flex-1" />
          <Button
            onClick={() => {
              close(false);
              setNotes(true);
            }}
          >
            All changes
          </Button>
          <Button variant="primary" onClick={() => close(false)} autoFocus>
            Got it
          </Button>
        </>
      }
    >
      <ul className="m-0 grid list-none gap-2.5 p-0 text-sm leading-relaxed">
        {shown.map((line) => (
          <li key={line} className="flex gap-2.5">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </Billboard>
  );
}

/** Opens the billboard once per new version, after the app has settled and nothing records. */
export function useWhatsNewAfterUpdate(): void {
  const { data: settings } = useSettings();
  const { data: status } = useSystemStatus();
  const setOpen = useUi((s) => s.setWhatsNew);
  const dictating = useDictation((s) => s.phase !== 'idle' && s.phase !== 'error');
  const live = useLive((s) => s.live.phase !== 'idle' && s.live.phase !== 'error');
  const shown = useRef(false);
  const due =
    !!settings?.onboardingComplete &&
    settings.announcements.whatsNew &&
    !!status?.appVersion &&
    settings.announcements.seenVersion !== status.appVersion;
  useEffect(() => {
    if (!due || shown.current || dictating || live) return;
    // A short pause after launch, so the app is on screen before anything asks for attention.
    const timer = setTimeout(() => {
      shown.current = true;
      setOpen(true);
    }, 1_500);
    return () => clearTimeout(timer);
  }, [due, dictating, live, setOpen]);
}
