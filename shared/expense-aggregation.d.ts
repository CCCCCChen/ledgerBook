export type PlanStatus = 'planned' | 'over_budget' | 'unexpected' | 'unplanned_adjustment';

export interface PlanStatusBreakdown {
  planned: number;
  over_budget: number;
  unexpected: number;
  unplanned_adjustment: number;
}

export interface OverallStats {
  totalExpense: number;
  count: number;
  avg: number;
  max: number;
  planned: number;
  unplanned: number;
  planStatusSummary: PlanStatusBreakdown;
}

export interface CategoryAgg {
  category: string;
  total: number;
  count: number;
  avg: number;
  max: number;
  plannedAmount: number;
  unplannedAmount: number;
  planStatusBreakdown: PlanStatusBreakdown;
}

export interface BudgetExecItem {
  budgetId: number | string;
  category: string;
  budgetAmount: number;
  used: number;
  remaining: number;
  rate: number;
  status: 'normal' | 'warning' | 'over';
}

export interface BudgetProgressItem {
  category: string;
  budgetAmount: number;
  used: number;
  remaining: number;
  rate: number;
  status: 'normal' | 'warning' | 'over';
  budgetCount: number;
}

export interface AggregationResult {
  overall: OverallStats;
  byCategory: CategoryAgg[];
  budgetExecution: BudgetExecItem[];
  budgetProgressByCategory: BudgetProgressItem[];
}

export declare function aggregateExpenses(opts: {
  transactions: any[];
  budgets: any[];
  refDate: Date;
  monthStart: string;
  monthEnd: string;
}): AggregationResult;

export declare function classifyPlanStatus(
  tx: any,
  budgetMap: Map<string, any>,
  totalUsedByBudgetBeforeTx?: Map<string, number>,
): PlanStatus;
