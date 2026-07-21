// ============================================================
// 预算服务模块
// ============================================================
import { budgetsApi, type BudgetWithStats } from '@/api/index';
import type { IBudget } from '@/types/finance';
import { isElectronRuntime } from '../electron-api';
import { lsLoadBudgets, lsSaveBudgets, lsLoadTransactions, lsSaveTransactions } from '../storage';
import { getBudgetCycleWindow, getBudgetUsedInWindow, getBudgetRate } from '../finance-utils';
import { nowLocalISODate } from '../date';

export async function loadBudgets(): Promise<BudgetWithStats[]> {
  if (isElectronRuntime()) {
    try {
      const res = await budgetsApi.list();
      return res.success ? res.data : lsLoadBudgets().map((b) => ({ ...b, used: 0, rate: 0, remaining: b.amount }));
    } catch {
      return lsLoadBudgets().map((b) => ({ ...b, used: 0, rate: 0, remaining: b.amount }));
    }
  }
  return lsLoadBudgets().map((budget) => {
    const window = getBudgetCycleWindow(budget);
    const used = getBudgetUsedInWindow(budget, lsLoadTransactions(), window);
    return {
      ...budget,
      used,
      rate: getBudgetRate(used, budget.amount),
      remaining: Math.max(0, budget.amount - used),
      currentPeriodStart: window?.start,
      currentPeriodEnd: window?.end,
    };
  });
}

export async function saveBudgets(budgets: IBudget[]): Promise<void> {
  if (isElectronRuntime()) return;
  lsSaveBudgets(budgets);
}

export async function createBudget(data: Partial<IBudget>): Promise<BudgetWithStats | null> {
  if (isElectronRuntime()) {
    try {
      const res = await budgetsApi.create(data);
      return res.success ? res.data : null;
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
    startDate: data.startDate || nowLocalISODate(),
    endDate: data.endDate,
    cycleDays: data.cycleDays,
    category: data.category,
    createdAt: now,
    updatedAt: now,
  };
  budgets.push(newBudget);
  lsSaveBudgets(budgets);
  return { ...newBudget, used: 0, rate: 0, remaining: newBudget.amount };
}

export async function updateBudget(id: string, data: Partial<IBudget>): Promise<BudgetWithStats | null> {
  if (isElectronRuntime()) {
    try {
      const res = await budgetsApi.update(id, data);
      return res.success ? res.data : null;
    } catch {
      return null;
    }
  }
  const budgets = lsLoadBudgets();
  const idx = budgets.findIndex((b) => b.id === id);
  if (idx === -1) return null;
  budgets[idx] = { ...budgets[idx], ...data, updatedAt: new Date().toISOString() } as IBudget;
  lsSaveBudgets(budgets);
  return { ...budgets[idx], used: 0, rate: 0, remaining: budgets[idx].amount };
}

export async function deleteBudget(id: string): Promise<boolean> {
  if (isElectronRuntime()) {
    try {
      const res = await budgetsApi.remove(id);
      return Boolean(res.success);
    } catch {
      return false;
    }
  }
  const budgets = lsLoadBudgets().filter((b) => b.id !== id);
  const transactions = lsLoadTransactions().map((t) => {
    if (t.budgetId === id) {
      return { ...t, budgetId: undefined, isBudgeted: false };
    }
    return t;
  });
  lsSaveBudgets(budgets);
  lsSaveTransactions(transactions);
  return true;
}
