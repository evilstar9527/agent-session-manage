import type { CanonicalSession, DiscoveredSession } from '../model/session.js';
import { discoverClaudeSessions } from '../discovery/claude.js';
import { discoverCodexSessions } from '../discovery/codex.js';
import { parseClaudeSession } from '../parsers/claude.js';
import { parseCodexSession } from '../parsers/codex.js';
import { SessionRepository } from '../store/repo.js';

export interface ScanResult {
  discovered: number;
  imported: number;
  skipped: number;
}

export async function scanSessions(repo: SessionRepository): Promise<ScanResult> {
  const discovered = [...(await discoverClaudeSessions()), ...(await discoverCodexSessions())];

  let imported = 0;
  let skipped = 0;

  for (const item of discovered) {
    const existing = repo.getImportFingerprint(item.filePath);
    if (
      existing &&
      existing.size === item.fingerprint.size &&
      existing.mtimeMs === item.fingerprint.mtimeMs &&
      existing.quickHash === item.fingerprint.quickHash
    ) {
      skipped += 1;
      continue;
    }

    const session = await parseDiscoveredSession(item);
    repo.upsertSession(session, item.fingerprint);
    imported += 1;
  }

  return {
    discovered: discovered.length,
    imported,
    skipped,
  };
}

async function parseDiscoveredSession(session: DiscoveredSession): Promise<CanonicalSession> {
  if (session.source === 'claude') {
    return parseClaudeSession(session.filePath);
  }
  return parseCodexSession(session.filePath);
}
