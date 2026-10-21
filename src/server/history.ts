import fs from 'node:fs';
import {
  historyQuerySchema,
  historyUpdateSchema,
  transcriptSchema,
  type HistoryPage,
  type HistoryQuery,
  type HistoryUpdate,
  type Transcript,
} from '@shared/domain/history';

export class JsonHistory {
  private items: Transcript[];
  private closed = false;

  constructor(private readonly file: string) {
    this.items = this.read();
  }

  add(transcript: Transcript): void {
    this.assertOpen();
    this.items.push(transcriptSchema.parse(transcript));
    this.write();
  }

  list(query: HistoryQuery): HistoryPage {
    this.assertOpen();
    const { search, limit, offset, kind, pinnedOnly } = historyQuerySchema.parse(query);
    const needle = search.trim().toLocaleLowerCase();
    const filtered = this.items.filter((item) => {
      const dictation = item.source === 'microphone';
      if (kind === 'dictation' && !dictation) return false;
      if (kind === 'live' && dictation) return false;
      if (pinnedOnly && !item.pinned) return false;
      if (!needle) return true;
      return (
        item.text.toLocaleLowerCase().includes(needle) ||
        item.title.toLocaleLowerCase().includes(needle)
      );
    });
    const items = [...filtered]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(offset, offset + limit);
    return { items, total: filtered.length };
  }

  get(id: string): Transcript | null {
    this.assertOpen();
    return this.items.find((item) => item.id === id) ?? null;
  }

  update(id: string, patch: HistoryUpdate): Transcript | null {
    this.assertOpen();
    const { title, pinned } = historyUpdateSchema.parse(patch);
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) return null;
    if (title !== undefined) item.title = title;
    if (pinned !== undefined) item.pinned = pinned;
    this.write();
    return item;
  }

  remove(id: string): void {
    this.assertOpen();
    const next = this.items.filter((item) => item.id !== id);
    if (next.length !== this.items.length) {
      this.items = next;
      this.write();
    }
  }

  clear(): void {
    this.assertOpen();
    this.items = [];
    this.write();
  }

  close(): void {
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('History is closed');
  }

  private read(): Transcript[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as unknown;
      if (!Array.isArray(raw)) return [];
      return raw.flatMap((item) => {
        const parsed = transcriptSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      });
    } catch {
      return [];
    }
  }

  private write(): void {
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.items), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }
}
