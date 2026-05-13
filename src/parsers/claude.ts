import type { CanonicalMessage, CanonicalSession, CanonicalToolCall } from '../model/session.js';
import { collapseWhitespace, readJsonLines, stringifyCompact } from './shared.js';

interface ClaudeRecord {
  type?: string;
  uuid?: string;
  parentUuid?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  sessionId?: string;
  version?: string;
  message?: {
    role?: string;
    content?: unknown;
    model?: string;
    stop_reason?: unknown;
  };
  toolUseResult?: unknown;
}

export async function parseClaudeSession(filePath: string): Promise<CanonicalSession> {
  const records = await readJsonLines(filePath);
  const messages: CanonicalMessage[] = [];
  const toolCalls: CanonicalToolCall[] = [];

  let sourceSessionId = '';
  let projectPath: string | undefined;
  let gitBranch: string | undefined;
  let createdAt: string | undefined;
  let updatedAt: string | undefined;
  let version: string | undefined;
  let title: string | undefined;

  for (const record of records) {
    const value = record.value as ClaudeRecord;

    sourceSessionId ||= value.sessionId || '';
    projectPath ||= value.cwd;
    gitBranch ||= value.gitBranch;
    version ||= value.version;

    if (value.timestamp) {
      createdAt = createdAt ? (createdAt < value.timestamp ? createdAt : value.timestamp) : value.timestamp;
      updatedAt = updatedAt ? (updatedAt > value.timestamp ? updatedAt : value.timestamp) : value.timestamp;
    }

    if (value.type === 'user') {
      const parts = extractClaudeUserText(value.message?.content);
      if (parts.text) {
        messages.push({
          id: value.uuid || `claude-user-${record.lineNumber}`,
          role: 'user',
          timestamp: value.timestamp,
          text: parts.text,
          parentId: value.parentUuid,
          rawRef: { sourcePath: filePath, line: record.lineNumber, type: value.type },
        });
        title ||= collapseWhitespace(parts.text, 80);
      }

      for (const result of parts.toolResults) {
        messages.push({
          id: `${value.uuid || `claude-user-${record.lineNumber}`}:${result.callId || 'tool-result'}`,
          role: 'tool',
          timestamp: value.timestamp,
          text: stringifyCompact(result.content),
          toolResult: result.content,
          parentId: value.parentUuid,
          rawRef: { sourcePath: filePath, line: record.lineNumber, type: 'tool_result' },
          metadata: {
            callId: result.callId,
            isError: Boolean(result.isError),
          },
        });
        toolCalls.push({
          id: result.callId || `${record.lineNumber}-result`,
          name: 'tool_result',
          timestamp: value.timestamp,
          output: result.content,
          isError: Boolean(result.isError),
          messageId: value.uuid,
        });
      }
      continue;
    }

    if (value.type === 'assistant') {
      const parts = extractClaudeAssistantContent(value.message?.content);
      if (parts.text) {
        messages.push({
          id: value.uuid || `claude-assistant-${record.lineNumber}`,
          role: 'assistant',
          timestamp: value.timestamp,
          text: parts.text,
          parentId: value.parentUuid,
          rawRef: { sourcePath: filePath, line: record.lineNumber, type: value.type },
          metadata: {
            model: value.message?.model,
            stopReason: value.message?.stop_reason,
          },
        });
      }

      for (const toolCall of parts.toolCalls) {
        toolCalls.push({
          id: toolCall.id,
          name: toolCall.name,
          timestamp: value.timestamp,
          input: toolCall.input,
          messageId: value.uuid,
        });
      }
    }
  }

  return {
    id: `claude:${sourceSessionId || filePath}`,
    source: 'claude',
    sourceSessionId: sourceSessionId || filePath,
    sourcePath: filePath,
    projectPath,
    title,
    summary: title,
    createdAt,
    updatedAt,
    git: { branch: gitBranch },
    archived: false,
    tags: [],
    messages,
    attachments: [],
    toolCalls,
    metadata: {
      version,
    },
  };
}

function extractClaudeUserText(content: unknown): { text?: string; toolResults: Array<{ callId?: string; content: unknown; isError?: boolean }> } {
  if (typeof content === 'string') {
    return { text: content, toolResults: [] };
  }

  if (!Array.isArray(content)) {
    return { toolResults: [] };
  }

  const textParts: string[] = [];
  const toolResults: Array<{ callId?: string; content: unknown; isError?: boolean }> = [];

  for (const item of content) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const block = item as Record<string, unknown>;
    if (block['type'] === 'tool_result') {
      toolResults.push({
        callId: typeof block['tool_use_id'] === 'string' ? block['tool_use_id'] : undefined,
        content: block['content'],
        isError: typeof block['is_error'] === 'boolean' ? block['is_error'] : undefined,
      });
      continue;
    }
    const text = typeof block['text'] === 'string' ? block['text'] : typeof block['content'] === 'string' ? block['content'] : undefined;
    if (text) {
      textParts.push(text);
    }
  }

  return {
    text: textParts.length > 0 ? textParts.join('\n\n') : undefined,
    toolResults,
  };
}

function extractClaudeAssistantContent(content: unknown): { text?: string; toolCalls: Array<{ id: string; name: string; input: unknown }> } {
  if (!Array.isArray(content)) {
    return { toolCalls: [] };
  }

  const textParts: string[] = [];
  const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];

  for (const item of content) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const block = item as Record<string, unknown>;
    if (block['type'] === 'tool_use' && typeof block['id'] === 'string' && typeof block['name'] === 'string') {
      toolCalls.push({
        id: block['id'],
        name: block['name'],
        input: block['input'],
      });
      continue;
    }

    const text = typeof block['text'] === 'string'
      ? block['text']
      : typeof block['thinking'] === 'string'
        ? block['thinking']
        : undefined;

    if (text) {
      textParts.push(text);
    }
  }

  return {
    text: textParts.length > 0 ? textParts.join('\n\n') : undefined,
    toolCalls,
  };
}
