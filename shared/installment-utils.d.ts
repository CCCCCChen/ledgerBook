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
