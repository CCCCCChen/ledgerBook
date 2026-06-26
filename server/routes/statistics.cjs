const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db.cjs');

router.get('/overview', (req, res) => {
  try {
    const db = getDatabase();
    const totalIncome = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE amount > 0"
    ).get().total;

    const totalExpense = db.prepare(
      "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions WHERE amount < 0"
    ).get().total;

    const txnCount = db.prepare("SELECT COUNT(*) as count FROM transactions").get().count;
    const budgetCount = db.prepare("SELECT COUNT(*) as count FROM budgets").get().count;

    res.json({
      totalIncome,
      totalExpense,
      transactionCount: txnCount,
      budgetCount,
      balance: totalIncome - totalExpense,
    });
  } catch (error) {
    res.status(500).json({ error: '获取统计概览失败', detail: error.message });
  }
});

router.get('/billing-cycle', (req, res) => {
  try {
    const db = getDatabase();
    const accounts = db.prepare(
      "SELECT id, name, type, billing_day FROM accounts WHERE type IN ('credit_card', 'alipay_huabei') AND billing_day IS NOT NULL"
    ).all();

    const now = new Date();
    const results = accounts.map((acc) => {
      const billingDay = acc.billing_day;
      const y = now.getFullYear();
      const m = now.getMonth();
      const start = new Date(y, m, billingDay);
      if (now < start) start.setMonth(m - 1);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      end.setDate(end.getDate() - 1);

      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);

      const row = db.prepare(
        "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM transactions WHERE account_id = ? AND amount < 0 AND date >= ? AND date <= ?"
      ).get(acc.id, startStr, endStr);

      return {
        accountId: acc.id,
        accountName: acc.name,
        accountType: acc.type,
        billingDay,
        cycleStart: startStr,
        cycleEnd: endStr,
        totalExpense: row.total,
      };
    });

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: '获取账单周期统计失败', detail: error.message });
  }
});

router.get('/budget-execution', (req, res) => {
  try {
    const db = getDatabase();
    const budgets = db.prepare("SELECT * FROM budgets").all();

    const results = budgets.map((budget) => {
      const row = db.prepare(
        "SELECT COALESCE(SUM(ABS(amount)), 0) as used FROM transactions WHERE budget_id = ? AND amount < 0"
      ).get(budget.id);

      const used = row.used;
      const rate = budget.amount > 0 ? Math.round((used / budget.amount) * 100) : 0;

      return {
        budgetId: budget.id,
        budgetName: budget.name,
        budgetAmount: budget.amount,
        cycleType: budget.cycle_type,
        category: budget.category,
        used,
        remaining: Math.max(0, budget.amount - used),
        rate,
        isOverBudget: rate > 100,
        isWarning: rate >= 80 && rate <= 100,
      };
    });

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: '获取预算执行统计失败', detail: error.message });
  }
});

router.get('/category-distribution', (req, res) => {
  try {
    const db = getDatabase();
    const rows = db.prepare(
      "SELECT category, COALESCE(SUM(ABS(amount)), 0) as total FROM transactions WHERE amount < 0 GROUP BY category ORDER BY total DESC"
    ).all();

    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

    const results = rows.map((r) => ({
      category: r.category,
      total: r.total,
      percentage: grandTotal > 0 ? Math.round((r.total / grandTotal) * 10000) / 100 : 0,
    }));

    res.json({ items: results, grandTotal });
  } catch (error) {
    res.status(500).json({ error: '获取分类支出分布失败', detail: error.message });
  }
});

router.get('/trend', (req, res) => {
  try {
    const db = getDatabase();
    const { granularity = 'daily' } = req.query;

    const rows = db.prepare(
      "SELECT date, ABS(amount) as amount FROM transactions WHERE amount < 0 ORDER BY date ASC"
    ).all();

    if (rows.length === 0) {
      return res.json({ granularity, items: [] });
    }

    const buckets = {};
    rows.forEach((row) => {
      const d = new Date(row.date);
      let key;
      if (granularity === 'weekly') {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d);
        monday.setDate(diff);
        key = monday.toISOString().slice(0, 10);
      } else if (granularity === 'monthly') {
        key = d.toISOString().slice(0, 7);
      } else {
        key = row.date;
      }
      buckets[key] = (buckets[key] || 0) + row.amount;
    });

    const items = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }));

    res.json({ granularity, items });
  } catch (error) {
    res.status(500).json({ error: '获取趋势统计失败', detail: error.message });
  }
});

router.get('/account-comparison', (req, res) => {
  try {
    const db = getDatabase();
    const rows = db.prepare(
      `SELECT a.id as accountId, a.name as accountName, a.type as accountType,
              COALESCE(SUM(ABS(t.amount)), 0) as totalExpense
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id AND t.amount < 0
       GROUP BY a.id
       ORDER BY totalExpense DESC`
    ).all();

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: '获取账户支出对比失败', detail: error.message });
  }
});

router.get('/over-budget-alerts', (req, res) => {
  try {
    const db = getDatabase();
    const budgets = db.prepare("SELECT * FROM budgets").all();

    const alerts = budgets
      .map((budget) => {
        const row = db.prepare(
          "SELECT COALESCE(SUM(ABS(amount)), 0) as used FROM transactions WHERE budget_id = ? AND amount < 0"
        ).get(budget.id);

        const used = row.used;
        const rate = budget.amount > 0 ? Math.round((used / budget.amount) * 100) : 0;

        return {
          budgetId: budget.id,
          budgetName: budget.name,
          budgetAmount: budget.amount,
          used,
          rate,
          severity: rate > 100 ? 'over' : rate >= 80 ? 'warning' : 'normal',
        };
      })
      .filter((b) => b.rate >= 80)
      .sort((a, b) => b.rate - a.rate);

    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: '获取超支预警失败', detail: error.message });
  }
});

module.exports = router;
