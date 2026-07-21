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
  | 'debit_card'
  | 'debit'
  | 'huabei';

export type BudgetCycleType = 'once' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export type TransactionType =
  | 'normal'
  | 'repayment_out'
  | 'repayment_in'
  | 'installment_bill'
  | 'income'
  | 'transfer';

export type BudgetTag = 'normal' | 'long_term_over' | 'over_budget' | 'under_spent' | 'reasonable';

export interface ITransaction {
  id: string;
  date: string;
  cashOutDate?: string;
  accountId: string;
  amount: number;
  category: TransactionCategory;
  expenseAttribute?: ExpenseAttribute;
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
  installmentCount?: number;
  feeTotal?: number;
  repaymentTargetAccountId?: string;
  isExpense?: boolean;
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
  tag?: BudgetTag;
  createdAt: string;
  updatedAt: string;
}

export interface IAccount {
  id: string;
  name: string;
  type: AccountType;
  balance?: number;
  creditLimit?: number;
  billingDay?: number;
  repaymentDay?: number;
  cashOutDelayDays?: number;
  note: string;
  totalDebt?: number;
  installmentTotalPeriods?: number;
  installmentRemainingPeriods?: number;
  installmentMonthlyPayment?: number;
  installmentTotalInterest?: number;
  monthlyInterest?: number;
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
