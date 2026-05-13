import { readFile } from 'node:fs/promises';

export async function readJsonLines(filePath: string): Promise<Array<{ lineNumber: number; value: unknown }>> {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const records: Array<{ lineNumber: number; value: unknown }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) {
      continue;
    }
    records.push({
      lineNumber: index + 1,
      value: JSON.parse(line),
    });
  }

  return records;
}

export function stringifyCompact(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export function collapseWhitespace(text: string, maxLength = 120): string {
  return text.split(/\s+/).join(' ').trim().slice(0, maxLength);
}
