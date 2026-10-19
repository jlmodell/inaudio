import fs from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import {
  historyQuerySchema,
  historyUpdateSchema,
  MAX_EXPORT_ITEMS,
  transcriptSchema,
  type HistoryKind,
  type HistoryPage,
  type HistoryQuery,
  type HistoryUpdate,
  type Transcript,
} from '@shared/domain/history';
import { MIGRATIONS } from './history-migrations';

/**
 * Turns free text into an FTS5 prefix query. Each token is quoted, so user
 * input can never be read as FTS operators or SQL.
 */
export function toFtsQuery(search: string): string | null {
  const tokens = search
    .normalize('NFKC')
    .split(/\s+/)
    .map((t) => t.replace(/"/g, '').trim())
    .filter(Boolean)
    .slice(0, 12);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"*`).join(' ');
}

function toTranscript(row: Record<string, unknown>): Transcript {
  return transcriptSchema.parse({
    id: row.id,
    text: row.text,
    modelId: row.model_id,
    durationMs: row.duration_ms,
    inferenceMs: row.inference_ms,
    language: row.language,
    createdAt: row.created_at,
    source: row.source,
    title: row.title ?? '',
    pinned: row.pinned === 1,
  });
}

/** `LIKE` treats % and _ as wildcards; a title search means them literally. */
function likeLiteral(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Fixed SQL for each filter. Nothing the user typed is ever part of a statement. */
const KIND_SQL: Record<HistoryKind, string> = {
  all: '1',
  dictation: "t.source = 'microphone'",
  live: "t.source <> 'microphone'",
};

function matchesKind(item: Transcript, kind: HistoryKind): boolean {
  return kind === 'all' || (kind === 'dictation') === (item.source === 'microphone');
}

export class HistoryRepository {
  private readonly db: DatabaseSync | null;
  private readonly jsonFile: string;
  private jsonItems: Transcript[];
  private closed = false;
  private readonly stmts: {
    insert: StatementSync;
    remove: StatementSync;
    clear: StatementSync;
    get: StatementSync;
    setTitle: StatementSync;
    setPinned: StatementSync;
  } | null;
  /** List and count statements, one pair per filter combination, prepared on first use. */
  private readonly lists = new Map<string, { page: StatementSync; count: StatementSync }>();

  constructor(file: string) {
    this.jsonFile = `${file}.json`;
    this.jsonItems = this.readJson();
    // Electron versions can expose node:sqlite without a usable DatabaseSync.
    // Keep history available without preventing the rest of the app from starting.
    if (typeof DatabaseSync !== 'function') {
      this.db = null;
      this.stmts = null;
      return;
    }

    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA secure_delete = ON;
      PRAGMA busy_timeout = 5000;
    `);
    this.migrate();
    this.stmts = {
      insert: this.db.prepare(
        `INSERT INTO transcripts (id, text, model_id, duration_ms, inference_ms, language, created_at, source)
         VALUES (@id, @text, @model_id, @duration_ms, @inference_ms, @language, @created_at, @source)`,
      ),
      remove: this.db.prepare('DELETE FROM transcripts WHERE id = ?'),
      clear: this.db.prepare('DELETE FROM transcripts'),
      get: this.db.prepare('SELECT * FROM transcripts WHERE id = ?'),
      setTitle: this.db.prepare('UPDATE transcripts SET title = ? WHERE id = ?'),
      setPinned: this.db.prepare('UPDATE transcripts SET pinned = ? WHERE id = ?'),
    };
  }

  add(transcript: Transcript): void {
    this.assertOpen();
    const t = transcriptSchema.parse(transcript);
    if (!this.db || !this.stmts) {
      this.jsonItems.push(t);
      this.writeJson();
      return;
    }
    this.stmts.insert.run({
      id: t.id,
      text: t.text,
      model_id: t.modelId,
      duration_ms: t.durationMs,
      inference_ms: t.inferenceMs,
      language: t.language,
      created_at: t.createdAt,
      source: t.source,
    });
  }

  list(query: HistoryQuery): HistoryPage {
    this.assertOpen();
    const { search, limit, offset, kind, pinnedOnly } = historyQuerySchema.parse(query);
    if (!this.db) {
      const normalized = search.trim().toLocaleLowerCase();
      const filtered = this.jsonItems.filter(
        (item) =>
          matchesKind(item, kind) &&
          (!pinnedOnly || item.pinned) &&
          (!normalized ||
            item.text.toLocaleLowerCase().includes(normalized) ||
            item.title.toLocaleLowerCase().includes(normalized)),
      );
      const items = [...filtered]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(offset, offset + limit);
      return { items, total: filtered.length };
    }
    const fts = toFtsQuery(search);
    const statements = this.listStatements(kind, pinnedOnly, fts !== null);
    // A search matches the full-text index or, for renamed transcripts, the title.
    const params: SQLInputValue[] = fts ? [fts, likeLiteral(search.trim())] : [];
    return {
      items: statements.page.all(...params, limit, offset).map(toTranscript),
      total: this.readCount(statements.count, ...params),
    };
  }

  get(id: string): Transcript | null {
    this.assertOpen();
    if (!this.stmts) return this.jsonItems.find((item) => item.id === id) ?? null;
    const row = this.stmts.get.get(id) as Record<string, unknown> | undefined;
    return row ? toTranscript(row) : null;
  }

  /** The transcripts with these ids, newest first; unknown ids are skipped. */
  getMany(ids: readonly string[]): Transcript[] {
    return ids
      .slice(0, MAX_EXPORT_ITEMS)
      .map((id) => this.get(id))
      .filter((item): item is Transcript => item !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Every transcript a view shows, for "Export all", capped at MAX_EXPORT_ITEMS. */
  all(kind: HistoryKind): Transcript[] {
    const items: Transcript[] = [];
    for (let offset = 0; offset < MAX_EXPORT_ITEMS; offset += 500) {
      const page = this.list({ kind, limit: 500, offset }).items;
      items.push(...page);
      if (page.length < 500) break;
    }
    return items.slice(0, MAX_EXPORT_ITEMS);
  }

  update(id: string, patch: HistoryUpdate): Transcript | null {
    this.assertOpen();
    const { title, pinned } = historyUpdateSchema.parse(patch);
    if (!this.db || !this.stmts) {
      const item = this.jsonItems.find((candidate) => candidate.id === id);
      if (!item) return null;
      if (title !== undefined) item.title = title;
      if (pinned !== undefined) item.pinned = pinned;
      this.writeJson();
      return item;
    }
    const { stmts } = this;
    this.transaction(() => {
      if (title !== undefined) stmts.setTitle.run(title, id);
      if (pinned !== undefined) stmts.setPinned.run(pinned ? 1 : 0, id);
    });
    return this.get(id);
  }

  remove(id: string): void {
    this.assertOpen();
    if (!this.db || !this.stmts) {
      const next = this.jsonItems.filter((item) => item.id !== id);
      if (next.length !== this.jsonItems.length) {
        this.jsonItems = next;
        this.writeJson();
      }
      return;
    }
    this.stmts.remove.run(id);
  }

  clear(): void {
    this.assertOpen();
    if (!this.db || !this.stmts) {
      this.jsonItems = [];
      this.writeJson();
      return;
    }
    const { db, stmts } = this;
    this.transaction(() => {
      stmts.clear.run();
      db.exec("INSERT INTO transcripts_fts(transcripts_fts) VALUES ('rebuild')");
    });
    db.exec('VACUUM');
  }

  close(): void {
    if (this.closed) return;
    this.db?.close();
    this.closed = true;
  }

  private migrate(): void {
    if (!this.db) return;
    const row = this.db.prepare('PRAGMA user_version').get() as
      { user_version?: unknown } | undefined;
    const version = row?.user_version;
    if (
      typeof version !== 'number' ||
      !Number.isSafeInteger(version) ||
      version < 0 ||
      version > MIGRATIONS.length
    ) {
      throw new Error('Invalid history database migration version');
    }
    const pending = MIGRATIONS.slice(version);
    if (pending.length === 0) return;
    const db = this.db;
    this.transaction(() => {
      pending.forEach((sql) => db.exec(sql));
      db.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
    });
  }

  private transaction(fn: () => void): void {
    if (!this.db) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch (rollbackError) {
        throw new Error('History database rollback failed', { cause: rollbackError });
      }
      throw error;
    }
  }

  private listStatements(kind: HistoryKind, pinnedOnly: boolean, search: boolean): { page: StatementSync; count: StatementSync } {
    const key = `${kind}|${pinnedOnly}|${search}`;
    const cached = this.lists.get(key);
    if (cached) return cached;
    if (!this.db) throw new Error('History database is not available');
    const where = [
      KIND_SQL[kind],
      pinnedOnly ? 't.pinned = 1' : '1',
      search
        ? "(t.rowid IN (SELECT rowid FROM transcripts_fts WHERE transcripts_fts MATCH ?) OR t.title LIKE ? ESCAPE '\\')"
        : '1',
    ].join(' AND ');
    const statements = {
      page: this.db.prepare(`SELECT t.* FROM transcripts t WHERE ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`),
      count: this.db.prepare(`SELECT count(*) AS n FROM transcripts t WHERE ${where}`),
    };
    this.lists.set(key, statements);
    return statements;
  }

  private readCount(statement: StatementSync, ...params: SQLInputValue[]): number {
    const row = statement.get(...params) as { n?: unknown } | undefined;
    if (!row || typeof row.n !== 'number' || !Number.isSafeInteger(row.n) || row.n < 0) {
      throw new Error('Invalid history database count');
    }
    return row.n;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('History database is closed');
  }

  private readJson(): Transcript[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.jsonFile, 'utf8')) as unknown;
      if (!Array.isArray(raw)) return [];
      return raw.flatMap((item) => {
        const parsed = transcriptSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      });
    } catch {
      return [];
    }
  }

  private writeJson(): void {
    const temporary = `${this.jsonFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.jsonItems), { mode: 0o600 });
    fs.renameSync(temporary, this.jsonFile);
  }
}
