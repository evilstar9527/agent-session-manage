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
import { getDatabasePath } from '../utils/paths.js';
import { materializeCodexSession } from '../convert/claude-to-codex.js';
import { materializeClaudeSession } from '../convert/codex-to-claude.js';

const execFileAsync = promisify(execFile);

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

export class SessionService {
  private createRepo(): SessionRepository {
    return new SessionRepository(getDatabasePath());
  }

  async scan(): Promise<{ discovered: number; imported: number; skipped: number }> {
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

  getResumeCommand(id: string): ResumeCommand {
    const session = this.get(id);
    if (!session) {
      throw new Error(`session not found: ${id}`);
    }

    const sessionId = session.sourceSessionId || session.id.replace(/^(claude|codex):/, '');
    const cwd = session.projectPath;

    if (session.source === 'codex') {
      return {
        source: session.source,
        command: ['codex', 'resume', ...(cwd ? ['--cd', cwd] : []), sessionId].map(shellQuote).join(' '),
        cwd,
        sessionId,
      };
    }

    const resume = ['claude', '--resume', sessionId].map(shellQuote).join(' ');
    return {
      source: session.source,
      command: cwd ? `cd ${shellQuote(cwd)} && ${resume}` : resume,
      cwd,
      sessionId,
    };
  }

  async launchResume(id: string): Promise<ResumeCommand> {
    const resume = this.getResumeCommand(id);
    await openCommandInTerminal(resume.command);
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

async function openCommandInTerminal(command: string): Promise<void> {
  if (process.platform === 'darwin') {
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
