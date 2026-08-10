// server/db.js — SQLite 数据库初始化与连接管理
// 创建 accounts / transactions / budgets 三张表，插入默认数据

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { resolveTransactionCashOutDate, resolveAccountCashOutDate } = require('./cashflow-utils.cjs');

let db = null;

function hasColumn(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function ensureColumn(tableName, columnName, definition) {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function migrateBudgetsTableIfNeeded() {
  const ddlRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'budgets'")
    .get();
  const ddl = String(ddlRow?.sql || '');
  const needsRecreate = !ddl.includes("'custom'");

  if (!needsRecreate) {
    ensureColumn('budgets', 'cycle_days', 'INTEGER');
    ensureColumn('budgets', 'tag', "TEXT CHECK(tag IN ('normal','long_term_over','over_budget','under_spent','reasonable'))");
    return;
  }

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE budgets_new (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        amount      REAL NOT NULL CHECK(amount > 0),
        cycle_type  TEXT NOT NULL CHECK(cycle_type IN ('once','weekly','monthly','yearly','custom')),
        start_date  TEXT NOT NULL,
        end_date    TEXT,
        cycle_days  INTEGER,
        category    TEXT,
        tag         TEXT CHECK(tag IN ('normal','long_term_over','over_budget','under_spent','reasonable')),
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO budgets_new (id, name, amount, cycle_type, start_date, end_date, cycle_days, category, tag, created_at, updated_at)
      SELECT id, name, amount, cycle_type, start_date, end_date, NULL, category, NULL, created_at, updated_at
      FROM budgets;
    `);

    const before = db.prepare('SELECT COUNT(*) AS c FROM budgets').get().c;
    const after = db.prepare('SELECT COUNT(*) AS c FROM budgets_new').get().c;
    if (before !== after) {
      throw new Error(`budgets 迁移行数校验失败：原表 ${before} 行，新表 ${after} 行，已自动回滚`);
    }

    db.exec('DROP TABLE budgets; ALTER TABLE budgets_new RENAME TO budgets;');
  });

  try {
    migrate();
  } catch (error) {
    console.error('[db] migrateBudgetsTableIfNeeded 迁移失败，已自动回滚，跳过重建。错误：', error.message);
    try {
      db.exec('DROP TABLE IF EXISTS budgets_new;');
    } catch {
      // ignore
    }
    // 迁移失败不阻塞应用启动，至少保证老数据能读出来
    ensureColumn('budgets', 'cycle_days', 'INTEGER');
    ensureColumn('budgets', 'tag', "TEXT CHECK(tag IN ('normal','long_term_over','over_budget','under_spent','reasonable'))");
  }
}

function migrateTransactionsTable() {
  ensureColumn('transactions', 'transaction_type', "TEXT NOT NULL DEFAULT 'normal'");
  ensureColumn('transactions', 'transfer_account_id', 'TEXT');
  ensureColumn('transactions', 'paired_transaction_id', 'TEXT');
  ensureColumn('transactions', 'installment_plan_id', 'TEXT');
  ensureColumn('transactions', 'installment_index', 'INTEGER');
  ensureColumn('transactions', 'installment_total', 'INTEGER');
  ensureColumn('transactions', 'installment_fee', 'REAL');
  ensureColumn('transactions', 'cash_out_date', 'TEXT');
  ensureColumn('transactions', 'expense_attribute', "TEXT CHECK(expense_attribute IN ('rigid_fixed','flexible_monthly','annual_cycle','one_time_emergency'))");
}

function migrateAccountsTable() {
  ensureColumn('accounts', 'repayment_day', 'INTEGER');
  ensureColumn('accounts', 'total_debt', 'REAL');
  ensureColumn('accounts', 'installment_total_periods', 'INTEGER');
  ensureColumn('accounts', 'installment_remaining_periods', 'INTEGER');
  ensureColumn('accounts', 'installment_monthly_payment', 'REAL');
  ensureColumn('accounts', 'installment_total_interest', 'REAL');
  ensureColumn('accounts', 'monthly_interest', 'REAL');
}

function migratePlannedExpensesTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS planned_expenses (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      amount        REAL NOT NULL CHECK(amount > 0),
      planned_date  TEXT NOT NULL,
      cash_out_date TEXT,
      account_id    TEXT,
      category      TEXT NOT NULL CHECK(category IN ('餐饮','购物','交通','娱乐','住房','其他')),
      note          TEXT DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );
  `);
  ensureColumn('planned_expenses', 'cash_out_date', 'TEXT');
}

function migrateIncomeBudgetsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS income_budgets (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      amount        REAL NOT NULL CHECK(amount > 0),
      cycle_type    TEXT NOT NULL CHECK(cycle_type IN ('once','weekly','monthly','yearly','custom')),
      expected_date TEXT NOT NULL,
      account_id    TEXT,
      cycle_days    INTEGER,
      start_date    TEXT NOT NULL,
      end_date      TEXT,
      note          TEXT DEFAULT '',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );
  `);
}

function backfillTransactionCashOutDates() {
  const accounts = db.prepare('SELECT id, type, billing_day, repayment_day FROM accounts').all();
  const accountMap = new Map(
    accounts.map((account) => [
      account.id,
      {
        id: account.id,
        type: account.type,
        billingDay: account.billing_day || undefined,
        repaymentDay: account.repayment_day || undefined,
      },
    ]),
  );
  const transactions = db.prepare(`
    SELECT id, date, amount, transaction_type AS transactionType, account_id AS accountId, cash_out_date AS cashOutDate
    FROM transactions
  `).all();
  const updateStmt = db.prepare('UPDATE transactions SET cash_out_date = ? WHERE id = ?');
  const tx = db.transaction((rows) => {
    rows.forEach((row) => {
      const account = accountMap.get(row.accountId);
      const nextCashOutDate = resolveTransactionCashOutDate(row, account) || null;
      if (nextCashOutDate !== (row.cashOutDate || null)) {
        updateStmt.run(nextCashOutDate, row.id);
      }
    });
  });
  tx(transactions);
}

function backfillPlannedExpenseCashOutDates() {
  const accounts = db.prepare('SELECT id, type, billing_day, repayment_day FROM accounts').all();
  const accountMap = new Map(
    accounts.map((account) => [
      account.id,
      {
        id: account.id,
        type: account.type,
        billingDay: account.billing_day || undefined,
        repaymentDay: account.repayment_day || undefined,
      },
    ]),
  );
  const plannedExpenses = db.prepare(`
    SELECT id, planned_date AS plannedDate, account_id AS accountId, cash_out_date AS cashOutDate
    FROM planned_expenses
  `).all();
  const updateStmt = db.prepare('UPDATE planned_expenses SET cash_out_date = ? WHERE id = ?');
  const tx = db.transaction((rows) => {
    rows.forEach((row) => {
      const account = accountMap.get(row.accountId);
      const nextCashOutDate = resolveAccountCashOutDate(row.plannedDate, account) || null;
      if (nextCashOutDate !== (row.cashOutDate || null)) {
        updateStmt.run(nextCashOutDate, row.id);
      }
    });
  });
  tx(plannedExpenses);
}

/**
 * 获取数据库文件路径
 * @param {string} userDataPath - Electron app.getPath('userData') 或自定义路径
 */
function getDbPath(userDataPath) {
  const dir = userDataPath || path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'budget.db');
}

/**
 * 初始化数据库：建表 + 插入默认数据（仅首次）
 * @param {string} userDataPath
 */
function initDatabase(dbPathOrDir, allowRecovery = true) {
  // 如果传入的是目录路径，自动拼接 budget.db；否则直接使用完整路径
  const dbPath = dbPathOrDir.endsWith('.db') ? dbPathOrDir : getDbPath(dbPathOrDir);
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  try {
    try {
      db = new Database(dbPath);
    } catch (error) {
      throw error;
    }

    // 启用 WAL 模式提升并发性能
    try {
      db.pragma('journal_mode = WAL');
    } catch {}

    try {
      db.pragma('foreign_keys = ON');
    } catch (error) {
      throw error;
    }

    // ---- 建表 ----
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        type        TEXT NOT NULL CHECK(type IN ('alipay_huabei','alipay_balance','wechat_balance','credit_card','debit_card')),
        billing_day INTEGER,
        repayment_day INTEGER,
        note        TEXT DEFAULT '',
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS budgets (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        amount      REAL NOT NULL CHECK(amount > 0),
        cycle_type  TEXT NOT NULL CHECK(cycle_type IN ('once','weekly','monthly','yearly','custom')),
        start_date  TEXT NOT NULL,
        end_date    TEXT,
        cycle_days  INTEGER,
        category    TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id          TEXT PRIMARY KEY,
        date        TEXT NOT NULL,
        account_id  TEXT NOT NULL,
        amount      REAL NOT NULL,
        category    TEXT NOT NULL CHECK(category IN ('餐饮','购物','交通','娱乐','住房','其他')),
        note        TEXT DEFAULT '',
        is_budgeted INTEGER NOT NULL DEFAULT 0,
        budget_id   TEXT,
        transaction_type TEXT NOT NULL DEFAULT 'normal',
        transfer_account_id TEXT,
        paired_transaction_id TEXT,
        installment_plan_id TEXT,
        installment_index INTEGER,
        installment_total INTEGER,
        installment_fee REAL,
        cash_out_date TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS planned_expenses (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        amount        REAL NOT NULL CHECK(amount > 0),
        planned_date  TEXT NOT NULL,
        cash_out_date TEXT,
        account_id    TEXT,
        category      TEXT NOT NULL CHECK(category IN ('餐饮','购物','交通','娱乐','住房','其他')),
        note          TEXT DEFAULT '',
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
      );
    `);

    // ---- 创建索引 ----（优化查询性能）
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_budget_id ON transactions(budget_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_cash_out_date ON transactions(cash_out_date);
      CREATE INDEX IF NOT EXISTS idx_planned_expenses_account_id ON planned_expenses(account_id);
      CREATE INDEX IF NOT EXISTS idx_planned_expenses_planned_date ON planned_expenses(planned_date);
      CREATE INDEX IF NOT EXISTS idx_transactions_date_account_id ON transactions(date, account_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_amount_cash_out_date ON transactions(amount, cash_out_date);
      CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category);
    `);

    migrateAccountsTable();
    migrateBudgetsTableIfNeeded();
    migrateTransactionsTable();
    migratePlannedExpensesTable();
    migrateIncomeBudgetsTable();
    backfillTransactionCashOutDates();
    backfillPlannedExpenseCashOutDates();

    // ---- 插入默认账户（仅当 accounts 表为空） ----
    const accountCount = db.prepare('SELECT COUNT(*) AS cnt FROM accounts').get();
    if (accountCount.cnt === 0) {
      const insertAccount = db.prepare(`
        INSERT INTO accounts (id, name, type, billing_day, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      const defaultAccounts = [
        ['acc-1', '支付宝花呗',       'alipay_huabei',   10, '日常消费主力'],
        ['acc-2', '支付宝余额',       'alipay_balance',  null, '零钱收支'],
        ['acc-3', '微信余额',         'wechat_balance',  null, '红包和转账'],
        ['acc-4', '招商银行信用卡',   'credit_card',     17, '大额消费用'],
        ['acc-5', '工商银行储蓄卡',   'debit_card',      null, '工资卡'],
      ];

      const insertMany = db.transaction((rows) => {
        for (const row of rows) {
          insertAccount.run(...row);
        }
      });
      insertMany(defaultAccounts);
    }

    // ---- 插入默认预算（仅当 budgets 表为空） ----
    const budgetCount = db.prepare('SELECT COUNT(*) AS cnt FROM budgets').get();
    if (budgetCount.cnt === 0) {
      const insertBudget = db.prepare(`
        INSERT INTO budgets (id, name, amount, cycle_type, start_date, end_date, cycle_days, category, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      const defaultBudgets = [
        ['bud-1', '奶茶支出',     200,  'weekly',  '2026-06-22', null, null, '餐饮'],
        ['bud-2', '咖啡支出',     150,  'weekly',  '2026-06-22', null, null, '餐饮'],
        ['bud-3', '高达模型支出', 3000, 'yearly',  '2026-01-01', null, null, '娱乐'],
      ];

      const insertMany = db.transaction((rows) => {
        for (const row of rows) {
          insertBudget.run(...row);
        }
      });
      insertMany(defaultBudgets);
    }

    // ---- 插入默认交易记录（仅当 transactions 表为空） ----
    const txnCount = db.prepare('SELECT COUNT(*) AS cnt FROM transactions').get();
    if (txnCount.cnt === 0) {
      const insertTxn = db.prepare(`
        INSERT INTO transactions (
          id, date, account_id, amount, category, note, is_budgeted, budget_id,
          transaction_type, transfer_account_id, paired_transaction_id,
          installment_plan_id, installment_index, installment_total, cash_out_date, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      const defaultTxns = [
        ['txn-1', '2026-06-25', 'acc-1', -38,   '餐饮', '一点点奶茶',           1, 'bud-1', 'normal', null, null, null, null, null, null],
        ['txn-2', '2026-06-24', 'acc-4', -450,  '购物', '优衣库T恤',            0, null, 'normal', null, null, null, null, null, null],
        ['txn-3', '2026-06-23', 'acc-2', -25,   '餐饮', '瑞幸咖啡',             1, 'bud-2', 'normal', null, null, null, null, null, null],
        ['txn-4', '2026-06-22', 'acc-5', 15000, '其他', '6月工资',              0, null, 'normal', null, null, null, null, null, null],
        ['txn-5', '2026-06-20', 'acc-4', -880,  '娱乐', 'MG 自由高达 2.0',      1, 'bud-3', 'normal', null, null, null, null, null, null],
      ];

      const insertMany = db.transaction((rows) => {
        for (const row of rows) {
          insertTxn.run(...row);
        }
      });
      insertMany(defaultTxns);
    }

    backfillTransactionCashOutDates();
    backfillPlannedExpenseCashOutDates();

    return db;
  } catch (error) {
    if (db) {
      try {
        db.close();
      } catch {}
      db = null;
    }

    const errorCode = error?.code;
    const errorMsg = String(error?.message || '');

    // ===== 安全机制：只有确认 DB 文件"真的损坏到无法打开"时才 rename =====
    // 之前的误触发场景：
    //  1) WAL/shm 锁文件存在 -> better-sqlite3 临时抛错 -> 实际 DB 完好
    //  2) 两个 Electron 进程同时启动抢锁 -> 第一个正常打开，第二个 SQLITE_BUSY / SQLITE_CANTOPEN
    //  3) 用户目录权限波动 -> 下次启动就好
    // 以上 3 种情况都不应把原 budget.db 改名成 backup。
    const isLikelyConcurrencyOrLockIssue =
      errorCode === 'SQLITE_BUSY' ||
      errorCode === 'SQLITE_LOCKED' ||
      errorMsg.includes('database is locked') ||
      errorMsg.includes('locking protocol') ||
      errorMsg.includes('journal') ||
      errorMsg.includes('WAL') ||
      errorMsg.includes('permission denied') ||
      errorMsg.includes('access is denied') ||
      errorMsg.includes('另一个进程') ||
      errorMsg.includes('被另一进程');

    if (isLikelyConcurrencyOrLockIssue) {
      console.error(
        '[db] 数据库疑似锁/并发问题（code=' + errorCode + '），拒绝自动 rename 原 DB 文件。' +
          '请关闭所有"个人收支预算管家"窗口和托盘后重试，或手动杀死遗留的 Electron 进程。',
      );
      throw error;
    }

    const shouldRecover =
      allowRecovery &&
      fs.existsSync(dbPath) &&
      (errorCode === 'SQLITE_CANTOPEN' ||
        errorCode === 'SQLITE_NOTADB' ||
        errorMsg.includes('unable to open database file') ||
        errorMsg.includes('file is encrypted or is not a database') ||
        errorMsg.includes('malformed database schema') ||
        errorMsg.includes('corrupt'));

    if (!shouldRecover) {
      throw error;
    }

    // 备份时保留 .recovery- 前缀，便于你事后恢复（不自动删，保留所有历史）
    const backupPath = `${dbPath}.recovery-${Date.now()}`;
    console.warn(
      `[db] 检测到数据库文件可能损坏（code=${errorCode}），为避免数据永久丢失，\n` +
        `   将原 DB 文件重命名为：\n     ${backupPath}\n` +
        `   然后新建一个干净的 budget.db（仅含初始 mock 数据）。\n` +
        `   如需找回数据：先关闭应用，再用上面的 .recovery 文件替换 budget.db 重新打开即可。`,
    );
    try {
      fs.renameSync(dbPath, backupPath);
    } catch (renameErr) {
      console.error('[db] rename 备份失败，放弃自动恢复：', renameErr?.message);
      throw error;
    }

    // 连同 WAL/SHM 也一起改名备份（否则 better-sqlite3 打开新的空 db 时会读到旧 WAL 导致"幻影数据"或校验错）
    const extras = [dbPath + '-wal', dbPath + '-shm', dbPath + '-journal'];
    extras.forEach((extra) => {
      if (fs.existsSync(extra)) {
        try {
          fs.renameSync(extra, `${extra}.recovery-${Date.now()}`);
        } catch {
          // ignore
        }
      }
    });

    return initDatabase(dbPath, false);
  }
}

/**
 * 获取当前数据库实例
 */
function getDatabase() {
  if (!db) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return db;
}

function checkpointDatabase() {
  if (!db) return;
  try {
    db.pragma('wal_checkpoint(FULL)');
  } catch {}
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {}
}

/**
 * 关闭数据库连接
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initDatabase, getDatabase, closeDatabase, checkpointDatabase, getDbPath };
