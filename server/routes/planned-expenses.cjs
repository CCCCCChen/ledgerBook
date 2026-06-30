const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db.cjs');
const { resolveAccountCashOutDate } = require('../cashflow-utils.cjs');

const VALID_CATEGORIES = ['餐饮', '购物', '交通', '娱乐', '住房', '其他'];

function formatLocalISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getAccountForCashflow(db, accountId) {
  if (!accountId) {
    return null;
  }
  return (
    db
      .prepare('SELECT id, type, billing_day AS billingDay, repayment_day AS repaymentDay FROM accounts WHERE id = ?')
      .get(accountId) || null
  );
}

function mapPlannedExpense(row) {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    plannedDate: row.planned_date,
    cashOutDate: row.cash_out_date || undefined,
    accountId: row.account_id || undefined,
    category: row.category,
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const rows = db
      .prepare('SELECT * FROM planned_expenses ORDER BY COALESCE(cash_out_date, planned_date) ASC, created_at ASC')
      .all();
    res.json({ success: true, data: rows.map(mapPlannedExpense) });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取预估支出列表失败', error: error.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM planned_expenses WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, message: '预估支出不存在' });
    }
    res.json({ success: true, data: mapPlannedExpense(row) });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取预估支出失败', error: error.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDatabase();
    const { name, amount, plannedDate, accountId, category, note } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: '名称不能为空' });
    }
    if (amount == null || isNaN(amount) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: '金额必须为正数' });
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: '分类不合法' });
    }

    const normalizedAccountId = accountId || null;
    const account = getAccountForCashflow(db, normalizedAccountId);
    const nextPlannedDate = plannedDate || formatLocalISODate(new Date());
    const cashOutDate = resolveAccountCashOutDate(nextPlannedDate, account) || null;
    const id = `pex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO planned_expenses (id, name, amount, planned_date, cash_out_date, account_id, category, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(name).trim(),
      Number(amount),
      nextPlannedDate,
      cashOutDate,
      normalizedAccountId,
      category,
      (note || '').trim(),
      now,
      now,
    );

    const created = db.prepare('SELECT * FROM planned_expenses WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: mapPlannedExpense(created) });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建预估支出失败', error: error.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM planned_expenses WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: '预估支出不存在' });
    }

    const { name, amount, plannedDate, accountId, category, note } = req.body;

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ success: false, message: '名称不能为空' });
    }
    if (amount !== undefined && (isNaN(amount) || Number(amount) <= 0)) {
      return res.status(400).json({ success: false, message: '金额必须为正数' });
    }
    if (category !== undefined && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, message: '分类不合法' });
    }

    const nextAccountId = accountId !== undefined ? accountId || null : existing.account_id;
    const nextPlannedDate = plannedDate || existing.planned_date;
    const account = getAccountForCashflow(db, nextAccountId);
    const nextCashOutDate = resolveAccountCashOutDate(nextPlannedDate, account) || null;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE planned_expenses
      SET name = ?, amount = ?, planned_date = ?, cash_out_date = ?, account_id = ?, category = ?, note = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name !== undefined ? String(name).trim() : existing.name,
      amount !== undefined ? Number(amount) : existing.amount,
      nextPlannedDate,
      nextCashOutDate,
      nextAccountId,
      category !== undefined ? category : existing.category,
      note !== undefined ? String(note).trim() : existing.note,
      now,
      req.params.id,
    );

    const updated = db.prepare('SELECT * FROM planned_expenses WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: mapPlannedExpense(updated) });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新预估支出失败', error: error.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM planned_expenses WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: '预估支出不存在' });
    }
    db.prepare('DELETE FROM planned_expenses WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '预估支出已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除预估支出失败', error: error.message });
  }
});

module.exports = router;
