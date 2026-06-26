type ExportDatabaseResult =
  | { success: true; path: string }
  | { success: false; error?: string };

type ImportDatabaseResult =
  | { success: true; path: string }
  | { success: false; error?: string };

export interface ElectronAPI {
  getApiBaseUrl: () => Promise<string>;
  openDataDirectory: () => Promise<void>;
  exportDatabase: () => Promise<ExportDatabaseResult>;
  importDatabase: () => Promise<ImportDatabaseResult>;
  getAppVersion: () => Promise<string>;
  getUserDataPath: () => Promise<string>;
  setCloseBehavior: (behavior: 'quit' | 'tray') => void;
  setAutoLaunch: (enabled: boolean) => Promise<boolean>;
  getAutoLaunch: () => Promise<boolean>;
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
}

export function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && 'electronAPI' in window;
}

export function getElectronAPI(): ElectronAPI | null {
  if (!isElectronRuntime()) return null;
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI ?? null;
}
