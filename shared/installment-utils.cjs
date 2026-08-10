// shared/installment-utils.cjs — 前后端共享的纯日期/周期计算工具
// 不依赖数据库，两端通过 require / import 复用同一份逻辑

/**
 * 解析 ISO 日期字符串为本地 Date（避免 UTC 偏移导致日期倒退一天）
 */
function parseISODate(date) {
  return new Date(`${date}T00:00:00`);
}

/**
 * 格式化 Date 为 ISO 日期字符串 yyyy-mm-dd
 */
function formatISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 日期加减 N 天，返回新 Date 对象
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * 安全获取某年某月的某一天（若该月无此日则取月末最后一天）
 */
function getSafeMonthDay(year, month, day) {
  // month: 0-based
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

/**
 * 计算预算/周期在当前参考日所属的窗口 [start, end]
 * 支持 once / weekly / monthly / yearly / custom 五种 cycleType
 *
 * @param {object} budget — { cycleType, startDate, endDate?, cycleDays? }
 * @param {Date}   refDate
 * @returns {{ start: string, end: string } | null}
 */
function getBudgetCycleWindow(budget, refDate = new Date()) {
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

  if (budget.cycleType === 'custom' && !budget.cycleDays) {
    return null; // custom 缺 cycleDays → 无法确定周期窗口
  }

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

  if (budget.cycleType === 'custom') {
    const cycleDays = budget.cycleDays;
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

exports.parseISODate = parseISODate;
exports.formatISODate = formatISODate;
exports.addDays = addDays;
exports.getSafeMonthDay = getSafeMonthDay;
exports.getBudgetCycleWindow = getBudgetCycleWindow;

/**
 * 计算「ref 所在自然月」的起止与天数
 * @param {Date} refDate
 * @returns {{ monthStart: string, monthEnd: string, daysInMonth: number }}
 */
function getMonthBounds(refDate) {
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
exports.getMonthBounds = getMonthBounds;

function _dayDiffInclusive(aISO, bISO) {
  const a = parseISODate(aISO).getTime();
  const b = parseISODate(bISO).getTime();
  return Math.max(0, Math.floor((b - a) / 86400000) + 1);
}
function _rangeOverlap(s1, e1, s2, e2) {
  const s = s1 > s2 ? s1 : s2;
  const e = e1 < e2 ? e1 : e2;
  if (s > e) return null;
  return [s, e];
}

/**
 * 把任意周期的预算，统一折算到「ref 所在自然月」口径：
 *   monthly  → 预算金额 × min(1, 今天过了的天数/当月天数)
 *   weekly   → 预算金额 × 4.34524（一年 52.1428 周 ÷ 12 月）
 *   yearly   → 预算金额 ÷ 12
 *   once/custom → 预算金额 × (自定义周期 & 当月的重叠天数 / 总天数)
 *
 * 返回的 normalizedBudgetAmount 是"当月应该的预算分母"，
 * 分子（usedInMonth）则是「当月真实支出」——方便所有使用率统一对比。
 *
 * @param {object} budget  { cycleType, startDate, endDate?, cycleDays?, amount }
 * @param {{ refDate?: Date, prorateMonthlyByElapsedDays?: boolean }} opts
 * @returns {{
 *   usedRangeStart: string, usedRangeEnd: string,
 *   overlapDays: number, totalCycleDaysCovered: number,
 *   normalizedBudgetAmount: number
 * } | null}
 */
function normalizeBudgetToCurrentMonth(budget, opts = {}) {
  const ref = opts.refDate ? parseISODate(formatISODate(opts.refDate)) : parseISODate(formatISODate(new Date()));
  const refISO = formatISODate(ref);
  const { monthStart, monthEnd, daysInMonth } = getMonthBounds(ref);
  const prorateMonthly = opts.prorateMonthlyByElapsedDays !== false; // 默认按月已过天数折算月预算
  const todayInMonth = Math.min(Math.max(_dayDiffInclusive(monthStart, refISO), 1), daysInMonth);

  const amount = Math.max(0, Number(budget.amount) || 0);

  if (budget.cycleType === 'monthly') {
    const factor = prorateMonthly ? todayInMonth / daysInMonth : 1;
    return {
      usedRangeStart: monthStart,
      usedRangeEnd: refISO, // 按"到今天为止"统计 used（不把未来未过的天数算进分子）
      overlapDays: todayInMonth,
      totalCycleDaysCovered: daysInMonth,
      normalizedBudgetAmount: amount * factor,
    };
  }

  if (budget.cycleType === 'weekly') {
    const cycleDays = 7;
    const rangeDays = prorateMonthly ? todayInMonth : daysInMonth;
    return {
      usedRangeStart: monthStart,
      usedRangeEnd: prorateMonthly ? refISO : monthEnd,
      overlapDays: rangeDays,
      totalCycleDaysCovered: cycleDays,
      normalizedBudgetAmount: amount * rangeDays / cycleDays,
    };
  }

  if (budget.cycleType === 'yearly') {
    const cycleDays = 365;
    const rangeDays = prorateMonthly ? todayInMonth : daysInMonth;
    return {
      usedRangeStart: monthStart,
      usedRangeEnd: prorateMonthly ? refISO : monthEnd,
      overlapDays: rangeDays,
      totalCycleDaysCovered: cycleDays,
      normalizedBudgetAmount: amount * rangeDays / cycleDays,
    };
  }

  if (budget.cycleType === 'custom') {
    if (!budget.cycleDays || budget.cycleDays <= 0) return null;
    const cycleDays = budget.cycleDays;
    const rangeDays = prorateMonthly ? todayInMonth : daysInMonth;
    return {
      usedRangeStart: monthStart,
      usedRangeEnd: prorateMonthly ? refISO : monthEnd,
      overlapDays: rangeDays,
      totalCycleDaysCovered: cycleDays,
      normalizedBudgetAmount: amount * rangeDays / cycleDays,
    };
  }

  // once
  const cycleStart = budget.startDate;
  const cycleEnd = budget.endDate || budget.startDate;
  const totalDays = _dayDiffInclusive(cycleStart, cycleEnd) || 1;

  const ov = _rangeOverlap(cycleStart, cycleEnd, monthStart, monthEnd);
  const overlapDays = ov ? _dayDiffInclusive(ov[0], ov[1]) : 0;
  const ratio = overlapDays / totalDays;
  return {
    usedRangeStart: ov ? ov[0] : monthStart,
    usedRangeEnd: ov ? ov[1] : monthStart,
    overlapDays,
    totalCycleDaysCovered: totalDays,
    normalizedBudgetAmount: amount * ratio,
  };
}
exports.normalizeBudgetToCurrentMonth = normalizeBudgetToCurrentMonth;

/**
 * 计算预算在当前参考日所属周期的原生统计口径（不折算）
 * - weekly  → 当前周窗口，分母 = 预算金额（周期原值）
 * - monthly → 当前月周期窗口，分母 = 预算金额
 * - yearly  → 当前年周期窗口，分母 = 预算金额
 * - once / custom → 当前周期窗口，分母 = 预算金额
 *
 * 仅供预算卡片展示使用；月度汇总/仪表盘请用 normalizeBudgetToCurrentMonth
 *
 * @param {object} budget  { cycleType, startDate, endDate?, cycleDays?, amount }
 * @param {Date}   refDate
 * @returns {{ currentPeriodStart: string, currentPeriodEnd: string, denominator: number } | null}
 */
function calculateBudgetStats(budget, refDate = new Date()) {
  const amount = Math.max(0, Number(budget.amount) || 0);
  const window = getBudgetCycleWindow(budget, refDate);

  if (!window) return null;

  return {
    currentPeriodStart: window.start,
    currentPeriodEnd: window.end,
    denominator: amount,
  };
}
exports.calculateBudgetStats = calculateBudgetStats;
