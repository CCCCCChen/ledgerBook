const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db.cjs');
const { mapBudgetRow, getBudgetCycleWindow } = require('../finance-utils.cjs');
const { resolveAccountCashOutDate } = require('../cashflow-utils.cjs');

function parseISODate(date) {
  return new Date(`${date}T00:00:00`);
}

function formatLocalISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function listDates(rangeFrom, rangeTo) {
  const from = parseISODate(rangeFrom);
  const to = parseISODate(rangeTo);
  const result = [];
  let cursor = from;
  while (formatLocalISODate(cursor) <= rangeTo) {
    result.push(formatLocalISODate(cursor));
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

  budgets.forEach((budget) => {
    const budgetTransactions = db
      .prepare('SELECT date, amount FROM transactions WHERE amount < 0 AND budget_id = ?')
      .all(budget.id);

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

    while (formatLocalISODate(cursor) <= toISO) {
      const window = getBudgetCycleWindow(budget, cursor);
      if (!window) break;
      if (window.end >= rangeFrom && window.end <= rangeTo) {
        const used = budgetTransactions
          .filter((t) => t.date >= window.start && t.date <= window.end)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const expectedAmount = Math.max(0, budget.amount - used);
        if (expectedAmount > 0) {
          results.push({
            id: `budget-${budget.id}-${window.end}`,
            date: window.end,
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
