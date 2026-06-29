const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db.cjs');
const { mapBudgetRow, createBudgetStats } = require('../finance-utils.cjs');

// GET /api/budgets — 获取所有预算项目（含执行统计）
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const budgets = db.prepare('SELECT * FROM budgets ORDER BY created_at DESC').all();
    const stats = budgets.map((budget) => createBudgetStats(db, budget));
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取预算列表失败', error: error.message });
  }
});

// GET /api/budgets/:id — 获取单个预算项目（含执行统计）
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const b = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    if (!b) {
      return res.status(404).json({ success: false, message: '预算项目不存在' });
    }
    res.json({ success: true, data: createBudgetStats(db, b) });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取预算项目失败', error: error.message });
  }
});

// POST /api/budgets — 创建预算项目
router.post('/', (req, res) => {
  try {
    const db = getDatabase();
    const { name, amount, cycleType, startDate, endDate, cycleDays, category } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: '预算名称不能为空' });
    }
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: '预算金额必须为正数' });
    }
    const validCycles = ['once', 'weekly', 'monthly', 'yearly', 'custom'];
    if (!cycleType || !validCycles.includes(cycleType)) {
      return res.status(400).json({ success: false, message: '无效的周期类型' });
    }
    if (cycleType === 'once' && !endDate) {
      return res.status(400).json({ success: false, message: '临时预算必须设置结束日期' });
    }
    if (cycleType === 'custom' && (!cycleDays || Number(cycleDays) < 2)) {
      return res.status(400).json({ success: false, message: '自定义周期至少需要 2 天' });
    }

    const id = `bud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO budgets (id, name, amount, cycle_type, start_date, end_date, cycle_days, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name.trim(), Number(amount), cycleType,
      startDate || now.slice(0, 10),
      cycleType === 'once' ? endDate : null,
      cycleType === 'custom' ? Number(cycleDays) : null,
      category || null, now, now,
    );

    const created = db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: createBudgetStats(db, created) });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建预算失败', error: error.message });
  }
});

// PUT /api/budgets/:id — 更新预算项目
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: '预算项目不存在' });
    }

    const { name, amount, cycleType, startDate, endDate, cycleDays, category } = req.body;

    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ success: false, message: '预算名称不能为空' });
    }
    if (amount !== undefined && (isNaN(amount) || Number(amount) <= 0)) {
      return res.status(400).json({ success: false, message: '预算金额必须为正数' });
    }
    const validCycles = ['once', 'weekly', 'monthly', 'yearly', 'custom'];
    const finalCycle = cycleType || existing.cycle_type;
    if (cycleType && !validCycles.includes(cycleType)) {
      return res.status(400).json({ success: false, message: '无效的周期类型' });
    }
    if (finalCycle === 'once' && endDate === undefined && !existing.end_date) {
      return res.status(400).json({ success: false, message: '临时预算必须设置结束日期' });
    }
    if (finalCycle === 'custom') {
      const finalCycleDays = cycleDays !== undefined ? Number(cycleDays) : existing.cycle_days;
      if (!finalCycleDays || finalCycleDays < 2) {
        return res.status(400).json({ success: false, message: '自定义周期至少需要 2 天' });
      }
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE budgets
      SET name = ?, amount = ?, cycle_type = ?, start_date = ?, end_date = ?, cycle_days = ?, category = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      amount !== undefined ? Number(amount) : existing.amount,
      finalCycle,
      startDate || existing.start_date,
      finalCycle === 'once' ? (endDate !== undefined ? endDate : existing.end_date) : null,
      finalCycle === 'custom'
        ? (cycleDays !== undefined ? Number(cycleDays) : existing.cycle_days)
        : null,
      category !== undefined ? (category || null) : existing.category,
      now,
      req.params.id,
    );

    const updated = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: createBudgetStats(db, updated) });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新预算失败', error: error.message });
  }
});

// DELETE /api/budgets/:id — 删除预算项目
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: '预算项目不存在' });
    }

    db.prepare('UPDATE transactions SET budget_id = NULL, is_budgeted = 0 WHERE budget_id = ?').run(req.params.id);
    db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);

    res.json({ success: true, message: '预算项目已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除预算失败', error: error.message });
  }
});

module.exports = router;
