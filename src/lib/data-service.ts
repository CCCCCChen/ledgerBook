// src/lib/data-service.ts — 统一数据服务层
// Electron 环境：调用后端 RESTful API（Express + SQLite）
// 浏览器开发环境：使用 localStorage（兼容原有行为）

import {
  accountsApi,
  transactionsApi,
  budgetsApi,
  plannedExpensesApi,
  statisticsApi,
  type TransactionFilters,
  type BudgetWithStats,
  type CreateTransactionInput,
  type UpdateTransactionInput,
  type CreatePlannedExpenseInput,
  type UpdatePlannedExpenseInput,
} from '@/api/index';
import type { ITransaction, IBudget, IAccount, IPlannedExpense } from '@/types/finance';
import { MOCK_ACCOUNTS, MOCK_BUDGETS, MOCK_PLANNED_EXPENSES, MOCK_TRANSACTIONS } from '@/data/finance';
import {
  getItem,
  setItem,
  STORAGE_KEYS,
  exportAllData,
  importAllData,
} from './storage';
import { getBudgetCycleWindow, getBudgetRate, getBudgetUsedInWindow } from './finance-utils';
import { formatLocalISODate, nowLocalISODate } from './date';
import { resolveAccountCashOutDate, resolveTransactionCashOutDate } from './cashflow';

