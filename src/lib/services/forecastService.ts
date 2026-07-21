// ============================================================
// 预测服务模块（预估支出 & 现金流）
// ============================================================
import { forecastApi, plannedExpensesApi, type CreatePlannedExpenseInput, type UpdatePlannedExpenseInput } from '@/api/index';
import type { IPlannedExpense } from '@/types/finance';
import { isElectronRuntime } from '../electron-api';
import { lsLoadPlannedExpenses, lsSavePlannedExpenses, lsLoadAccounts } from '../storage';
import { resolveAccountCashOutDate } from '../cashflow';
import { nowLocalISODate } from '../date';
export { forecastApi };

export async function loadPlannedExpenses(): Promise<IPlannedExpense[]> {
  if (isElectronRuntime()) {
    try {
      const res = await plannedExpensesApi.list();
      return res.success ? res.data : lsLoadPlannedExpenses();
    } catch {
      return lsLoadPlannedExpenses();
    }
  }
  return lsLoadPlannedExpenses();
}

export async function createPlannedExpense(data: CreatePlannedExpenseInput): Promise<IPlannedExpense | null> {
  if (isElectronRuntime()) {
    try {
      const res = await plannedExpensesApi.create(data);
      return res.success ? res.data : null;
    } catch {
      return null;
    }
  }
  const plannedExpenses = lsLoadPlannedExpenses();
  const accounts = lsLoadAccounts();
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const id = `pex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const plannedDate = data.plannedDate || nowLocalISODate();
  const accountId = data.accountId || undefined;
  const newItem: IPlannedExpense = {
    id,
    name: data.name || '',
    amount: Number(data.amount || 0),
    plannedDate,
    cashOutDate: resolveAccountCashOutDate(plannedDate, accountMap.get(accountId || '')) || undefined,
    accountId,
    category: (data.category as IPlannedExpense['category']) || '其他',
    note: data.note || '',
    createdAt: now,
    updatedAt: now,
  };
  plannedExpenses.push(newItem);
  lsSavePlannedExpenses(plannedExpenses);
  return newItem;
}

export async function updatePlannedExpense(id: string, data: UpdatePlannedExpenseInput): Promise<IPlannedExpense | null> {
  if (isElectronRuntime()) {
    try {
      const res = await plannedExpensesApi.update(id, data);
      return res.success ? res.data : null;
    } catch {
      return null;
    }
  }
  const plannedExpenses = lsLoadPlannedExpenses();
  const idx = plannedExpenses.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  const accounts = lsLoadAccounts();
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const nextItem = {
    ...plannedExpenses[idx],
    ...data,
    amount: data.amount !== undefined ? Number(data.amount) : plannedExpenses[idx].amount,
    accountId: data.accountId || undefined,
    updatedAt: new Date().toISOString(),
  };
  plannedExpenses[idx] = {
    ...nextItem,
    cashOutDate: resolveAccountCashOutDate(nextItem.plannedDate, accountMap.get(nextItem.accountId || '')) || undefined,
  };
  lsSavePlannedExpenses(plannedExpenses);
  return plannedExpenses[idx];
}

export async function deletePlannedExpense(id: string): Promise<boolean> {
  if (isElectronRuntime()) {
    try {
      const res = await plannedExpensesApi.remove(id);
      return Boolean(res.success);
    } catch {
      return false;
    }
  }
  const plannedExpenses = lsLoadPlannedExpenses();
  const nextItems = plannedExpenses.filter((item) => item.id !== id);
  if (nextItems.length === plannedExpenses.length) return false;
  lsSavePlannedExpenses(nextItems);
  return true;
}
