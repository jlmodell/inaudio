import type { ReadAloudRuntime, SentenceTiming } from '@shared/web/read-aloud-engine';
import { readAloudRuntimeLabel, sentenceRealtimeFactor } from '@shared/web/read-aloud-engine';

export interface ReadAloudDiag {
  runtime: ReadAloudRuntime | null;
  isolated: boolean;
  threads: number;
  buffer: number;
  timings: SentenceTiming[];
}

const KEY = 'inaudio.web.readAloudDiag';

function isolatedNow(): boolean {
  return typeof globalThis !== 'undefined' && globalThis.crossOriginIsolated === true;
}

function empty(): ReadAloudDiag {
  return { runtime: null, isolated: isolatedNow(), threads: 0, buffer: 3, timings: [] };
}

function readStored(): ReadAloudDiag {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<ReadAloudDiag>;
    return {
      ...empty(),
      runtime: parsed.runtime ?? null,
      threads: parsed.threads ?? 0,
      buffer: parsed.buffer ?? 3,
      timings: Array.isArray(parsed.timings) ? parsed.timings : [],
    };
  } catch {
    return empty();
  }
}

let current = readStored();
const listeners = new Set<(value: ReadAloudDiag) => void>();

export function readAloudDiag(): ReadAloudDiag {
  return { ...current, isolated: isolatedNow(), timings: current.timings.slice() };
}

export function writeAloudDiag(patch: Partial<ReadAloudDiag>): ReadAloudDiag {
  current = { ...current, ...patch, isolated: isolatedNow(), timings: patch.timings ?? current.timings };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode */
  }
  const snapshot = readAloudDiag();
  for (const listener of listeners) listener(snapshot);
  return snapshot;
}

export function subscribeAloudDiag(listener: (value: ReadAloudDiag) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function formatSentenceTiming(timing: SentenceTiming): string {
  const audio = (timing.durationMs / 1000).toFixed(1);
  const generate = (timing.generateMs / 1000).toFixed(1);
  const factor = sentenceRealtimeFactor(timing);
  return `${audio}s audio in ${generate}s (${factor ? `${factor.toFixed(1)}×` : '—'})`;
}

export function formatReadAloudDiag(diag: ReadAloudDiag): string {
  const isolated = diag.isolated ? 'isolated' : 'not isolated';
  const engine = diag.runtime ? readAloudRuntimeLabel(diag.runtime) : 'not started';
  const last = diag.timings.at(-1);
  const timing = last ? ` Last sentence: ${formatSentenceTiming(last)}.` : '';
  return `Voice: ${engine}. Page is ${isolated}${diag.threads ? `, ${diag.threads} thread${diag.threads === 1 ? '' : 's'}` : ''}. Buffer ${diag.buffer}.${timing}`;
}
