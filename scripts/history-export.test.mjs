import assert from 'node:assert/strict';
import test from 'node:test';
import { exportFileName, exportTranscripts } from '../src/shared/history/export.ts';

const labels = { model: (id) => (id === 'parakeet-tdt-0.6b-v2-int8' ? 'Parakeet TDT 0.6B v2' : id) };
const item = (over = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  text: 'Okay, so for the release on Thursday we still need the Linux packages signed.',
  modelId: 'parakeet-tdt-0.6b-v2-int8',
  durationMs: 2_460_000,
  inferenceMs: 1,
  language: 'en',
  createdAt: Date.UTC(2026, 9, 18, 10, 2),
  source: 'system',
  title: '',
  pinned: false,
  ...over,
});

test('plain text has a title line, a details line and the text', () => {
  const out = exportTranscripts([item({ title: 'Release planning call' })], 'txt', labels);
  assert.equal(out, 'Release planning call\nSystem audio · 2026-10-18 10:02 UTC · 41 min 0 s · Parakeet TDT 0.6B v2\n\nOkay, so for the release on Thursday we still need the Linux packages signed.\n');
});

test('markdown keeps transcript lines from turning into headings or lists', () => {
  const out = exportTranscripts([item({ text: '# not a heading\n- not a list\n1. not numbered', title: 'A # title' })], 'md', labels);
  assert.ok(out.startsWith('## A   title\n'));
  assert.ok(out.includes('\\# not a heading\n\\- not a list\n1\\. not numbered'));
});

test('json carries every field and parses back', () => {
  const parsed = JSON.parse(exportTranscripts([item({ pinned: true })], 'json', labels));
  assert.equal(parsed.app, 'Inaudio');
  assert.equal(parsed.transcripts.length, 1);
  assert.equal(parsed.transcripts[0].source, 'system');
  assert.equal(parsed.transcripts[0].pinned, true);
  assert.equal(parsed.transcripts[0].createdAt, '2026-10-18T10:02:00.000Z');
});

test('suggested file names are safe and carry the format', () => {
  assert.equal(exportFileName([item({ title: 'Q3: plan/review <final>?' })], 'md'), 'Q3 plan review final.md');
  assert.equal(exportFileName([item({ title: '...' })], 'txt'), 'Inaudio transcript.txt');
  assert.match(exportFileName([item(), item()], 'json'), /^Inaudio transcripts \d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(exportFileName([item({ title: '' })], 'txt'), 'Okay, so for the release on Thursday we still need the.txt');
});
