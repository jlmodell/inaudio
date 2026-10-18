import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { MIGRATIONS } from '../src/main/services/history-migrations.ts';

function migrate(db, upTo) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  db.exec('BEGIN IMMEDIATE');
  for (const sql of MIGRATIONS.slice(version, upTo)) db.exec(sql);
  db.exec(`PRAGMA user_version = ${upTo}`);
  db.exec('COMMIT');
}

const search = (db, word) =>
  db.prepare("SELECT t.id FROM transcripts_fts f JOIN transcripts t ON t.rowid = f.rowid WHERE transcripts_fts MATCH ?").all(`"${word}"*`).map((r) => r.id);

test('version 2 keeps existing rows, marks them as microphone, and keeps search working', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db, 1);
  db.prepare(
    `INSERT INTO transcripts (id, text, model_id, duration_ms, inference_ms, language, created_at)
     VALUES ('a', 'send the draft to Sam', 'parakeet-tdt-0.6b-v2-int8', 1200, 300, 'en', 1)`,
  ).run();
  migrate(db, 2);

  const row = db.prepare('SELECT * FROM transcripts WHERE id = ?').get('a');
  assert.equal(row.source, 'microphone');
  assert.equal(row.text, 'send the draft to Sam');
  assert.deepEqual(search(db, 'draft'), ['a']);

  // New rows are indexed, and deletes leave the index, through the recreated triggers.
  db.prepare(
    `INSERT INTO transcripts (id, text, model_id, duration_ms, inference_ms, language, created_at, source)
     VALUES ('b', 'release on thursday', 'parakeet-tdt-0.6b-v2-int8', 60000, 4000, 'en', 2, 'system')`,
  ).run();
  assert.deepEqual(search(db, 'thursday'), ['b']);
  db.prepare('DELETE FROM transcripts WHERE id = ?').run('a');
  assert.deepEqual(search(db, 'draft'), []);
});

test('version 2 holds a long session and refuses an unknown source', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db, MIGRATIONS.length);
  const insert = db.prepare(
    `INSERT INTO transcripts (id, text, model_id, duration_ms, inference_ms, language, created_at, source)
     VALUES (?, ?, 'parakeet-tdt-0.6b-v2-int8', 0, 0, '', 1, ?)`,
  );
  insert.run('long', 'x'.repeat(150_000), 'system+mic');
  assert.throws(() => insert.run('too-long', 'x'.repeat(200_001), 'system'));
  assert.throws(() => insert.run('bad', 'hello', 'camera'));
});
