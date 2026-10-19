/**
 * Schema history for the transcript database, applied in order and tracked by PRAGMA user_version.
 * No imports, so the script tests can run these against a real SQLite database.
 */
export const MIGRATIONS = [
  `CREATE TABLE transcripts (
     id TEXT PRIMARY KEY,
     text TEXT NOT NULL CHECK (length(text) <= 20000),
     model_id TEXT NOT NULL,
     duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
     inference_ms INTEGER NOT NULL CHECK (inference_ms >= 0),
     language TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX transcripts_created_at ON transcripts (created_at DESC);
   CREATE VIRTUAL TABLE transcripts_fts USING fts5(text, content='transcripts', content_rowid='rowid');
   CREATE TRIGGER transcripts_ai AFTER INSERT ON transcripts BEGIN
     INSERT INTO transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
   END;
   CREATE TRIGGER transcripts_ad AFTER DELETE ON transcripts BEGIN
     INSERT INTO transcripts_fts(transcripts_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
   END;`,
  // Live transcripts: a source column and room for a long session. STRICT tables cannot alter
  // a CHECK, so the table is rebuilt with rowids kept and the full-text index rebuilt over it.
  `CREATE TABLE transcripts_v2 (
     id TEXT PRIMARY KEY,
     text TEXT NOT NULL CHECK (length(text) <= 200000),
     model_id TEXT NOT NULL,
     duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
     inference_ms INTEGER NOT NULL CHECK (inference_ms >= 0),
     language TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     source TEXT NOT NULL DEFAULT 'microphone' CHECK (source IN ('microphone', 'system', 'system+mic'))
   ) STRICT;
   INSERT INTO transcripts_v2 (rowid, id, text, model_id, duration_ms, inference_ms, language, created_at)
     SELECT rowid, id, text, model_id, duration_ms, inference_ms, language, created_at FROM transcripts;
   DROP TRIGGER transcripts_ai;
   DROP TRIGGER transcripts_ad;
   DROP TABLE transcripts_fts;
   DROP TABLE transcripts;
   ALTER TABLE transcripts_v2 RENAME TO transcripts;
   CREATE INDEX transcripts_created_at ON transcripts (created_at DESC);
   CREATE VIRTUAL TABLE transcripts_fts USING fts5(text, content='transcripts', content_rowid='rowid');
   INSERT INTO transcripts_fts(transcripts_fts) VALUES ('rebuild');
   CREATE TRIGGER transcripts_ai AFTER INSERT ON transcripts BEGIN
     INSERT INTO transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
   END;
   CREATE TRIGGER transcripts_ad AFTER DELETE ON transcripts BEGIN
     INSERT INTO transcripts_fts(transcripts_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
   END;`,
  // The "Audio device" live source. Same rebuild as version 2, with the source CHECK widened.
  `CREATE TABLE transcripts_v3 (
     id TEXT PRIMARY KEY,
     text TEXT NOT NULL CHECK (length(text) <= 200000),
     model_id TEXT NOT NULL,
     duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
     inference_ms INTEGER NOT NULL CHECK (inference_ms >= 0),
     language TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     source TEXT NOT NULL DEFAULT 'microphone' CHECK (source IN ('microphone', 'system', 'system+mic', 'device'))
   ) STRICT;
   INSERT INTO transcripts_v3 (rowid, id, text, model_id, duration_ms, inference_ms, language, created_at, source)
     SELECT rowid, id, text, model_id, duration_ms, inference_ms, language, created_at, source FROM transcripts;
   DROP TRIGGER transcripts_ai;
   DROP TRIGGER transcripts_ad;
   DROP TABLE transcripts_fts;
   DROP TABLE transcripts;
   ALTER TABLE transcripts_v3 RENAME TO transcripts;
   CREATE INDEX transcripts_created_at ON transcripts (created_at DESC);
   CREATE VIRTUAL TABLE transcripts_fts USING fts5(text, content='transcripts', content_rowid='rowid');
   INSERT INTO transcripts_fts(transcripts_fts) VALUES ('rebuild');
   CREATE TRIGGER transcripts_ai AFTER INSERT ON transcripts BEGIN
     INSERT INTO transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
   END;
   CREATE TRIGGER transcripts_ad AFTER DELETE ON transcripts BEGIN
     INSERT INTO transcripts_fts(transcripts_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
   END;`,
  // A title the user can give a transcript, and pinning. Added columns keep every row.
  `ALTER TABLE transcripts ADD COLUMN title TEXT NOT NULL DEFAULT '' CHECK (length(title) <= 120);
   ALTER TABLE transcripts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1));
   CREATE INDEX transcripts_pinned ON transcripts (pinned, created_at DESC);`,
];
