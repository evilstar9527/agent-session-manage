import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CanonicalSession, SessionPreview, SourceFingerprint } from '../model/session.js';
import { schemaStatements } from './schema.js';

export interface StoredSession extends CanonicalSession {}

interface SearchRow {
  id: string;
  source: 'claude' | 'codex';
  source_session_id: string;
  source_path: string;
  project_path: string | null;
  title: string | null;
  summary: string | null;
  created_at: string | null;
  updated_at: string | null;
  git_branch: string | null;
  archived: number;
  pinned_at: string | null;
  message_count: number;
  tool_call_count: number;
}

interface SessionRow {
  id: string;
  source: 'claude' | 'codex';
  source_session_id: string;
  source_path: string;
  project_path: string | null;
  title: string | null;
  summary: string | null;
  created_at: string | null;
  updated_at: string | null;
  git_branch: string | null;
  git_sha: string | null;
  git_origin_url: string | null;
  archived: number;
  pinned_at: string | null;
  tags_json: string;
  attachments_json: string;
  tool_calls_json: string;
  metadata_json: string;
  message_count: number;
  tool_call_count: number;
}

interface MessageRow {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  timestamp: string | null;
  text: string | null;
  tool_name: string | null;
  tool_input_json: string | null;
  tool_result_json: string | null;
  parent_id: string | null;
  raw_ref_json: string | null;
  metadata_json: string | null;
}