// ============================================================
// localStorage 辅助函数
// ============================================================
function lsLoadAccounts(): IAccount[] {
  const data = getItem<IAccount>(STORAGE_KEYS.accounts);
  if (data.length > 0) return data;
  setItem(STORAGE_KEYS.accounts, MOCK_ACCOUNTS);
  return MOCK_ACCOUNTS;
}
function lsSaveAccounts(accounts: IAccount[]): void {
  setItem(STORAGE_KEYS.accounts, accounts);
}
function lsLoadTransactions(): ITransaction[] {
  const data = getItem<ITransaction>(STORAGE_KEYS.transactions);
  if (data.length > 0) {
    const accounts = lsLoadAccounts();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    let changed = false;
    const normalized = data.map((transaction) => {
      const nextCashOutDate = resolveTransactionCashOutDate(transaction, accountMap.get(transaction.accountId)) || undefined;
      if (transaction.cashOutDate !== nextCashOutDate) {
        changed = true;
        return { ...transaction, cashOutDate: nextCashOutDate };
      }
      return transaction;
    });
    if (changed) {
      setItem(STORAGE_KEYS.transactions, normalized);
    }
    return normalized;
  }
  setItem(STORAGE_KEYS.transactions, MOCK_TRANSACTIONS);
  return MOCK_TRANSACTIONS;
}
function lsSaveTransactions(transactions: ITransaction[]): void {
  setItem(STORAGE_KEYS.transactions, transactions);
}
function lsLoadBudgets(): IBudget[] {
  const data = getItem<IBudget>(STORAGE_KEYS.budgets);
  if (data.length > 0) return data;
  setItem(STORAGE_KEYS.budgets, MOCK_BUDGETS);
  return MOCK_BUDGETS;
}
function lsSaveBudgets(budgets: IBudget[]): void {
  setItem(STORAGE_KEYS.budgets, budgets);
}
function lsLoadPlannedExpenses(): IPlannedExpense[] {
  const data = getItem<IPlannedExpense>(STORAGE_KEYS.plannedExpenses);
  if (data.length > 0) {
    const accounts = lsLoadAccounts();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    let changed = false;
    const normalized = data.map((plannedExpense) => {
      const nextCashOutDate =
        resolveAccountCashOutDate(plannedExpense.plannedDate, accountMap.get(plannedExpense.accountId || '')) || undefined;
      if (plannedExpense.cashOutDate !== nextCashOutDate) {
        changed = true;
        return { ...plannedExpense, cashOutDate: nextCashOutDate };
      }
      return plannedExpense;
    });
    if (changed) {
      setItem(STORAGE_KEYS.plannedExpenses, normalized);
    }
    return normalized;
  }
  setItem(STORAGE_KEYS.plannedExpenses, MOCK_PLANNED_EXPENSES);
  return MOCK_PLANNED_EXPENSES;
}
function lsSavePlannedExpenses(plannedExpenses: IPlannedExpense[]): void {
  setItem(STORAGE_KEYS.plannedExpenses, plannedExpenses);
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
    billingDay: data.billingDay,
    repaymentDay: data.repaymentDay,
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
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const transactions = lsLoadTransactions().map((transaction) => ({
    ...transaction,
    cashOutDate: resolveTransactionCashOutDate(transaction, accountMap.get(transaction.accountId)) || undefined,
  }));
  const plannedExpenses = lsLoadPlannedExpenses().map((plannedExpense) => ({
    ...plannedExpense,
    cashOutDate:
      resolveAccountCashOutDate(plannedExpense.plannedDate, accountMap.get(plannedExpense.accountId || '')) || undefined,
  }));
  lsSaveTransactions(transactions);
  lsSavePlannedExpenses(plannedExpenses);
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
  const transactions = lsLoadTransactions().map((t) => (t.accountId === id ? { ...t, accountId: '' } : t));
  const plannedExpenses = lsLoadPlannedExpenses().map((item) =>
    item.accountId === id ? { ...item, accountId: undefined, cashOutDate: undefined } : item,
  );
  lsSaveAccounts(accounts);
  lsSaveTransactions(transactions);
  lsSavePlannedExpenses(plannedExpenses);
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

export async function createTransaction(data: CreateTransactionInput): Promise<ITransaction | null> {
  if (isElectron()) {
    try {
      const res = await transactionsApi.create(data as CreateTransactionInput);
      return res.data;
    } catch {
      return null;
    }
  }
  if (data.transactionType === 'repayment_out' && data.accountId && data.transferAccountId && data.amount != null) {
    const amount = Math.abs(Number(data.amount));
    const now = new Date().toISOString();
    const pairId = `pair-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const accounts = lsLoadAccounts();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const outTxn: ITransaction = {
      id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: data.date || nowLocalISODate(),
      cashOutDate: undefined,
      accountId: data.accountId,
      amount: -amount,
      category: '其他',
      note: `${data.note || '信用账户还款'}（扣款）`,
      isBudgeted: false,
      transactionType: 'repayment_out',
      transferAccountId: data.transferAccountId,
      pairedTransactionId: pairId,
      createdAt: now,
      updatedAt: now,
    };
    const inTxn: ITransaction = {
      id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-r`,
      date: data.date || nowLocalISODate(),
      cashOutDate: undefined,
      accountId: data.transferAccountId,
      amount,
      category: '其他',
      note: `${data.note || '信用账户还款'}（入账）`,
      isBudgeted: false,
      transactionType: 'repayment_in',
      transferAccountId: data.accountId,
      pairedTransactionId: pairId,
      createdAt: now,
      updatedAt: now,
    };
    const txns = lsLoadTransactions();
    txns.push(outTxn, inTxn);
    lsSaveTransactions(txns);
    return outTxn;
  }

  const installmentCount = Number((data as CreateTransactionInput).installmentCount || 1);
  if (data.transactionType === 'installment_bill' && installmentCount >= 2) {
    const txns = lsLoadTransactions();
    const now = new Date().toISOString();
    const planId = `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const accounts = lsLoadAccounts();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const perAmount = Math.abs(Number(data.amount || 0));
    const feeTotal = data.feeTotal != null ? Math.abs(Number(data.feeTotal)) : 0;
    const perFee = feeTotal > 0 ? Math.round((feeTotal / installmentCount) * 100) / 100 : 0;
    let feeAllocated = 0;
    for (let index = 0; index < installmentCount; index += 1) {
      const isLast = index === installmentCount - 1;
      const fee = feeTotal > 0 ? (isLast ? Math.round((feeTotal - feeAllocated) * 100) / 100 : perFee) : 0;
      feeAllocated += fee;
      const amount = perAmount + fee;
      const date = new Date(`${data.date || nowLocalISODate()}T00:00:00`);
      date.setMonth(date.getMonth() + index);
      txns.push({
        id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index + 1}`,
        date: formatLocalISODate(date),
        cashOutDate:
          resolveTransactionCashOutDate(
            {
              date: formatLocalISODate(date),
              amount: -amount,
              transactionType: 'installment_bill',
              accountId: data.accountId || '',
            },
            accountMap.get(data.accountId || ''),
          ) || undefined,
        accountId: data.accountId || '',
        amount: -amount,
        category: data.category || '其他',
        note: `${data.note || '分期账单'}（第 ${index + 1}/${installmentCount} 期）`,
        isBudgeted: data.isBudgeted || false,
        budgetId: data.budgetId,
        transactionType: 'installment_bill',
        installmentPlanId: planId,
        installmentIndex: index + 1,
        installmentTotal: installmentCount,
        installmentFee: feeTotal > 0 ? fee : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }
    lsSaveTransactions(txns);
    return txns[txns.length - installmentCount];
  }

  const txns = lsLoadTransactions();
  const id = `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const accounts = lsLoadAccounts();
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const newTxn: ITransaction = {
    id,
    date: data.date || nowLocalISODate(),
    cashOutDate:
      resolveTransactionCashOutDate(
        {
          date: data.date || nowLocalISODate(),
          amount: Number(data.amount || 0),
          transactionType: data.transactionType || 'normal',
          accountId: data.accountId || '',
        },
        accountMap.get(data.accountId || ''),
      ) || undefined,
    accountId: data.accountId || '',
    amount: data.amount || 0,
    category: data.category || '其他',
    note: data.note || '',
    isBudgeted: data.isBudgeted || false,
    budgetId: data.budgetId,
    transactionType: data.transactionType || 'normal',
    transferAccountId: data.transferAccountId,
    pairedTransactionId: data.pairedTransactionId,
    installmentPlanId: data.installmentPlanId,
    installmentIndex: data.installmentIndex,
    installmentTotal: data.installmentTotal,
    createdAt: now,
    updatedAt: now,
  };
  txns.push(newTxn);
  lsSaveTransactions(txns);
  return newTxn;
}

export async function updateTransaction(id: string, data: UpdateTransactionInput): Promise<ITransaction | null> {
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
  if (txns[idx].transactionType && txns[idx].transactionType !== 'normal' && txns[idx].transactionType !== 'installment_bill') {
    return null;
  }
  if (txns[idx].transactionType === 'installment_bill') {
    const scope = data.editScope || 'single';
    const baseNote = (data.note != null ? String(data.note) : txns[idx].note).replace(/（第\s*\d+\/\d+\s*期）$/, '').trim();
    const planId = txns[idx].installmentPlanId;
    const amount = data.amount != null ? Number(data.amount) : txns[idx].amount;
    const category = (data.category ?? txns[idx].category) as ITransaction['category'];
    const isBudgeted = data.isBudgeted != null ? Boolean(data.isBudgeted) : txns[idx].isBudgeted;
    const budgetId = isBudgeted ? (data.budgetId ?? txns[idx].budgetId) : undefined;
    const now = new Date().toISOString();
    const baseDate = data.date ?? txns[idx].date;
    const accounts = lsLoadAccounts();
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    if (scope === 'plan' && planId) {
      txns.forEach((transaction) => {
        if (transaction.installmentPlanId !== planId) return;
        const suffix =
          transaction.installmentIndex && transaction.installmentTotal
            ? `（第 ${transaction.installmentIndex}/${transaction.installmentTotal} 期）`
            : '';
        if (transaction.installmentIndex) {
          const date = new Date(`${baseDate}T00:00:00`);
          date.setMonth(date.getMonth() + (transaction.installmentIndex - 1));
          transaction.date = formatLocalISODate(date);
        }
        transaction.amount = amount;
        transaction.category = category;
        transaction.note = suffix ? `${baseNote || '分期账单'}${suffix}` : baseNote || '分期账单';
        transaction.isBudgeted = isBudgeted;
        transaction.budgetId = budgetId;
        transaction.cashOutDate =
          resolveTransactionCashOutDate(transaction, accountMap.get(transaction.accountId)) || undefined;
        transaction.updatedAt = now;
      });
    } else {
      const suffix =
        txns[idx].installmentIndex && txns[idx].installmentTotal
          ? `（第 ${txns[idx].installmentIndex}/${txns[idx].installmentTotal} 期）`
          : '';
      txns[idx] = {
        ...txns[idx],
        date: data.date ?? txns[idx].date,
        amount,
        category,
        note: suffix ? `${baseNote || '分期账单'}${suffix}` : baseNote || '分期账单',
        isBudgeted,
        budgetId,
        cashOutDate:
          resolveTransactionCashOutDate(
            {
              ...txns[idx],
              date: data.date ?? txns[idx].date,
              amount,
            },
            accountMap.get(txns[idx].accountId),
          ) || undefined,
        updatedAt: now,
      };
    }
    lsSaveTransactions(txns);
    return txns[idx];
  }
  const accounts = lsLoadAccounts();
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const nextTxn = { ...txns[idx], ...data };
  txns[idx] = {
    ...nextTxn,
    cashOutDate: resolveTransactionCashOutDate(nextTxn, accountMap.get(nextTxn.accountId)) || undefined,
    updatedAt: new Date().toISOString(),
  };
  lsSaveTransactions(txns);
  return txns[idx];
}

export async function deleteTransaction(id: string, scope: 'single' | 'plan' = 'single'): Promise<boolean> {
  if (isElectron()) {
    try {
      await transactionsApi.remove(id, scope);
      return true;
    } catch {
      return false;
    }
  }
  const current = lsLoadTransactions();
  const existing = current.find((t) => t.id === id);
  if (!existing) return false;
  const todayISO = nowLocalISODate();
  const txns = current.filter((transaction) => {
    if (existing.pairedTransactionId) {
      return transaction.pairedTransactionId !== existing.pairedTransactionId;
    }
    if (existing.installmentPlanId) {
      if (scope === 'plan') {
        const firstDate = current
          .filter((t) => t.installmentPlanId === existing.installmentPlanId)
          .map((t) => t.date)
          .sort()[0];
        if (firstDate && firstDate <= todayISO) {
          return true;
        }
        return transaction.installmentPlanId !== existing.installmentPlanId;
      }
      return transaction.id !== id;
    }
    return transaction.id !== id;
  });
  if (existing.installmentPlanId && scope === 'plan') {
    const firstDate = current
      .filter((t) => t.installmentPlanId === existing.installmentPlanId)
      .map((t) => t.date)
      .sort()[0];
    if (firstDate && firstDate <= todayISO) return false;
  }
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

// ============================================================
// 预估支出
// ============================================================
export async function loadPlannedExpenses(): Promise<IPlannedExpense[]> {
  if (isElectron()) {
    try {
      const res = await plannedExpensesApi.list();
      return res.data;
    } catch {
      return lsLoadPlannedExpenses();
    }
  }
  return lsLoadPlannedExpenses();
}

export async function createPlannedExpense(data: CreatePlannedExpenseInput): Promise<IPlannedExpense | null> {
  if (isElectron()) {
    try {
      const res = await plannedExpensesApi.create(data);
      return res.data;
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
    category: data.category || '其他',
    note: data.note || '',
    createdAt: now,
    updatedAt: now,
  };
  plannedExpenses.push(newItem);
  lsSavePlannedExpenses(plannedExpenses);
  return newItem;
}

export async function updatePlannedExpense(id: string, data: UpdatePlannedExpenseInput): Promise<IPlannedExpense | null> {
  if (isElectron()) {
    try {
      const res = await plannedExpensesApi.update(id, data);
      return res.data;
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
  if (isElectron()) {
    try {
      await plannedExpensesApi.remove(id);
      return true;
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

// ============================================================
// 统计（仅 Electron 模式走 API）
// ============================================================
export { statisticsApi };
