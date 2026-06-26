const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db.cjs');

// GET /api/transactions — 获取交易记录列表，支持筛选
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { accountId, category, dateFrom, dateTo, keyword, sortOrder } = req.query;

    let sql = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];

    if (accountId) {
      sql += ' AND account_id = ?';
      params.push(accountId);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (dateFrom) {
      sql += ' AND date >= ?';
      params.push(dateFrom);
    }
    if (dateTo) {
      sql += ' AND date <= ?';
      params.push(dateTo);
    }
    if (keyword) {
      sql += ' AND (note LIKE ? OR category LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw);
    }

    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY date ${order}, created_at ${order}`;

    const rows = db.prepare(sql).all(...params);
    const mapped = rows.map(mapTransaction);
    res.json({ success: true, data: mapped });
  } catch (error) {
    console.error('GET /api/transactions error:', error.message);
    res.status(500).json({ success: false, message: '获取交易记录失败', error: error.message });
  }
});

// GET /api/transactions/:id — 获取单条交易记录
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: '交易记录不存在' });
    }
    res.json({ success: true, data: mapTransaction(row) });
  } catch (error) {
    console.error('GET /api/transactions/:id error:', error.message);
    res.status(500).json({ success: false, message: '获取交易记录失败', error: error.message });
  }
});

// POST /api/transactions — 创建交易记录
router.post('/', (req, res) => {
  try {
    const db = getDatabase();
    const { date, accountId, amount, category, note, isBudgeted, budgetId } = req.body;

    if (!date || !accountId || amount == null || !category) {
      return res.status(400).json({ success: false, message: '缺少必填字段：date, accountId, amount, category' });
    }

    const id = `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO transactions (id, date, account_id, amount, category, note, is_budgeted, budget_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, date, accountId, Number(amount), category,
      note || '', isBudgeted ? 1 : 0, isBudgeted && budgetId ? budgetId : null,
      now, now,
    );

    const created = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: mapTransaction(created) });
  } catch (error) {
    console.error('POST /api/transactions error:', error.message);
    res.status(500).json({ success: false, message: '创建交易记录失败', error: error.message });
  }
});

// PUT /api/transactions/:id — 更新交易记录
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: '交易记录不存在' });
    }

    const { date, accountId, amount, category, note, isBudgeted, budgetId } = req.body;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE transactions
      SET date = ?, account_id = ?, amount = ?, category = ?, note = ?,
          is_budgeted = ?, budget_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      date ?? existing.date,
      accountId ?? existing.account_id,
      amount != null ? Number(amount) : existing.amount,
      category ?? existing.category,
      note ?? existing.note,
      isBudgeted != null ? (isBudgeted ? 1 : 0) : existing.is_budgeted,
      isBudgeted != null ? (isBudgeted && budgetId ? budgetId : null) : existing.budget_id,
      now,
      req.params.id,
    );

    const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: mapTransaction(updated) });
  } catch (error) {
    console.error('PUT /api/transactions/:id error:', error.message);
    res.status(500).json({ success: false, message: '更新交易记录失败', error: error.message });
  }
});

// DELETE /api/transactions/:id — 删除交易记录
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: '交易记录不存在' });
    }

    db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '交易记录已删除' });
  } catch (error) {
    console.error('DELETE /api/transactions/:id error:', error.message);
    res.status(500).json({ success: false, message: '删除交易记录失败', error: error.message });
  }
});

function mapTransaction(row) {
  return {
    id: row.id,
    date: row.date,
    accountId: row.account_id,
    amount: row.amount,
    category: row.category,
    note: row.note || '',
    isBudgeted: row.is_budgeted === 1,
    budgetId: row.budget_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
