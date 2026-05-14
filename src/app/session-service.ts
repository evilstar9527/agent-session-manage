import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { exportSessionMarkdown } from '../export/markdown.js';
import { scanSessions } from '../indexer/index.js';
import type { CanonicalSession, SessionPreview } from '../model/session.js';
import { parseClaudeSession } from '../parsers/claude.js';
import { parseCodexSession } from '../parsers/codex.js';
import { SessionRepository } from '../store/repo.js';
import { detectJsonlSource } from '../utils/detect.js';
import { getClaudeHome, getCodexHome, getDatabasePath } from '../utils/paths.js';
import { materializeCodexSession } from '../convert/claude-to-codex.js';
import { materializeClaudeSession } from '../convert/codex-to-claude.js';

const execFileAsync = promisify(execFile);
type ScanResult = { discovered: number; imported: number; skipped: number };
export type TerminalApp = 'system' | 'ghostty';

export interface ConvertRequest {
  input: string;
  target: 'claude' | 'codex';
  outputPath: string;
}

export interface ResumeCommand {
  source: 'claude' | 'codex';
  command: string;
  cwd?: string;
  sessionId: string;
}

export interface ResumeRequest {
  id: string;
  target?: 'claude' | 'codex';
  terminal?: TerminalApp;
}

export class SessionService {
  private scanPromise?: Promise<ScanResult>;

  private createRepo(): SessionRepository {
    return new SessionRepository(getDatabasePath());
  }

  async scan(): Promise<ScanResult> {
    if (this.scanPromise) {
      return this.scanPromise;
    }

    this.scanPromise = this.runScan();
    try {
      return await this.scanPromise;
    } finally {
      this.scanPromise = undefined;
    }
  }

  private async runScan(): Promise<ScanResult> {
    const repo = this.createRepo();
    try {
      return await scanSessions(repo);
    } finally {
      repo.close();
    }
  }

  list(limit = 50): SessionPreview[] {
    const repo = this.createRepo();
    try {
      return repo.listSessions(limit);
    } finally {
      repo.close();
    }
  }

  search(query: string, limit = 50): SessionPreview[] {
    const repo = this.createRepo();
    try {
      return repo.searchSessions(query, limit);
    } finally {
      repo.close();
    }
  }

  get(id: string): CanonicalSession | undefined {
    const repo = this.createRepo();
    try {
      return repo.getSession(id);
    } finally {
      repo.close();
    }
  }

  addTag(id: string, tag: string): boolean {
    const repo = this.createRepo();
    try {
      return repo.addTag(id, tag);
    } finally {
      repo.close();
    }
  }

  archive(id: string): boolean {
    const repo = this.createRepo();
    try {
      return repo.setArchived(id, true);
    } finally {
      repo.close();
    }
  }

  delete(id: string): boolean {
    const repo = this.createRepo();
    try {
      return repo.deleteSession(id);
    } finally {
      repo.close();
    }
  }

  pin(id: string, pinned: boolean): boolean {
    const repo = this.createRepo();
    try {
      return repo.setPinned(id, pinned);
    } finally {
      repo.close();
    }
  }

  getResumeCommand(id: string): ResumeCommand {
    const session = this.get(id);
    if (!session) {
      throw new Error(`session not found: ${id}`);
    }

    const sessionId = session.sourceSessionId || session.id.replace(/^(claude|codex):/, '');
    return buildResumeCommand(session.source, sessionId, session.projectPath);
  }

  async getResumeAsCommand(request: ResumeRequest): Promise<ResumeCommand> {
    const session = this.get(request.id);
    if (!session) {
      throw new Error(`session not found: ${request.id}`);
    }

    const target = request.target || session.source;
    const sessionId = await this.materializeForResume(session, target);
    return buildResumeCommand(target, sessionId, session.projectPath);
  }

  async launchResume(id: string, terminal: TerminalApp = 'system'): Promise<ResumeCommand> {
    const resume = this.getResumeCommand(id);
    await openCommandInTerminal(resume.command, terminal);
    return resume;
  }

  async launchResumeAs(request: ResumeRequest): Promise<ResumeCommand> {
    const resume = await this.getResumeAsCommand(request);
    await openCommandInTerminal(resume.command, request.terminal ?? 'system');
    return resume;
  }

  async exportMarkdown(id: string, outputPath: string): Promise<string> {
    const session = this.get(id);
    if (!session) {
      throw new Error(`session not found: ${id}`);
    }
    await exportSessionMarkdown(session, outputPath);
    return outputPath;
  }

  async convert(request: ConvertRequest): Promise<string> {
    const session = await this.loadInput(request.input);
    if (!session) {
      throw new Error(`session not found: ${request.input}`);
    }

    if (request.target === 'claude') {
      const result = await materializeClaudeSession(session, request.outputPath);
      return result.sessionFile;
    }

    const result = await materializeCodexSession(session, request.outputPath);
    return result.sessionFile;
  }

  private async materializeForResume(session: CanonicalSession, target: 'claude' | 'codex'): Promise<string> {
    if (target === session.source) {
      return session.sourceSessionId || session.id.replace(/^(claude|codex):/, '');
    }

    if (target === 'claude') {
      const result = await materializeClaudeSession(session, getClaudeHome());
      return result.sessionId;
    }

    const result = await materializeCodexSession(session, getCodexHome());
    return result.sessionId;
  }

  async loadInput(input: string): Promise<CanonicalSession | undefined> {
    const repoSession = this.get(input);
    if (repoSession) {
      return repoSession;
    }

    if (!input.endsWith('.jsonl')) {
      return undefined;
    }

    const source = await detectJsonlSource(input);
    return source === 'claude' ? parseClaudeSession(input) : parseCodexSession(input);
  }

  resolveOutputPath(targetPath: string): string {
    return path.resolve(targetPath);
  }
}

export const sessionService = new SessionService();

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildResumeCommand(source: 'claude' | 'codex', sessionId: string, cwd?: string): ResumeCommand {
  if (source === 'codex') {
    return {
      source,
      command: ['codex', 'resume', ...(cwd ? ['--cd', cwd] : []), sessionId].map(shellQuote).join(' '),
      cwd,
      sessionId,
    };
  }

  const resume = ['claude', '--resume', sessionId].map(shellQuote).join(' ');
  return {
    source,
    command: cwd ? `cd ${shellQuote(cwd)} && ${resume}` : resume,
    cwd,
    sessionId,
  };
}

async function openCommandInTerminal(command: string, terminal: TerminalApp): Promise<void> {
  if (process.platform === 'darwin') {
    if (terminal === 'ghostty') {
      await execFileAsync('open', ['-na', 'Ghostty.app', '--args', '-e', 'zsh', '-lc', command]);
      return;
    }

    await execFileAsync('osascript', [
      '-e',
      `tell application "Terminal" to do script "${escapeAppleScriptString(command)}"`,
      '-e',
      'tell application "Terminal" to activate',
    ]);
    return;
  }

  if (process.platform === 'win32') {
    await execFileAsync('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', command]);
    return;
  }

  await execFileAsync('x-terminal-emulator', ['-e', `sh -lc ${shellQuote(command)}`]);
}

function escapeAppleScriptString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
