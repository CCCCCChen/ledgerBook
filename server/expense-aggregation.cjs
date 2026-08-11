/**
 * D2 — Expense Aggregation Service
 * Dashboard 数据层唯一入口，D3~D6 均消费此输出。
 * 纯函数，不访问数据库。
 */
const { normalizeBudgetToCurrentMonth } = require('../shared/installment-utils.cjs');

/**
 * D3 — 计划状态派生
 * 规则：有 budgetId + 不超预算 → planned，超 → over_budget；
 * 无 budgetId + expense_attribute = one_time_emergency → unexpected；
 * 其余 → unplanned_adjustment。
 */
function classifyPlanStatus(tx, budgetMap, totalUsedByBudgetBeforeTx) {
  if (tx.budgetId && budgetMap.has(String(tx.budgetId))) {
    const budget = budgetMap.get(String(tx.budgetId));
    const absAmt = Math.abs(tx.amount);
    const usedSoFar = (totalUsedByBudgetBeforeTx && totalUsedByBudgetBeforeTx.get(String(tx.budgetId))) || 0;
    if (usedSoFar + absAmt <= Number(budget.amount)) {
      return 'planned';
    }
    return 'over_budget';
  }
  if (tx.expenseAttribute === 'one_time_emergency') {
    return 'unexpected';
  }
  return 'unplanned_adjustment';
}

/**
 * @param {Object} opts
 * @param {Array}  opts.transactions  — 已按时间范围过滤的支出交易
 * @param {Array}  opts.budgets       — 全部预算列表
 * @param {Date}   opts.refDate       — 参考日期（用于月折算）
 * @param {string} opts.monthStart    — 当月起始 YYYY-MM-DD
 * @param {string} opts.monthEnd      — 当月结束 YYYY-MM-DD
 */
