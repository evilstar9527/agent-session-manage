import { readFile } from 'node:fs/promises';
import type { SessionSource } from '../model/session.js';

export async function detectJsonlSource(filePath: string): Promise<SessionSource> {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const value = JSON.parse(line) as Record<string, unknown>;
    if (value['type'] === 'session_meta' || value['type'] === 'turn_context' || value['type'] === 'response_item') {
      return 'codex';
    }
    if ((value['type'] === 'user' || value['type'] === 'assistant') && ('sessionId' in value || 'cwd' in value)) {
      return 'claude';
    }
  }

  throw new Error(`unable to detect session source for ${filePath}`);
}
