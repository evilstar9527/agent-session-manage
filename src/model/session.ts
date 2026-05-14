export type SessionSource = 'claude' | 'codex';

export type CanonicalRole = 'system' | 'user' | 'assistant' | 'tool';

export interface CanonicalGitInfo {
  branch?: string;
  sha?: string;
  originUrl?: string;
}

export interface CanonicalRawRef {
  sourcePath: string;
  line?: number;
  type?: string;
}

export interface CanonicalMessage {
  id: string;
  role: CanonicalRole;
  timestamp?: string;
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  parentId?: string;
  rawRef?: CanonicalRawRef;
  metadata?: Record<string, unknown>;
}

export interface CanonicalToolCall {
  id: string;
  name: string;
  timestamp?: string;
  input?: unknown;
  output?: unknown;
  isError?: boolean;
  messageId?: string;
}

export interface CanonicalSession {
  id: string;
  source: SessionSource;
  sourceSessionId: string;
  sourcePath: string;
  projectPath?: string;
  title?: string;
  summary?: string;
  createdAt?: string;
  updatedAt?: string;
  git: CanonicalGitInfo;
  archived: boolean;
  pinnedAt?: string;
  tags: string[];
  messages: CanonicalMessage[];
  attachments: string[];
  toolCalls: CanonicalToolCall[];
  metadata: Record<string, unknown>;
}

export interface SessionPreview {
  id: string;
  source: SessionSource;
  sourceSessionId: string;
  sourcePath: string;
  projectPath?: string;
  title?: string;
  summary?: string;
  createdAt?: string;
  updatedAt?: string;
  gitBranch?: string;
  archived: boolean;
  pinnedAt?: string;
  messageCount: number;
  toolCallCount: number;
}

export interface SourceFingerprint {
  sourcePath: string;
  size: number;
  mtimeMs: number;
  quickHash: string;
}

export interface DiscoveredSession {
  source: SessionSource;
  filePath: string;
  sessionId: string;
  projectPathHint?: string;
  fingerprint: SourceFingerprint;
}
