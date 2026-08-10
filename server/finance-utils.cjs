const { parseISODate, formatISODate, addDays, getSafeMonthDay, getBudgetCycleWindow, normalizeBudgetToCurrentMonth } = require('../shared/installment-utils.cjs');

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
 * 返回一个预算项目的统计数据 —— 统一以"参考日所在自然月"口径折算：
 *   - 分母 = normalizeBudgetToCurrentMonth 的 normalizedBudgetAmount
 *   - 分子 = 在 usedRangeStart..usedRangeEnd 窗口内的真实支出
 *   - rate  = Math.round(used / denominator * 100)（百分制整数）
 */
function createBudgetStats(db, row, refDate = new Date()) {
  const budget = mapBudgetRow(row);
  const norm = normalizeBudgetToCurrentMonth(budget, { refDate, prorateMonthlyByElapsedDays: false });
  const denominator = Math.max(0, norm.normalizedBudgetAmount);

  const params = [budget.id];
  let sql = `
    SELECT COALESCE(SUM(ABS(amount)), 0) AS used
    FROM transactions
    WHERE budget_id = ? AND amount < 0
  `;
  // 只要有明确的分子窗口就按窗口统计；如果预算完全不在 ref 月，used 直接 = 0，不再额外加永真条件
  if (norm.usedRangeStart && norm.usedRangeEnd && norm.overlapDays > 0) {
    sql += ' AND date >= ? AND date <= ?';
    params.push(norm.usedRangeStart, norm.usedRangeEnd);
  } else if (!norm.usedRangeStart && !norm.usedRangeEnd) {
    // 兼容：无明确窗口时退化到预算周期窗口（原逻辑）
    const currentWindow = getBudgetCycleWindow(budget, refDate);
    if (currentWindow) {
      sql += ' AND date >= ? AND date <= ?';
      params.push(currentWindow.start, currentWindow.end);
    }
  }

  const usedRow = db.prepare(sql).get(...params);
  const used = usedRow ? usedRow.used : 0;
  const rate = denominator > 0 ? Math.round((used / denominator) * 100) : 0;

  return {
    ...budget,
    currentPeriodStart: norm.usedRangeStart,
    currentPeriodEnd: norm.usedRangeEnd,
    monthlyBudgetAmount: denominator,
    used,
    rate,
    remaining: Math.max(0, denominator - used),
    cycleOverlapDays: norm.overlapDays,
  };
}

module.exports = {
  mapBudgetRow,
  getBudgetCycleWindow,
  createBudgetStats,
};
