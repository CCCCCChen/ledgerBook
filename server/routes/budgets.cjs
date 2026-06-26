const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db.cjs');

// GET /api/budgets — 获取所有预算项目（含执行统计）
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const budgets = db.prepare('SELECT * FROM budgets ORDER BY created_at DESC').all();
    const stats = budgets.map((b) => {
      const usedRow = db.prepare(`
        SELECT COALESCE(SUM(ABS(amount)), 0) AS used
        FROM transactions
        WHERE budget_id = ? AND amount < 0
      `).get(b.id);
      const used = usedRow ? usedRow.used : 0;
      const rate = b.amount > 0 ? Math.round((used / b.amount) * 100) : 0;
      return {
        id: b.id,
        name: b.name,
        amount: b.amount,
        cycleType: b.cycle_type,
        startDate: b.start_date,
        endDate: b.end_date,
        category: b.category,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
        used,
        rate,
        remaining: Math.max(0, b.amount - used),
      };
    });
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
    const usedRow = db.prepare(`
      SELECT COALESCE(SUM(ABS(amount)), 0) AS used
      FROM transactions
      WHERE budget_id = ? AND amount < 0
    `).get(b.id);
    const used = usedRow ? usedRow.used : 0;
    const rate = b.amount > 0 ? Math.round((used / b.amount) * 100) : 0;
    res.json({
      success: true,
      data: {
        id: b.id,
        name: b.name,
        amount: b.amount,
        cycleType: b.cycle_type,
        startDate: b.start_date,
        endDate: b.end_date,
        category: b.category,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
        used,
        rate,
        remaining: Math.max(0, b.amount - used),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取预算项目失败', error: error.message });
  }
});

// POST /api/budgets — 创建预算项目
router.post('/', (req, res) => {
  try {
    const db = getDatabase();
    const { name, amount, cycleType, startDate, endDate, category } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: '预算名称不能为空' });
    }
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: '预算金额必须为正数' });
    }
    const validCycles = ['once', 'weekly', 'monthly', 'yearly'];
    if (!cycleType || !validCycles.includes(cycleType)) {
      return res.status(400).json({ success: false, message: '无效的周期类型' });
    }
    if (cycleType === 'once' && !endDate) {
      return res.status(400).json({ success: false, message: '临时预算必须设置结束日期' });
    }

    const id = `bud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO budgets (id, name, amount, cycle_type, start_date, end_date, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name.trim(), Number(amount), cycleType,
      startDate || now.slice(0, 10),
      cycleType === 'once' ? endDate : null,
      category || null, now, now,
    );

    const created = db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
    res.status(201).json({
      success: true,
      data: {
        id: created.id,
        name: created.name,
        amount: created.amount,
        cycleType: created.cycle_type,
        startDate: created.start_date,
        endDate: created.end_date,
        category: created.category,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
        used: 0,
        rate: 0,
        remaining: created.amount,
      },
    });
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

    const { name, amount, cycleType, startDate, endDate, category } = req.body;

    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ success: false, message: '预算名称不能为空' });
    }
    if (amount !== undefined && (isNaN(amount) || Number(amount) <= 0)) {
      return res.status(400).json({ success: false, message: '预算金额必须为正数' });
    }
    const validCycles = ['once', 'weekly', 'monthly', 'yearly'];
    const finalCycle = cycleType || existing.cycle_type;
    if (cycleType && !validCycles.includes(cycleType)) {
      return res.status(400).json({ success: false, message: '无效的周期类型' });
    }
    if (finalCycle === 'once' && endDate === undefined && !existing.end_date) {
      return res.status(400).json({ success: false, message: '临时预算必须设置结束日期' });
    }

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE budgets
      SET name = ?, amount = ?, cycle_type = ?, start_date = ?, end_date = ?, category = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      amount !== undefined ? Number(amount) : existing.amount,
      finalCycle,
      startDate || existing.start_date,
      finalCycle === 'once' ? (endDate !== undefined ? endDate : existing.end_date) : null,
      category !== undefined ? (category || null) : existing.category,
      now,
      req.params.id,
    );

    const updated = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    const usedRow = db.prepare(`
      SELECT COALESCE(SUM(ABS(amount)), 0) AS used
      FROM transactions
      WHERE budget_id = ? AND amount < 0
    `).get(updated.id);
    const used = usedRow ? usedRow.used : 0;
    const rate = updated.amount > 0 ? Math.round((used / updated.amount) * 100) : 0;

    res.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        amount: updated.amount,
        cycleType: updated.cycle_type,
        startDate: updated.start_date,
        endDate: updated.end_date,
        category: updated.category,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
        used,
        rate,
        remaining: Math.max(0, updated.amount - used),
      },
    });
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
