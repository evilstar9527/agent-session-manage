import React, { useState } from 'react';
import type { SessionPreview } from '../../model/session.js';

interface SessionListProps {
  sessions: SessionPreview[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onPin: (id: string, pinned: boolean) => Promise<void>;
  loading: boolean;
  query: string;
}

export function SessionList({ sessions, selectedId, onSelect, onPin, loading, query }: SessionListProps): React.JSX.Element {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  if (loading && sessions.length === 0) {
    return (
      <div className="session-list-root">
        <PanelHeader title="Sessions" subtitle="Loading local transcripts..." count="Working" />
        <EmptyState title="Scanning index" copy="Session rows will appear here as soon as the local index responds." />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="session-list-root">
        <PanelHeader title="Sessions" subtitle="No visible rows" count="0" />
        <EmptyState
          title={query ? 'No matches' : 'Empty index'}
          copy={query ? `No sessions matched "${query}".` : 'Scan local Claude Code and Codex history to populate the index.'}
        />
      </div>
    );
  }

  const groups = groupSessionsByProject(sessions);

  return (
    <div className="session-list-root">
      <PanelHeader title="Sessions" subtitle={`${groups.length} worktrees`} count={String(sessions.length)} />
      <div className="session-list-scroll">
        {groups.map(group => {
          const collapsed = collapsedGroups.has(group.projectPath);

          return (
            <section className={`session-group${collapsed ? ' is-collapsed' : ''}`} key={group.projectPath}>
              <div className="session-group-header">
                <button
                  className="session-group-toggle"
                  onClick={() => setCollapsedGroups(current => toggleGroup(current, group.projectPath))}
                  aria-expanded={!collapsed}
                >
                  <span className="session-group-chevron">{collapsed ? '›' : '⌄'}</span>
                  <span className="session-group-title">{formatProjectName(group.projectPath)}</span>
                </button>
                <span className="meta-pill">{group.sessions.length}</span>
              </div>
              <div className="session-group-path">{group.projectPath}</div>
              {!collapsed && group.sessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  selected={session.id === selectedId}
                  onSelect={onSelect}
                  onPin={onPin}
                />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  selected,
  onSelect,
  onPin,
}: {
  session: SessionPreview;
  selected: boolean;
  onSelect: (id: string) => void;
  onPin: (id: string, pinned: boolean) => Promise<void>;
}): React.JSX.Element {
  const sourceClass = session.source === 'claude' ? 'badge-source-claude' : 'badge-source-codex';

  return (
    <div
      role="button"
      tabIndex={0}
      className={`session-card${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(session.id)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(session.id);
        }
      }}
    >
      <div className="session-card-top">
        <div className="session-card-badges">
          <span className={`badge ${sourceClass}`}>{session.source}</span>
          {session.archived && <span className="badge badge-archived">Archived</span>}
        </div>
        <button
          className={`pin-button${session.pinnedAt ? ' is-pinned' : ''}`}
          onClick={event => {
            event.stopPropagation();
            void onPin(session.id, !session.pinnedAt);
          }}
          title={session.pinnedAt ? 'Unpin session' : 'Pin session'}
          aria-label={session.pinnedAt ? 'Unpin session' : 'Pin session'}
        >
          {session.pinnedAt ? 'Pinned' : 'Pin'}
        </button>
      </div>
      <div>
        <div className="session-card-title">{session.title || '(untitled)'}</div>
        {session.summary && <div className="session-card-summary">{session.summary}</div>}
      </div>
      <div className="session-card-bottom">
        <span>{session.updatedAt || session.createdAt || '-'}</span>
        <span>{session.messageCount} messages</span>
        <span>{session.toolCallCount} tools</span>
        {session.gitBranch && <span>{session.gitBranch}</span>}
      </div>
    </div>
  );
}

function toggleGroup(current: Set<string>, projectPath: string): Set<string> {
  const next = new Set(current);
  if (next.has(projectPath)) {
    next.delete(projectPath);
  } else {
    next.add(projectPath);
  }
  return next;
}

function groupSessionsByProject(sessions: SessionPreview[]): Array<{ projectPath: string; sessions: SessionPreview[] }> {
  const grouped = new Map<string, SessionPreview[]>();
  for (const session of sessions) {
    const key = session.projectPath || '(unknown worktree)';
    grouped.set(key, [...(grouped.get(key) || []), session]);
  }
  return [...grouped.entries()].map(([projectPath, rows]) => ({ projectPath, sessions: rows }));
}

function formatProjectName(projectPath: string): string {
  if (projectPath === '(unknown worktree)') {
    return projectPath;
  }
  const parts = projectPath.split('/').filter(Boolean);
  return parts.at(-1) || projectPath;
}

function PanelHeader({ title, subtitle, count }: { title: string; subtitle: string; count: string }): React.JSX.Element {
  return (
    <div className="panel-header">
      <div className="panel-header-copy">
        <div className="panel-label">Index</div>
        <h2 className="panel-title">{title}</h2>
        <p className="panel-subtitle">{subtitle}</p>
      </div>
      <span className="meta-pill">{count}</span>
    </div>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }): React.JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-card">
        <div className="panel-label">Status</div>
        <h3 className="empty-title">{title}</h3>
        <p className="empty-copy">{copy}</p>
      </div>
    </div>
  );
}
