// ============================================================
// 账户服务模块
// ============================================================
import { accountsApi } from '@/api/index';
import type { IAccount } from '@/types/finance';
import { MOCK_ACCOUNTS } from '@/data/finance';
import { isElectronRuntime } from '../electron-api';
import { lsLoadAccounts, lsSaveAccounts, lsLoadTransactions, lsSaveTransactions } from '../storage';

function nowLocalISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function loadAccounts(): Promise<IAccount[]> {
  if (isElectronRuntime()) {
    try {
      const res = await accountsApi.list();
      return res.success ? res.data : lsLoadAccounts();
    } catch {
      return lsLoadAccounts();
    }
  }
  return lsLoadAccounts();
}

export async function saveAccounts(accounts: IAccount[]): Promise<void> {
  if (isElectronRuntime()) return;
  lsSaveAccounts(accounts);
}

export async function createAccount(data: Partial<IAccount>): Promise<IAccount | null> {
  if (isElectronRuntime()) {
    try {
      const res = await accountsApi.create(data);
      return res.success ? res.data : null;
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
    type: (data.type as IAccount['type']) || 'debit_card',
    balance: data.balance ?? 0,
    creditLimit: data.creditLimit,
    billingDay: data.billingDay,
    repaymentDay: data.repaymentDay,
    cashOutDelayDays: data.cashOutDelayDays,
    note: data.note ?? '',
    createdAt: now,
    updatedAt: now,
  };
  accounts.push(newAccount);
  lsSaveAccounts(accounts);
  return newAccount;
}

export async function updateAccount(id: string, data: Partial<IAccount>): Promise<IAccount | null> {
  if (isElectronRuntime()) {
    try {
      const res = await accountsApi.update(id, data);
      return res.success ? res.data : null;
    } catch {
      return null;
    }
  }
  const accounts = lsLoadAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  accounts[idx] = { ...accounts[idx], ...data, updatedAt: new Date().toISOString() } as IAccount;
  lsSaveAccounts(accounts);
  return accounts[idx];
}

export async function deleteAccount(id: string): Promise<boolean> {
  if (isElectronRuntime()) {
    try {
      const res = await accountsApi.remove(id);
      return Boolean(res.success);
    } catch {
      return false;
    }
  }
  const accounts = lsLoadAccounts().filter((a) => a.id !== id);
  const transactions = lsLoadTransactions().filter((t) => t.accountId !== id);
  lsSaveAccounts(accounts);
  lsSaveTransactions(transactions);
  return true;
}

export function getDefaultAccounts(): IAccount[] {
  return MOCK_ACCOUNTS;
}
