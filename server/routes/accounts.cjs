const express = require('express');
const router = express.Router();
const { getDatabase } = require('../db.cjs');
const { resolveAccountCashOutDate } = require('../cashflow-utils.cjs');

function syncPlannedExpenseCashOutDates(db, accountId) {
  const account = db
    .prepare('SELECT id, type, billing_day AS billingDay, repayment_day AS repaymentDay FROM accounts WHERE id = ?')
    .get(accountId);
  const rows = db
    .prepare('SELECT id, planned_date AS plannedDate FROM planned_expenses WHERE account_id = ?')
    .all(accountId);
  const updateStmt = db.prepare('UPDATE planned_expenses SET cash_out_date = ? WHERE id = ?');
  rows.forEach((row) => {
    updateStmt.run(resolveAccountCashOutDate(row.plannedDate, account) || null, row.id);
  });
}

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

// GET /api/accounts/:id/debt — 账户负债聚合信息
router.get('/:id/debt', (req, res) => {
  try {
    const db = getDatabase();
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, error: '账户不存在' });
    }

    const today = new Date().toISOString().slice(0, 10);
    let totalDebt = 0;
    let installmentMonthlyPayment = 0;
    let installmentTotalPeriods = 0;

    // 1. 分期债务：transaction_type='installment_bill' 且 cash_out_date > today 的未来期数
    const installmentRows = db.prepare(`
      SELECT amount, installment_index, installment_total, installment_fee, cash_out_date, date
      FROM transactions
      WHERE account_id = ? AND transaction_type = 'installment_bill'
    `).all(req.params.id);

    installmentRows.forEach((row) => {
      const cashOutDate = row.cash_out_date || row.date;
      if (cashOutDate > today) {
        // 未来未还债务
        totalDebt += Math.abs(row.amount);
        installmentMonthlyPayment += Math.abs(row.amount); // 每期金额即月供
        if (row.installment_total) {
          installmentTotalPeriods = Math.max(installmentTotalPeriods, row.installment_total - (row.installment_index || 0) + 1);
        }
      }
    });

    // 2. 非分期信用消费：credit_card/credit 类型支出且 cash_out_date > today 的未到期还款
    const creditSpend = db.prepare(`
      SELECT amount, cash_out_date, date
      FROM transactions
      WHERE account_id = ? AND type = 'credit' AND cash_out_date > ?
    `).all(req.params.id, today);

    creditSpend.forEach((row) => {
      totalDebt += Math.abs(row.amount);
    });

    res.json({
      success: true,
      data: {
        accountId: req.params.id,
        totalDebt,
        installmentMonthlyPayment,
        installmentTotalPeriods,
      },
    });
  } catch (err) {
    console.error('[accounts] GET /:id/debt error:', err.message);
    res.status(500).json({ success: false, error: '获取账户负债信息失败' });
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

    syncPlannedExpenseCashOutDates(db, req.params.id);

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
    db.prepare('UPDATE planned_expenses SET account_id = NULL, cash_out_date = NULL WHERE account_id = ?').run(req.params.id);
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
    totalDebt: row.total_debt ?? 0,
    installmentTotalPeriods: row.installment_total_periods ?? 0,
    installmentMonthlyPayment: row.installment_monthly_payment ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = router;