export class SessionRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec('PRAGMA journal_mode = WAL');
    for (const statement of schemaStatements) {
      this.db.exec(statement);
    }
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  getImportFingerprint(sourcePath: string): SourceFingerprint | undefined {
    const row = this.db
      .prepare('SELECT source_path, fingerprint_size, fingerprint_mtime_ms, fingerprint_hash FROM imports WHERE source_path = ?')
      .get(sourcePath) as { source_path: string; fingerprint_size: number; fingerprint_mtime_ms: number; fingerprint_hash: string } | undefined;

    if (!row) {
      return undefined;
    }

    return {
      sourcePath: row.source_path,
      size: row.fingerprint_size,
      mtimeMs: row.fingerprint_mtime_ms,
      quickHash: row.fingerprint_hash,
    };
  }

  upsertSession(session: CanonicalSession, fingerprint: SourceFingerprint): void {
    const importedAt = new Date().toISOString();

    this.db.exec('BEGIN');
    try {
      this.db.prepare(`
        INSERT INTO sessions (
          id, source, source_session_id, source_path, project_path, title, summary, created_at, updated_at,
          git_branch, git_sha, git_origin_url, archived, pinned_at, tags_json, attachments_json, tool_calls_json,
          metadata_json, message_count, tool_call_count, fingerprint_size, fingerprint_mtime_ms,
          fingerprint_hash, imported_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          source = excluded.source,
          source_session_id = excluded.source_session_id,
          source_path = excluded.source_path,
          project_path = excluded.project_path,
          title = excluded.title,
          summary = excluded.summary,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          git_branch = excluded.git_branch,
          git_sha = excluded.git_sha,
          git_origin_url = excluded.git_origin_url,
          archived = excluded.archived,
          pinned_at = COALESCE(sessions.pinned_at, excluded.pinned_at),
          tags_json = excluded.tags_json,
          attachments_json = excluded.attachments_json,
          tool_calls_json = excluded.tool_calls_json,
          metadata_json = excluded.metadata_json,
          message_count = excluded.message_count,
          tool_call_count = excluded.tool_call_count,
          fingerprint_size = excluded.fingerprint_size,
          fingerprint_mtime_ms = excluded.fingerprint_mtime_ms,
          fingerprint_hash = excluded.fingerprint_hash,
          imported_at = excluded.imported_at
      `).run(
        session.id,
        session.source,
        session.sourceSessionId,
        session.sourcePath,
        session.projectPath ?? null,
        session.title ?? null,
        session.summary ?? null,
        session.createdAt ?? null,
        session.updatedAt ?? null,
        session.git.branch ?? null,
        session.git.sha ?? null,
        session.git.originUrl ?? null,
        session.archived ? 1 : 0,
        session.pinnedAt ?? null,
        JSON.stringify(session.tags),
        JSON.stringify(session.attachments),
        JSON.stringify(session.toolCalls),
        JSON.stringify(session.metadata),
        session.messages.length,
        session.toolCalls.length,
        fingerprint.size,
        fingerprint.mtimeMs,
        fingerprint.quickHash,
        importedAt,
      );

      this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(session.id);
      this.db.prepare('DELETE FROM tags WHERE session_id = ?').run(session.id);
      this.db.prepare('DELETE FROM artifacts WHERE session_id = ?').run(session.id);

      const insertMessage = this.db.prepare(`
        INSERT INTO messages (
          session_id, ordinal, id, role, timestamp, text, tool_name, tool_input_json,
          tool_result_json, parent_id, raw_ref_json, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      session.messages.forEach((message, ordinal) => {
        insertMessage.run(
          session.id,
          ordinal,
          message.id,
          message.role,
          message.timestamp ?? null,
          message.text ?? null,
          message.toolName ?? null,
          message.toolInput === undefined ? null : JSON.stringify(message.toolInput),
          message.toolResult === undefined ? null : JSON.stringify(message.toolResult),
          message.parentId ?? null,
          message.rawRef === undefined ? null : JSON.stringify(message.rawRef),
          message.metadata === undefined ? null : JSON.stringify(message.metadata),
        );
      });

      const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (session_id, tag) VALUES (?, ?)');
      for (const tag of session.tags) {
        insertTag.run(session.id, tag);
      }

      const insertArtifact = this.db.prepare('INSERT OR IGNORE INTO artifacts (session_id, path, kind) VALUES (?, ?, ?)');
      for (const artifact of session.attachments) {
        insertArtifact.run(session.id, artifact, 'attachment');
      }

      this.db.prepare(`
        INSERT INTO imports (source_path, imported_at, fingerprint_hash, fingerprint_size, fingerprint_mtime_ms)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source_path) DO UPDATE SET
          imported_at = excluded.imported_at,
          fingerprint_hash = excluded.fingerprint_hash,
          fingerprint_size = excluded.fingerprint_size,
          fingerprint_mtime_ms = excluded.fingerprint_mtime_ms
      `).run(sourcePathOrId(session), importedAt, fingerprint.quickHash, fingerprint.size, fingerprint.mtimeMs);

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  listSessions(limit?: number): SessionPreview[] {
    const query = limit
      ? `SELECT * FROM sessions ${sessionOrderClause()} LIMIT ?`
      : `SELECT * FROM sessions ${sessionOrderClause()}`;
    const rows = (limit ? this.db.prepare(query).all(limit) : this.db.prepare(query).all()) as unknown as SessionRow[];
    return rows.map(toPreview);
  }

  searchSessions(query: string, limit = 20): SessionPreview[] {
    const like = `%${query}%`;
    const rows = this.db.prepare(`
      SELECT DISTINCT
        s.id,
        s.source,
        s.source_session_id,
        s.source_path,
        s.project_path,
        s.title,
        s.summary,
        s.created_at,
        s.updated_at,
        s.git_branch,
        s.archived,
        s.pinned_at,
        s.message_count,
        s.tool_call_count
      FROM sessions s
      LEFT JOIN messages m ON m.session_id = s.id
      WHERE
        s.id LIKE ? OR
        s.source_session_id LIKE ? OR
        s.title LIKE ? OR
        s.summary LIKE ? OR
        s.project_path LIKE ? OR
        s.source_path LIKE ? OR
        m.text LIKE ?
      ${sessionOrderClause('s')}
      LIMIT ?
    `).all(like, like, like, like, like, like, like, limit) as unknown as SearchRow[];

    return rows.map(toPreview);
  }

  addTag(sessionId: string, tag: string): boolean {
    const row = this.db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId) as { id: string } | undefined;
    if (!row) {
      return false;
    }

    this.db.prepare('INSERT OR IGNORE INTO tags (session_id, tag) VALUES (?, ?)').run(sessionId, tag);
    this.syncTags(sessionId);
    return true;
  }

  setArchived(sessionId: string, archived: boolean): boolean {
    const result = this.db.prepare('UPDATE sessions SET archived = ? WHERE id = ?').run(archived ? 1 : 0, sessionId);
    return result.changes > 0;
  }

  setPinned(sessionId: string, pinned: boolean): boolean {
    const pinnedAt = pinned ? new Date().toISOString() : null;
    const result = this.db.prepare('UPDATE sessions SET pinned_at = ? WHERE id = ?').run(pinnedAt, sessionId);
    return result.changes > 0;
  }

  deleteSession(sessionId: string): boolean {
    const row = this.db.prepare('SELECT source_path FROM sessions WHERE id = ?').get(sessionId) as { source_path: string } | undefined;
    if (!row) {
      return false;
    }

    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM tags WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM artifacts WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM imports WHERE source_path = ?').run(row.source_path);
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      this.db.exec('COMMIT');
      return true;
    } catch (caught) {
      this.db.exec('ROLLBACK');
      throw caught;
    }
  }

  getSession(sessionId: string): StoredSession | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow | undefined;
    if (!row) {
      return undefined;
    }

    const messages = this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY ordinal ASC').all(sessionId) as unknown as MessageRow[];

    return {
      id: row.id,
      source: row.source,
      sourceSessionId: row.source_session_id,
      sourcePath: row.source_path,
      projectPath: row.project_path ?? undefined,
      title: row.title ?? undefined,
      summary: row.summary ?? undefined,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
      git: {
        branch: row.git_branch ?? undefined,
        sha: row.git_sha ?? undefined,
        originUrl: row.git_origin_url ?? undefined,
      },
      archived: row.archived === 1,
      pinnedAt: row.pinned_at ?? undefined,
      tags: JSON.parse(row.tags_json) as string[],
      attachments: JSON.parse(row.attachments_json) as string[],
      toolCalls: JSON.parse(row.tool_calls_json),
      metadata: JSON.parse(row.metadata_json),
      messages: messages.map(message => ({
        id: message.id,
        role: message.role,
        timestamp: message.timestamp ?? undefined,
        text: message.text ?? undefined,
        toolName: message.tool_name ?? undefined,
        toolInput: message.tool_input_json ? JSON.parse(message.tool_input_json) : undefined,
        toolResult: message.tool_result_json ? JSON.parse(message.tool_result_json) : undefined,
        parentId: message.parent_id ?? undefined,
        rawRef: message.raw_ref_json ? JSON.parse(message.raw_ref_json) : undefined,
        metadata: message.metadata_json ? JSON.parse(message.metadata_json) : undefined,
      })),
    };
  }

  private syncTags(sessionId: string): void {
    const rows = this.db.prepare('SELECT tag FROM tags WHERE session_id = ? ORDER BY tag ASC').all(sessionId) as unknown as Array<{ tag: string }>;
    this.db.prepare('UPDATE sessions SET tags_json = ? WHERE id = ?').run(JSON.stringify(rows.map(row => row.tag)), sessionId);
  }

  private migrate(): void {
    const columns = this.db.prepare('PRAGMA table_info(sessions)').all() as unknown as Array<{ name: string }>;
    if (!columns.some(column => column.name === 'pinned_at')) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN pinned_at TEXT');
    }
  }
}

function sourcePathOrId(session: CanonicalSession): string {
  return session.sourcePath;
}

function sessionOrderClause(alias?: string): string {
  const prefix = alias ? `${alias}.` : '';
  return `ORDER BY ${prefix}pinned_at IS NULL ASC, ${prefix}pinned_at DESC, COALESCE(${prefix}updated_at, ${prefix}created_at) DESC`;
}

function toPreview(row: SearchRow | SessionRow): SessionPreview {
  return {
    id: row.id,
    source: row.source,
    sourceSessionId: row.source_session_id,
    sourcePath: row.source_path,
    projectPath: row.project_path ?? undefined,
    title: row.title ?? undefined,
    summary: row.summary ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    gitBranch: row.git_branch ?? undefined,
    archived: row.archived === 1,
    pinnedAt: row.pinned_at ?? undefined,
    messageCount: row.message_count,
    toolCallCount: row.tool_call_count,
  };
}
