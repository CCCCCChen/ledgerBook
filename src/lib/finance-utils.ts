import type { IBudget, ITransaction } from '@/types/finance';

export interface BudgetCycleWindow {
  start: string;
  end: string;
}

export interface BudgetSettlementItem {
  budgetId: string;
  budgetName: string;
  cycleStart: string;
  cycleEnd: string;
  budgetAmount: number;
  used: number;
  expectedAmount: number;
}

function parseISODate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function formatISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getSafeMonthDay(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

export function getBudgetCycleWindow(budget: IBudget, refDate = new Date()): BudgetCycleWindow | null {
  const anchor = parseISODate(budget.startDate);
  const ref = parseISODate(formatISODate(refDate));

  if (budget.cycleType === 'once') {
    const end = budget.endDate || budget.startDate;
    if (ref < anchor || ref > parseISODate(end)) {
      return null;
    }
    return { start: budget.startDate, end };
  }

  if (ref < anchor) {
    return { start: budget.startDate, end: budget.startDate };
  }

  if (budget.cycleType === 'weekly' || (budget.cycleType === 'custom' && budget.cycleDays)) {
    const cycleDays = budget.cycleType === 'weekly' ? 7 : budget.cycleDays!;
    const diffDays = Math.floor((ref.getTime() - anchor.getTime()) / 86400000);
    const cycleIndex = Math.floor(diffDays / cycleDays);
    const start = addDays(anchor, cycleIndex * cycleDays);
    const end = addDays(start, cycleDays - 1);
    return { start: formatISODate(start), end: formatISODate(end) };
  }

  if (budget.cycleType === 'monthly') {
    const anchorDay = anchor.getDate();
    let start = getSafeMonthDay(ref.getFullYear(), ref.getMonth(), anchorDay);
    if (ref < start) {
      start = getSafeMonthDay(ref.getFullYear(), ref.getMonth() - 1, anchorDay);
    }
    const nextStart = getSafeMonthDay(start.getFullYear(), start.getMonth() + 1, anchorDay);
    const end = addDays(nextStart, -1);
    return { start: formatISODate(start), end: formatISODate(end) };
  }

  const anchorMonth = anchor.getMonth();
  const anchorDay = anchor.getDate();
  let start = getSafeMonthDay(ref.getFullYear(), anchorMonth, anchorDay);
  if (ref < start) {
    start = getSafeMonthDay(ref.getFullYear() - 1, anchorMonth, anchorDay);
  }
  const nextStart = getSafeMonthDay(start.getFullYear() + 1, anchorMonth, anchorDay);
  const end = addDays(nextStart, -1);
  return { start: formatISODate(start), end: formatISODate(end) };
}

export function getBudgetUsedInWindow(budget: IBudget, transactions: ITransaction[], window: BudgetCycleWindow | null): number {
  if (!window) return 0;
  return transactions
    .filter((transaction) => {
      if (transaction.amount >= 0) return false;
      if (transaction.budgetId !== budget.id) return false;
      return transaction.date >= window.start && transaction.date <= window.end;
    })
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
}

export function getBudgetRate(used: number, amount: number): number {
  if (amount <= 0) return 0;
  return Math.round((used / amount) * 100);
}

export function listBudgetSettlementsForMonth(
  budgets: IBudget[],
  transactions: ITransaction[],
  refDate = new Date(),
): BudgetSettlementItem[] {
  const today = formatISODate(refDate);
  const monthEnd = formatISODate(endOfMonth(refDate));
  const results: BudgetSettlementItem[] = [];

  budgets.forEach((budget) => {
    if (budget.cycleType === 'once') {
      if (!budget.endDate || budget.endDate < today || budget.endDate > monthEnd) return;
      const window = { start: budget.startDate, end: budget.endDate };
      const used = getBudgetUsedInWindow(budget, transactions, window);
      results.push({
        budgetId: budget.id,
        budgetName: budget.name,
        cycleStart: window.start,
        cycleEnd: window.end,
        budgetAmount: budget.amount,
        used,
        expectedAmount: Math.max(0, budget.amount - used),
      });
      return;
    }

    const seedWindow = getBudgetCycleWindow(budget, refDate);
    if (!seedWindow) return;
    const cycleStartDate = parseISODate(seedWindow.start);
    let cursor = cycleStartDate;

    while (formatISODate(cursor) <= monthEnd) {
      const currentWindow = getBudgetCycleWindow(budget, cursor);
      if (!currentWindow) break;
      if (currentWindow.end >= today && currentWindow.end <= monthEnd) {
        const used = getBudgetUsedInWindow(budget, transactions, currentWindow);
        results.push({
          budgetId: budget.id,
          budgetName: budget.name,
          cycleStart: currentWindow.start,
          cycleEnd: currentWindow.end,
          budgetAmount: budget.amount,
          used,
          expectedAmount: Math.max(0, budget.amount - used),
        });
      }
      cursor = addDays(parseISODate(currentWindow.end), 1);
    }
  });

  return results.sort((a, b) => a.cycleEnd.localeCompare(b.cycleEnd));
}

export function isFutureTransaction(transaction: ITransaction, refDate = new Date()): boolean {
  return transaction.date > formatISODate(refDate);
}
