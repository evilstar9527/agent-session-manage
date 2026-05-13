import type { CanonicalMessage, CanonicalSession, CanonicalToolCall } from '../model/session.js';
import { collapseWhitespace, readJsonLines, stringifyCompact } from './shared.js';

interface CodexEnvelope {
  type?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

export async function parseCodexSession(filePath: string): Promise<CanonicalSession> {
  const records = await readJsonLines(filePath);
  const messages: CanonicalMessage[] = [];
  const toolCalls: CanonicalToolCall[] = [];

  let sourceSessionId = '';
  let projectPath: string | undefined;
  let title: string | undefined;
  let createdAt: string | undefined;
  let updatedAt: string | undefined;
  let model: string | undefined;
  let version: string | undefined;
  let gitBranch: string | undefined;
  let lastAssistantMessageId: string | undefined;

  for (const record of records) {
    const envelope = record.value as CodexEnvelope;
    if (envelope.timestamp) {
      createdAt = createdAt ? (createdAt < envelope.timestamp ? createdAt : envelope.timestamp) : envelope.timestamp;
      updatedAt = updatedAt ? (updatedAt > envelope.timestamp ? updatedAt : envelope.timestamp) : envelope.timestamp;
    }

    if (envelope.type === 'session_meta') {
      sourceSessionId ||= readString(envelope.payload?.['id']) || '';
      projectPath ||= readString(envelope.payload?.['cwd']);
      model ||= readString(envelope.payload?.['model_provider']);
      version ||= readString(envelope.payload?.['cli_version']);
      continue;
    }

    if (envelope.type === 'turn_context') {
      projectPath ||= readString(envelope.payload?.['cwd']);
      model ||= readString(envelope.payload?.['model']);
      gitBranch ||= readString(envelope.payload?.['git_branch']);
      continue;
    }

    if (envelope.type !== 'response_item') {
      continue;
    }

    const payloadType = readString(envelope.payload?.['type']);
    if (payloadType === 'message') {
      const role = readString(envelope.payload?.['role']) || 'assistant';
      const text = extractCodexMessageText(envelope.payload?.['content']);
      if (!text) {
        continue;
      }
      const messageId = readString(envelope.payload?.['id']) || `codex-message-${record.lineNumber}`;
      messages.push({
        id: messageId,
        role: role === 'user' ? 'user' : 'assistant',
        timestamp: envelope.timestamp,
        text,
        rawRef: { sourcePath: filePath, line: record.lineNumber, type: payloadType },
      });
      if (role === 'assistant') {
        lastAssistantMessageId = messageId;
      }
      if (role === 'user') {
        title ||= collapseWhitespace(text, 80);
      }
      continue;
    }

    if (payloadType === 'reasoning') {
      const text = extractCodexReasoningText(envelope.payload?.['summary']);
      if (!text) {
        continue;
      }
      messages.push({
        id: `codex-reasoning-${record.lineNumber}`,
        role: 'assistant',
        timestamp: envelope.timestamp,
        text,
        rawRef: { sourcePath: filePath, line: record.lineNumber, type: payloadType },
        metadata: { kind: 'reasoning' },
      });
      continue;
    }

    if (payloadType === 'function_call') {
      const toolId = readString(envelope.payload?.['call_id']) || `codex-call-${record.lineNumber}`;
      toolCalls.push({
        id: toolId,
        name: readString(envelope.payload?.['name']) || 'unknown',
        timestamp: envelope.timestamp,
        input: parseJsonish(readString(envelope.payload?.['arguments'])),
        messageId: lastAssistantMessageId,
      });
      continue;
    }

    if (payloadType === 'function_call_output') {
      const toolId = readString(envelope.payload?.['call_id']) || `codex-output-${record.lineNumber}`;
      const output = parseJsonish(readString(envelope.payload?.['output']));
      messages.push({
        id: `codex-tool-${record.lineNumber}`,
        role: 'tool',
        timestamp: envelope.timestamp,
        text: stringifyCompact(output),
        toolResult: output,
        rawRef: { sourcePath: filePath, line: record.lineNumber, type: payloadType },
        metadata: {
          callId: toolId,
        },
      });
      toolCalls.push({
        id: toolId,
        name: 'function_call_output',
        timestamp: envelope.timestamp,
        output,
      });
    }
  }

  return {
    id: `codex:${sourceSessionId || filePath}`,
    source: 'codex',
    sourceSessionId: sourceSessionId || filePath,
    sourcePath: filePath,
    projectPath,
    title,
    summary: title,
    createdAt,
    updatedAt,
    git: { branch: gitBranch },
    archived: filePath.includes('/archived_sessions/'),
    tags: [],
    messages,
    attachments: [],
    toolCalls,
    metadata: {
      model,
      version,
    },
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function extractCodexMessageText(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }

  const text = content
    .flatMap(item => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const block = item as Record<string, unknown>;
      const value = typeof block['text'] === 'string' ? block['text'] : undefined;
      return value ? [value] : [];
    })
    .join('\n\n')
    .trim();

  return text || undefined;
}

function extractCodexReasoningText(summary: unknown): string | undefined {
  if (!Array.isArray(summary)) {
    return undefined;
  }

  const text = summary
    .flatMap(item => {
      if (!item || typeof item !== 'object') {
        return [];
      }
      const block = item as Record<string, unknown>;
      const value = typeof block['text'] === 'string' ? block['text'] : undefined;
      return value ? [value] : [];
    })
    .join('\n\n')
    .trim();

  return text || undefined;
}

function parseJsonish(value: string | undefined): unknown {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
