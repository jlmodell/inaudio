import { ArrowLeft, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@renderer/lib/cn';
import { useSettings, useUpdateStatus } from '@renderer/lib/queries';
import { useUi } from '@renderer/stores/ui-store';
import { CATEGORIES, CATEGORY_GROUPS, SEARCH_ITEMS } from './settings-nav';

/**
 * Settings replace the app's navigation while they are open: a way back, a search across
 * every setting, and the categories, each opening its own page.
 */
export function SettingsSidebar({ macInset }: { macInset: boolean }) {
  const [query, setQuery] = useState('');
  const category = useUi((s) => s.settingsCategory);
  const openSettings = useUi((s) => s.openSettings);
  const navigate = useUi((s) => s.navigate);
  const previous = useUi((s) => s.previousRoute);
  const { data: settings } = useSettings();
  const { data: update } = useUpdateStatus();
  // The dot only appears where the title bar indicator would: automatic updates on.
  const updatePending =
    settings?.updates.checkAutomatically && (update?.state === 'available' || update?.state === 'downloading' || update?.state === 'downloaded');

  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return SEARCH_ITEMS.filter((item) => {
      const haystack = `${item.label} ${CATEGORIES[item.category].label} ${item.keywords}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    }).slice(0, 12);
  }, [query]);

  return (
    <aside aria-label="Settings" className="flex w-[248px] shrink-0 flex-col pb-4">
      <div className={cn('drag flex h-11 items-center', macInset ? 'pl-[84px]' : 'pl-4')} />
      <div className="grid gap-1 px-3">
        <button
          type="button"
          onClick={() => navigate(previous)}
          className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-muted outline-none hover:bg-surface/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ArrowLeft aria-hidden className="size-4" /> Back to Inaudio
        </button>
        <h1 className="mx-2.5 mt-3 mb-2 text-xl font-semibold tracking-tight">Settings</h1>
        <div className="relative mb-2">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('');
              const first = results[0];
              if (event.key === 'Enter' && first) {
                openSettings(first.category, first.id);
                setQuery('');
              }
            }}
            placeholder="Search settings"
            aria-label="Search settings"
            maxLength={80}
            className="h-9 w-full rounded-lg bg-surface pr-8 pl-8 text-[13px] text-ink shadow-[0_0_0_1px_var(--line)] outline-none placeholder:text-faint focus:shadow-[0_0_0_2px_var(--accent)] [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear settings search"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-faint hover:text-ink"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <nav aria-label="Settings categories" className="app-scroll-area min-h-0 flex-1 overflow-y-auto px-3">
        {query ? (
          <div className="grid gap-0.5" role="list" aria-label="Search results">
            {results.length ? (
              results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  onClick={() => {
                    openSettings(item.category, item.id);
                    setQuery('');
                  }}
                  className="grid gap-0.5 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="text-sm text-ink">{item.label}</span>
                  <span className="text-xs text-faint">{CATEGORIES[item.category].label}</span>
                </button>
              ))
            ) : (
              <p className="px-2.5 py-2 text-sm text-muted">No settings found.</p>
            )}
          </div>
        ) : (
          CATEGORY_GROUPS.map((group) => (
            <div key={group.label} className="grid gap-0.5 pb-3">
              <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-[0.06em] text-faint uppercase">{group.label}</p>
              {group.items.map(({ id, label, icon: Icon }) => {
                const active = id === category;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => openSettings(id)}
                    className={cn(
                      'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none transition-colors focus-visible:outline-2 focus-visible:outline-accent',
                      active ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line)]' : 'text-muted hover:bg-surface/60 hover:text-ink',
                    )}
                  >
                    <Icon aria-hidden className={cn('size-4 shrink-0', active && 'text-accent')} />
                    <span className="truncate">{label}</span>
                    {id === 'updates' && updatePending && (
                      <span aria-label="Update in progress" className="ml-auto size-2 shrink-0 rounded-full bg-accent" />
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}
