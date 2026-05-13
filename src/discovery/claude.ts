import path from 'node:path';
import type { DiscoveredSession } from '../model/session.js';
import { collectFiles, fingerprintFile } from '../utils/fs.js';
import { getClaudeProjectsDir } from '../utils/paths.js';

export async function discoverClaudeSessions(): Promise<DiscoveredSession[]> {
  const root = getClaudeProjectsDir();
  const files = await collectFiles(root, filePath => filePath.endsWith('.jsonl'));

  return Promise.all(
    files.map(async filePath => ({
      source: 'claude' as const,
      filePath,
      sessionId: path.basename(filePath, '.jsonl'),
      fingerprint: await fingerprintFile(filePath),
    })),
  );
}
