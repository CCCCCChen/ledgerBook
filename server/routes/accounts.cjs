const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db.cjs');

// GET /api/accounts — 获取所有账户
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const accounts = db.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all();
    const mapped = accounts.map(mapAccount);
    res.json({ success: true, data: mapped });
  } catch (err) {
    console.error('[accounts] GET / error:', err.message);
    res.status(500).json({ success: false, error: '获取账户列表失败' });
  }
});

// GET /api/accounts/:id — 获取单个账户
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }
    res.json({ success: true, data: mapAccount(row) });
  } catch (err) {
    console.error('[accounts] GET /:id error:', err.message);
    res.status(500).json({ success: false, error: '获取账户详情失败' });
  }
});

// POST /api/accounts — 创建账户
router.post('/', (req, res) => {
  try {
    const db = getDatabase();
    const { name, type, billingDay, repaymentDay, note } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: '账户名称不能为空' });
    }
    if (!type) {
      return res.status(400).json({ success: false, error: '账户类型不能为空' });
    }

    const validTypes = ['alipay_huabei', 'alipay_balance', 'wechat_balance', 'credit_card', 'debit_card'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: '无效的账户类型' });
    }

    const needsBilling = type === 'alipay_huabei' || type === 'credit_card';
    const billingDayNum = billingDay != null ? Number(billingDay) : null;
    if (needsBilling && (billingDayNum == null || billingDayNum < 1 || billingDayNum > 28)) {
      return res.status(400).json({ success: false, error: '账单日必须在 1-28 之间' });
    }
    const repaymentDayNum = repaymentDay != null ? Number(repaymentDay) : null;
    if (needsBilling && repaymentDay != null && (repaymentDayNum == null || repaymentDayNum < 1 || repaymentDayNum > 28)) {
      return res.status(400).json({ success: false, error: '还款日必须在 1-28 之间' });
    }

    const id = `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO accounts (id, name, type, billing_day, repayment_day, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name.trim(),
      type,
      needsBilling ? billingDayNum : null,
      needsBilling ? repaymentDayNum : null,
      (note || '').trim(),
      now,
      now,
    );

    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    res.status(201).json({ success: true, data: mapAccount(row) });
  } catch (err) {
    console.error('[accounts] POST error:', err.message);
    res.status(500).json({ success: false, error: '创建账户失败' });
  }
});

// PUT /api/accounts/:id — 更新账户
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }

    const { name, type, billingDay, repaymentDay, note } = req.body;
    const newName = name != null ? name.trim() : existing.name;
    const newType = type != null ? type : existing.type;
    const newNote = note != null ? note.trim() : existing.note;

    if (!newName) {
      return res.status(400).json({ success: false, error: '账户名称不能为空' });
    }

    const validTypes = ['alipay_huabei', 'alipay_balance', 'wechat_balance', 'credit_card', 'debit_card'];
    if (!validTypes.includes(newType)) {
      return res.status(400).json({ success: false, error: '无效的账户类型' });
    }

    const needsBilling = newType === 'alipay_huabei' || newType === 'credit_card';
    let newBillingDay = null;
    if (billingDay != null) {
      newBillingDay = Number(billingDay);
    } else if (needsBilling) {
      newBillingDay = existing.billing_day;
    }

    if (needsBilling && (newBillingDay == null || newBillingDay < 1 || newBillingDay > 28)) {
      return res.status(400).json({ success: false, error: '账单日必须在 1-28 之间' });
    }

    let newRepaymentDay = null;
    if (repaymentDay != null) {
      newRepaymentDay = Number(repaymentDay);
    } else if (needsBilling) {
      newRepaymentDay = existing.repayment_day;
    }
    if (needsBilling && newRepaymentDay != null && (newRepaymentDay < 1 || newRepaymentDay > 28)) {
      return res.status(400).json({ success: false, error: '还款日必须在 1-28 之间' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE accounts SET name = ?, type = ?, billing_day = ?, repayment_day = ?, note = ?, updated_at = ?
      WHERE id = ?
    `).run(newName, newType, needsBilling ? newBillingDay : null, needsBilling ? newRepaymentDay : null, newNote, now, req.params.id);

    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: mapAccount(row) });
  } catch (err) {
    console.error('[accounts] PUT error:', err.message);
    res.status(500).json({ success: false, error: '更新账户失败' });
  }
});

// DELETE /api/accounts/:id — 删除账户
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }

    db.prepare('UPDATE transactions SET account_id = NULL WHERE account_id = ?').run(req.params.id);
    db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);

    res.json({ success: true, message: '账户已删除' });
  } catch (err) {
    console.error('[accounts] DELETE error:', err.message);
    res.status(500).json({ success: false, error: '删除账户失败' });
  }
});

function mapAccount(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    billingDay: row.billing_day,
    repaymentDay: row.repayment_day,
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
