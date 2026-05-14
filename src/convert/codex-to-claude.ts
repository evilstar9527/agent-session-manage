import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CanonicalSession } from '../model/session.js';
import { pathToClaudeProjectBucket } from '../utils/paths.js';

export interface ClaudeMaterialization {
  sessionFile: string;
  sessionId: string;
  historyFile?: string;
}

export async function materializeClaudeSession(session: CanonicalSession, outputPath: string): Promise<ClaudeMaterialization> {
  const targetSessionId = session.source === 'claude' ? normalizeClaudeSessionId(session.sourceSessionId) : randomUUID();
  const target = outputPath.endsWith('.jsonl')
    ? { sessionFile: outputPath }
    : {
        sessionFile: path.join(
          outputPath,
          'projects',
          pathToClaudeProjectBucket(session.projectPath || '.'),
          `${targetSessionId}.jsonl`,
        ),
        historyFile: path.join(outputPath, 'history.jsonl'),
      };

  await mkdir(path.dirname(target.sessionFile), { recursive: true });

  const lines: string[] = [];
  const permissionMode = 'default';
  const startedAt = session.createdAt || new Date().toISOString();
  let previousUuid: string | null = null;
  let sawUserMessage = false;

  lines.push(JSON.stringify({
    type: 'permission-mode',
    permissionMode,
    sessionId: targetSessionId,
  }));

  for (const message of session.messages) {
    if (message.role === 'system' || message.role === 'tool') {
      continue;
    }

    const text = (message.text || '').trim();
    if (!text) {
      continue;
    }

    const uuid = randomUUID();
    const timestamp = message.timestamp || new Date().toISOString();

    if (!sawUserMessage && message.role !== 'user') {
      continue;
    }

    if (message.role === 'user') {
      if (!sawUserMessage) {
        lines.push(JSON.stringify({
          type: 'file-history-snapshot',
          messageId: uuid,
          snapshot: {
            messageId: uuid,
            trackedFileBackups: {},
            timestamp,
          },
          isSnapshotUpdate: false,
        }));
      }

      const line = {
        parentUuid: previousUuid,
        isSidechain: false,
        promptId: randomUUID(),
        type: 'user',
        message: {
          role: 'user',
          content: text,
        },
        uuid,
        timestamp,
        permissionMode,
        userType: 'external',
        entrypoint: 'cli',
        cwd: session.projectPath || '.',
        sessionId: targetSessionId,
        version: readString(session.metadata['version']) || 'agent-session-manage',
        gitBranch: session.git.branch || 'HEAD',
      };
      lines.push(JSON.stringify(line));
      if (!sawUserMessage) {
        lines.push(JSON.stringify({
          type: 'ai-title',
          aiTitle: session.title || text.slice(0, 80) || 'Imported session',
          sessionId: targetSessionId,
        }));
        sawUserMessage = true;
      }
      previousUuid = uuid;
      continue;
    }

    const line = {
      parentUuid: previousUuid,
      isSidechain: false,
      message: {
        model: readString(session.metadata['model']) || 'claude-sonnet-4-6',
        id: `msg_${randomUUID().replaceAll('-', '')}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 0,
          server_tool_use: {
            web_search_requests: 0,
            web_fetch_requests: 0,
          },
          service_tier: 'standard',
          cache_creation: {
            ephemeral_1h_input_tokens: 0,
            ephemeral_5m_input_tokens: 0,
          },
        },
      },
      type: 'assistant',
      uuid,
      timestamp,
      userType: 'external',
      entrypoint: 'cli',
      cwd: session.projectPath || '.',
      sessionId: targetSessionId,
      version: readString(session.metadata['version']) || 'agent-session-manage',
      gitBranch: session.git.branch || 'HEAD',
    };
    lines.push(JSON.stringify(line));
    previousUuid = uuid;
  }

  if (!sawUserMessage) {
    const uuid = randomUUID();
    lines.push(JSON.stringify({
      type: 'file-history-snapshot',
      messageId: uuid,
      snapshot: {
        messageId: uuid,
        trackedFileBackups: {},
        timestamp: startedAt,
      },
      isSnapshotUpdate: false,
    }));
    lines.push(JSON.stringify({
      parentUuid: null,
      isSidechain: false,
      promptId: randomUUID(),
      type: 'user',
      message: {
        role: 'user',
        content: session.title || 'Imported session',
      },
      uuid,
      timestamp: startedAt,
      permissionMode,
      userType: 'external',
      entrypoint: 'cli',
      cwd: session.projectPath || '.',
      sessionId: targetSessionId,
      version: readString(session.metadata['version']) || 'agent-session-manage',
      gitBranch: session.git.branch || 'HEAD',
    }));
    lines.push(JSON.stringify({
      type: 'ai-title',
      aiTitle: session.title || 'Imported session',
      sessionId: targetSessionId,
    }));
  }

  await writeFile(target.sessionFile, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf8');

  if (target.historyFile) {
    await mkdir(path.dirname(target.historyFile), { recursive: true });
    const historyLine = JSON.stringify({
      display: session.title || 'Imported session',
      pastedContents: {},
      timestamp: Date.now(),
      project: session.projectPath || '.',
      sessionId: targetSessionId,
    });
    await writeFile(target.historyFile, `${historyLine}\n`, { encoding: 'utf8', flag: 'a' });
  }

  return { ...target, sessionId: targetSessionId };
}

function normalizeClaudeSessionId(candidate: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : randomUUID();
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
