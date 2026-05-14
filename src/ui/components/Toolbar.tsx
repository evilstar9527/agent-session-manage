import React from 'react';

interface ToolbarProps {
  loading: boolean;
  query: string;
  claudeCount: number;
  codexCount: number;
  visibleCount: number;
  totalMessages: number;
  focusSource?: string;
  focusBranch?: string;
  terminal: 'system' | 'ghostty';
  onTerminalChange: (terminal: 'system' | 'ghostty') => void;
  onQueryChange: (query: string) => Promise<void>;
  onScan: () => Promise<void>;
}

export function Toolbar(props: ToolbarProps): React.JSX.Element {
  return (
    <div className="toolbar">
      <label className="search-box">
        <span className="search-label">Search sessions</span>
        <span className="search-input-row">
          <input
            className="text-input"
            value={props.query}
            onChange={event => void props.onQueryChange(event.target.value)}
            placeholder="Search title, path, branch, or source. Leave empty to show all sessions."
          />
          <button className="button button-primary" onClick={() => void props.onScan()} disabled={props.loading}>
            Search
          </button>
        </span>
      </label>
      <div className="hero-chip-row toolbar-summary">
        <span className="badge badge-source-claude">Claude {props.claudeCount}</span>
        <span className="badge badge-source-codex">Codex {props.codexCount}</span>
        <span className="meta-pill">Visible {props.visibleCount}</span>
        <span className="meta-pill">{props.totalMessages} messages</span>
        <span className="meta-pill">Focus {props.focusSource ?? '-'}</span>
        <span className="meta-pill">Branch {props.focusBranch ?? '-'}</span>
        <div className="terminal-picker" aria-label="Terminal">
          <span className="terminal-label">Terminal</span>
          <button
            className={`terminal-option${props.terminal === 'system' ? ' is-active' : ''}`}
            onClick={() => props.onTerminalChange('system')}
          >
            System
          </button>
          <button
            className={`terminal-option terminal-option-ghostty${props.terminal === 'ghostty' ? ' is-active' : ''}`}
            onClick={() => props.onTerminalChange('ghostty')}
          >
            Ghostty
          </button>
        </div>
      </div>
    </div>
  );
}
