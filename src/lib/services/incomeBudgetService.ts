// ============================================================
// 收入预算服务模块
// ============================================================
import { incomeBudgetsApi } from '@/api/index';
import type { IIncomeBudget } from '@/types/finance';
import { isElectronRuntime } from '../electron-api';
import { lsLoadIncomeBudgets, lsSaveIncomeBudgets } from '../storage';
import { nowLocalISODate } from './transactionService';

export async function loadIncomeBudgets(): Promise<IIncomeBudget[]> {
  if (isElectronRuntime()) {
    try {
      const res = await incomeBudgetsApi.list();
      return Array.isArray(res) ? res : lsLoadIncomeBudgets();
    } catch {
      return lsLoadIncomeBudgets();
    }
  }
  return lsLoadIncomeBudgets();
}

export async function saveIncomeBudgets(items: IIncomeBudget[]): Promise<void> {
  if (isElectronRuntime()) return;
  lsSaveIncomeBudgets(items);
}

export async function createIncomeBudget(data: Partial<IIncomeBudget>): Promise<IIncomeBudget | null> {
  if (isElectronRuntime()) {
    try {
      const res = await incomeBudgetsApi.create(data);
      return res && typeof res === 'object' && 'id' in res ? res : null;
    } catch {
      return null;
    }
  }
  const list = lsLoadIncomeBudgets();
  const id = `ib-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const newItem: IIncomeBudget = {
    id,
    name: data.name || '',
    amount: Number(data.amount || 0),
    cycleType: data.cycleType || 'once',
    expectedDate: data.expectedDate || nowLocalISODate(),
    accountId: data.accountId || undefined,
    cycleDays: data.cycleDays,
    startDate: data.startDate || nowLocalISODate(),
    endDate: data.endDate,
    note: data.note || '',
    createdAt: now,
    updatedAt: now,
  };
  list.push(newItem);
  lsSaveIncomeBudgets(list);
  return newItem;
}

export async function updateIncomeBudget(id: string, data: Partial<IIncomeBudget>): Promise<IIncomeBudget | null> {
  if (isElectronRuntime()) {
    try {
      const res = await incomeBudgetsApi.update(id, data);
      return res && typeof res === 'object' && 'id' in res ? res : null;
    } catch {
      return null;
    }
  }
  const list = lsLoadIncomeBudgets();
  const idx = list.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() } as IIncomeBudget;
  lsSaveIncomeBudgets(list);
  return list[idx];
}

export async function deleteIncomeBudget(id: string): Promise<boolean> {
  if (isElectronRuntime()) {
    try {
      const res = await incomeBudgetsApi.remove(id);
      return Boolean(res && (res as any).success !== false);
    } catch {
      return false;
    }
  }
  const list = lsLoadIncomeBudgets().filter((item) => item.id !== id);
  lsSaveIncomeBudgets(list);
  return true;
}
