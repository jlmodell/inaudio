import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CleanupModelsStatus } from '@shared/domain/system';
import type { Settings } from '@shared/domain/settings';
import { MAX_REPLACEMENT_CHARS, MAX_REPLACEMENTS, type Replacement } from '@shared/text/replacements';
import { Button } from '@renderer/components/ui/button';
import { Row } from '@renderer/components/ui/layout';
import { Switch } from '@renderer/components/ui/switch';

/** The rows worth saving: something to find, trimmed, within the limits. */
function clean(rows: Replacement[]): Replacement[] {
  return rows
    .map((row) => ({ from: row.from.trim(), to: row.to }))
    .filter((row) => row.from.length > 0)
    .slice(0, MAX_REPLACEMENTS);
}

/**
 * The custom words list. Edits stay local while typing and are saved when a field loses
 * focus or a row is added or removed, so settings are not rewritten on every keystroke.
 */
function CustomWords({ value, onChange }: { value: Replacement[]; onChange(next: Replacement[]): void }) {
  const [rows, setRows] = useState<Replacement[]>(value);
  useEffect(() => setRows(value), [value]);
  const commit = (next: Replacement[]) => {
    const saved = clean(next);
    if (JSON.stringify(saved) !== JSON.stringify(value)) onChange(saved);
  };
  const set = (index: number, patch: Partial<Replacement>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div id="settings-custom-words" className="grid scroll-mt-6 gap-2.5 py-3">
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">Custom words</p>
        <p className="text-sm text-muted">
          Fix names and terms the engine mishears. Applied to dictation and live transcripts, whole words only, on this computer.
        </p>
      </div>
      {rows.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_32px] items-center gap-2 text-xs text-faint">
          <span>Heard</span>
          <span />
          <span>Write as</span>
          <span />
        </div>
      )}
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_32px] items-center gap-2">
          <input
            aria-label={`Heard, row ${index + 1}`}
            value={row.from}
            maxLength={MAX_REPLACEMENT_CHARS}
            placeholder="in audio"
            onChange={(event) => set(index, { from: event.target.value })}
            onBlur={() => commit(rows)}
            className="h-9 rounded-[6px] bg-sunken px-2.5 text-sm text-ink outline-none placeholder:text-faint focus:shadow-[0_0_0_2px_var(--accent)]"
          />
          <span aria-hidden className="text-center text-faint">
            →
          </span>
          <input
            aria-label={`Write as, row ${index + 1}`}
            value={row.to}
            maxLength={MAX_REPLACEMENT_CHARS}
            placeholder="Inaudio"
            onChange={(event) => set(index, { to: event.target.value })}
            onBlur={() => commit(rows)}
            className="h-9 rounded-[6px] bg-sunken px-2.5 text-sm text-ink outline-none placeholder:text-faint focus:shadow-[0_0_0_2px_var(--accent)]"
          />
          <button
            type="button"
            aria-label={`Remove row ${index + 1}`}
            onClick={() => {
              const next = rows.filter((_, i) => i !== index);
              setRows(next);
              commit(next);
            }}
            className="grid size-8 place-items-center rounded-[6px] text-muted hover:bg-sunken hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={rows.length >= MAX_REPLACEMENTS} onClick={() => setRows((current) => [...current, { from: '', to: '' }])}>
          <Plus /> Add word
        </Button>
        <span className="text-xs text-faint">
          {clean(rows).length} of {MAX_REPLACEMENTS}
        </span>
      </div>
    </div>
  );
}

/** How finished text is cleaned up: joining live passages, punctuation, custom words. */
export function TranscriptQualitySettings({
  live,
  stt,
  models,
  onLive,
  onStt,
}: {
  live: Settings['live'];
  stt: Settings['stt'];
  models: CleanupModelsStatus;
  onLive(patch: Partial<Settings['live']>): void;
  onStt(patch: Partial<Settings['stt']>): void;
}) {
  const punctReady = models.punct !== 'missing';
  return (
    <>
      <Row
        id="settings-smart-join"
        label="Join live passages into sentences"
        description="Removes the false full stops where audio was split mid-sentence, drops words repeated at the seams, and starts a new paragraph only after a real pause."
      >
        <Switch aria-label="Join live passages into sentences" checked={live.smartJoin} onCheckedChange={(smartJoin) => onLive({ smartJoin })} />
      </Row>
      <Row
        id="settings-restore-punctuation"
        label="Restore punctuation and capitals"
        description={
          punctReady
            ? 'Re-punctuates each new live passage together with the sentence it continues, using a small bundled English model. English only.'
            : 'The punctuation model is missing or damaged. Reinstall Inaudio to restore it.'
        }
      >
        <Switch
          aria-label="Restore punctuation and capitals"
          disabled={!punctReady}
          checked={punctReady && live.restorePunctuation}
          onCheckedChange={(restorePunctuation) => onLive({ restorePunctuation })}
        />
      </Row>
      <CustomWords value={stt.replacements} onChange={(replacements) => onStt({ replacements })} />
    </>
  );
}
