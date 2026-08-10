const { parseISODate, formatISODate, addDays, getSafeMonthDay, getBudgetCycleWindow, normalizeBudgetToCurrentMonth, calculateBudgetStats } = require('../shared/installment-utils.cjs');

function mapBudgetRow(row) {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    cycleType: row.cycle_type,
    startDate: row.start_date,
    endDate: row.end_date || undefined,
    cycleDays: row.cycle_days || undefined,
    category: row.category || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 返回一个预算项目的统计数据 —— 预算卡片原生口径（不折算）：
 *   - 周期窗口 = calculateBudgetStats 按 refDate 得到的当前周期（weekly 跟随 refDate 滑动）
 *   - 分母 = 预算周期原值 amount
 *   - 分子 = 在 spendingWindow（customWindow ?? 周期窗口）内的真实支出
 *   - rate  = Math.round(used / denominator * 100)（百分制整数）
 *
 * @param {object} db
 * @param {object} row          预算行
 * @param {Date}   refDate      参考日（决定周期窗口）
 * @param {{start:string,end:string}|null} customWindow 可选：覆盖支出查询窗口（周滑动时传目标周）
 */
function createBudgetStats(db, row, refDate = new Date(), customWindow = null) {
  const budget = mapBudgetRow(row);
  const stats = calculateBudgetStats(budget, refDate);

  // custom 缺 cycleDays → 无法计算，返回空壳
  if (!stats) {
    return {
      ...budget,
      currentPeriodStart: budget.startDate,
      currentPeriodEnd: budget.endDate || budget.startDate,
      spendingStart: undefined,
      spendingEnd: undefined,
      denominator: budget.amount,
      used: 0,
      rate: 0,
      remaining: budget.amount,
    };
  }

  const denominator = stats.denominator;

  const spendingStart = customWindow ? customWindow.start : stats.currentPeriodStart;
  const spendingEnd = customWindow ? customWindow.end : stats.currentPeriodEnd;

  const params = [budget.id];
  let sql = `
    SELECT COALESCE(SUM(ABS(amount)), 0) AS used
    FROM transactions
    WHERE budget_id = ? AND amount < 0
  `;
  // 支出统计窗口：周滑动时用 customWindow，否则用当前周期窗口
  if (spendingStart && spendingEnd) {
    sql += ' AND date >= ? AND date <= ?';
    params.push(spendingStart, spendingEnd);
  }

  const usedRow = db.prepare(sql).get(...params);
  const used = usedRow ? usedRow.used : 0;
  const rate = denominator > 0 ? Math.round((used / denominator) * 100) : 0;

  return {
    ...budget,
    currentPeriodStart: stats.currentPeriodStart,
    currentPeriodEnd: stats.currentPeriodEnd,
    spendingStart: customWindow ? customWindow.start : undefined,
    spendingEnd: customWindow ? customWindow.end : undefined,
    denominator,
    used,
    rate,
    remaining: Math.max(0, denominator - used),
  };
}

module.exports = {
  mapBudgetRow,
  getBudgetCycleWindow,
  createBudgetStats,
};
