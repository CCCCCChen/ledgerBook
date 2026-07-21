const { parseISODate, formatISODate, addDays, getSafeMonthDay, getBudgetCycleWindow } = require('../shared/installment-utils.cjs');

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

function createBudgetStats(db, row, refDate = new Date()) {
  const budget = mapBudgetRow(row);
  const currentWindow = getBudgetCycleWindow(budget, refDate);
  const params = [budget.id];
  let sql = `
    SELECT COALESCE(SUM(ABS(amount)), 0) AS used
    FROM transactions
    WHERE budget_id = ? AND amount < 0
  `;

  if (currentWindow) {
    sql += ' AND date >= ? AND date <= ?';
    params.push(currentWindow.start, currentWindow.end);
  }

  const usedRow = db.prepare(sql).get(...params);
  const used = usedRow ? usedRow.used : 0;
  const rate = budget.amount > 0 ? Math.round((used / budget.amount) * 100) : 0;

  return {
    ...budget,
    currentPeriodStart: currentWindow ? currentWindow.start : undefined,
    currentPeriodEnd: currentWindow ? currentWindow.end : undefined,
    used,
    rate,
    remaining: Math.max(0, budget.amount - used),
  };
}

module.exports = {
  mapBudgetRow,
  getBudgetCycleWindow,
  createBudgetStats,
};
