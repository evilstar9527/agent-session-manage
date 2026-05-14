import React, { useState } from 'react';
import type { CanonicalMessage, CanonicalSession, CanonicalToolCall } from '../../model/session.js';

interface SessionDetailProps {
  session?: CanonicalSession;
  loading: boolean;
  onResumeAs: (target: 'claude' | 'codex') => Promise<void>;
  onExport: () => void;
  onDelete: () => Promise<void>;
}

export function SessionDetail({ session, loading, onResumeAs, onExport, onDelete }: SessionDetailProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'overview' | 'messages'>('overview');

  if (!session) {
    return (
      <div className="session-detail-root">
        <div className="empty-state-detail">
          <div className="empty-card">
            <div className="panel-label">Detail</div>
            <h2 className="empty-title">Select a session</h2>
            <p className="empty-copy">Pick a row from the session index to inspect messages, tool calls, metadata, and source paths.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="session-detail-root">
      <div className="detail-tabs detail-tabs-top">
        <button
          className={`tab-button${activeTab === 'overview' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Session Detail
        </button>
        <button
          className={`tab-button${activeTab === 'messages' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          Messages
        </button>
      </div>

      {activeTab === 'overview'
        ? <OverviewTab session={session} loading={loading} onResumeAs={onResumeAs} onExport={onExport} onDelete={onDelete} />
        : <MessagesTab session={session} />}
    </div>
  );
}

function OverviewTab({
  session,
  loading,
  onResumeAs,
  onExport,
  onDelete,
}: {
  session: CanonicalSession;
  loading: boolean;
  onResumeAs: (target: 'claude' | 'codex') => Promise<void>;
  onExport: () => void;
  onDelete: () => Promise<void>;
}): React.JSX.Element {
  return (
    <div className="detail-scroll overview-scroll">
      <section className="detail-hero detail-hero-card">
        <div className="detail-topline">
          <div>
            <div className="panel-label">Session detail</div>
            <h2 className="detail-title">{session.title || session.id}</h2>
            {session.summary && <p className="detail-copy">{session.summary}</p>}
          </div>
          <span className={`badge ${session.source === 'claude' ? 'badge-source-claude' : 'badge-source-codex'}`}>
            {session.source}
          </span>
        </div>

        <div className="detail-chip-row">
          <span className="meta-pill">{session.messages.length} messages</span>
          <span className="meta-pill">{session.toolCalls.length} tool calls</span>
          {session.pinnedAt && <span className="meta-pill meta-pill-pinned">Pinned</span>}
          <span className="meta-pill">{session.archived ? 'Archived' : 'Active'}</span>
        </div>

        <div className="detail-meta-grid">
          <MetaCard label="Project" value={session.projectPath || '-'} mono />
          <MetaCard label="Updated" value={session.updatedAt || session.createdAt || '-'} />
          <MetaCard label="Branch" value={session.git.branch || '-'} />
          <MetaCard label="Source path" value={session.sourcePath} mono />
          <MetaCard label="Source ID" value={session.sourceSessionId} mono />
          <MetaCard label="Git SHA" value={session.git.sha || '-'} mono />
        </div>

        <div className="detail-actions-row">
          <button className="button button-primary" onClick={() => void onResumeAs('claude')}>
            Resume Claude
          </button>
          <button className="button button-primary button-codex" onClick={() => void onResumeAs('codex')}>
            Resume Codex
          </button>
          <button className="button button-secondary" onClick={onExport}>
            Export
          </button>
          <button className="button button-danger" onClick={() => void onDelete()}>
            Delete
          </button>
        </div>

        {loading && <span className="notice-inline">Loading...</span>}
      </section>

      <section className="content-section compact-summary-grid">
        <SummaryItem label="Messages" value={String(session.messages.length)} />
        <SummaryItem label="Tool calls" value={String(session.toolCalls.length)} />
        <SummaryItem label="Session ID" value={session.sourceSessionId} mono />
      </section>
    </div>
  );
}

function MetaCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className="meta-card">
      <span className="meta-label">{label}</span>
      <span className={`meta-value${mono ? ' meta-value-mono' : ''}`}>{value}</span>
    </div>
  );
}

function SummaryItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): React.JSX.Element {
  return (
    <div className="summary-item">
      <span className="meta-label">{label}</span>
      <span className={mono ? 'summary-value summary-value-mono' : 'summary-value'}>{value}</span>
    </div>
  );
}

function MessagesTab({ session }: { session: CanonicalSession }): React.JSX.Element {
  return (
    <div className="detail-scroll messages-tab-scroll">
      <section className="content-section">
        <div className="section-header">
          <div>
            <div className="section-label">Transcript</div>
            <h3 className="section-title">Messages</h3>
          </div>
          <span className="section-counter">{session.messages.length}</span>
        </div>
        <div className="message-list">
          {session.messages.map(message => <MessageCard key={message.id} message={message} />)}
        </div>
      </section>

      <section className="content-section">
        <div className="section-header">
          <div>
            <div className="section-label">Execution</div>
            <h3 className="section-title">Tool calls</h3>
          </div>
          <span className="section-counter">{session.toolCalls.length}</span>
        </div>
        {session.toolCalls.length > 0 ? (
          <div className="tool-call-list">
            {session.toolCalls.map(toolCall => <ToolCallCard key={toolCall.id} toolCall={toolCall} />)}
          </div>
        ) : (
          <p className="empty-copy empty-copy-left">No tool calls were captured for this session.</p>
        )}
      </section>
    </div>
  );
}

function MessageCard({ message, compact = false }: { message: CanonicalMessage; compact?: boolean }): React.JSX.Element {
  return (
    <article className={`message-card role-${message.role}${compact ? ' is-compact' : ''}`}>
      <div className="message-head">
        <span className={`role-pill role-${message.role}`}>{message.role}</span>
        <span className="message-meta">{message.timestamp || message.toolName || message.id}</span>
      </div>
      <div className="message-body">{message.text || renderJson(message.toolResult ?? message.toolInput ?? message.metadata) || '(empty)'}</div>
    </article>
  );
}

function ToolCallCard({ toolCall }: { toolCall: CanonicalToolCall }): React.JSX.Element {
  return (
    <article className="tool-call-card">
      <div className="tool-call-head">
        <div>
          <div className="tool-call-name">{toolCall.name}</div>
          {toolCall.timestamp && <div className="tool-call-meta">{toolCall.timestamp}</div>}
        </div>
        <span className={`status-pill ${toolCall.isError ? 'is-error' : 'is-ok'}`}>{toolCall.isError ? 'Error' : 'OK'}</span>
      </div>
      <details className="tool-details">
        <summary>Input and output</summary>
        <pre className="code-block">{renderJson({ input: toolCall.input, output: toolCall.output, isError: toolCall.isError })}</pre>
      </details>
    </article>
  );
}

function renderJson(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}
