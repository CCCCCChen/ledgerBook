const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db.cjs');

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function addMonths(date, months) {
  const result = new Date(`${date}T00:00:00`);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result.toISOString().slice(0, 10);
}

function buildRepaymentTransactions(payload) {
  const pairId = createId('pair');
  const now = new Date().toISOString();
  const amount = Math.abs(Number(payload.amount));
  const baseNote = payload.note?.trim() || '信用账户还款';

  return [
    {
      id: createId('txn'),
      date: payload.date,
      accountId: payload.accountId,
      amount: -amount,
      category: '其他',
      note: `${baseNote}（扣款）`,
      isBudgeted: false,
      budgetId: null,
      transactionType: 'repayment_out',
      transferAccountId: payload.repaymentTargetAccountId,
      pairedTransactionId: pairId,
      installmentPlanId: null,
      installmentIndex: null,
      installmentTotal: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: createId('txn'),
      date: payload.date,
      accountId: payload.repaymentTargetAccountId,
      amount,
      category: '其他',
      note: `${baseNote}（入账）`,
      isBudgeted: false,
      budgetId: null,
      transactionType: 'repayment_in',
      transferAccountId: payload.accountId,
      pairedTransactionId: pairId,
      installmentPlanId: null,
      installmentIndex: null,
      installmentTotal: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function buildInstallmentTransactions(payload) {
  const installmentCount = Number(payload.installmentCount || 1);
  const now = new Date().toISOString();
  const planId = createId('inst');
  const totalAmount = Math.abs(Number(payload.amount));
  const base = Math.round((totalAmount / installmentCount) * 100) / 100;
  const items = [];
  let allocated = 0;

  for (let index = 0; index < installmentCount; index += 1) {
    const isLast = index === installmentCount - 1;
    const amount = isLast ? Math.round((totalAmount - allocated) * 100) / 100 : base;
    allocated += amount;
    items.push({
      id: createId('txn'),
      date: addMonths(payload.date, index),
      accountId: payload.accountId,
      amount: -amount,
      category: payload.category,
      note: `${payload.note || '分期账单'}（第 ${index + 1}/${installmentCount} 期）`,
      isBudgeted: Boolean(payload.isBudgeted),
      budgetId: payload.isBudgeted && payload.budgetId ? payload.budgetId : null,
      transactionType: 'installment_bill',
      transferAccountId: null,
      pairedTransactionId: null,
      installmentPlanId: planId,
      installmentIndex: index + 1,
      installmentTotal: installmentCount,
      createdAt: now,
      updatedAt: now,
    });
  }

  return items;
}

function buildNormalTransaction(payload) {
  const now = new Date().toISOString();
  return [{
    id: createId('txn'),
    date: payload.date,
    accountId: payload.accountId,
    amount: Number(payload.amount),
    category: payload.category,
    note: payload.note || '',
    isBudgeted: Boolean(payload.isBudgeted),
    budgetId: payload.isBudgeted && payload.budgetId ? payload.budgetId : null,
    transactionType: payload.transactionType || 'normal',
    transferAccountId: payload.transferAccountId || null,
    pairedTransactionId: payload.pairedTransactionId || null,
    installmentPlanId: payload.installmentPlanId || null,
    installmentIndex: payload.installmentIndex || null,
    installmentTotal: payload.installmentTotal || null,
    createdAt: now,
    updatedAt: now,
  }];
}

function insertTransactions(db, items) {
  const stmt = db.prepare(`
    INSERT INTO transactions (
      id, date, account_id, amount, category, note, is_budgeted, budget_id,
      transaction_type, transfer_account_id, paired_transaction_id,
      installment_plan_id, installment_index, installment_total, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows) => {
    rows.forEach((row) => {
      stmt.run(
        row.id,
        row.date,
        row.accountId,
        row.amount,
        row.category,
        row.note,
        row.isBudgeted ? 1 : 0,
        row.budgetId,
        row.transactionType,
        row.transferAccountId,
        row.pairedTransactionId,
        row.installmentPlanId,
        row.installmentIndex,
        row.installmentTotal,
        row.createdAt,
        row.updatedAt,
      );
    });
  });
  insertMany(items);
}

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
    const {
      date,
      accountId,
      amount,
      category,
      note,
      isBudgeted,
      budgetId,
      transactionType = 'normal',
      repaymentTargetAccountId,
      installmentCount,
    } = req.body;

    if (!date || !accountId || amount == null || !category) {
      return res.status(400).json({ success: false, message: '缺少必填字段：date, accountId, amount, category' });
    }
    if (transactionType === 'repayment_out' && !repaymentTargetAccountId) {
      return res.status(400).json({ success: false, message: '还款交易必须指定还款目标账户' });
    }
    if (transactionType === 'installment_bill' && (!installmentCount || Number(installmentCount) < 2)) {
      return res.status(400).json({ success: false, message: '分期至少需要 2 期' });
    }

    let items;
    if (transactionType === 'repayment_out') {
      items = buildRepaymentTransactions({
        date,
        accountId,
        amount,
        note,
        repaymentTargetAccountId,
      });
    } else if (transactionType === 'installment_bill') {
      items = buildInstallmentTransactions({
        date,
        accountId,
        amount,
        category,
        note,
        isBudgeted,
        budgetId,
        installmentCount,
      });
    } else {
      items = buildNormalTransaction({
        date,
        accountId,
        amount,
        category,
        note,
        isBudgeted,
        budgetId,
        transactionType,
      });
    }

    insertTransactions(db, items);

    const createdRows = items.map((item) => db.prepare('SELECT * FROM transactions WHERE id = ?').get(item.id));
    const mapped = createdRows.map(mapTransaction);
    res.status(201).json({ success: true, data: mapped[0], items: mapped });
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
    if (existing.transaction_type !== 'normal') {
      return res.status(400).json({ success: false, message: '分期/还款自动生成记录暂不支持直接编辑，请删除后重新创建' });
    }
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE transactions
      SET date = ?, account_id = ?, amount = ?, category = ?, note = ?,
          is_budgeted = ?, budget_id = ?, transaction_type = ?, updated_at = ?
      WHERE id = ?
    `).run(
      date ?? existing.date,
      accountId ?? existing.account_id,
      amount != null ? Number(amount) : existing.amount,
      category ?? existing.category,
      note ?? existing.note,
      isBudgeted != null ? (isBudgeted ? 1 : 0) : existing.is_budgeted,
      isBudgeted != null ? (isBudgeted && budgetId ? budgetId : null) : existing.budget_id,
      'normal',
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

    if (existing.paired_transaction_id) {
      db.prepare('DELETE FROM transactions WHERE paired_transaction_id = ?').run(existing.paired_transaction_id);
    } else if (existing.installment_plan_id) {
      db.prepare('DELETE FROM transactions WHERE installment_plan_id = ?').run(existing.installment_plan_id);
    } else {
      db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
    }
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
    transactionType: row.transaction_type || 'normal',
    transferAccountId: row.transfer_account_id || undefined,
    pairedTransactionId: row.paired_transaction_id || undefined,
    installmentPlanId: row.installment_plan_id || undefined,
    installmentIndex: row.installment_index || undefined,
    installmentTotal: row.installment_total || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
