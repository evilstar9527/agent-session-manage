import { createHash } from 'node:crypto';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { SourceFingerprint } from '../model/session.js';

const QUICK_HASH_BYTES = 64 * 1024;

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function collectFiles(root: string, predicate: (filePath: string) => boolean): Promise<string[]> {
  if (!(await pathExists(root))) {
    return [];
  }

  const results: string[] = [];
  const queue = [root];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }
      if (entry.isFile() && predicate(entryPath)) {
        results.push(entryPath);
      }
    }
  }

  results.sort();
  return results;
}

export async function fingerprintFile(filePath: string): Promise<SourceFingerprint> {
  const stats = await stat(filePath);
  const handle = await open(filePath, 'r');

  try {
    const headLength = Math.min(Number(stats.size), QUICK_HASH_BYTES);
    const headBuffer = Buffer.alloc(headLength);
    await handle.read(headBuffer, 0, headLength, 0);

    let tailBuffer = Buffer.alloc(0);
    if (stats.size > QUICK_HASH_BYTES) {
      const tailLength = Math.min(Number(stats.size), QUICK_HASH_BYTES);
      tailBuffer = Buffer.alloc(tailLength);
      await handle.read(tailBuffer, 0, tailLength, Math.max(0, Number(stats.size) - tailLength));
    }

    const quickHash = createHash('sha1').update(headBuffer).update(tailBuffer).digest('hex');

    return {
      sourcePath: filePath,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      quickHash,
    };
  } finally {
    await handle.close();
  }
}
