/**
 * Turns saved transcripts into an export file. The main process writes the result to a
 * path the user picked in the native save dialog; nothing here touches the disk. Only type
 * imports, so the script tests can load this file directly.
 */
import type { ExportFormat, Transcript } from '../domain/history';

export interface ExportLabels {
  /** Display name for each model id, e.g. "Parakeet TDT 0.6B v2". */
  model(id: string): string;
}

const SOURCE: Record<Transcript['source'], string> = {
  microphone: 'Dictation',
  system: 'System audio',
  'system+mic': 'System + microphone',
  device: 'Audio device',
};

function title(item: Transcript): string {
  if (item.title) return item.title;
  const words = item.text.replace(/\s+/g, ' ').trim();
  return words.length > 60 ? `${words.slice(0, 60).replace(/\s+\S*$/, '')}…` : words;
}

function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h} h ${m} min` : m ? `${m} min ${s} s` : `${s} s`;
}

/** ISO date and time in UTC, so the file reads the same on every computer. */
function when(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** Markdown would read a leading #, >, - or 1. as structure; this keeps text as text. */
function markdownText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^(\s*)([#>*+-])(\s)/, '$1\\$2$3').replace(/^(\s*)(\d+)([.)])(\s)/, '$1$2\\$3$4'))
    .join('\n');
}

export function exportTranscripts(items: readonly Transcript[], format: ExportFormat, labels: ExportLabels): string {
  if (format === 'json') {
    return `${JSON.stringify(
      {
        app: 'Inaudio',
        exportedAt: new Date().toISOString(),
        transcripts: items.map((item) => ({
          id: item.id,
          title: item.title,
          text: item.text,
          source: item.source,
          model: item.modelId,
          language: item.language,
          createdAt: new Date(item.createdAt).toISOString(),
          durationMs: item.durationMs,
          pinned: item.pinned,
        })),
      },
      null,
      2,
    )}\n`;
  }
  if (format === 'md') {
    return `${items
      .map((item) => {
        const meta = [SOURCE[item.source], when(item.createdAt), duration(item.durationMs), labels.model(item.modelId)].join(' · ');
        return `## ${title(item).replace(/[\r\n#]/g, ' ').trim()}\n\n_${meta}_\n\n${markdownText(item.text)}\n`;
      })
      .join('\n')}`;
  }
  return `${items
    .map((item) => {
      const meta = [SOURCE[item.source], when(item.createdAt), duration(item.durationMs), labels.model(item.modelId)].join(' · ');
      return `${title(item)}\n${meta}\n\n${item.text}\n`;
    })
    .join('\n----------------------------------------\n\n')}`;
}

/** A file name the save dialog suggests: no path separators or reserved characters. */
export function exportFileName(items: readonly Transcript[], format: ExportFormat): string {
  const first = items[0];
  const base =
    items.length === 1 && first
      ? title(first).replace(/…$/, '')
      : `Inaudio transcripts ${new Date().toISOString().slice(0, 10)}`;
  const safe = base
    .replace(/[<>:"/\\|?*]/g, ' ')
    // Control characters are never valid in a file name.
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, '');
  return `${safe || 'Inaudio transcript'}.${format}`;
}
