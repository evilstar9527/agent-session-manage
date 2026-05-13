import React, { useState } from 'react';

interface TagEditorProps {
  sessionId: string;
  onClose: () => void;
  onComplete: (tag: string) => Promise<void>;
}

export function TagEditor({ sessionId, onClose, onComplete }: TagEditorProps): React.JSX.Element {
  const [tag, setTag] = useState('');

  return (
    <div className="modal-overlay">
      <div className="modal-dialog modal-dialog-compact">
        <h3 className="modal-title">Add tag</h3>
        <div className="modal-subtitle">{sessionId}</div>
        <label className="modal-field">
          <span className="search-label">Tag name</span>
          <input className="text-input" value={tag} onChange={event => setTag(event.target.value)} placeholder="bugfix, research, release..." />
        </label>
        <div className="modal-actions">
          <button className="button button-ghost" onClick={onClose}>Cancel</button>
          <button
            className="button button-primary"
            onClick={async () => {
              if (!tag.trim()) return;
              await window.desktopApi.addTag(sessionId, tag.trim());
              await onComplete(tag.trim());
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
