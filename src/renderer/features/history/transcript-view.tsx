import { Copy, Download, Pin } from 'lucide-react';
import { MODEL_CATALOG, type ModelId } from '@shared/domain/models';
import { transcriptTitle, wordCount, type Transcript } from '@shared/domain/history';
import { Button } from '@renderer/components/ui/button';
import { Badge } from '@renderer/components/ui/layout';
import { ReadAloudButton } from '@renderer/features/read-aloud/read-aloud-controls';
import { ActionMenu, MenuItem } from '@renderer/components/ui/menu';
import { cn } from '@renderer/lib/cn';
import { formatDuration, formatWhen } from '@renderer/lib/format';
import { EXPORT_OPTIONS, SOURCE_LABEL, TranscriptMenu, type TranscriptActions } from './transcript-actions';

/** A saved transcript in full: what it is, what can be done with it, and its text. */
export function TranscriptView({ item, actions }: { item: Transcript; actions: TranscriptActions }) {
  const words = wordCount(item.text);
  const paragraphs = item.text.split(/\n{2,}/);
  return (
    <div className="grid gap-5 px-5 py-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={item.source === 'microphone' ? 'neutral' : 'accent'}>{SOURCE_LABEL[item.source]}</Badge>
        <Badge>{formatWhen(item.createdAt)}</Badge>
        <Badge>{formatDuration(item.durationMs)}</Badge>
        <Badge>
          {words.toLocaleString()} {words === 1 ? 'word' : 'words'}
        </Badge>
        <Badge>{MODEL_CATALOG[item.modelId as ModelId]?.name ?? item.modelId}</Badge>
        {item.language && <Badge>{item.language.toUpperCase()}</Badge>}
      </div>
      <div className="flex items-center gap-1.5">
        <ReadAloudButton variant="button" id={item.id} title={transcriptTitle(item)} text={item.text} />
        <Button size="sm" onClick={() => actions.copy(item)}>
          <Copy /> Copy
        </Button>
        <ActionMenu
          label="Export as"
          align="start"
          trigger={
            <>
              <Download aria-hidden className="size-4" /> Export
            </>
          }
          triggerClassName="flex h-8 w-auto items-center gap-1.5 bg-sunken px-3 text-sm font-medium text-ink hover:bg-line"
        >
          {EXPORT_OPTIONS.map((option) => (
            <MenuItem key={option.format} onSelect={() => actions.exportAs(item, option.format)} tail={`.${option.format}`}>
              {option.label}
            </MenuItem>
          ))}
        </ActionMenu>
        <Button
          size="sm"
          aria-pressed={item.pinned}
          className={cn(item.pinned && 'bg-accent-soft text-accent hover:bg-accent-soft')}
          onClick={() => actions.togglePin(item)}
        >
          <Pin /> {item.pinned ? 'Pinned' : 'Pin'}
        </Button>
        <span className="flex-1" />
        <TranscriptMenu item={item} actions={actions} />
      </div>
      <div data-selectable className="grid gap-4 text-base leading-relaxed break-words">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="m-0 whitespace-pre-wrap">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
