// src/lib/data-service.ts — 统一数据服务层
// Electron 环境：调用后端 RESTful API（Express + SQLite）
// 浏览器开发环境：使用 localStorage（兼容原有行为）

import { accountsApi, transactionsApi, budgetsApi, statisticsApi, type TransactionFilters, type BudgetWithStats } from '@/api/index';
import type { ITransaction, IBudget, IAccount } from '@/types/finance';
import {
  getItem,
  setItem,
  STORAGE_KEYS,
  exportAllData,
  importAllData,
} from './storage';

// ============================================================
// localStorage 辅助函数
// ============================================================
function lsLoadAccounts(): IAccount[] {
  return getItem<IAccount>(STORAGE_KEYS.accounts);
}
function lsSaveAccounts(accounts: IAccount[]): void {
  setItem(STORAGE_KEYS.accounts, accounts);
}
function lsLoadTransactions(): ITransaction[] {
  return getItem<ITransaction>(STORAGE_KEYS.transactions);
}
function lsSaveTransactions(transactions: ITransaction[]): void {
  setItem(STORAGE_KEYS.transactions, transactions);
}
function lsLoadBudgets(): IBudget[] {
  return getItem<IBudget>(STORAGE_KEYS.budgets);
}
function lsSaveBudgets(budgets: IBudget[]): void {
  setItem(STORAGE_KEYS.budgets, budgets);
}

// ============================================================
// 环境检测
// ============================================================
function isElectron(): boolean {
  return !!(window as unknown as Record<string, unknown>).electronAPI;
}

// ============================================================
// 账户
// ============================================================
export async function loadAccounts(): Promise<IAccount[]> {
  if (isElectron()) {
    try {
      const res = await accountsApi.list();
      return res.data;
    } catch {
      return lsLoadAccounts();
    }
  }
  return lsLoadAccounts();
}

export async function saveAccounts(accounts: IAccount[]): Promise<void> {
  if (isElectron()) {
    // 逐个同步（API 不支持批量）
    return;
  }
  lsSaveAccounts(accounts);
}

export async function createAccount(data: Partial<IAccount>): Promise<IAccount | null> {
  if (isElectron()) {
    try {
      const res = await accountsApi.create(data);
      return res.data;
    } catch {
      return null;
    }
  }
  const accounts = lsLoadAccounts();
  const id = `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const newAccount: IAccount = {
    id,
    name: data.name || '',
    type: data.type || 'debit_card',
    note: data.note || '',
    createdAt: now,
    updatedAt: now,
  };
  accounts.push(newAccount);
  lsSaveAccounts(accounts);
  return newAccount;
}

export async function updateAccount(id: string, data: Partial<IAccount>): Promise<IAccount | null> {
  if (isElectron()) {
    try {
      const res = await accountsApi.update(id, data);
      return res.data;
    } catch {
      return null;
    }
  }
  const accounts = lsLoadAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  accounts[idx] = { ...accounts[idx], ...data, updatedAt: new Date().toISOString() };
  lsSaveAccounts(accounts);
  return accounts[idx];
}

export async function deleteAccount(id: string): Promise<boolean> {
  if (isElectron()) {
    try {
      await accountsApi.remove(id);
      return true;
    } catch {
      return false;
    }
  }
  const accounts = lsLoadAccounts().filter((a) => a.id !== id);
  lsSaveAccounts(accounts);
  return true;
}

// ============================================================
// 交易记录
// ============================================================
export async function loadTransactions(filters?: TransactionFilters): Promise<ITransaction[]> {
  if (isElectron()) {
    try {
      const res = await transactionsApi.list(filters);
      return res.data;
    } catch {
      return lsLoadTransactions();
    }
  }
  return lsLoadTransactions();
}

export async function saveTransactions(transactions: ITransaction[]): Promise<void> {
  if (isElectron()) return;
  lsSaveTransactions(transactions);
}

export async function createTransaction(data: Partial<ITransaction>): Promise<ITransaction | null> {
  if (isElectron()) {
    try {
      const res = await transactionsApi.create(data);
      return res.data;
    } catch {
      return null;
    }
  }
  const txns = lsLoadTransactions();
  const id = `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const newTxn: ITransaction = {
    id,
    date: data.date || now.slice(0, 10),
    accountId: data.accountId || '',
    amount: data.amount || 0,
    category: data.category || '其他',
    note: data.note || '',
    isBudgeted: data.isBudgeted || false,
    budgetId: data.budgetId,
    createdAt: now,
    updatedAt: now,
  };
  txns.push(newTxn);
  lsSaveTransactions(txns);
  return newTxn;
}

