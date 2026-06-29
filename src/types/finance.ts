// EXPORTS: ITransaction, IBudget, IAccount, TransactionCategory, AccountType, BudgetCycleType, TransactionType

export type TransactionCategory = '餐饮' | '购物' | '交通' | '娱乐' | '住房' | '其他';

export type AccountType =
  | 'alipay_huabei'
  | 'alipay_balance'
  | 'wechat_balance'
  | 'credit_card'
  | 'debit_card';

export type BudgetCycleType = 'once' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export type TransactionType = 'normal' | 'repayment_out' | 'repayment_in' | 'installment_bill';

export interface ITransaction {
  id: string;
  date: string;
  accountId: string;
  amount: number;
  category: TransactionCategory;
  note: string;
  isBudgeted: boolean;
  budgetId?: string;
  transactionType?: TransactionType;
  transferAccountId?: string;
  pairedTransactionId?: string;
  installmentPlanId?: string;
  installmentIndex?: number;
  installmentTotal?: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface IAccount {
  id: string;
  name: string;
  type: AccountType;
  billingDay?: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}
