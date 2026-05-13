import { contextBridge, ipcRenderer } from 'electron';
import type { CanonicalSession, SessionPreview } from '../model/session.js';

type ScanResult = { discovered: number; imported: number; skipped: number };
type ResumeCommand = { source: 'claude' | 'codex'; command: string; cwd?: string; sessionId: string };

type DesktopApi = {
  scan: () => Promise<ScanResult>;
  list: (limit?: number) => Promise<SessionPreview[]>;
  search: (query: string, limit?: number) => Promise<SessionPreview[]>;
  get: (id: string) => Promise<CanonicalSession | undefined>;
  addTag: (id: string, tag: string) => Promise<boolean>;
  archive: (id: string) => Promise<boolean>;
  deleteSession: (id: string) => Promise<boolean>;
  resumeCommand: (id: string) => Promise<ResumeCommand>;
  launchResume: (id: string) => Promise<ResumeCommand>;
  exportMarkdown: (id: string, outputPath: string) => Promise<string>;
  convert: (input: string, target: 'claude' | 'codex', outputPath: string) => Promise<string>;
  chooseDirectory: () => Promise<string | undefined>;
  chooseMarkdownPath: () => Promise<string | undefined>;
};

const api: DesktopApi = {
  scan: () => ipcRenderer.invoke('sessions:scan'),
  list: limit => ipcRenderer.invoke('sessions:list', limit),
  search: (query, limit) => ipcRenderer.invoke('sessions:search', query, limit),
  get: id => ipcRenderer.invoke('sessions:get', id),
  addTag: (id, tag) => ipcRenderer.invoke('sessions:addTag', id, tag),
  archive: id => ipcRenderer.invoke('sessions:archive', id),
  deleteSession: id => ipcRenderer.invoke('sessions:delete', id),
  resumeCommand: id => ipcRenderer.invoke('sessions:resumeCommand', id),
  launchResume: id => ipcRenderer.invoke('sessions:launchResume', id),
  exportMarkdown: (id, outputPath) => ipcRenderer.invoke('sessions:exportMarkdown', id, outputPath),
  convert: (input, target, outputPath) => ipcRenderer.invoke('sessions:convert', input, target, outputPath),
  chooseDirectory: () => ipcRenderer.invoke('dialog:chooseDirectory'),
  chooseMarkdownPath: () => ipcRenderer.invoke('dialog:chooseMarkdownPath'),
};

contextBridge.exposeInMainWorld('desktopApi', api);

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
