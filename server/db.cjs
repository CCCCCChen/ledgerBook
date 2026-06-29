// server/db.js — SQLite 数据库初始化与连接管理
// 创建 accounts / transactions / budgets 三张表，插入默认数据

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

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
    return;
  }

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
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO budgets_new (id, name, amount, cycle_type, start_date, end_date, cycle_days, category, created_at, updated_at)
    SELECT id, name, amount, cycle_type, start_date, end_date, NULL, category, created_at, updated_at
    FROM budgets;

    DROP TABLE budgets;
    ALTER TABLE budgets_new RENAME TO budgets;
  `);
}

function migrateTransactionsTable() {
  ensureColumn('transactions', 'transaction_type', "TEXT NOT NULL DEFAULT 'normal'");
  ensureColumn('transactions', 'transfer_account_id', 'TEXT');
  ensureColumn('transactions', 'paired_transaction_id', 'TEXT');
  ensureColumn('transactions', 'installment_plan_id', 'TEXT');
  ensureColumn('transactions', 'installment_index', 'INTEGER');
  ensureColumn('transactions', 'installment_total', 'INTEGER');
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
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE SET NULL
      );
    `);

    migrateBudgetsTableIfNeeded();
    migrateTransactionsTable();

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
          installment_plan_id, installment_index, installment_total, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      const defaultTxns = [
        ['txn-1', '2026-06-25', 'acc-1', -38,   '餐饮', '一点点奶茶',           1, 'bud-1', 'normal', null, null, null, null, null],
        ['txn-2', '2026-06-24', 'acc-4', -450,  '购物', '优衣库T恤',            0, null, 'normal', null, null, null, null, null],
        ['txn-3', '2026-06-23', 'acc-2', -25,   '餐饮', '瑞幸咖啡',             1, 'bud-2', 'normal', null, null, null, null, null],
        ['txn-4', '2026-06-22', 'acc-5', 15000, '其他', '6月工资',              0, null, 'normal', null, null, null, null, null],
        ['txn-5', '2026-06-20', 'acc-4', -880,  '娱乐', 'MG 自由高达 2.0',      1, 'bud-3', 'normal', null, null, null, null, null],
      ];

      const insertMany = db.transaction((rows) => {
        for (const row of rows) {
          insertTxn.run(...row);
        }
      });
      insertMany(defaultTxns);
    }

    return db;
  } catch (error) {
    if (db) {
      try {
        db.close();
      } catch {}
      db = null;
    }

    const shouldRecover =
      allowRecovery &&
      fs.existsSync(dbPath) &&
      (error?.code === 'SQLITE_CANTOPEN' || String(error?.message || '').includes('unable to open database file'));

    if (!shouldRecover) {
      throw error;
    }

    const backupPath = `${dbPath}.recovery-${Date.now()}`;
    fs.renameSync(dbPath, backupPath);

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

/**
 * 关闭数据库连接
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initDatabase, getDatabase, closeDatabase, getDbPath };
