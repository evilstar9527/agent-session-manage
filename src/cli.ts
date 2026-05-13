import { stat } from 'node:fs/promises';
import { Command } from 'commander';
import { materializeCodexSession } from './convert/claude-to-codex.js';
import { materializeClaudeSession } from './convert/codex-to-claude.js';
import { exportSessionMarkdown } from './export/markdown.js';
import { scanSessions } from './indexer/index.js';
import type { CanonicalSession, SessionPreview } from './model/session.js';
import { parseClaudeSession } from './parsers/claude.js';
import { parseCodexSession } from './parsers/codex.js';
import { SessionRepository } from './store/repo.js';
import { detectJsonlSource } from './utils/detect.js';
import { getDatabasePath } from './utils/paths.js';
import { sessionService } from './app/session-service.js';

const program = new Command();

program
  .name('sessions')
  .description('Manage Claude Code and Codex sessions from a unified local index');

program
  .command('scan')
  .description('Discover local Claude Code and Codex sessions and import them into the local index')
  .action(async () => {
    const repo = new SessionRepository(getDatabasePath());
    try {
      const result = await scanSessions(repo);
      console.log(`discovered ${result.discovered} sessions`);
      console.log(`imported ${result.imported} sessions`);
      console.log(`skipped ${result.skipped} unchanged sessions`);
    } finally {
      repo.close();
    }
  });

program
  .command('list')
  .description('List indexed sessions')
  .option('-n, --limit <number>', 'maximum number of sessions to display', value => Number(value), 20)
  .action(options => {
    const repo = new SessionRepository(getDatabasePath());
    try {
      printPreviews(repo.listSessions(options.limit));
    } finally {
      repo.close();
    }
  });

program
  .command('search')
  .description('Search indexed sessions by id, title, path, or message text')
  .argument('<query>', 'search query')
  .option('-n, --limit <number>', 'maximum number of sessions to display', value => Number(value), 20)
  .action((query, options) => {
    const repo = new SessionRepository(getDatabasePath());
    try {
      printPreviews(repo.searchSessions(query, options.limit));
    } finally {
      repo.close();
    }
  });

program
  .command('show')
  .description('Show one indexed session')
  .argument('<id>', 'session id')
  .option('--json', 'print full session as JSON', false)
  .action((id, options) => {
    const repo = new SessionRepository(getDatabasePath());
    try {
      const session = repo.getSession(id);
      if (!session) {
        console.error(`session not found: ${id}`);
        process.exitCode = 1;
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(session, null, 2));
        return;
      }

      console.log(`id\t${session.id}`);
      console.log(`source\t${session.source}`);
      console.log(`title\t${session.title || '(untitled)'}`);
      console.log(`project\t${session.projectPath || '-'}`);
      console.log(`updated\t${session.updatedAt || session.createdAt || '-'}`);
      console.log(`messages\t${session.messages.length}`);
      console.log('');
      for (const message of session.messages) {
        console.log(`[${message.role}] ${message.text || ''}`);
      }
    } finally {
      repo.close();
    }
  });

program
  .command('export-md')
  .description('Export one indexed session as Markdown')
  .argument('<id>', 'session id')
  .argument('<output>', 'markdown output path')
  .action(async (id, output) => {
    const repo = new SessionRepository(getDatabasePath());
    try {
      const session = repo.getSession(id);
      if (!session) {
        console.error(`session not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      await exportSessionMarkdown(session, output);
      console.log(output);
    } finally {
      repo.close();
    }
  });

program
  .command('convert')
  .description('Convert one indexed or on-disk session to the target format')
  .argument('<input>', 'indexed session id or direct source file path')
  .requiredOption('--to <target>', 'target format: claude or codex')
  .requiredOption('--output <path>', 'output file or target home path')
  .action(async (input, options: { to: string; output: string }) => {
    const session = await loadSessionInput(input);
    if (!session) {
      console.error(`session not found: ${input}`);
      process.exitCode = 1;
      return;
    }

    if (options.to === 'claude') {
      const result = await materializeClaudeSession(session, options.output);
      console.log(result.sessionFile);
      return;
    }

    if (options.to === 'codex') {
      const result = await materializeCodexSession(session, options.output);
      console.log(result.sessionFile);
      return;
    }

    console.error(`unsupported target: ${options.to}`);
    process.exitCode = 1;
  });

program
  .command('tag-add')
  .description('Add a tag to an indexed session')
  .argument('<id>', 'session id')
  .argument('<tag>', 'tag value')
  .action((id, tag) => {
    const repo = new SessionRepository(getDatabasePath());
    try {
      if (!repo.addTag(id, tag)) {
        console.error(`session not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      console.log(`tagged ${id} with ${tag}`);
    } finally {
      repo.close();
    }
  });

program
  .command('archive')
  .description('Mark an indexed session as archived')
  .argument('<id>', 'session id')
  .action(id => {
    const repo = new SessionRepository(getDatabasePath());
    try {
      if (!repo.setArchived(id, true)) {
        console.error(`session not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      console.log(`archived ${id}`);
    } finally {
      repo.close();
    }
  });

program
  .command('delete')
  .description('Delete an indexed session record without deleting the source JSONL file')
  .argument('<id>', 'session id')
  .action(id => {
    const repo = new SessionRepository(getDatabasePath());
    try {
      if (!repo.deleteSession(id)) {
        console.error(`session not found: ${id}`);
        process.exitCode = 1;
        return;
      }
      console.log(`deleted ${id}`);
    } finally {
      repo.close();
    }
  });

program
  .command('resume-command')
  .description('Print the command for resuming a session in its native CLI')
  .argument('<id>', 'session id')
  .action(id => {
    try {
      console.log(sessionService.getResumeCommand(id).command);
    } catch (caught) {
      console.error(caught instanceof Error ? caught.message : String(caught));
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);

function printPreviews(sessions: SessionPreview[]): void {
  for (const session of sessions) {
    console.log([
      session.id,
      session.source,
      session.updatedAt || session.createdAt || '-',
      session.title || '(untitled)',
      session.projectPath || '-',
    ].join('\t'));
  }
}

async function loadSessionInput(input: string): Promise<CanonicalSession | undefined> {
  if (await isFile(input) && input.endsWith('.jsonl')) {
    const source = await detectJsonlSource(input);
    return source === 'claude' ? parseClaudeSession(input) : parseCodexSession(input);
  }

  const repo = new SessionRepository(getDatabasePath());
  try {
    return repo.getSession(input);
  } finally {
    repo.close();
  }
}

async function isFile(targetPath: string): Promise<boolean> {
  try {
    const info = await stat(targetPath);
    return info.isFile();
  } catch {
    return false;
  }
}
