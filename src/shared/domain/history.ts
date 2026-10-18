import { z } from 'zod';
import { transcriptSourceSchema } from './capture';
import { modelIdSchema } from './models';

/** One dictation take. */
export const MAX_TRANSCRIPT_CHARS = 20_000;
/** One live session, which can run for hours. History rows are capped at this. */
export const MAX_SESSION_TRANSCRIPT_CHARS = 200_000;

export const transcriptSchema = z.object({
  id: z.string().uuid(),
  text: z.string().max(MAX_SESSION_TRANSCRIPT_CHARS),
  modelId: modelIdSchema,
  durationMs: z.number().int().nonnegative(),
  inferenceMs: z.number().int().nonnegative(),
  language: z.string().max(16),
  createdAt: z.number().int().positive(),
  source: transcriptSourceSchema.default('microphone'),
});
export type Transcript = z.infer<typeof transcriptSchema>;

export const historyQuerySchema = z.object({
  search: z.string().max(200).default(''),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});
export type HistoryQuery = z.input<typeof historyQuerySchema>;

export interface HistoryPage {
  items: Transcript[];
  total: number;
}
