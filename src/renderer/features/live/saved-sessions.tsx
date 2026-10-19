import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { transcriptTitle } from '@shared/domain/history';
import { Button } from '@renderer/components/ui/button';
import { Drawer } from '@renderer/components/ui/drawer';
import { SOURCE_LABEL, TranscriptMenu, useTranscriptActions } from '@renderer/features/history/transcript-actions';
import { TranscriptView } from '@renderer/features/history/transcript-view';
import { formatDuration, formatWhen } from '@renderer/lib/format';
import { useHistory } from '@renderer/lib/queries';
import { useUi } from '@renderer/stores/ui-store';

/**
 * The Live page's drawer of saved live sessions. A session opens in place, with a way back
 * to the list; everything else a transcript can do comes from its ⋯ menu.
 */
export function SavedSessionsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useHistory({ kind: 'live', limit: 100, offset: 0 });
  const navigate = useUi((s) => s.navigate);
  const { actions, dialogs } = useTranscriptActions({ onDeleted: (id) => selected === id && setSelected(null) });
  const item = data?.items.find((candidate) => candidate.id === selected) ?? null;
  const total = data?.total ?? 0;

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
          onOpenChange(next);
        }}
        title={item ? transcriptTitle(item) : 'Saved sessions'}
        description={item ? undefined : 'Live transcripts kept in History on this computer.'}
        headerActions={
          item && (
            <button
              type="button"
              aria-label="Back to saved sessions"
              onClick={() => setSelected(null)}
              className="grid size-8 shrink-0 place-items-center rounded-[6px] text-muted hover:bg-sunken hover:text-ink"
            >
              <ArrowLeft aria-hidden className="size-4" />
            </button>
          )
        }
        footer={
          !item && (
            <>
              <span className="flex-1 text-xs text-faint">{total === 1 ? '1 session' : `${total} sessions`}</span>
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  navigate('history');
                }}
              >
                Open History
              </Button>
            </>
          )
        }
      >
        {item ? (
          <TranscriptView item={item} actions={actions} />
        ) : total === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No live sessions saved yet. Stop a live transcript and it appears here.</p>
        ) : (
          <ul className="grid gap-1 p-2">
            {data?.items.map((session) => (
              <li key={session.id} className="flex items-start gap-2 rounded-lg px-3 py-2.5 hover:bg-sunken">
                <button
                  type="button"
                  onClick={() => setSelected(session.id)}
                  className="grid min-w-0 flex-1 gap-1 rounded-[6px] text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="truncate text-sm font-semibold">{transcriptTitle(session)}</span>
                  <span className="truncate text-xs text-faint">
                    {formatWhen(session.createdAt)} · {formatDuration(session.durationMs)} · {SOURCE_LABEL[session.source]}
                  </span>
                  <span className="truncate text-[13px] text-muted">{session.text}</span>
                </button>
                <TranscriptMenu item={session} actions={actions} onOpen={() => setSelected(session.id)} />
              </li>
            ))}
          </ul>
        )}
      </Drawer>
      {dialogs}
    </>
  );
}
