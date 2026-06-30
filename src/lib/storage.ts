// EXPORTS: getItem, setItem, removeItem, getAllKeys, clearAll, exportAllData, importAllData

import { formatLocalISODate } from './date';

const STORAGE_KEYS = {
  transactions: '__budget_transactions',
  budgets: '__budget_budgets',
  accounts: '__budget_accounts',
  plannedExpenses: '__budget_planned_expenses',
} as const;

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

function getStorageBackend(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.error('storage.getStorageBackend failed:', String(error));
    return null;
  }
}

function getItem<T>(key: StorageKey): T[] {
  try {
    const raw = getStorageBackend()?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('storage.getItem failed:', String(error));
    return [];
  }
}

function setItem<T>(key: StorageKey, data: T[]): void {
  try {
    getStorageBackend()?.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('storage.setItem failed:', String(error));
  }
}

function removeItem(key: StorageKey): void {
  try {
    getStorageBackend()?.removeItem(key);
  } catch (error) {
    console.error('storage.removeItem failed:', String(error));
  }
}

function getAllKeys(): StorageKey[] {
  return Object.values(STORAGE_KEYS);
}

function clearAll(): void {
  try {
    for (const key of getAllKeys()) {
      getStorageBackend()?.removeItem(key);
    }
  } catch (error) {
    console.error('storage.clearAll failed:', String(error));
  }
}

interface IExportData {
  version: number;
  exportedAt: string;
  transactions: unknown[];
  budgets: unknown[];
  accounts: unknown[];
  plannedExpenses: unknown[];
}

function exportAllData(): void {
  try {
    const data: IExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions: getItem(STORAGE_KEYS.transactions),
      budgets: getItem(STORAGE_KEYS.budgets),
      accounts: getItem(STORAGE_KEYS.accounts),
      plannedExpenses: getItem(STORAGE_KEYS.plannedExpenses),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-export-${formatLocalISODate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('storage.exportAllData failed:', String(error));
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
    const existingPlannedExpenses = getItem(STORAGE_KEYS.plannedExpenses);

    const mergedTransactions = [...existingTransactions, ...data.transactions];
    const mergedBudgets = [...existingBudgets, ...data.budgets];
    const mergedAccounts = [...existingAccounts, ...data.accounts];
    const mergedPlannedExpenses = [...existingPlannedExpenses, ...(Array.isArray(data.plannedExpenses) ? data.plannedExpenses : [])];

    setItem(STORAGE_KEYS.transactions, mergedTransactions);
    setItem(STORAGE_KEYS.budgets, mergedBudgets);
    setItem(STORAGE_KEYS.accounts, mergedAccounts);
    setItem(STORAGE_KEYS.plannedExpenses, mergedPlannedExpenses);

    return true;
  } catch (error) {
    console.error('storage.importAllData failed:', String(error));
    return false;
  }
}

export { STORAGE_KEYS, getItem, setItem, removeItem, getAllKeys, clearAll, exportAllData, importAllData };
export type { StorageKey, IExportData };
