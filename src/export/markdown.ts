import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CanonicalSession } from '../model/session.js';

export async function exportSessionMarkdown(session: CanonicalSession, outputPath: string): Promise<void> {
  const lines: string[] = [];

  lines.push(`# ${session.title || session.id}`);
  lines.push('');
  lines.push(`- Source: ${session.source}`);
  lines.push(`- Source session id: ${session.sourceSessionId}`);
  lines.push(`- Project path: ${session.projectPath || '-'}`);
  lines.push(`- Updated at: ${session.updatedAt || session.createdAt || '-'}`);
  lines.push(`- Git branch: ${session.git.branch || '-'}`);
  lines.push(`- Messages: ${session.messages.length}`);
  lines.push(`- Tool calls: ${session.toolCalls.length}`);
  lines.push('');
  lines.push('## Conversation');
  lines.push('');

  for (const message of session.messages) {
    lines.push(`### ${message.role}`);
    lines.push('');
    if (message.text) {
      lines.push(message.text);
      lines.push('');
    }
    if (message.toolName) {
      lines.push(`Tool: ${message.toolName}`);
      lines.push('');
    }
    if (message.toolInput !== undefined) {
      lines.push('```json');
      lines.push(JSON.stringify(message.toolInput, null, 2));
      lines.push('```');
      lines.push('');
    }
    if (message.toolResult !== undefined) {
      lines.push('```json');
      lines.push(JSON.stringify(message.toolResult, null, 2));
      lines.push('```');
      lines.push('');
    }
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, lines.join('\n'), 'utf8');
}
