// EXPORTS: getItem, setItem, removeItem, getAllKeys, clearAll, exportAllData, importAllData

import { scopedStorage } from '@lark-apaas/client-toolkit-lite';
import { logger } from '@lark-apaas/client-toolkit-lite';

const STORAGE_KEYS = {
  transactions: '__budget_transactions',
  budgets: '__budget_budgets',
  accounts: '__budget_accounts',
} as const;

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

function getItem<T>(key: StorageKey): T[] {
  try {
    const raw = scopedStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.error('storage.getItem failed:', String(error));
    return [];
  }
}

function setItem<T>(key: StorageKey, data: T[]): void {
  try {
    scopedStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    logger.error('storage.setItem failed:', String(error));
  }
}

function removeItem(key: StorageKey): void {
  try {
    scopedStorage.removeItem(key);
  } catch (error) {
    logger.error('storage.removeItem failed:', String(error));
  }
}

function getAllKeys(): StorageKey[] {
  return Object.values(STORAGE_KEYS);
}

function clearAll(): void {
  try {
    for (const key of getAllKeys()) {
      scopedStorage.removeItem(key);
    }
  } catch (error) {
    logger.error('storage.clearAll failed:', String(error));
  }
}

interface IExportData {
  version: number;
  exportedAt: string;
  transactions: unknown[];
  budgets: unknown[];
  accounts: unknown[];
}

function exportAllData(): void {
  try {
    const data: IExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions: getItem(STORAGE_KEYS.transactions),
      budgets: getItem(STORAGE_KEYS.budgets),
      accounts: getItem(STORAGE_KEYS.accounts),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    logger.error('storage.exportAllData failed:', String(error));
  }
}

function importAllData(jsonString: string): boolean {
  try {
    const data: IExportData = JSON.parse(jsonString);
    if (!data.version || !Array.isArray(data.transactions) || !Array.isArray(data.budgets) || !Array.isArray(data.accounts)) {
      return false;
    }

    const existingTransactions = getItem(STORAGE_KEYS.transactions);
    const existingBudgets = getItem(STORAGE_KEYS.budgets);
    const existingAccounts = getItem(STORAGE_KEYS.accounts);

    const mergedTransactions = [...existingTransactions, ...data.transactions];
    const mergedBudgets = [...existingBudgets, ...data.budgets];
    const mergedAccounts = [...existingAccounts, ...data.accounts];

    setItem(STORAGE_KEYS.transactions, mergedTransactions);
    setItem(STORAGE_KEYS.budgets, mergedBudgets);
    setItem(STORAGE_KEYS.accounts, mergedAccounts);

    return true;
  } catch (error) {
    logger.error('storage.importAllData failed:', String(error));
    return false;
  }
}

export { STORAGE_KEYS, getItem, setItem, removeItem, getAllKeys, clearAll, exportAllData, importAllData };
export type { StorageKey, IExportData };
