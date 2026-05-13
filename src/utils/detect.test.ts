import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectJsonlSource } from './detect.js';

test('detectJsonlSource detects Claude transcript files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'asm-detect-claude-'));
  const file = path.join(dir, 'session.jsonl');
  await writeFile(file, `${JSON.stringify({ type: 'user', sessionId: 'abc', cwd: '/tmp', message: { content: 'hello' } })}\n`, 'utf8');

  const source = await detectJsonlSource(file);
  assert.equal(source, 'claude');
});

test('detectJsonlSource detects Codex rollout files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'asm-detect-codex-'));
  const file = path.join(dir, 'rollout.jsonl');
  await writeFile(file, `${JSON.stringify({ type: 'session_meta', payload: { id: 'abc' } })}\n`, 'utf8');

  const source = await detectJsonlSource(file);
  assert.equal(source, 'codex');
});
