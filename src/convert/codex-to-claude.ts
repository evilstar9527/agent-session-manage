import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CanonicalSession } from '../model/session.js';
import { pathToClaudeProjectBucket } from '../utils/paths.js';

export interface ClaudeMaterialization {
  sessionFile: string;
  historyFile?: string;
}

export async function materializeClaudeSession(session: CanonicalSession, outputPath: string): Promise<ClaudeMaterialization> {
  const targetSessionId = normalizeClaudeSessionId(session.sourceSessionId);
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
  let previousUuid: string | undefined;

  for (const message of session.messages) {
    const uuid = randomUUID();

    if (message.role === 'tool') {
      const toolUseId = readString(message.metadata?.['callId']) || message.id;
      const isError = Boolean(message.metadata?.['isError']);
      const line = {
        parentUuid: previousUuid,
        isSidechain: false,
        userType: 'external',
        cwd: session.projectPath || '.',
        sessionId: targetSessionId,
        version: readString(session.metadata['version']) || 'agent-session-manage',
        gitBranch: session.git.branch || 'HEAD',
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: message.toolResult ?? message.text ?? '',
              is_error: isError,
            },
          ],
        },
        uuid,
        timestamp: message.timestamp || new Date().toISOString(),
      };
      lines.push(JSON.stringify(line));
      previousUuid = uuid;
      continue;
    }

    if (message.role === 'user') {
      const line = {
        parentUuid: previousUuid,
        isSidechain: false,
        userType: 'external',
        cwd: session.projectPath || '.',
        sessionId: targetSessionId,
        version: readString(session.metadata['version']) || 'agent-session-manage',
        gitBranch: session.git.branch || 'HEAD',
        type: 'user',
        message: {
          role: 'user',
          content: message.text || '',
        },
        uuid,
        timestamp: message.timestamp || new Date().toISOString(),
      };
      lines.push(JSON.stringify(line));
      previousUuid = uuid;
      continue;
    }

    const toolBlocks = session.toolCalls
      .filter(toolCall => toolCall.messageId === message.id && toolCall.input !== undefined)
      .map(toolCall => {
        return {
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
          caller: { type: 'direct' },
        };
      });

    const content = [
      ...(message.text ? [{ type: 'text', text: message.text }] : []),
      ...toolBlocks,
    ];

    const line = {
      parentUuid: previousUuid,
      isSidechain: false,
      userType: 'external',
      cwd: session.projectPath || '.',
      sessionId: targetSessionId,
      version: readString(session.metadata['version']) || 'agent-session-manage',
      gitBranch: session.git.branch || 'HEAD',
      type: 'assistant',
      message: {
        id: `msg_${randomUUID().replaceAll('-', '')}`,
        type: 'message',
        role: 'assistant',
        content,
        stop_reason: toolBlocks.length > 0 ? 'tool_use' : null,
        stop_sequence: null,
      },
      uuid,
      timestamp: message.timestamp || new Date().toISOString(),
    };
    lines.push(JSON.stringify(line));
    previousUuid = uuid;
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

  return target;
}

function normalizeClaudeSessionId(candidate: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : randomUUID();
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
