// src/api/index.ts — 业务 API 封装
// 提供与原有 storage 模块兼容的接口，底层调用后端 RESTful API

import { api } from './client';
import type { ITransaction, IBudget, IAccount, IPlannedExpense, IIncomeBudget, IIncomeBudgetProjection } from '@/types/finance';

export interface CreateTransactionInput extends Partial<ITransaction> {
  repaymentTargetAccountId?: string;
  installmentCount?: number;
  feeTotal?: number;
}

export interface UpdateTransactionInput extends Partial<ITransaction> {
  editScope?: 'single' | 'plan';
  feeTotal?: number;
}

export interface CreatePlannedExpenseInput extends Partial<IPlannedExpense> {}

export interface UpdatePlannedExpenseInput extends Partial<IPlannedExpense> {}

export interface AccountDebtInfo {
  accountId: string;
  totalDebt: number;
  installmentMonthlyPayment: number;
  installmentTotalPeriods: number;
}

// ============================================================
// 账户 API
// ============================================================
export const accountsApi = {
  list: () => api.get<{ success: boolean; data: IAccount[] }>('/api/accounts'),
  get: (id: string) => api.get<{ success: boolean; data: IAccount }>(`/api/accounts/${id}`),
  debt: (id: string) => api.get<{ success: boolean; data: AccountDebtInfo }>(`/api/accounts/${id}/debt`),
  create: (data: Partial<IAccount>) => api.post<{ success: boolean; data: IAccount }>('/api/accounts', data),
  update: (id: string, data: Partial<IAccount>) => api.put<{ success: boolean; data: IAccount }>(`/api/accounts/${id}`, data),
  remove: (id: string) => api.delete<{ success: boolean }>(`/api/accounts/${id}`),
};

