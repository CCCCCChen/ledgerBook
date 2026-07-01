// server/routes/income-budgets.cjs — 收入预算 API
const express = require('express');
const { getDatabase } = require('../db.cjs');

const router = express.Router();

// 生成 UUID
function genId(prefix = 'inc') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 获取所有收入预算
router.get('/', (req, res) => {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT 
      id, name, amount, cycle_type AS cycleType, expected_date AS expectedDate,
      account_id AS accountId, cycle_days AS cycleDays,
      start_date AS startDate, end_date AS endDate, note,
      created_at AS createdAt, updated_at AS updatedAt
    FROM income_budgets
    ORDER BY expected_date ASC
  `).all();
  res.json(rows);
});

// 创建收入预算
router.post('/', (req, res) => {
  const db = getDatabase();
  const {
    name, amount, cycleType = 'once', expectedDate,
    accountId = null, cycleDays = null, startDate, endDate = null, note = ''
  } = req.body;

  if (!name || !amount || !expectedDate || !startDate) {
    return res.status(400).json({ error: '缺少必填字段' });
  }

  const id = genId('inc-bud');
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO income_budgets (
      id, name, amount, cycle_type, expected_date, account_id,
      cycle_days, start_date, end_date, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, amount, cycleType, expectedDate, accountId,
    cycleDays, startDate, endDate, note, now, now
  );

  const row = db.prepare(`
    SELECT 
      id, name, amount, cycle_type AS cycleType, expected_date AS expectedDate,
      account_id AS accountId, cycle_days AS cycleDays,
      start_date AS startDate, end_date AS endDate, note,
      created_at AS createdAt, updated_at AS updatedAt
    FROM income_budgets WHERE id = ?
  `).get(id);

  res.status(201).json(row);
});

// 更新收入预算
router.put('/:id', (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const {
    name, amount, cycleType, expectedDate,
    accountId, cycleDays, startDate, endDate, note
  } = req.body;

  const existing = db.prepare('SELECT id FROM income_budgets WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '收入预算不存在' });
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE income_budgets SET
      name = COALESCE(?, name),
      amount = COALESCE(?, amount),
      cycle_type = COALESCE(?, cycle_type),
      expected_date = COALESCE(?, expected_date),
      account_id = ?,
      cycle_days = ?,
      start_date = COALESCE(?, start_date),
      end_date = ?,
      note = COALESCE(?, note),
      updated_at = ?
    WHERE id = ?
  `).run(
    name, amount, cycleType, expectedDate,
    accountId, cycleDays, startDate, endDate, note,
    now, id
  );

  const row = db.prepare(`
    SELECT 
      id, name, amount, cycle_type AS cycleType, expected_date AS expectedDate,
      account_id AS accountId, cycle_days AS cycleDays,
      start_date AS startDate, end_date AS endDate, note,
      created_at AS createdAt, updated_at AS updatedAt
    FROM income_budgets WHERE id = ?
  `).get(id);

  res.json(row);
});

// 删除收入预算
router.delete('/:id', (req, res) => {
  const db = getDatabase();
  const { id } = req.params;

  const result = db.prepare('DELETE FROM income_budgets WHERE id = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: '收入预算不存在' });
  }

  res.json({ success: true });
});

// 获取指定时间范围内的收入预算展开（按周期展开成具体日期）
router.get('/projection', (req, res) => {
  const db = getDatabase();
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: '缺少 startDate 或 endDate 参数' });
  }

  const budgets = db.prepare(`
    SELECT 
      id, name, amount, cycle_type AS cycleType, expected_date AS expectedDate,
      account_id AS accountId, cycle_days AS cycleDays,
      start_date AS startDate, end_date AS endDate, note
    FROM income_budgets
    ORDER BY expected_date ASC
  `).all();

  // 按周期展开
  const projections = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (const budget of budgets) {
    const budgetStart = new Date(budget.startDate);
    const budgetEnd = budget.endDate ? new Date(budget.endDate) : null;
    const expectedDay = new Date(budget.expectedDate).getDate();

    if (budget.cycleType === 'once') {
      const date = new Date(budget.expectedDate);
      if (date >= start && date <= end) {
        projections.push({
          ...budget,
          projectionDate: budget.expectedDate,
          isOneTime: true
        });
      }
    } else if (budget.cycleType === 'monthly') {
      let current = new Date(Math.max(start.getTime(), budgetStart.getTime()));
      current.setDate(expectedDay);
      if (current < new Date(budget.startDate)) {
        current.setMonth(current.getMonth() + 1);
      }

      while (current <= end && (!budgetEnd || current <= budgetEnd)) {
        projections.push({
          ...budget,
          projectionDate: current.toISOString().split('T')[0],
          isOneTime: false
        });
        current.setMonth(current.getMonth() + 1);
      }
    } else if (budget.cycleType === 'weekly') {
      const baseDate = new Date(budget.expectedDate);
      let current = new Date(Math.max(start.getTime(), budgetStart.getTime()));
      // 对齐到星期几
      const dayDiff = (baseDate.getDay() - current.getDay() + 7) % 7;
      current.setDate(current.getDate() + dayDiff);
      if (current < new Date(budget.startDate)) {
        current.setDate(current.getDate() + 7);
      }

      while (current <= end && (!budgetEnd || current <= budgetEnd)) {
        projections.push({
          ...budget,
          projectionDate: current.toISOString().split('T')[0],
          isOneTime: false
        });
        current.setDate(current.getDate() + 7);
      }
    } else if (budget.cycleType === 'custom' && budget.cycleDays) {
      const baseDate = new Date(budget.expectedDate);
      let current = new Date(Math.max(start.getTime(), budgetStart.getTime()));
      const dayDiff = Math.ceil((current - baseDate) / (1000 * 60 * 60 * 24));
      const cycles = Math.ceil(dayDiff / budget.cycleDays);
      current = new Date(baseDate.getTime() + cycles * budget.cycleDays * 24 * 60 * 60 * 1000);

      while (current <= end && (!budgetEnd || current <= budgetEnd)) {
        projections.push({
          ...budget,
          projectionDate: current.toISOString().split('T')[0],
          isOneTime: false
        });
        current.setDate(current.getDate() + budget.cycleDays);
      }
    } else if (budget.cycleType === 'yearly') {
      const baseDate = new Date(budget.expectedDate);
      let current = new Date(Math.max(start.getTime(), budgetStart.getTime()));
      current.setMonth(baseDate.getMonth());
      current.setDate(baseDate.getDate());
      if (current < new Date(budget.startDate)) {
        current.setFullYear(current.getFullYear() + 1);
      }

      while (current <= end && (!budgetEnd || current <= budgetEnd)) {
        projections.push({
          ...budget,
          projectionDate: current.toISOString().split('T')[0],
          isOneTime: false
        });
        current.setFullYear(current.getFullYear() + 1);
      }
    }
  }

  projections.sort((a, b) => new Date(a.projectionDate) - new Date(b.projectionDate));
  res.json(projections);
});

module.exports = router;
