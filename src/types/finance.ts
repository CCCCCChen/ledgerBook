// EXPORTS: ITransaction, IBudget, IAccount, IPlannedExpense, TransactionCategory, AccountType, BudgetCycleType, TransactionType

export type TransactionCategory = '餐饮' | '购物' | '交通' | '娱乐' | '住房' | '其他';

export type ExpenseAttribute = 'rigid_fixed' | 'flexible_monthly' | 'annual_cycle' | 'one_time_emergency';
export const EXPENSE_ATTRIBUTE_LABELS = {
  rigid_fixed: '刚性固定支出',
  flexible_monthly: '弹性月度支出',
  annual_cycle: '年度周期支出',
  one_time_emergency: '一次性突发支出',
} as const;

export type AccountType =
  | 'alipay_huabei'
  | 'alipay_balance'
  | 'wechat_balance'
  | 'credit_card'
  | 'debit_card';

export type BudgetCycleType = 'once' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export type TransactionType = 'normal' | 'repayment_out' | 'repayment_in' | 'installment_bill' | 'income';

export type BudgetTag = 'normal' | 'long_term_over' | 'over_budget' | 'under_spent' | 'reasonable';

export interface ITransaction {
  id: string;
  date: string;
  cashOutDate?: string;
  accountId: string;
  amount: number;
  category: TransactionCategory;
  expenseAttribute?: ExpenseAttribute; // 支出属性：刚性/弹性/年度/突发
  note: string;
  isBudgeted: boolean;
  budgetId?: string;
  transactionType?: TransactionType;
  transferAccountId?: string;
  pairedTransactionId?: string;
  installmentPlanId?: string;
  installmentIndex?: number;
  installmentTotal?: number;
  installmentFee?: number;
  createdAt: string;
  updatedAt: string;
}

export interface IBudget {
  id: string;
  name: string;
  amount: number;
  cycleType: BudgetCycleType;
  startDate: string;
  endDate?: string;
  cycleDays?: number;
  category?: TransactionCategory;
  tag?: BudgetTag; // 预算标签：长期超支/预算过剩等
  createdAt: string;
  updatedAt: string;
}

export interface IAccount {
  id: string;
  name: string;
  type: AccountType;
  billingDay?: number;
  repaymentDay?: number;
  note: string;
  totalDebt?: number; // 当前总欠款金额（仅信用账户）
  installmentTotalPeriods?: number; // 分期总期数
  installmentRemainingPeriods?: number; // 剩余分期期数
  installmentMonthlyPayment?: number; // 每月分期月供
  installmentTotalInterest?: number; // 分期总利息
  monthlyInterest?: number; // 每月利息支出
  createdAt: string;
  updatedAt: string;
}

export interface IPlannedExpense {
  id: string;
  name: string;
  amount: number;
  plannedDate: string;
  cashOutDate?: string;
  accountId?: string;
  category: TransactionCategory;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface IIncomeBudget {
  id: string;
  name: string;
  amount: number;
  cycleType: BudgetCycleType;
  expectedDate: string;
  accountId?: string;
  cycleDays?: number;
  startDate: string;
  endDate?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface IIncomeBudgetProjection extends IIncomeBudget {
  projectionDate: string;
  isOneTime: boolean;
}
