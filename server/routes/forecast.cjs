const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db.cjs');
const { mapBudgetRow, getBudgetCycleWindow } = require('../finance-utils.cjs');
const { resolveAccountCashOutDate } = require('../cashflow-utils.cjs');
const { parseISODate, formatISODate, addDays } = require('../../shared/installment-utils.cjs');

function listDates(rangeFrom, rangeTo) {
  const from = parseISODate(rangeFrom);
  const to = parseISODate(rangeTo);
  const result = [];
  let cursor = from;
  while (formatISODate(cursor) <= rangeTo) {
    result.push(formatISODate(cursor));
    cursor = addDays(cursor, 1);
    if (result.length > 5000) break;
  }
  return result;
}

function getAccountForCashflow(db, accountId) {
  if (!accountId) return null;
  return (
    db
      .prepare('SELECT id, type, billing_day AS billingDay, repayment_day AS repaymentDay FROM accounts WHERE id = ?')
      .get(accountId) || null
  );
}

function getEffectiveTransactionDate(row) {
  if (row.amount < 0 && row.cashOutDate) {
    return row.cashOutDate;
  }
  return row.date;
}

function buildBudgetSettlementsForRange(db, rangeFrom, rangeTo) {
  const budgets = db.prepare('SELECT * FROM budgets').all().map(mapBudgetRow);
  const results = [];
  const fromDate = parseISODate(rangeFrom);
  const toISO = rangeTo;

  // 批量查询所有 budget 的 transactions，按 budget_id 内存分组（修复 N+1 查询）
  const allBudgetTxns = db
    .prepare('SELECT budget_id, date, amount FROM transactions WHERE amount < 0 AND budget_id IS NOT NULL')
    .all();
  const txnsByBudget = new Map();
  allBudgetTxns.forEach((t) => {
    const list = txnsByBudget.get(t.budget_id);
    if (list) {
      list.push(t);
    } else {
      txnsByBudget.set(t.budget_id, [t]);
    }
  });

  budgets.forEach((budget) => {
    const budgetTransactions = txnsByBudget.get(budget.id) || [];

    if (budget.cycleType === 'once') {
      if (!budget.endDate) return;
      if (budget.endDate < rangeFrom || budget.endDate > rangeTo) return;
      const used = budgetTransactions
        .filter((t) => t.date >= budget.startDate && t.date <= budget.endDate)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const expectedAmount = Math.max(0, budget.amount - used);
      results.push({
        id: `budget-${budget.id}-${budget.endDate}`,
        date: budget.endDate,
        amount: -expectedAmount,
      });
      return;
    }

    let cursor = parseISODate(budget.startDate);
    if (cursor < fromDate) {
      const seed = getBudgetCycleWindow(budget, fromDate);
      if (!seed) return;
      cursor = parseISODate(seed.start);
    }

    while (formatISODate(cursor) <= toISO) {
      const window = getBudgetCycleWindow(budget, cursor);
      if (!window) break;
      if (window.start >= rangeFrom && window.start <= rangeTo) {
        const used = budgetTransactions
          .filter((t) => t.date >= window.start && t.date <= window.end)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const expectedAmount = Math.max(0, budget.amount - used);
        if (expectedAmount > 0) {
          results.push({
            id: `budget-${budget.id}-${window.start}`,
            date: window.start,
            amount: -expectedAmount,
          });
        }
      }
      cursor = addDays(parseISODate(window.end), 1);
      if (results.length > 2000) break;
    }
  });

  return results;
}

