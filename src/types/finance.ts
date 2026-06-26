// EXPORTS: ITransaction, IBudget, IAccount, TransactionCategory, AccountType, BudgetCycleType

export type TransactionCategory = '餐饮' | '购物' | '交通' | '娱乐' | '住房' | '其他';

export type AccountType =
  | 'alipay_huabei'
  | 'alipay_balance'
  | 'wechat_balance'
  | 'credit_card'
  | 'debit_card';

export type BudgetCycleType = 'once' | 'weekly' | 'monthly' | 'yearly';

export interface ITransaction {
  id: string;
  date: string;
  accountId: string;
  amount: number;
  category: TransactionCategory;
  note: string;
  isBudgeted: boolean;
  budgetId?: string;
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
