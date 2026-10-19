import { z } from 'zod';
import { transcriptSourceSchema } from './capture';
import { modelIdSchema } from './models';

/** One dictation take. */
export const MAX_TRANSCRIPT_CHARS = 20_000;
/** One live session, which can run for hours. History rows are capped at this. */
export const MAX_SESSION_TRANSCRIPT_CHARS = 200_000;
/** A title the user gives a transcript. Empty means the first words stand in for it. */
export const MAX_TITLE_CHARS = 120;
/** At most this many transcripts are written to one export file. */
export const MAX_EXPORT_ITEMS = 1_000;

export const transcriptSchema = z.object({
  id: z.string().uuid(),
  text: z.string().max(MAX_SESSION_TRANSCRIPT_CHARS),
  modelId: modelIdSchema,
  durationMs: z.number().int().nonnegative(),
  inferenceMs: z.number().int().nonnegative(),
  language: z.string().max(16),
  createdAt: z.number().int().positive(),
  source: transcriptSourceSchema.default('microphone'),
  title: z.string().max(MAX_TITLE_CHARS).default(''),
  pinned: z.boolean().default(false),
});
export type Transcript = z.infer<typeof transcriptSchema>;

/** Which transcripts a History view shows. */
export const HISTORY_KINDS = ['all', 'dictation', 'live'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

export const historyQuerySchema = z.object({
  search: z.string().max(200).default(''),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
  kind: z.enum(HISTORY_KINDS).default('all'),
  pinnedOnly: z.boolean().default(false),
});
export type HistoryQuery = z.input<typeof historyQuerySchema>;

export interface HistoryPage {
  items: Transcript[];
  total: number;
}

/** What a user may change on a saved transcript. The text itself is never edited. */
export const historyUpdateSchema = z
  .object({
    title: z.string().trim().max(MAX_TITLE_CHARS).optional(),
    pinned: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => patch.title !== undefined || patch.pinned !== undefined, 'Nothing to change');
export type HistoryUpdate = z.infer<typeof historyUpdateSchema>;

export const EXPORT_FORMATS = ['txt', 'md', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The words a transcript is known by: its title, or the start of its text. */
export function transcriptTitle(item: Pick<Transcript, 'title' | 'text'>, max = 60): string {
  if (item.title) return item.title;
  const first = item.text.replace(/\s+/g, ' ').trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[,.;:]$/, '')}…`;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
