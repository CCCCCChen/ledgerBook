// shared/installment-utils.ts — 前后端共享的纯日期/周期计算工具（ESM 版本，供前端 TS 使用）
// 不依赖数据库，两端通过 import 复用同一份逻辑

export interface BudgetCycleWindow {
  start: string;
  end: string;
}

/**
 * 解析 ISO 日期字符串为本地 Date（避免 UTC 偏移导致日期倒退一天）
 */
export function parseISODate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

/**
 * 格式化 Date 为 ISO 日期字符串 yyyy-mm-dd
 */
export function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 日期加减 N 天，返回新 Date 对象
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * 安全获取某年某月的某一天（若该月无此日则取月末最后一天）
 */
export function getSafeMonthDay(year: number, month: number, day: number): Date {
  // month: 0-based
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

/**
 * 计算预算/周期在当前参考日所属的窗口 [start, end]
 * 支持 once / weekly / monthly / yearly / custom 五种 cycleType
 */
export function getBudgetCycleWindow(
  budget: { cycleType: string; startDate: string; endDate?: string; cycleDays?: number },
  refDate: Date = new Date(),
): BudgetCycleWindow | null {
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
    if (budget.cycleType === 'weekly') {
      // 以参考日所属周的周一为准
      const refDay = ref.getDay();
      const mondayOffset = refDay === 0 ? -6 : 1 - refDay;
      const currentMonday = addDays(ref, mondayOffset);

      const anchorDay = anchor.getDay();
      const anchorMondayOffset = anchorDay === 0 ? -6 : 1 - anchorDay;
      const anchorMonday = addDays(anchor, anchorMondayOffset);

      const diffDays = Math.floor((currentMonday.getTime() - anchorMonday.getTime()) / 86400000);
      const cycleIndex = Math.floor(diffDays / 7);

      const start = addDays(anchorMonday, cycleIndex * 7);
      const end = addDays(start, 6);
      return { start: formatISODate(start), end: formatISODate(end) };
    }

    const cycleDays = budget.cycleDays as number;
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

  // yearly
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
