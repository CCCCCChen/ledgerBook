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

export interface MonthBounds {
  monthStart: string;
  monthEnd: string;
  daysInMonth: number;
}

export function getMonthBounds(refDate: Date): MonthBounds {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const monthStart = new Date(y, m, 1);
  const monthEnd = new Date(y, m + 1, 0);
  return {
    monthStart: formatISODate(monthStart),
    monthEnd: formatISODate(monthEnd),
    daysInMonth: monthEnd.getDate(),
  };
}

function dayDiffInclusive(aISO: string, bISO: string): number {
  const a = parseISODate(aISO).getTime();
  const b = parseISODate(bISO).getTime();
  return Math.max(0, Math.floor((b - a) / 86400000) + 1);
}
function rangeOverlap(s1: string, e1: string, s2: string, e2: string): [string, string] | null {
  const s = s1 > s2 ? s1 : s2;
  const e = e1 < e2 ? e1 : e2;
  if (s > e) return null;
  return [s, e];
}

export interface MonthlyNormalizedBudgetResult {
  usedRangeStart: string;
  usedRangeEnd: string;
  overlapDays: number;
  totalCycleDaysCovered: number;
  normalizedBudgetAmount: number;
}

/** 周期原生口径统计结果（供预算卡片展示，不折算） */
export interface BudgetStatsResult {
  currentPeriodStart: string;
  currentPeriodEnd: string;
  denominator: number;
}

export interface BudgetShapeForNormalize {
  cycleType: string;
  startDate: string;
  endDate?: string;
  cycleDays?: number;
  amount: number;
}

/**
 * 把任意周期预算统一折算到 ref 所在自然月口径：
 *  monthly → 预算金额 × (今天在该月已过去的天数 / 该月总天数)   【默认开启；设 prorateMonthlyByElapsedDays=false 取整月】
 *  weekly  → 预算金额 × (365.25/7/12 ≈ 4.345)
 *  yearly  → 预算金额 ÷ 12
 *  once/custom → 预算金额 × (自定义周期与当月的重叠天数 / 自定义周期总天数)
 */
export function normalizeBudgetToCurrentMonth(
  budget: BudgetShapeForNormalize,
  opts: { refDate?: Date; prorateMonthlyByElapsedDays?: boolean } = {},
): MonthlyNormalizedBudgetResult {
  const ref = parseISODate(formatISODate(opts.refDate ?? new Date()));
  const refISO = formatISODate(ref);
  const { monthStart, monthEnd, daysInMonth } = getMonthBounds(ref);
  const prorateMonthly = opts.prorateMonthlyByElapsedDays !== false;
  const todayInMonth = Math.min(Math.max(dayDiffInclusive(monthStart, refISO), 1), daysInMonth);

  const amount = Math.max(0, Number(budget.amount) || 0);

  if (budget.cycleType === 'monthly') {
    const factor = prorateMonthly ? todayInMonth / daysInMonth : 1;
    return {
      usedRangeStart: monthStart,
      usedRangeEnd: refISO,
      overlapDays: todayInMonth,
      totalCycleDaysCovered: daysInMonth,
      normalizedBudgetAmount: amount * factor,
    };
  }

  if (budget.cycleType === 'weekly') {
    // 用 getBudgetCycleWindow 取当前周窗口，按与当月的实际重叠天数折算
    const w = getBudgetCycleWindow(budget, ref);
    const cycleStart = w ? w.start : budget.startDate;
    const cycleEnd = w ? w.end : budget.startDate;
    const cycleTotalDays = 7;

    const ov = rangeOverlap(cycleStart, cycleEnd, monthStart, monthEnd);
    const overlapDays = ov ? dayDiffInclusive(ov[0], ov[1]) : 0;
    const ratio = overlapDays / cycleTotalDays;

    return {
      usedRangeStart: ov ? ov[0] : monthStart,
      usedRangeEnd: ov ? ov[1] : monthStart,
      overlapDays,
      totalCycleDaysCovered: cycleTotalDays,
      normalizedBudgetAmount: amount * ratio,
    };
  }

  if (budget.cycleType === 'yearly') {
    return {
      usedRangeStart: monthStart,
      usedRangeEnd: monthEnd,
      overlapDays: daysInMonth,
      totalCycleDaysCovered: 365.25 / 12,
      normalizedBudgetAmount: amount / 12,
    };
  }

  // once / custom
  let cycleStart = budget.startDate;
  let cycleEnd = budget.endDate || budget.startDate;
  let totalDays = 0;
  if (budget.cycleType === 'custom' && (budget.cycleDays ?? 0) > 0) {
    const w = getBudgetCycleWindow(budget, ref);
    if (w) { cycleStart = w.start; cycleEnd = w.end; }
    totalDays = Math.max(1, Number(budget.cycleDays) || 0);
  } else if (budget.cycleType === 'once') {
    cycleStart = budget.startDate;
    cycleEnd = budget.endDate || budget.startDate;
    totalDays = dayDiffInclusive(cycleStart, cycleEnd);
  } else {
    totalDays = dayDiffInclusive(cycleStart, cycleEnd);
  }
  if (totalDays <= 0) totalDays = 1;

  const ov = rangeOverlap(cycleStart, cycleEnd, monthStart, monthEnd);
  const overlapDays = ov ? dayDiffInclusive(ov[0], ov[1]) : 0;
  const ratio = overlapDays / totalDays;
  return {
    usedRangeStart: ov ? ov[0] : monthStart,
    usedRangeEnd: ov ? ov[1] : monthStart,
    overlapDays,
    totalCycleDaysCovered: totalDays,
    normalizedBudgetAmount: amount * ratio,
  };
}

/**
 * 计算预算在当前参考日所属周期的原生统计口径（不折算）
 * - weekly  → 当前周窗口，分母 = 预算金额（周期原值）
 * - monthly → 当前月周期窗口，分母 = 预算金额
 * - yearly  → 当前年周期窗口，分母 = 预算金额
 * - once / custom → 当前周期窗口，分母 = 预算金额
 *
 * 仅供预算卡片展示使用；月度汇总/仪表盘请用 normalizeBudgetToCurrentMonth
 */
export function calculateBudgetStats(
  budget: BudgetShapeForNormalize,
  refDate: Date = new Date(),
): BudgetStatsResult {
  const amount = Math.max(0, Number(budget.amount) || 0);
  const window = getBudgetCycleWindow(budget, refDate);

  if (window) {
    return {
      currentPeriodStart: window.start,
      currentPeriodEnd: window.end,
      denominator: amount,
    };
  }

  // 兜底：窗口计算失败时（如 once 已超出范围），使用起止日期回退
  return {
    currentPeriodStart: budget.startDate,
    currentPeriodEnd: budget.endDate || budget.startDate,
    denominator: amount,
  };
}
