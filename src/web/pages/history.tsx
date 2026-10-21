import { Copy, Pin, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { transcriptTitle, wordCount, type Transcript } from '@shared/domain/history';
import { Button } from '@renderer/components/ui/button';
import { EmptyState } from '@renderer/components/ui/empty-state';
import { IconButton } from '@renderer/components/ui/icon-button';
import { PageHeader } from '@renderer/components/ui/layout';
import { toast } from '@renderer/components/ui/toast';
import { formatDuration, formatTime, groupByDay } from '@renderer/lib/format';
import { api } from '../api';
import { keys, useHistory } from '../queries';

export function HistoryPage() {
  const [search, setSearch] = useState('');
  const { data } = useHistory(search);
  const client = useQueryClient();
  const items = data?.items ?? [];

  const remove = async (id: string) => {
    await api.removeTranscript(id);
    void client.invalidateQueries({ queryKey: keys.history });
  };

  const pin = async (item: Transcript) => {
    await api.updateTranscript(item.id, { pinned: !item.pinned });
    void client.invalidateQueries({ queryKey: keys.history });
  };

  return (
    <div className="grid gap-6">
      <PageHeader title="History" description="Transcripts from this Inaudio, searchable on this computer." />
      <label className="flex h-10 items-center gap-2 rounded-[6px] bg-sunken px-3 text-sm">
        <Search className="size-4 text-muted" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search transcripts"
          className="h-full w-full bg-transparent outline-none"
        />
      </label>
      {items.length === 0 ? (
        <EmptyState
          title={search ? 'Nothing matches' : 'No transcripts yet'}
          description={search ? 'Try a different word.' : 'Dictate something and it appears here.'}
        />
      ) : (
        <div className="grid gap-4">
          {groupByDay(items).map((group) => (
            <section key={group.day} className="grid gap-1">
              <h2 className="m-0 text-sm font-semibold tracking-wide text-faint uppercase">{group.day}</h2>
              <ul className="m-0 grid list-none gap-1 p-0">
                {group.items.map((item) => (
                  <li key={item.id} className="grid gap-2 rounded-xl px-2.5 py-3 hover:bg-sunken">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-1">
                        <span className="flex items-center gap-2">
                          {item.pinned && <Pin className="size-3.5 fill-current text-accent" />}
                          <span className="truncate text-[15px] font-semibold">{transcriptTitle(item)}</span>
                        </span>
                        <span className="text-xs text-faint tabular-nums">
                          {formatTime(item.createdAt)} · {formatDuration(item.durationMs)} · {wordCount(item.text)} words
                        </span>
                      </div>
                      <div className="flex shrink-0">
                        <IconButton
                          label="Copy"
                          size="icon-sm"
                          onClick={() =>
                            void navigator.clipboard.writeText(item.text).then(() => toast('Copied'))
                          }
                        >
                          <Copy />
                        </IconButton>
                        <IconButton
                          label={item.pinned ? 'Unpin' : 'Pin'}
                          size="icon-sm"
                          onClick={() => void pin(item)}
                        >
                          <Pin className={item.pinned ? 'fill-current' : ''} />
                        </IconButton>
                        <IconButton label="Delete" size="icon-sm" onClick={() => void remove(item.id)}>
                          <Trash2 />
                        </IconButton>
                      </div>
                    </div>
                    <p className="m-0 text-[15px] leading-relaxed whitespace-pre-wrap">{item.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {items.length > 0 && (
            <Button
              variant="ghost"
              className="justify-self-start"
              onClick={() =>
                void api.clearHistory().then(() => client.invalidateQueries({ queryKey: keys.history }))
              }
            >
              Clear history
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
