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
 * 返回一个预算项目的统计数据 —— 统一以"参考日所在自然月"口径折算：
 *   - 分母 = normalizeBudgetToCurrentMonth 的 normalizedBudgetAmount
 *   - 分子 = 在 usedRangeStart..usedRangeEnd 窗口内的真实支出
 *   - rate  = Math.round(used / denominator * 100)（百分制整数）
 */
function createBudgetStats(db, row, refDate = new Date()) {
  const budget = mapBudgetRow(row);
  const stats = calculateBudgetStats(budget, refDate);
  const denominator = stats.denominator;

  const params = [budget.id];
  let sql = `
    SELECT COALESCE(SUM(ABS(amount)), 0) AS used
    FROM transactions
    WHERE budget_id = ? AND amount < 0
  `;
  // 在当前周期窗口内统计支出（原生口径，不折算）
  if (stats.currentPeriodStart && stats.currentPeriodEnd) {
    sql += ' AND date >= ? AND date <= ?';
    params.push(stats.currentPeriodStart, stats.currentPeriodEnd);
  }

  const usedRow = db.prepare(sql).get(...params);
  const used = usedRow ? usedRow.used : 0;
  const rate = denominator > 0 ? Math.round((used / denominator) * 100) : 0;

  return {
    ...budget,
    currentPeriodStart: stats.currentPeriodStart,
    currentPeriodEnd: stats.currentPeriodEnd,
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
