import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { CanonicalSession, SourceFingerprint } from '../model/session.js';
import { SessionRepository } from './repo.js';

test('setPinned keeps pinned sessions at the top until unpinned', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'asm-repo-'));
  const repo = new SessionRepository(path.join(dir, 'index.sqlite'));
  try {
    repo.upsertSession(makeSession('claude:first', 'First', '2026-05-12T00:00:00.000Z'), makeFingerprint('/tmp/first.jsonl'));
    repo.upsertSession(makeSession('claude:second', 'Second', '2026-05-13T00:00:00.000Z'), makeFingerprint('/tmp/second.jsonl'));

    assert.deepEqual(repo.listSessions().map(session => session.id), ['claude:second', 'claude:first']);

    assert.equal(repo.setPinned('claude:first', true), true);
    const pinned = repo.listSessions();
    assert.deepEqual(pinned.map(session => session.id), ['claude:first', 'claude:second']);
    assert.ok(pinned[0]?.pinnedAt);

    assert.equal(repo.setPinned('claude:first', false), true);
    assert.deepEqual(repo.listSessions().map(session => session.id), ['claude:second', 'claude:first']);
  } finally {
    repo.close();
  }
});

function makeSession(id: string, title: string, updatedAt: string): CanonicalSession {
  return {
    id,
    source: 'claude',
    sourceSessionId: id.replace('claude:', ''),
    sourcePath: `/tmp/${title.toLowerCase()}.jsonl`,
    projectPath: '/tmp/project',
    title,
    summary: title,
    createdAt: updatedAt,
    updatedAt,
    git: { branch: 'main' },
    archived: false,
    tags: [],
    attachments: [],
    metadata: {},
    toolCalls: [],
    messages: [
      { id: `${id}:message`, role: 'user', text: title, timestamp: updatedAt },
    ],
  };
}

function makeFingerprint(sourcePath: string): SourceFingerprint {
  return {
    sourcePath,
    size: 1,
    mtimeMs: 1,
    quickHash: sourcePath,
  };
}
