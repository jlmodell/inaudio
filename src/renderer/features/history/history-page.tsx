import { useQueryClient } from '@tanstack/react-query';
import { ClipboardPaste, Copy, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { MODEL_CATALOG } from '@shared/domain/models';
import { ConfirmDialog } from '@renderer/components/ui/alert-dialog';
import { Button } from '@renderer/components/ui/button';
import { EmptyState } from '@renderer/components/ui/empty-state';
import { IconButton } from '@renderer/components/ui/icon-button';
import { Badge, PageHeader } from '@renderer/components/ui/layout';
import { api } from '@renderer/lib/api';
import { formatDuration, formatWhen } from '@renderer/lib/format';
import { keys, useHistory, useSettings } from '@renderer/lib/queries';

const SOURCE_LABEL = { system: 'System audio', 'system+mic': 'System + microphone', device: 'Audio device' } as const;

const PAGE = 50;

export function HistoryPage() {
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const deferred = useDeferredValue(search.trim());
  const { data, isFetching } = useHistory({ search: deferred, limit, offset: 0 });
  const { data: settings } = useSettings();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: keys.historyAll });

  return (
    <div>
      <PageHeader
        title="History"
        description={
          settings?.dictation.saveHistory === false
            ? 'Saving is off. New dictations are not stored.'
            : 'Stored only on this computer.'
        }
        actions={
          <ConfirmDialog
            title="Clear all history?"
            description="Every saved transcript is deleted from this computer. This cannot be undone."
            confirmLabel="Clear history"
            onConfirm={() => void api.history.clear().then(refresh)}
            trigger={
              <Button variant="ghost" size="sm" disabled={!data?.total}>
                <Trash2 /> Clear all
              </Button>
            }
          />
        }
      />

      <label className="flex h-10 items-center gap-2 rounded-lg bg-sunken px-3">
        <Search className="size-4 text-faint" />
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

      <ul className="mt-4 divide-y divide-line">
        {data?.items.map((item) => (
          <li key={item.id} className="group grid gap-1.5 py-4">
            <div className="flex items-center justify-between gap-4 text-xs text-faint">
              <span className="flex min-w-0 items-center gap-2">
                {item.source !== 'microphone' && (
                  <Badge tone="accent">{SOURCE_LABEL[item.source]}</Badge>
                )}
                <span className="truncate">
                  {formatWhen(item.createdAt)} · {formatDuration(item.durationMs)} · {MODEL_CATALOG[item.modelId as keyof typeof MODEL_CATALOG]?.name ?? item.modelId}
                </span>
              </span>
              <span className="flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <IconButton label="Copy" size="icon-sm" onClick={() => void api.text.copy(item.text)}>
                  <Copy />
                </IconButton>
                <IconButton label="Type into focused app" size="icon-sm" onClick={() => void api.text.insert(item.text)}>
                  <ClipboardPaste />
                </IconButton>
                <IconButton label="Delete" size="icon-sm" onClick={() => void api.history.remove(item.id).then(refresh)}>
                  <Trash2 />
                </IconButton>
              </span>
            </div>
            <p data-selectable className="text-base leading-relaxed whitespace-pre-wrap">
              {item.text}
            </p>
          </li>
        ))}
      </ul>

      {data && data.items.length === 0 && (
        <EmptyState
          title={deferred ? 'No transcripts found' : 'No transcripts yet'}
          description={deferred ? 'Try a different search phrase.' : 'Dictate something and it will appear here automatically.'}
        />
      )}
      {data && data.total > data.items.length && (
        <div className="flex justify-center pt-4">
          <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Show more ({data.total - data.items.length})
          </Button>
        </div>
      )}
    </div>
  );
}
