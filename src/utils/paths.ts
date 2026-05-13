import os from 'node:os';
import path from 'node:path';

export const DEFAULT_CONVERT_OUTPUT_DIR = path.join(os.homedir(), 'work', 'agent-session-manage', 'convert-sessions');

export function getClaudeHome(): string {
  return process.env['CLAUDE_CONFIG_DIR']?.trim() || process.env['CLAUDE_HOME']?.trim() || path.join(os.homedir(), '.claude');
}

export function getClaudeProjectsDir(): string {
  return path.join(getClaudeHome(), 'projects');
}

export function getCodexHome(): string {
  return process.env['TRANSESSION_CODEX_HOME']?.trim() || process.env['CODEX_HOME']?.trim() || path.join(os.homedir(), '.codex');
}

export function getAppHome(): string {
  return process.env['SESSIONS_HOME']?.trim() || path.join(os.homedir(), '.agent-session-manage');
}

export function getDatabasePath(): string {
  return path.join(getAppHome(), 'index.sqlite');
}

export function normalizeProjectPath(input: string): string {
  return path.resolve(input);
}

export function pathToClaudeProjectBucket(projectPath: string): string {
  return normalizeProjectPath(projectPath).replace(/[/\\.]/g, '-');
}
