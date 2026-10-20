import { useQueryClient } from '@tanstack/react-query';
import { Captions, Copy, Download, Mic, Pin, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { transcriptTitle, wordCount, type HistoryKind, type Transcript } from '@shared/domain/history';
import { ConfirmDialog } from '@renderer/components/ui/alert-dialog';
import { Button } from '@renderer/components/ui/button';
import { Drawer } from '@renderer/components/ui/drawer';
import { EmptyState } from '@renderer/components/ui/empty-state';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Badge, PageHeader } from '@renderer/components/ui/layout';
import { ActionMenu, MenuItem, MenuSeparator, MenuSub } from '@renderer/components/ui/menu';
import { Segmented } from '@renderer/components/ui/segmented';
import { toast } from '@renderer/components/ui/toast';
import { ReadAloudButton, useReadingState } from '@renderer/features/read-aloud/read-aloud-controls';
import { api, errorMessage } from '@renderer/lib/api';
import { cn } from '@renderer/lib/cn';
import { formatDuration, formatTime, groupByDay } from '@renderer/lib/format';
import { keys, useHistory, useSettings } from '@renderer/lib/queries';
import { useUi } from '@renderer/stores/ui-store';
import { EXPORT_OPTIONS, SOURCE_LABEL, TranscriptMenu, useTranscriptActions, type TranscriptActions } from './transcript-actions';
import { TranscriptView } from './transcript-view';

const PAGE = 50;

type View = HistoryKind | 'pinned';
const VIEWS: { value: View; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'dictation', label: 'Dictation' },
  { value: 'live', label: 'Live' },
  { value: 'pinned', label: 'Pinned' },
];

const EMPTY: Record<View, { title: string; description: string }> = {
  all: { title: 'No transcripts yet', description: 'Dictate something or record a live transcript and it appears here.' },
  dictation: { title: 'No dictations yet', description: 'Dictations are saved here when Save history is on.' },
  live: { title: 'No live transcripts yet', description: 'Live sessions are saved here when you stop them.' },
  pinned: { title: 'Nothing pinned', description: 'Pin a transcript from its ⋯ menu to keep it here.' },
};

/**
 * One saved transcript in the list. The whole row opens it; Read aloud and Copy wait on the
 * right, shown on hover or focus and always while it is being read; the ⋯ menu has the rest.
 */
