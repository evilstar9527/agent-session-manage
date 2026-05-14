export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    source_session_id TEXT NOT NULL,
    source_path TEXT NOT NULL UNIQUE,
    project_path TEXT,
    title TEXT,
    summary TEXT,
    created_at TEXT,
    updated_at TEXT,
    git_branch TEXT,
    git_sha TEXT,
    git_origin_url TEXT,
    archived INTEGER NOT NULL,
    pinned_at TEXT,
    tags_json TEXT NOT NULL,
    attachments_json TEXT NOT NULL,
    tool_calls_json TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    message_count INTEGER NOT NULL,
    tool_call_count INTEGER NOT NULL,
    fingerprint_size INTEGER NOT NULL,
    fingerprint_mtime_ms REAL NOT NULL,
    fingerprint_hash TEXT NOT NULL,
    imported_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    session_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    id TEXT NOT NULL,
    role TEXT NOT NULL,
    timestamp TEXT,
    text TEXT,
    tool_name TEXT,
    tool_input_json TEXT,
    tool_result_json TEXT,
    parent_id TEXT,
    raw_ref_json TEXT,
    metadata_json TEXT,
    PRIMARY KEY (session_id, ordinal)
  )`,
  `CREATE TABLE IF NOT EXISTS imports (
    source_path TEXT PRIMARY KEY,
    imported_at TEXT NOT NULL,
    fingerprint_hash TEXT NOT NULL,
    fingerprint_size INTEGER NOT NULL,
    fingerprint_mtime_ms REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    session_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (session_id, tag)
  )`,
  `CREATE TABLE IF NOT EXISTS artifacts (
    session_id TEXT NOT NULL,
    path TEXT NOT NULL,
    kind TEXT,
    PRIMARY KEY (session_id, path)
  )`
] as const;
