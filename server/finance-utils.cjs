function parseISODate(date) {
  return new Date(`${date}T00:00:00`);
}

function formatISODate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getSafeMonthDay(year, month, day) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

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

  if (budget.cycleType === 'weekly' || (budget.cycleType === 'custom' && budget.cycleDays)) {
    const cycleDays = budget.cycleType === 'weekly' ? 7 : budget.cycleDays;
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
