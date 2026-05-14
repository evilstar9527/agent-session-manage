import { existsSync, watch, type FSWatcher } from 'node:fs';
import { BrowserWindow } from 'electron';
import { sessionService } from '../app/session-service.js';
import { getClaudeProjectsDir, getCodexHome } from '../utils/paths.js';

type WatchStatus = 'ok' | 'error';

interface WatchPayload {
  status: WatchStatus;
  reason: 'startup' | 'filesystem';
  discovered?: number;
  imported?: number;
  skipped?: number;
  message?: string;
}

const WATCH_DEBOUNCE_MS = 1500;
const WATCH_ROOTS = [
  getClaudeProjectsDir(),
  `${getCodexHome()}/sessions`,
  `${getCodexHome()}/archived_sessions`,
];

let watchers: FSWatcher[] = [];
let scanTimer: NodeJS.Timeout | undefined;
let scanRunning = false;
let scanQueued = false;

export function startSessionWatcher(): void {
  queueScan('startup', 150);

  for (const root of WATCH_ROOTS) {
    if (!existsSync(root)) {
      continue;
    }

    try {
      watchers.push(watch(root, { recursive: true }, () => {
        queueScan('filesystem', WATCH_DEBOUNCE_MS);
      }));
    } catch (caught) {
      notifyWindows({
        status: 'error',
        reason: 'filesystem',
        message: caught instanceof Error ? caught.message : String(caught),
      });
    }
  }
}

export function stopSessionWatcher(): void {
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = undefined;
  }

  for (const watcher of watchers) {
    watcher.close();
  }
  watchers = [];
}

function queueScan(reason: WatchPayload['reason'], delayMs: number): void {
  if (scanTimer) {
    clearTimeout(scanTimer);
  }

  scanTimer = setTimeout(() => {
    scanTimer = undefined;
    void runScan(reason);
  }, delayMs);
}

async function runScan(reason: WatchPayload['reason']): Promise<void> {
  if (scanRunning) {
    scanQueued = true;
    return;
  }

  scanRunning = true;
  try {
    const result = await sessionService.scan();
    notifyWindows({ status: 'ok', reason, ...result });
  } catch (caught) {
    notifyWindows({
      status: 'error',
      reason,
      message: caught instanceof Error ? caught.message : String(caught),
    });
  } finally {
    scanRunning = false;
  }

  if (scanQueued) {
    scanQueued = false;
    queueScan('filesystem', WATCH_DEBOUNCE_MS);
  }
}

function notifyWindows(payload: WatchPayload): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('sessions:indexUpdated', payload);
  }
}
