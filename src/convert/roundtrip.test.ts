import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { CanonicalSession } from '../model/session.js';
import { materializeCodexSession } from './claude-to-codex.js';
import { materializeClaudeSession } from './codex-to-claude.js';
import { detectJsonlSource } from '../utils/detect.js';

const session: CanonicalSession = {
  id: 'claude:test',
  source: 'claude',
  sourceSessionId: '95380947-517d-42fb-a9f7-f16e57d84815',
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
  metadata: { version: 'test', model: 'imported' },
  toolCalls: [
    { id: 'call-1', name: 'Read', input: { file_path: '/tmp/a.ts' }, messageId: '2' },
  ],
  messages: [
    { id: '1', role: 'user', text: 'hello' },
    { id: '2', role: 'assistant', text: 'I will read a file' },
    { id: '3', role: 'tool', text: 'file contents', toolResult: 'file contents', metadata: { callId: 'call-1', isError: false } },
  ],
};

test('materializeCodexSession writes rollout and session index', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'asm-codex-'));
  const result = await materializeCodexSession(session, dir);

  const source = await detectJsonlSource(result.sessionFile);
  assert.equal(source, 'codex');

  const sessionIndex = await readFile(path.join(dir, 'session_index.jsonl'), 'utf8');
  assert.match(sessionIndex, /thread_name/);
});

test('materializeClaudeSession writes transcript and history', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'asm-claude-'));
  const result = await materializeClaudeSession(session, dir);

  const source = await detectJsonlSource(result.sessionFile);
  assert.equal(source, 'claude');

  const history = await readFile(path.join(dir, 'history.jsonl'), 'utf8');
  assert.match(history, /sessionId/);

  const transcript = await readFile(result.sessionFile, 'utf8');
  assert.match(transcript, /tool_result/);
});