function buildIncomeSettlementsForRange(db, rangeFrom, rangeTo) {
  const budgets = db.prepare(`
    SELECT
      id, name, amount, cycle_type AS cycleType, expected_date AS expectedDate,
      start_date AS startDate, end_date AS endDate, cycle_days AS cycleDays
    FROM income_budgets
  `).all();

  const results = [];
  const fromDate = new Date(rangeFrom);
  const toDate = new Date(rangeTo);

  budgets.forEach((budget) => {
    const budgetStart = new Date(budget.startDate);
    const budgetEnd = budget.endDate ? new Date(budget.endDate) : null;
    const expected = new Date(budget.expectedDate);
    const expectedDay = expected.getDate();

    // once：仅 expected_date 当天
    if (budget.cycleType === 'once') {
      if (expected >= fromDate && expected <= toDate) {
        results.push({
          id: `income-${budget.id}-${budget.expectedDate}`,
          date: budget.expectedDate,
          amount: budget.amount,
        });
      }
      return;
    }

    // monthly：每月 expected_date.getDate() 号
    if (budget.cycleType === 'monthly') {
      let current = new Date(Math.max(fromDate.getTime(), budgetStart.getTime()));
      current.setDate(expectedDay);
      if (current < budgetStart) { current.setMonth(current.getMonth() + 1); }
      while (current <= toDate && (!budgetEnd || current <= budgetEnd)) {
        const ds = current.toISOString().split('T')[0];
        if (ds >= rangeFrom && ds <= rangeTo) {
          results.push({ id: `income-${budget.id}-${ds}`, date: ds, amount: budget.amount });
        }
        current.setMonth(current.getMonth() + 1);
      }
      return;
    }

    // weekly：每周 expected_date 的星期几
    if (budget.cycleType === 'weekly') {
      const baseDay = expected.getDay();
      let current = new Date(Math.max(fromDate.getTime(), budgetStart.getTime()));
      const diff = (baseDay - current.getDay() + 7) % 7;
      current.setDate(current.getDate() + diff);
      if (current < budgetStart) { current.setDate(current.getDate() + 7); }
      while (current <= toDate && (!budgetEnd || current <= budgetEnd)) {
        const ds = current.toISOString().split('T')[0];
        if (ds >= rangeFrom && ds <= rangeTo) {
          results.push({ id: `income-${budget.id}-${ds}`, date: ds, amount: budget.amount });
        }
        current.setDate(current.getDate() + 7);
      }
      return;
    }

    // yearly：每年同月同日
    if (budget.cycleType === 'yearly') {
      let current = new Date(Math.max(fromDate.getTime(), budgetStart.getTime()));
      current.setMonth(expected.getMonth());
      current.setDate(expected.getDate());
      if (current < budgetStart) { current.setFullYear(current.getFullYear() + 1); }
      while (current <= toDate && (!budgetEnd || current <= budgetEnd)) {
        const ds = current.toISOString().split('T')[0];
        if (ds >= rangeFrom && ds <= rangeTo) {
          results.push({ id: `income-${budget.id}-${ds}`, date: ds, amount: budget.amount });
        }
        current.setFullYear(current.getFullYear() + 1);
      }
      return;
    }

    // custom：每 cycleDays 天，从 start_date 起算
    if (budget.cycleType === 'custom' && budget.cycleDays) {
      let current = new Date(Math.max(fromDate.getTime(), budgetStart.getTime()));
      const dayDiff = Math.ceil((current.getTime() - budgetStart.getTime()) / (1000 * 60 * 60 * 24));
      const cycles = Math.ceil(dayDiff / budget.cycleDays);
      current = new Date(budgetStart.getTime() + cycles * budget.cycleDays * 24 * 60 * 60 * 1000);
      while (current <= toDate && (!budgetEnd || current <= budgetEnd)) {
        const ds = current.toISOString().split('T')[0];
        if (ds >= rangeFrom && ds <= rangeTo) {
          results.push({ id: `income-${budget.id}-${ds}`, date: ds, amount: budget.amount });
        }
        current.setDate(current.getDate() + budget.cycleDays);
      }
    }
  });

  return results;
}

function simulateBalance({ startBalance, rangeFrom, rangeTo, deltasByDate }) {
  const dates = listDates(rangeFrom, rangeTo);
  const points = [];
  let balance = startBalance;
  let minBalance = balance;
  let minDate = dates[0] || rangeFrom;

  dates.forEach((date) => {
    const delta = deltasByDate.get(date) || 0;
    balance += delta;
    points.push({ date, balance });
    if (balance < minBalance) {
      minBalance = balance;
      minDate = date;
    }
  });

  return { points, minBalance, minDate, endBalance: balance };
}

