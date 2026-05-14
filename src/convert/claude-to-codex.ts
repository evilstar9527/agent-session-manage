import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CanonicalSession } from '../model/session.js';

export interface CodexMaterialization {
  sessionFile: string;
  sessionId: string;
}

export async function materializeCodexSession(session: CanonicalSession, outputPath: string): Promise<CodexMaterialization> {
  const sessionId = randomUUID();
  const now = new Date();
  const targetFile = outputPath.endsWith('.jsonl')
    ? outputPath
    : path.join(outputPath, 'sessions', timestampPath(now), `rollout-${timestampFile(now)}-${sessionId}.jsonl`);

  await mkdir(path.dirname(targetFile), { recursive: true });

  const lines: string[] = [];
  const startTimestamp = session.createdAt || new Date().toISOString();

  lines.push(JSON.stringify({
    timestamp: startTimestamp,
    type: 'session_meta',
    payload: {
      id: sessionId,
      timestamp: startTimestamp,
      cwd: session.projectPath || '.',
      originator: 'agent-session-manage',
      cli_version: 'agent-session-manage',
      source: 'import',
      model_provider: readString(session.metadata['model']) || 'imported',
      base_instructions: {
        text: `Imported from ${session.source} session ${session.sourceSessionId}`,
      },
    },
  }));

  lines.push(JSON.stringify({
    timestamp: startTimestamp,
    type: 'turn_context',
    payload: {
      turn_id: randomUUID(),
      cwd: session.projectPath || '.',
      approval_policy: 'on-request',
      sandbox_policy: { type: 'workspace-write' },
      model: readString(session.metadata['model']) || 'imported',
    },
  }));

  for (const message of session.messages) {
    if (message.role === 'tool') {
      const callId = readString(message.metadata?.['callId']) || message.id;
      lines.push(JSON.stringify({
        timestamp: message.timestamp || new Date().toISOString(),
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: callId,
          output: stringifyMaybeJson(message.toolResult ?? message.text ?? ''),
        },
      }));
      continue;
    }

    lines.push(JSON.stringify({
      timestamp: message.timestamp || new Date().toISOString(),
      type: 'response_item',
      payload: {
        type: 'message',
        id: message.id,
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.text ? [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: message.text }] : [],
      },
    }));

    const toolCalls = session.toolCalls.filter(toolCall => toolCall.messageId === message.id && toolCall.input !== undefined);
    for (const toolCall of toolCalls) {
      lines.push(JSON.stringify({
        timestamp: toolCall.timestamp || message.timestamp || new Date().toISOString(),
        type: 'response_item',
        payload: {
          type: 'function_call',
          id: toolCall.id,
          call_id: toolCall.id,
          name: toolCall.name,
          arguments: stringifyMaybeJson(toolCall.input),
        },
      }));
    }
  }

  await writeFile(targetFile, lines.join('\n') + '\n', 'utf8');

  if (!outputPath.endsWith('.jsonl')) {
    const sessionIndexPath = path.join(outputPath, 'session_index.jsonl');
    await mkdir(path.dirname(sessionIndexPath), { recursive: true });
    await writeFile(
      sessionIndexPath,
      `${JSON.stringify({ id: sessionId, thread_name: session.title || sessionId, updated_at: session.updatedAt || startTimestamp })}\n`,
      { encoding: 'utf8', flag: 'a' },
    );
  }

  return { sessionFile: targetFile, sessionId };
}

function stringifyMaybeJson(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function timestampPath(date: Date): string {
  return [date.getUTCFullYear(), pad(date.getUTCMonth() + 1), pad(date.getUTCDate())].join('/');
}

function timestampFile(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join('-') + 'T' + [pad(date.getUTCHours()), pad(date.getUTCMinutes()), pad(date.getUTCSeconds())].join('-');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
