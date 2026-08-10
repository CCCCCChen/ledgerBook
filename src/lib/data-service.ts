// ============================================================
// data-service.ts —— 统一导出入口（向后兼容）
// 各领域函数已拆分到 src/lib/services/ 下，此处做 re-export。
// ============================================================

export {
  loadAccounts,
  saveAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getDefaultAccounts,
} from './services/accountService';

export {
  loadTransactions,
  saveTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from './services/transactionService';

export {
  loadBudgets,
  saveBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
} from './services/budgetService';

export {
  loadPlannedExpenses,
  createPlannedExpense,
  updatePlannedExpense,
  deletePlannedExpense,
  forecastApi,
} from './services/forecastService';

export {
  loadIncomeBudgets,
  saveIncomeBudgets,
  createIncomeBudget,
  updateIncomeBudget,
  deleteIncomeBudget,
} from './services/incomeBudgetService';

// 统计（仅 Electron 模式走 API）—— 保持原样 re-export
export { statisticsApi } from '@/api/index';