export async function updateTransaction(id: string, data: Partial<ITransaction>): Promise<ITransaction | null> {
  if (isElectron()) {
    try {
      const res = await transactionsApi.update(id, data);
      return res.data;
    } catch {
      return null;
    }
  }
  const txns = lsLoadTransactions();
  const idx = txns.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  txns[idx] = { ...txns[idx], ...data, updatedAt: new Date().toISOString() };
  lsSaveTransactions(txns);
  return txns[idx];
}

export async function deleteTransaction(id: string): Promise<boolean> {
  if (isElectron()) {
    try {
      await transactionsApi.remove(id);
      return true;
    } catch {
      return false;
    }
  }
  const txns = lsLoadTransactions().filter((t) => t.id !== id);
  lsSaveTransactions(txns);
  return true;
}

// ============================================================
// 预算
// ============================================================
export async function loadBudgets(): Promise<BudgetWithStats[]> {
  if (isElectron()) {
    try {
      const res = await budgetsApi.list();
      return res.data;
    } catch {
      return lsLoadBudgets().map((b) => ({ ...b, used: 0, rate: 0, remaining: b.amount }));
    }
  }
  return lsLoadBudgets().map((b) => ({ ...b, used: 0, rate: 0, remaining: b.amount }));
}

export async function saveBudgets(budgets: IBudget[]): Promise<void> {
  if (isElectron()) return;
  lsSaveBudgets(budgets);
}

export async function createBudget(data: Partial<IBudget>): Promise<BudgetWithStats | null> {
  if (isElectron()) {
    try {
      const res = await budgetsApi.create(data);
      return res.data;
    } catch {
      return null;
    }
  }
  const budgets = lsLoadBudgets();
  const id = `bud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const newBudget: IBudget = {
    id,
    name: data.name || '',
    amount: data.amount || 0,
    cycleType: data.cycleType || 'monthly',
    startDate: data.startDate || now.slice(0, 10),
    endDate: data.endDate,
    category: data.category,
    createdAt: now,
    updatedAt: now,
  };
  budgets.push(newBudget);
  lsSaveBudgets(budgets);
  return { ...newBudget, used: 0, rate: 0, remaining: newBudget.amount };
}

export async function updateBudget(id: string, data: Partial<IBudget>): Promise<BudgetWithStats | null> {
  if (isElectron()) {
    try {
      const res = await budgetsApi.update(id, data);
      return res.data;
    } catch {
      return null;
    }
  }
  const budgets = lsLoadBudgets();
  const idx = budgets.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  budgets[idx] = { ...budgets[idx], ...data, updatedAt: new Date().toISOString() };
  lsSaveBudgets(budgets);
  return { ...budgets[idx], used: 0, rate: 0, remaining: budgets[idx].amount };
}

export async function deleteBudget(id: string): Promise<boolean> {
  if (isElectron()) {
    try {
      await budgetsApi.remove(id);
      return true;
    } catch {
      return false;
    }
  }
  const budgets = lsLoadBudgets().filter((b) => b.id !== id);
  lsSaveBudgets(budgets);
  return true;
}

// ============================================================
// 统计（仅 Electron 模式走 API）
// ============================================================
export { statisticsApi };
