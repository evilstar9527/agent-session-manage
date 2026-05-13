import React, { useState } from 'react';

const DEFAULT_CONVERT_OUTPUT_PATH = '~/work/agent-session-manage/convert-sessions';

interface ConvertDialogProps {
  sessionId: string;
  onClose: () => void;
  onComplete: (outputPath: string) => void;
}

export function ConvertDialog({ sessionId, onClose, onComplete }: ConvertDialogProps): React.JSX.Element {
  const [target, setTarget] = useState<'claude' | 'codex'>('codex');
  const [outputPath, setOutputPath] = useState(DEFAULT_CONVERT_OUTPUT_PATH);

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <h3 className="modal-title">Convert session</h3>
        <div className="modal-subtitle">{sessionId}</div>
        <label className="modal-field">
          <span className="search-label">Target format</span>
          <select className="select-input" value={target} onChange={event => setTarget(event.target.value as 'claude' | 'codex')}>
          <option value="codex">Codex</option>
          <option value="claude">Claude</option>
          </select>
        </label>
        <div className="split-input-row modal-field">
          <input className="text-input" value={outputPath} onChange={event => setOutputPath(event.target.value)} placeholder="output path" />
          <button className="button button-secondary" onClick={async () => setOutputPath((await window.desktopApi.chooseDirectory()) || outputPath)}>Browse</button>
        </div>
        <div className="modal-actions">
          <button className="button button-ghost" onClick={onClose}>Cancel</button>
          <button
            className="button button-primary"
            onClick={async () => {
              const result = await window.desktopApi.convert(sessionId, target, outputPath);
              onComplete(result);
              onClose();
            }}
            disabled={!outputPath.trim()}
          >
            Convert
          </button>
        </div>
      </div>
    </div>
  );
}
