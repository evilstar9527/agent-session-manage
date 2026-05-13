import { dialog, ipcMain } from 'electron';
import { sessionService } from '../app/session-service.js';
import { DEFAULT_CONVERT_OUTPUT_DIR } from '../utils/paths.js';

export function registerIpcHandlers(): void {
  ipcMain.handle('sessions:scan', () => sessionService.scan());
  ipcMain.handle('sessions:list', (_event, limit?: number) => sessionService.list(limit));
  ipcMain.handle('sessions:search', (_event, query: string, limit?: number) => sessionService.search(query, limit));
  ipcMain.handle('sessions:get', (_event, id: string) => sessionService.get(id));
  ipcMain.handle('sessions:addTag', (_event, id: string, tag: string) => sessionService.addTag(id, tag));
  ipcMain.handle('sessions:archive', (_event, id: string) => sessionService.archive(id));
  ipcMain.handle('sessions:delete', (_event, id: string) => sessionService.delete(id));
  ipcMain.handle('sessions:resumeCommand', (_event, id: string) => sessionService.getResumeCommand(id));
  ipcMain.handle('sessions:launchResume', (_event, id: string) => sessionService.launchResume(id));
  ipcMain.handle('sessions:exportMarkdown', (_event, id: string, outputPath: string) => sessionService.exportMarkdown(id, outputPath));
  ipcMain.handle('sessions:convert', (_event, input: string, target: 'claude' | 'codex', outputPath: string) =>
    sessionService.convert({ input, target, outputPath }),
  );
  ipcMain.handle('dialog:chooseDirectory', async () => {
    const result = await dialog.showOpenDialog({
      defaultPath: DEFAULT_CONVERT_OUTPUT_DIR,
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle('dialog:chooseMarkdownPath', async () => {
    const result = await dialog.showSaveDialog({
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      defaultPath: 'session.md',
    });
    return result.canceled ? undefined : result.filePath;
  });
}
