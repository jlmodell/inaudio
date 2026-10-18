import fs from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import {
  historyQuerySchema,
  transcriptSchema,
  type HistoryPage,
  type HistoryQuery,
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
  });
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
    page: StatementSync;
    count: StatementSync;
    search: StatementSync;
    searchCount: StatementSync;
  } | null;

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
      page: this.db.prepare('SELECT * FROM transcripts ORDER BY created_at DESC LIMIT ? OFFSET ?'),
      count: this.db.prepare('SELECT count(*) AS n FROM transcripts'),
      search: this.db.prepare(
        `SELECT t.* FROM transcripts_fts f JOIN transcripts t ON t.rowid = f.rowid
         WHERE transcripts_fts MATCH ? ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      ),
      searchCount: this.db.prepare(
        'SELECT count(*) AS n FROM transcripts_fts WHERE transcripts_fts MATCH ?',
      ),
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
    const { search, limit, offset } = historyQuerySchema.parse(query);
    if (!this.db || !this.stmts) {
      const normalized = search.trim().toLocaleLowerCase();
      const filtered = normalized
        ? this.jsonItems.filter((item) => item.text.toLocaleLowerCase().includes(normalized))
        : this.jsonItems;
      const items = [...filtered]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(offset, offset + limit);
      return { items, total: filtered.length };
    }
    const fts = toFtsQuery(search);
    if (!fts) {
      return {
        items: this.stmts.page.all(limit, offset).map(toTranscript),
        total: this.readCount(this.stmts.count),
      };
    }
    return {
      items: this.stmts.search.all(fts, limit, offset).map(toTranscript),
      total: this.readCount(this.stmts.searchCount, fts),
    };
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
