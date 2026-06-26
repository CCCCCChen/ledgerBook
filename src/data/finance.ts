// EXPORTS: MOCK_TRANSACTIONS, MOCK_BUDGETS, MOCK_ACCOUNTS, DEFAULT_CATEGORIES, ACCOUNT_TYPE_LABELS, BUDGET_CYCLE_LABELS

import type { ITransaction, IBudget, IAccount, TransactionCategory, AccountType, BudgetCycleType } from '@/types/finance';

export const DEFAULT_CATEGORIES: TransactionCategory[] = ['餐饮', '购物', '交通', '娱乐', '住房', '其他'];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  alipay_huabei: '支付宝花呗',
  alipay_balance: '支付宝余额',
  wechat_balance: '微信余额',
  credit_card: '信用卡',
  debit_card: '储蓄卡',
};

export const BUDGET_CYCLE_LABELS: Record<BudgetCycleType, string> = {
  once: '临时预算',
  weekly: '每周固定',
  monthly: '每月固定',
  yearly: '每年固定',
};

export const MOCK_ACCOUNTS: IAccount[] = [
  {
    id: 'acc-1',
    name: '支付宝花呗',
    type: 'alipay_huabei',
    billingDay: 10,
    note: '日常消费主力',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'acc-2',
    name: '支付宝余额',
    type: 'alipay_balance',
    note: '零钱收支',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'acc-3',
    name: '微信余额',
    type: 'wechat_balance',
    note: '红包和转账',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'acc-4',
    name: '招商银行信用卡',
    type: 'credit_card',
    billingDay: 17,
    note: '大额消费用',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'acc-5',
    name: '工商银行储蓄卡',
    type: 'debit_card',
    note: '工资卡',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export const MOCK_BUDGETS: IBudget[] = [
  {
    id: 'bud-1',
    name: '奶茶支出',
    amount: 200,
    cycleType: 'weekly',
    startDate: '2026-06-22',
    category: '餐饮',
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
  },
  {
    id: 'bud-2',
    name: '咖啡支出',
    amount: 150,
    cycleType: 'weekly',
    startDate: '2026-06-22',
    category: '餐饮',
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
  },
  {
    id: 'bud-3',
    name: '高达模型支出',
    amount: 3000,
    cycleType: 'yearly',
    startDate: '2026-01-01',
    category: '娱乐',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export const MOCK_TRANSACTIONS: ITransaction[] = [
  {
    id: 'txn-1',
    date: '2026-06-25',
    accountId: 'acc-1',
    amount: -38,
    category: '餐饮',
    note: '一点点奶茶',
    isBudgeted: true,
    budgetId: 'bud-1',
    createdAt: '2026-06-25T12:00:00.000Z',
    updatedAt: '2026-06-25T12:00:00.000Z',
  },
  {
    id: 'txn-2',
    date: '2026-06-24',
    accountId: 'acc-4',
    amount: -450,
    category: '购物',
    note: '优衣库T恤',
    isBudgeted: false,
    createdAt: '2026-06-24T15:30:00.000Z',
    updatedAt: '2026-06-24T15:30:00.000Z',
  },
  {
    id: 'txn-3',
    date: '2026-06-23',
    accountId: 'acc-2',
    amount: -25,
    category: '餐饮',
    note: '瑞幸咖啡',
    isBudgeted: true,
    budgetId: 'bud-2',
    createdAt: '2026-06-23T09:00:00.000Z',
    updatedAt: '2026-06-23T09:00:00.000Z',
  },
  {
    id: 'txn-4',
    date: '2026-06-22',
    accountId: 'acc-5',
    amount: 15000,
    category: '其他',
    note: '6月工资',
    isBudgeted: false,
    createdAt: '2026-06-22T10:00:00.000Z',
    updatedAt: '2026-06-22T10:00:00.000Z',
  },
  {
    id: 'txn-5',
    date: '2026-06-20',
    accountId: 'acc-4',
    amount: -880,
    category: '娱乐',
    note: 'MG 自由高达 2.0',
    isBudgeted: true,
    budgetId: 'bud-3',
    createdAt: '2026-06-20T20:00:00.000Z',
    updatedAt: '2026-06-20T20:00:00.000Z',
  },
];