// ============================================================
// 交易记录 API
// ============================================================
export interface TransactionFilters {
  accountId?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface TransactionListResponse {
  success: boolean;
  data: ITransaction[];
  total: number;
  page: number;
  limit: number;
}

export const transactionsApi = {
  list: (filters?: TransactionFilters) => {
    const params = new URLSearchParams();
    if (filters?.accountId && filters.accountId !== 'all') params.set('accountId', filters.accountId);
    if (filters?.category && filters.category !== 'all') params.set('category', filters.category);
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    if (filters?.keyword) params.set('keyword', filters.keyword);
    if (filters?.sortOrder) params.set('sortOrder', filters.sortOrder);
    if (filters?.page != null) params.set('page', String(filters.page));
    if (filters?.limit != null) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return api.get<TransactionListResponse>(`/api/transactions${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => api.get<{ success: boolean; data: ITransaction }>(`/api/transactions/${id}`),
  create: (data: CreateTransactionInput) => api.post<{ success: boolean; data: ITransaction; items?: ITransaction[] }>('/api/transactions', data),
  update: (id: string, data: UpdateTransactionInput) => api.put<{ success: boolean; data: ITransaction }>(`/api/transactions/${id}`, data),
  remove: (id: string, scope?: 'single' | 'plan') =>
    api.delete<{ success: boolean }>(`/api/transactions/${id}${scope ? `?scope=${scope}` : ''}`),
};

// ============================================================
// 预算 API
// ============================================================
export interface BudgetWithStats extends IBudget {
  used: number;
  rate: number;
  remaining: number;
  denominator?: number;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  spendingStart?: string;
  spendingEnd?: string;
}

export interface BudgetListParams {
  refDate?: string;
  spendingStart?: string;
  spendingEnd?: string;
}

export const budgetsApi = {
  list: (params?: BudgetListParams) =>
    api.get<{ success: boolean; data: BudgetWithStats[] }>('/api/budgets', { params }),
  get: (id: string) => api.get<{ success: boolean; data: BudgetWithStats }>(`/api/budgets/${id}`),
  create: (data: Partial<IBudget>) => api.post<{ success: boolean; data: BudgetWithStats }>('/api/budgets', data),
  update: (id: string, data: Partial<IBudget>) => api.put<{ success: boolean; data: BudgetWithStats }>(`/api/budgets/${id}`, data),
  remove: (id: string) => api.delete<{ success: boolean }>(`/api/budgets/${id}`),
};

// ============================================================
// 预估支出 API
// ============================================================
export const plannedExpensesApi = {
  list: () => api.get<{ success: boolean; data: IPlannedExpense[] }>('/api/planned-expenses'),
  get: (id: string) => api.get<{ success: boolean; data: IPlannedExpense }>(`/api/planned-expenses/${id}`),
  create: (data: CreatePlannedExpenseInput) =>
    api.post<{ success: boolean; data: IPlannedExpense }>('/api/planned-expenses', data),
  update: (id: string, data: UpdatePlannedExpenseInput) =>
    api.put<{ success: boolean; data: IPlannedExpense }>(`/api/planned-expenses/${id}`, data),
  remove: (id: string) => api.delete<{ success: boolean }>(`/api/planned-expenses/${id}`),
};

// ============================================================
// Forecast API
// ============================================================
export interface ForecastImpactInput {
  rangeFrom: string;
  rangeTo: string;
  startBalance: number;
  includePlannedExpenses?: boolean;
  includeBudgetSettlement?: boolean;
  simulatedExpense?: {
    date: string;
    amount: number;
    accountId?: string;
  };
}

export const forecastApi = {
  impact: (data: ForecastImpactInput) =>
    api.post<{
      success: boolean;
      data: {
        baseline: { minBalance: number; minDate: string; endBalance: number };
        withExpense: { minBalance: number; minDate: string; endBalance: number };
        delta: { minBalance: number; endBalance: number };
      };
    }>('/api/forecast/impact', data),
};

// ============================================================
// 统计 API
// ============================================================
export const statisticsApi = {
  overview: () => api.get<{
    totalIncome: number;
    totalExpense: number;
    transactionCount: number;
    budgetCount: number;
    balance: number;
  }>('/api/statistics/overview'),

  billingCycle: () => api.get<Array<{
    accountId: string;
    accountName: string;
    accountType: string;
    billingDay: number;
    cycleStart: string;
    cycleEnd: string;
    totalExpense: number;
  }>>('/api/statistics/billing-cycle'),

  budgetExecution: () => api.get<Array<{
    budgetId: string;
    budgetName: string;
    budgetAmount: number;
    cycleType: string;
    category: string | null;
    used: number;
    remaining: number;
    rate: number;
    isOverBudget: boolean;
    isWarning: boolean;
  }>>('/api/statistics/budget-execution'),

  categoryDistribution: () => api.get<{
    items: Array<{ category: string; total: number; percentage: number }>;
    grandTotal: number;
  }>('/api/statistics/category-distribution'),

  trend: (granularity: 'daily' | 'weekly' | 'monthly' = 'daily') =>
    api.get<{ granularity: string; items: Array<{ date: string; amount: number }> }>(
      `/api/statistics/trend?granularity=${granularity}`,
    ),

  accountComparison: () => api.get<Array<{
    accountId: string;
    accountName: string;
    accountType: string;
    totalExpense: number;
  }>>('/api/statistics/account-comparison'),

  overBudgetAlerts: () => api.get<Array<{
    budgetId: string;
    budgetName: string;
    budgetAmount: number;
    used: number;
    rate: number;
    severity: 'over' | 'warning' | 'normal';
  }>>('/api/statistics/over-budget-alerts'),
};

// ============================================================
// 收入预算 API
// ============================================================
export const incomeBudgetsApi = {
  list: () => api.get<IIncomeBudget[]>('/api/income-budgets'),
  create: (data: Partial<IIncomeBudget>) => api.post<IIncomeBudget>('/api/income-budgets', data),
  update: (id: string, data: Partial<IIncomeBudget>) => api.put<IIncomeBudget>(`/api/income-budgets/${id}`, data),
  remove: (id: string) => api.delete<{ success: boolean }>(`/api/income-budgets/${id}`),
  projection: (startDate: string, endDate: string) =>
    api.get<IIncomeBudgetProjection[]>(`/api/income-budgets/projection?startDate=${startDate}&endDate=${endDate}`),
};