router.post('/impact', (req, res) => {
  try {
    const db = getDatabase();
    const {
      rangeFrom,
      rangeTo,
      startBalance = 0,
      includePlannedExpenses = true,
      includeBudgetSettlement = true,
      includeIncomeSettlement = true,
      simulatedExpense,
    } = req.body || {};

    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) {
      return res.status(400).json({ success: false, message: 'rangeFrom/rangeTo 不合法' });
    }

    const transactionRows = db
      .prepare(
        `
        SELECT
          id,
          date,
          amount,
          transaction_type AS transactionType,
          cash_out_date AS cashOutDate,
          note
        FROM transactions
        WHERE (
          amount < 0 AND cash_out_date IS NOT NULL AND cash_out_date >= ? AND cash_out_date <= ?
        ) OR (
          amount < 0 AND cash_out_date IS NULL AND date >= ? AND date <= ?
        ) OR (
          amount >= 0 AND date >= ? AND date <= ?
        )
      `,
      )
      .all(rangeFrom, rangeTo, rangeFrom, rangeTo, rangeFrom, rangeTo);

    const plannedRows = includePlannedExpenses
      ? db
          .prepare(
            `
            SELECT id, planned_date AS plannedDate, cash_out_date AS cashOutDate, amount, note
            FROM planned_expenses
            WHERE COALESCE(cash_out_date, planned_date) >= ? AND COALESCE(cash_out_date, planned_date) <= ?
          `,
          )
          .all(rangeFrom, rangeTo)
      : [];

    const settlementRows = includeBudgetSettlement ? buildBudgetSettlementsForRange(db, rangeFrom, rangeTo) : [];
    const incomeSettlementRows = includeIncomeSettlement ? buildIncomeSettlementsForRange(db, rangeFrom, rangeTo) : [];

    const baselineDeltasByDate = new Map();
    transactionRows.forEach((row) => {
      const date = getEffectiveTransactionDate(row);
      baselineDeltasByDate.set(date, (baselineDeltasByDate.get(date) || 0) + Number(row.amount));
    });
    plannedRows.forEach((row) => {
      const date = row.cashOutDate || row.plannedDate;
      baselineDeltasByDate.set(date, (baselineDeltasByDate.get(date) || 0) - Math.abs(Number(row.amount)));
    });
    settlementRows.forEach((row) => {
      baselineDeltasByDate.set(row.date, (baselineDeltasByDate.get(row.date) || 0) + Number(row.amount));
    });
    incomeSettlementRows.forEach((row) => {
      baselineDeltasByDate.set(row.date, (baselineDeltasByDate.get(row.date) || 0) + Number(row.amount));
    });

    const baseline = simulateBalance({
      startBalance: Number(startBalance) || 0,
      rangeFrom,
      rangeTo,
      deltasByDate: baselineDeltasByDate,
    });

    const withExpenseDeltasByDate = new Map(baselineDeltasByDate);
    if (simulatedExpense && simulatedExpense.amount != null && Number(simulatedExpense.amount) > 0 && simulatedExpense.date) {
      const amount = Math.abs(Number(simulatedExpense.amount));
      const account = getAccountForCashflow(db, simulatedExpense.accountId || null);
      const cashOutDate = resolveAccountCashOutDate(simulatedExpense.date, account) || simulatedExpense.date;
      withExpenseDeltasByDate.set(cashOutDate, (withExpenseDeltasByDate.get(cashOutDate) || 0) - amount);
    }

    const withExpense = simulateBalance({
      startBalance: Number(startBalance) || 0,
      rangeFrom,
      rangeTo,
      deltasByDate: withExpenseDeltasByDate,
    });

    res.json({
      success: true,
      data: {
        baseline: {
          minBalance: baseline.minBalance,
          minDate: baseline.minDate,
          endBalance: baseline.endBalance,
        },
        withExpense: {
          minBalance: withExpense.minBalance,
          minDate: withExpense.minDate,
          endBalance: withExpense.endBalance,
        },
        delta: {
          minBalance: withExpense.minBalance - baseline.minBalance,
          endBalance: withExpense.endBalance - baseline.endBalance,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '影响评估失败', error: error.message });
  }
});

module.exports = router;
