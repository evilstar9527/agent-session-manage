import path from 'node:path';
import type { DiscoveredSession } from '../model/session.js';
import { collectFiles, fingerprintFile } from '../utils/fs.js';
import { getCodexHome } from '../utils/paths.js';

function isRolloutFile(filePath: string): boolean {
  const name = path.basename(filePath);
  return name.startsWith('rollout-') && name.endsWith('.jsonl');
}

export async function discoverCodexSessions(): Promise<DiscoveredSession[]> {
  const root = getCodexHome();
  const files = [
    ...(await collectFiles(path.join(root, 'sessions'), isRolloutFile)),
    ...(await collectFiles(path.join(root, 'archived_sessions'), isRolloutFile)),
  ];

  return Promise.all(
    files.sort().map(async filePath => ({
      source: 'codex' as const,
      filePath,
      sessionId: path.basename(filePath, '.jsonl'),
      fingerprint: await fingerprintFile(filePath),
    })),
  );
}