function Row({ item, onOpen, actions }: { item: Transcript; onOpen(): void; actions: TranscriptActions }) {
  const reading = useReadingState(item.id);
  const live = item.source !== 'microphone';
  const SourceIcon = live ? Captions : Mic;
  const words = wordCount(item.text);
  return (
    <li
      className={cn(
        'group flex items-start gap-3.5 rounded-xl px-2.5 py-3.5 transition-colors hover:bg-sunken focus-within:bg-sunken',
        reading !== 'idle' && 'bg-accent-soft hover:bg-accent-soft focus-within:bg-accent-soft',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-sunken text-muted transition-colors group-hover:bg-surface group-focus-within:bg-surface',
          reading !== 'idle' && 'bg-surface text-accent',
        )}
      >
        <SourceIcon className="size-[17px]" />
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="grid min-w-0 flex-1 gap-1 rounded-[6px] text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <span className="flex min-w-0 items-center gap-2">
          {item.pinned && <Pin aria-label="Pinned" className="size-3.5 shrink-0 fill-current text-accent" />}
          <span className="truncate text-[15px] font-semibold">{transcriptTitle(item)}</span>
          {live && <Badge tone="accent">{SOURCE_LABEL[item.source]}</Badge>}
        </span>
        <span className="truncate text-xs text-faint tabular-nums">
          {formatTime(item.createdAt)} · {formatDuration(item.durationMs)} · {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
        </span>
        {(item.title || item.text.length > 60) && (
          <span className="line-clamp-2 text-[15px] leading-relaxed text-ink">{item.text}</span>
        )}
      </button>
      <span
        className={cn(
          'flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
          reading !== 'idle' && 'opacity-100',
        )}
      >
        <ReadAloudButton id={item.id} title={transcriptTitle(item)} text={item.text} />
        <IconButton label="Copy text" size="icon-sm" onClick={() => actions.copy(item)}>
          <Copy />
        </IconButton>
      </span>
      <TranscriptMenu item={item} actions={actions} onOpen={onOpen} />
    </li>
  );
}

export function HistoryPage() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('all');
  const [limit, setLimit] = useState(PAGE);
  const [clearing, setClearing] = useState(false);
  const deferred = useDeferredValue(search.trim());
  const kind: HistoryKind = view === 'pinned' ? 'all' : view;
  const { data, isFetching } = useHistory({ search: deferred, limit, offset: 0, kind, pinnedOnly: view === 'pinned' });
  const latest = useHistory({ limit: 1, offset: 0 });
  const { data: settings } = useSettings();
  const client = useQueryClient();
  const open = useUi((s) => s.transcript);
  const setOpen = useUi((s) => s.openTranscript);
  const { actions, dialogs } = useTranscriptActions({ onDeleted: (id) => open === id && setOpen(null) });

  const openItem: Transcript | null =
    open === 'latest' ? (latest.data?.items[0] ?? null) : (data?.items.find((item) => item.id === open) ?? null);

  const exportAll = (format: (typeof EXPORT_OPTIONS)[number]['format']) =>
    void api.history
      .export({ kind, format })
      .then((count) => count > 0 && toast(`${count} ${count === 1 ? 'transcript' : 'transcripts'} exported`))
      .catch((error: unknown) => toast(errorMessage(error), { tone: 'danger' }));

  const saving = settings?.dictation.saveHistory !== false || settings?.live.saveHistory !== false;

  return (
    <div>
      <PageHeader
        title="History"
        description={saving ? 'Stored only on this computer.' : 'Saving is off. New transcripts are not stored.'}
        actions={
          <ActionMenu label="History actions">
            <MenuSub label="Export all shown" icon={<Download />}>
              {EXPORT_OPTIONS.map((option) => (
                <MenuItem key={option.format} disabled={!data?.total} onSelect={() => exportAll(option.format)} tail={`.${option.format}`}>
                  {option.label}
                </MenuItem>
              ))}
            </MenuSub>
            <MenuSeparator />
            <MenuItem icon={<Trash2 />} danger disabled={!data?.total} onSelect={() => setClearing(true)}>
              Clear all history…
            </MenuItem>
          </ActionMenu>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-10 min-w-60 flex-1 items-center gap-2 rounded-[6px] bg-sunken px-3">
          <Search aria-hidden className="size-4 text-faint" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transcripts"
            aria-label="Search transcripts"
            maxLength={200}
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          {isFetching && <span className="text-xs text-faint">Searching…</span>}
        </label>
        <Segmented<View>
          label="Show"
          value={view}
          onValueChange={(next) => {
            setView(next);
            setLimit(PAGE);
          }}
          options={VIEWS}
        />
      </div>

      <div className="mt-2">
        {groupByDay(data?.items ?? []).map((group) => (
          <section key={group.day} aria-label={group.day}>
            <h2 className="sticky top-0 z-10 m-0 flex items-center gap-1.5 bg-surface/95 px-2.5 pt-5 pb-1.5 text-xs font-semibold tracking-[0.05em] text-faint uppercase backdrop-blur-sm">
              {group.day}
              <span className="font-medium tracking-normal normal-case">· {group.items.length}</span>
            </h2>
            <ul className="m-0 grid list-none gap-0.5 p-0">
              {group.items.map((item) => (
                <Row key={item.id} item={item} onOpen={() => setOpen(item.id)} actions={actions} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {data && data.items.length === 0 && (
        <EmptyState
          title={deferred ? 'No transcripts found' : EMPTY[view].title}
          description={deferred ? 'Try a different search phrase.' : EMPTY[view].description}
        />
      )}
      {data && data.total > data.items.length && (
        <div className="flex justify-center pt-4">
          <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({data.total - data.items.length})
          </Button>
        </div>
      )}

      <Drawer
        open={openItem !== null}
        onOpenChange={(next) => !next && setOpen(null)}
        title={openItem ? transcriptTitle(openItem) : ''}
        description={openItem ? 'Stored only on this computer. Press Esc to close.' : undefined}
      >
        {openItem && <TranscriptView item={openItem} actions={actions} />}
      </Drawer>

      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Clear all history?"
        description="Every saved transcript is deleted from this computer. This cannot be undone."
        confirmLabel="Clear history"
        onConfirm={() => {
          setClearing(false);
          void api.history.clear().then(() => client.invalidateQueries({ queryKey: keys.historyAll }));
        }}
      />
      {dialogs}
    </div>
  );
}
