// shared/installment-utils.d.ts — TypeScript 类型声明

export interface BudgetCycleWindow {
  start: string;
  end: string;
}

export function parseISODate(date: string): Date;
export function formatISODate(date: Date): string;
export function addDays(date: Date, days: number): Date;
export function getSafeMonthDay(year: number, month: number, day: number): Date;

export function getBudgetCycleWindow(
  budget: { cycleType: string; startDate: string; endDate?: string; cycleDays?: number },
  refDate?: Date
): BudgetCycleWindow | null;

export interface MonthBounds {
  monthStart: string;
  monthEnd: string;
  daysInMonth: number;
}
export function getMonthBounds(refDate: Date): MonthBounds;

export interface MonthlyNormalizedBudgetResult {
  usedRangeStart: string;
  usedRangeEnd: string;
  overlapDays: number;
  totalCycleDaysCovered: number;
  normalizedBudgetAmount: number;
}
export interface BudgetShapeForNormalize {
  cycleType: string;
  startDate: string;
  endDate?: string;
  cycleDays?: number;
  amount: number;
}
export function normalizeBudgetToCurrentMonth(
  budget: BudgetShapeForNormalize,
  opts?: { refDate?: Date; prorateMonthlyByElapsedDays?: boolean }
): MonthlyNormalizedBudgetResult;
