import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { exportSessionMarkdown } from './markdown.js';
import type { CanonicalSession } from '../model/session.js';

const session: CanonicalSession = {
  id: 'claude:test',
  source: 'claude',
  sourceSessionId: 'test',
  sourcePath: '/tmp/source.jsonl',
  projectPath: '/tmp/project',
  title: 'Test Session',
  summary: 'Test Session',
  createdAt: '2026-05-12T00:00:00.000Z',
  updatedAt: '2026-05-12T00:00:00.000Z',
  git: { branch: 'main' },
  archived: false,
  tags: [],
  attachments: [],
  toolCalls: [],
  metadata: {},
  messages: [
    { id: '1', role: 'user', text: 'hello' },
    { id: '2', role: 'assistant', text: 'world' },
  ],
};

test('exportSessionMarkdown creates parent directories and writes markdown', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'asm-md-'));
  const output = path.join(dir, 'nested', 'session.md');

  await exportSessionMarkdown(session, output);

  const content = await readFile(output, 'utf8');
  assert.match(content, /# Test Session/);
  assert.match(content, /### user/);
  assert.match(content, /hello/);
  assert.match(content, /world/);
});
