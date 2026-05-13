import React, { useState } from 'react';

interface ExportDialogProps {
  sessionId: string;
  onClose: () => void;
  onComplete: (outputPath: string) => void;
}

export function ExportDialog({ sessionId, onClose, onComplete }: ExportDialogProps): React.JSX.Element {
  const [outputPath, setOutputPath] = useState('');

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <h3 className="modal-title">Export Markdown</h3>
        <div className="modal-subtitle">{sessionId}</div>
        <div className="split-input-row modal-field">
          <input
            className="text-input"
            value={outputPath}
            onChange={event => setOutputPath(event.target.value)}
            placeholder="output markdown path"
          />
          <button className="button button-secondary" onClick={async () => setOutputPath((await window.desktopApi.chooseMarkdownPath()) || outputPath)}>Browse</button>
        </div>
        <div className="modal-actions">
          <button className="button button-ghost" onClick={onClose}>Cancel</button>
          <button
            className="button button-primary"
            onClick={async () => {
              const result = await window.desktopApi.exportMarkdown(sessionId, outputPath);
              onComplete(result);
              onClose();
            }}
            disabled={!outputPath.trim()}
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