function aggregateExpenses(opts) {
  const { transactions, budgets, refDate, monthStart, monthEnd } = opts;

  // ==========================================
  // 1. 收口过滤 & 基础指标
  // ==========================================
  const expenses = transactions.filter(t => t.amount < 0 && t.date >= monthStart && t.date <= monthEnd);
  const totalExpense = expenses.reduce((s, t) => s + Math.abs(t.amount), 0);
  const count = expenses.length;
  const avg = count > 0 ? Math.round(totalExpense / count) : 0;
  const max = count > 0 ? Math.max(...expenses.map(t => Math.abs(t.amount))) : 0;

  // ==========================================
  // 2. 计划内/外拆分
  // ==========================================
  const budgetMap = new Map();
  budgets.forEach(b => { if (b && b.id != null) budgetMap.set(String(b.id), b); });

  let plannedAmount = 0;
  let unplannedAmount = 0;

  // D3: planStatus 分类 + 逐个 budget 累积用量
  const planStatusSummary = { planned: 0, over_budget: 0, unexpected: 0, unplanned_adjustment: 0 };
  const budgetAccUsed = new Map();

  expenses.forEach(t => {
    const ps = classifyPlanStatus(t, budgetMap, budgetAccUsed);
    const absAmt = Math.abs(t.amount);
    planStatusSummary[ps] += absAmt;

    if (t.budgetId) {
      const key = String(t.budgetId);
      budgetAccUsed.set(key, (budgetAccUsed.get(key) || 0) + absAmt);
    }

    if (t.budgetId && budgetMap.has(String(t.budgetId))) {
      plannedAmount += absAmt;
    } else {
      unplannedAmount += absAmt;
    }
  });

  // ==========================================
  // 3. 分类聚合
  // ==========================================
  const catMap = new Map();

  expenses.forEach(t => {
    const cat = (t.category || '其他');
    let agg = catMap.get(cat);
    if (!agg) {
      agg = { category: cat, total: 0, count: 0, amounts: [], plannedAmount: 0, unplannedAmount: 0, planStatusBreakdown: { planned: 0, over_budget: 0, unexpected: 0, unplanned_adjustment: 0 } };
      catMap.set(cat, agg);
    }
    const absAmt = Math.abs(t.amount);
    const ps = classifyPlanStatus(t, budgetMap, budgetAccUsed);
    agg.total += absAmt;
    agg.count += 1;
    agg.amounts.push(absAmt);
    agg.planStatusBreakdown[ps] += absAmt;
    if (t.budgetId && budgetMap.has(String(t.budgetId))) {
      agg.plannedAmount += absAmt;
    } else {
      agg.unplannedAmount += absAmt;
    }
  });

  const byCategory = [];
  catMap.forEach((agg, category) => {
    agg.amounts.sort((a, b) => b - a);
    byCategory.push({
      category,
      total: Math.round(agg.total),
      count: agg.count,
      avg: Math.round(agg.total / agg.count),
      max: Math.round(agg.amounts[0]),
      plannedAmount: Math.round(agg.plannedAmount),
      unplannedAmount: Math.round(agg.unplannedAmount),
      planStatusBreakdown: {
        planned: Math.round(agg.planStatusBreakdown.planned),
        over_budget: Math.round(agg.planStatusBreakdown.over_budget),
        unexpected: Math.round(agg.planStatusBreakdown.unexpected),
        unplanned_adjustment: Math.round(agg.planStatusBreakdown.unplanned_adjustment),
      },
    });
  });
  byCategory.sort((a, b) => b.total - a.total);

  // ==========================================
  // 4. 预算执行
  // ==========================================
  const budgetExecution = [];

  // 第一步：每笔交易只归属一次
  const budgetUsedMap = new Map();
  const unassignedByCategory = new Map();

  expenses.forEach(t => {
    const absAmt = Math.abs(t.amount);
    if (t.budgetId && budgetMap.has(String(t.budgetId))) {
      const key = String(t.budgetId);
      budgetUsedMap.set(key, (budgetUsedMap.get(key) || 0) + absAmt);
    } else {
      const cat = (t.category || '其他');
      unassignedByCategory.set(cat, (unassignedByCategory.get(cat) || 0) + absAmt);
    }
  });

  budgets.forEach(b => {
    if (!b || Number(b.amount) <= 0) return;
    const norm = normalizeBudgetToCurrentMonth(b, {
      refDate,
      prorateMonthlyByElapsedDays: false,
    });
    if (norm.normalizedBudgetAmount <= 0) return;

    const cat = (b.category || '其他');
    const used = budgetUsedMap.get(String(b.id)) || 0;

    const denominator = norm.normalizedBudgetAmount;
    const rate = Math.min(1, denominator > 0 ? used / denominator : 0);
    const remaining = Math.max(0, denominator - used);
    let status = 'normal';
    if (rate >= 1) status = 'over';
    else if (rate >= 0.8) status = 'warning';

    budgetExecution.push({
      budgetId: b.id,
      category: cat,
      budgetAmount: denominator,
      used: Math.round(used),
      remaining: Math.round(remaining),
      rate: Math.round(rate * 100),
      status,
    });
  });

  // ==========================================
  // 5. 预算执行 — 按分类汇总（同分类多预算合并 + 未分配交易）
  // ==========================================
  const progressCatMap = new Map();
  budgetExecution.forEach(be => {
    let pc = progressCatMap.get(be.category);
    if (!pc) {
      pc = { category: be.category, budgetAmount: 0, used: 0, budgetIds: new Set() };
      progressCatMap.set(be.category, pc);
    }
    pc.budgetAmount += be.budgetAmount;
    pc.used += be.used;
    pc.budgetIds.add(String(be.budgetId));
  });

  // 未分配到此分类预算的交易也计入该分类的 used
  unassignedByCategory.forEach((amount, cat) => {
    let pc = progressCatMap.get(cat);
    if (!pc) {
      pc = { category: cat, budgetAmount: 0, used: 0, budgetIds: new Set() };
      progressCatMap.set(cat, pc);
    }
    pc.used += amount;
  });

  const budgetProgressByCategory = [];
  progressCatMap.forEach((pc, category) => {
    const rate = pc.budgetAmount > 0 ? pc.used / pc.budgetAmount : 0;
    let status = 'normal';
    if (rate >= 1) status = 'over';
    else if (rate >= 0.8) status = 'warning';
    budgetProgressByCategory.push({
      category,
      budgetAmount: Math.round(pc.budgetAmount),
      used: Math.round(pc.used),
      remaining: Math.round(Math.max(0, pc.budgetAmount - pc.used)),
      rate: Math.round(Math.min(1, rate) * 100),
      status,
      budgetCount: pc.budgetIds.size,
    });
  });

  return {
    overall: {
      totalExpense: Math.round(totalExpense),
      count,
      avg,
      max,
      planned: Math.round(plannedAmount),
      unplanned: Math.round(unplannedAmount),
      planStatusSummary: {
        planned: Math.round(planStatusSummary.planned),
        over_budget: Math.round(planStatusSummary.over_budget),
        unexpected: Math.round(planStatusSummary.unexpected),
        unplanned_adjustment: Math.round(planStatusSummary.unplanned_adjustment),
      },
    },
    byCategory,
    budgetExecution,
    budgetProgressByCategory,
  };
}

module.exports = { aggregateExpenses, classifyPlanStatus };
