import React, { useEffect, useMemo, useState } from 'react';
import type { CanonicalSession, SessionPreview } from '../model/session.js';
import { ConvertDialog } from './components/ConvertDialog.js';
import { ExportDialog } from './components/ExportDialog.js';
import { SessionDetail } from './components/SessionDetail.js';
import { SessionList } from './components/SessionList.js';
import { Toolbar } from './components/Toolbar.js';

export function App(): React.JSX.Element {
  const [sessions, setSessions] = useState<SessionPreview[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [selectedSession, setSelectedSession] = useState<CanonicalSession | undefined>();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [showConvert, setShowConvert] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const selectedPreview = useMemo(() => sessions.find(session => session.id === selectedId), [sessions, selectedId]);
  const claudeCount = useMemo(() => sessions.filter(session => session.source === 'claude').length, [sessions]);
  const codexCount = useMemo(() => sessions.filter(session => session.source === 'codex').length, [sessions]);
  const totalMessages = useMemo(() => sessions.reduce((count, session) => count + session.messageCount, 0), [sessions]);

  function getDesktopApi(): Window['desktopApi'] {
    if (!window.desktopApi) {
      throw new Error('Desktop API bridge is unavailable. Please fully restart the desktop app.');
    }
    return window.desktopApi;
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  useEffect(() => {
    if (!message && !error) {
      return;
    }

    const timer = window.setTimeout(() => {
      setMessage(undefined);
      setError(undefined);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [message, error]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedSession(undefined);
      return;
    }

    void (async () => {
      const session = await getDesktopApi().get(selectedId);
      setSelectedSession(session);
    })();
  }, [selectedId]);

  async function loadSessions(nextQuery?: string): Promise<void> {
    setLoading(true);
    setError(undefined);
    try {
      const effectiveQuery = nextQuery ?? query;
      const rows = effectiveQuery ? await getDesktopApi().search(effectiveQuery, 200) : await getDesktopApi().list(200);
      setSessions(rows);
      if (!selectedId && rows[0]) {
        setSelectedId(rows[0].id);
      }
      if (selectedId && !rows.some(session => session.id === selectedId)) {
        setSelectedId(rows[0]?.id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  async function handleScan(): Promise<void> {
    setLoading(true);
    setMessage('Scanning local Claude Code and Codex sessions…');
    setError(undefined);
    try {
      const result = await getDesktopApi().scan();
      setMessage(`Scanned ${result.discovered} sessions, imported ${result.imported}, skipped ${result.skipped}.`);
      await loadSessions();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!selectedId) {
      return;
    }
    const deletingId = selectedId;
    const deleted = await getDesktopApi().deleteSession(deletingId);
    if (deleted) {
      setMessage(`Deleted ${deletingId} from index`);
      setSelectedId(undefined);
      setSelectedSession(undefined);
      await loadSessions();
    }
  }

  return (
    <div className="app-shell">
      <div className="app-layout">
        <section className="toolbar-card">
          <Toolbar
            loading={loading}
            query={query}
            claudeCount={claudeCount}
            codexCount={codexCount}
            visibleCount={sessions.length}
            totalMessages={totalMessages}
            focusSource={selectedPreview?.source}
            focusBranch={selectedPreview?.gitBranch}
            onQueryChange={async nextQuery => {
              setQuery(nextQuery);
              await loadSessions(nextQuery);
            }}
            onScan={handleScan}
          />
        </section>

        <section className="workspace-grid">
          <div className="panel">
            <SessionList sessions={sessions} selectedId={selectedId} onSelect={setSelectedId} loading={loading} query={query} />
          </div>
          <div className="panel">
            <SessionDetail
              session={selectedSession}
              loading={loading}
              message={message}
              error={error}
              onExport={() => setShowExport(true)}
              onConvert={() => setShowConvert(true)}
              onDelete={handleDelete}
            />
          </div>
        </section>

        {showConvert && selectedPreview && (
          <ConvertDialog
            sessionId={selectedPreview.id}
            onClose={() => setShowConvert(false)}
            onComplete={value => setMessage(`Converted to ${value}`)}
          />
        )}

        {showExport && selectedPreview && (
          <ExportDialog
            sessionId={selectedPreview.id}
            onClose={() => setShowExport(false)}
            onComplete={value => setMessage(`Exported to ${value}`)}
          />
        )}

        {(message || error) && (
          <div className={`toast-card${error ? ' is-error' : ''}`}>
            {error || message}
          </div>
        )}
      </div>
    </div>
  );
}
