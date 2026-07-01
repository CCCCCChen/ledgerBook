import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertTriangle, TrendingUp, Wallet, CreditCard, PieChart, BarChart3 } from 'lucide-react';
import { CHART_COLORS } from '@/lib/chart-colors';
import { DEFAULT_CATEGORIES, EXPENSE_ATTRIBUTE_LABELS } from '@/data/finance';
import type { ITransaction, IAccount, ExpenseAttribute } from '@/types/finance';
import { loadAccounts, loadBudgets, loadTransactions } from '@/lib/data-service';
import { listBudgetSettlementsForRange } from '@/lib/finance-utils';
import { formatLocalISODate, formatLocalISOYearMonth } from '@/lib/date';
import type { BudgetWithStats } from '@/api';
import { getEffectiveTransactionDate } from '@/lib/cashflow';

type TimeGranularity = 'daily' | 'weekly' | 'monthly';
type TimelineMode = 'expense' | 'cashflow';
type WeeklyBudgetNormalizeMode = 'weeks4' | 'days';
type StatsPeriod = 'week' | 'month' | 'quarter' | 'year';
const PERIOD_LABELS = {
  week: '本周',
  month: '本月',
  quarter: '近3月',
  year: '全年',
} as const;

interface FutureExpenseItem {
  id: string;
  type: 'installment' | 'future' | 'budget';
  title: string;
  date: string;
  amount: number;
  accountId: string;
  originalDate?: string;
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return formatLocalISODate(d);
}

function getMonthKey(date: Date): string {
  return formatLocalISOYearMonth(date);
}

function parseISODate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function diffDaysInclusive(fromISO: string, toISO: string): number {
  const from = parseISODate(fromISO);
  const to = parseISODate(toISO);
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / 86400000) + 1;
}

function getMonthBounds(dateISO: string): { monthStart: string; monthEnd: string; daysInMonth: number } {
  const d = parseISODate(dateISO);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    monthStart: formatLocalISODate(start),
    monthEnd: formatLocalISODate(end),
    daysInMonth: end.getDate(),
  };
}

function isFullNaturalMonthRange(rangeFrom: string, rangeTo: string): boolean {
  const fromBounds = getMonthBounds(rangeFrom);
  const toBounds = getMonthBounds(rangeTo);
  return (
    fromBounds.monthStart === rangeFrom &&
    fromBounds.monthEnd === rangeTo &&
    fromBounds.monthStart === toBounds.monthStart
  );
}

function getBillingCycleRange(billingDay: number, refDate: Date): { start: string; end: string } {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const start = new Date(y, m, billingDay);
  if (refDate < start) {
    start.setMonth(m - 1);
  }
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() - 1);
  return {
    start: formatLocalISODate(start),
    end: formatLocalISODate(end),
  };
}

function inferExpenseAttribute(transaction: Pick<ITransaction, 'category' | 'amount' | 'note' | 'expenseAttribute'>): ExpenseAttribute {
  if (transaction.expenseAttribute) {
    return transaction.expenseAttribute;
  }
  const note = transaction.note || '';
  const amountAbs = Math.abs(transaction.amount);
  if (/年费|年度|会员|续费|保险|订阅|学费|体检/i.test(note)) {
    return 'annual_cycle';
  }
  if (transaction.category === '住房' || transaction.category === '交通') {
    return 'rigid_fixed';
  }
  if (amountAbs >= 1000 && (transaction.category === '购物' || transaction.category === '娱乐')) {
    return 'one_time_emergency';
  }
  return 'flexible_monthly';
}

function getPaymentChannelLabel(transaction: Pick<ITransaction, 'transactionType' | 'accountId'>, account?: IAccount): string {
  if (transaction.transactionType === 'installment_bill') {
    return '分期';
  }
  if (!account) {
    return '现金/其他';
  }
  if (account.type === 'credit_card') {
    return '信用卡';
  }
  if (account.type === 'alipay_huabei') {
    return '花呗';
  }
  return '银行卡';
}

function getRecentMonthKeys(referenceISO: string, count: number): string[] {
  const ref = parseISODate(referenceISO);
  return Array.from({ length: count }, (_, index) => {
    const d = new Date(ref.getFullYear(), ref.getMonth() - (count - 1 - index), 1);
    return formatLocalISOYearMonth(d);
  });
}

function calcMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calcStd(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = calcMean(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function calcGini(values: number[]): number {
  const filtered = values.filter((value) => value > 0);
  if (filtered.length === 0) return 0;
  const mean = calcMean(filtered);
  if (mean === 0) return 0;
  let diffSum = 0;
  filtered.forEach((a) => {
    filtered.forEach((b) => {
      diffSum += Math.abs(a - b);
    });
  });
  return diffSum / (2 * filtered.length * filtered.length * mean);
}

interface AnomalyItem {
  id: string;
  type: 'daily_large' | 'flexible_monthly' | 'impulse';
  title: string;
  description: string;
  severity: 'high' | 'medium';
  amount?: number;
}

interface ForecastBand {
  label: string;
  monthKey: string;
  optimistic: number;
  baseline: number;
  conservative: number;
}

function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return `${year}-${month}`;
}

function shiftMonthKey(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return formatLocalISOYearMonth(date);
}

function buildMonthlySeries(
  transactions: ITransaction[],
  timelineMode: TimelineMode,
  predicate: (transaction: ITransaction) => boolean,
  monthKeys: string[],
): number[] {
  return monthKeys.map((monthKey) =>
    transactions
      .filter(predicate)
      .map((transaction) => ({
        ...transaction,
        effectiveDate: getEffectiveTransactionDate(transaction, timelineMode),
      }))
      .filter((transaction) => formatLocalISOYearMonth(parseISODate(transaction.effectiveDate)) === monthKey)
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
  );
}

function fitHolt(values: number[], steps: number): number[] {
  if (values.length === 0) return Array.from({ length: steps }, () => 0);
  if (values.length === 1) return Array.from({ length: steps }, () => values[0]);
  const alpha = 0.55;
  const beta = 0.25;
  let level = values[0];
  let trend = values[1] - values[0];
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i];
    const prevLevel = level;
    level = alpha * value + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return Array.from({ length: steps }, (_, index) => Math.max(0, level + (index + 1) * trend));
}

function fitHoltWinters(values: number[], steps: number, seasonLength = 3): number[] {
  if (values.length < seasonLength * 2) {
    return fitHolt(values, steps);
  }
  const alpha = 0.45;
  const beta = 0.2;
  const gamma = 0.25;
  let level = calcMean(values.slice(0, seasonLength));
  let trend = (calcMean(values.slice(seasonLength, seasonLength * 2)) - calcMean(values.slice(0, seasonLength))) / seasonLength;
  const seasonals = Array.from({ length: seasonLength }, (_, idx) => values[idx] - level);
  for (let i = 0; i < values.length; i += 1) {
    const seasonalIndex = i % seasonLength;
    const value = values[i];
    const prevLevel = level;
    const seasonal = seasonals[seasonalIndex];
    level = alpha * (value - seasonal) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonals[seasonalIndex] = gamma * (value - level) + (1 - gamma) * seasonal;
  }
  return Array.from({ length: steps }, (_, index) => {
    const seasonal = seasonals[(values.length + index) % seasonLength] || 0;
    return Math.max(0, level + (index + 1) * trend + seasonal);
  });
}

function buildForecastBands(values: number[], nextMonthKeys: string[]): ForecastBand[] {
  const baselineValues = values.length >= 6 ? fitHoltWinters(values, nextMonthKeys.length) : fitHolt(values, nextMonthKeys.length);
  const std = calcStd(values);
  const band = Math.max(std * 0.8, calcMean(values) * 0.12, 20);
  return nextMonthKeys.map((monthKey, index) => ({
    label: getMonthLabel(monthKey),
    monthKey,
    optimistic: Math.max(0, baselineValues[index] * 0.92),
    baseline: Math.max(0, baselineValues[index]),
    conservative: Math.max(0, baselineValues[index] + band),
  }));
}

export default function StatisticsPage() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithStats[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [timeGranularity, setTimeGranularity] = useState<TimeGranularity>('daily');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('expense');
  const [includeBudgetSettlement, setIncludeBudgetSettlement] = useState(true);
  const [weeklyBudgetNormalizeMode, setWeeklyBudgetNormalizeMode] = useState<WeeklyBudgetNormalizeMode>('weeks4');
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>('month');
  const today = new Date();
  const todayISO = formatLocalISODate(today);
  const monthStartISO = formatLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEndISO = formatLocalISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  // 周期自动计算
  const [rangeFrom, setRangeFrom] = useState(monthStartISO);
  const [rangeTo, setRangeTo] = useState(monthEndISO);

  useEffect(() => {
    const now = new Date();
    let start, end;
    switch (selectedPeriod) {
      case 'week':
        start = parseISODate(getWeekStart(now));
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'quarter':
        start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
    }
    setRangeFrom(formatLocalISODate(start));
    setRangeTo(formatLocalISODate(end));
  }, [selectedPeriod]);

  useEffect(() => {
    if (rangeFrom && rangeTo && rangeFrom > rangeTo) {
      setRangeTo(rangeFrom);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    (async () => {
      const [txns, bdgs, accts] = await Promise.all([
        loadTransactions(),
        loadBudgets(),
        loadAccounts(),
      ]);
      setTransactions(txns);
      setBudgets(bdgs);
      setAccounts(accts);
    })().catch(() => {});
  }, []);

  const filteredTransactions = useMemo(
    () =>
      transactions
        .map((transaction) => ({
          ...transaction,
          effectiveDate: getEffectiveTransactionDate(transaction, timelineMode),
        }))
        .filter((transaction) => transaction.effectiveDate >= rangeFrom && transaction.effectiveDate <= rangeTo),
    [transactions, rangeFrom, rangeTo, timelineMode],
  );

  const actualCutoff = useMemo(() => (todayISO < rangeTo ? todayISO : rangeTo), [todayISO, rangeTo]);

  const actualTransactions = useMemo(
    () => filteredTransactions.filter((transaction) => transaction.effectiveDate <= actualCutoff),
    [filteredTransactions, actualCutoff],
  );

  const actualExpenses = useMemo(
    () => actualTransactions.filter((t) => t.amount < 0).map((t) => ({ ...t, amount: Math.abs(t.amount) })),
    [actualTransactions],
  );

  const futureFrom = useMemo(() => (todayISO > rangeFrom ? todayISO : rangeFrom), [todayISO, rangeFrom]);
  const futureExpenseTransactions = useMemo(() => {
    if (rangeTo < futureFrom) return [];
    return filteredTransactions
      .filter((transaction) => transaction.amount < 0 && transaction.effectiveDate > actualCutoff && transaction.effectiveDate >= futureFrom)
      .map((transaction) => ({ ...transaction, amount: Math.abs(transaction.amount) }));
  }, [filteredTransactions, actualCutoff, futureFrom, rangeTo]);

  const budgetSettlementItems = useMemo(
    () =>
      listBudgetSettlementsForRange(budgets, transactions, rangeFrom, rangeTo)
        .filter((item) => item.expectedAmount > 0)
        .filter((item) => item.cycleEnd >= futureFrom),
    [budgets, transactions, rangeFrom, rangeTo, futureFrom],
  );

  const shiftedTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.amount < 0)
        .filter((transaction) => transaction.cashOutDate && transaction.cashOutDate !== transaction.date)
        .sort((a, b) => (a.cashOutDate || '').localeCompare(b.cashOutDate || '')),
    [transactions],
  );

  const futureExpenseItems = useMemo<FutureExpenseItem[]>(() => {
    const transactionItems: FutureExpenseItem[] = futureExpenseTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.transactionType === 'installment_bill' ? 'installment' : 'future',
      title: transaction.note || '未来支出',
      date: transaction.effectiveDate,
      amount: transaction.amount,
      accountId: transaction.accountId,
      originalDate: transaction.date,
    }));
    const budgetItems: FutureExpenseItem[] = includeBudgetSettlement
      ? budgetSettlementItems.map((item) => ({
          id: `budget-${item.budgetId}-${item.cycleEnd}`,
          type: 'budget',
          title: `${item.budgetName} 预算结算`,
          date: item.cycleEnd,
          amount: item.expectedAmount,
          accountId: '',
        }))
      : [];
    return [...transactionItems, ...budgetItems].sort((a, b) => a.date.localeCompare(b.date));
  }, [futureExpenseTransactions, includeBudgetSettlement, budgetSettlementItems]);

  // ---- 超支预警 ----
  const overBudgetAlerts = useMemo(() => {
    return budgets
      .filter((budget) => budget.rate >= 80)
      .sort((a, b) => b.rate - a.rate);
  }, [budgets]);

  // ---- 核心指标计算 ----
  const coreMetrics = useMemo(() => {
    // 权责口径总消费
    const totalConsumption = actualExpenses.reduce((sum, t) => sum + t.amount, 0);

    // 按支出属性拆分
    const attributeBreakdown: Record<ExpenseAttribute, number> = {
      rigid_fixed: 0,
      flexible_monthly: 0,
      annual_cycle: 0,
      one_time_emergency: 0,
    };
    actualExpenses.forEach((t) => {
      if (t.expenseAttribute) {
        attributeBreakdown[t.expenseAttribute] += t.amount;
      } else {
        // 默认无标记的归为弹性月度支出
        attributeBreakdown.flexible_monthly += t.amount;
      }
    });

    // 现金流口径
    const cashOutflow = actualTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const netIncome = actualTransactions
      .filter(t => t.amount > 0 && (t.transactionType === 'income' || t.transactionType === 'normal'))
      .reduce((sum, t) => sum + t.amount, 0);
    const disposableCash = netIncome - cashOutflow;

    // 信贷指标
    const creditAccounts = accounts.filter(a => a.type === 'credit_card' || a.type === 'alipay_huabei');
    const totalDebt = creditAccounts.reduce((sum, a) => sum + (a.totalDebt || 0), 0);
    const monthlyRepayment = creditAccounts.reduce((sum, a) => {
      // 计算本月待还金额：根据账单日判断是否在本月还款范围
      if (!a.billingDay || !a.repaymentDay) return sum;
      const dueDate = new Date(today.getFullYear(), today.getMonth(), a.repaymentDay);
      if (formatLocalISODate(dueDate) >= monthStartISO && formatLocalISODate(dueDate) <= monthEndISO) {
        // 简单估算待还总额为总负债 + 每月利息（后续可优化为精准计算）
        return sum + (a.totalDebt || 0) + (a.monthlyInterest || 0) + (a.installmentMonthlyPayment || 0);
      }
      return sum;
    }, 0);
    const totalInstallmentPayment = creditAccounts.reduce((sum, a) => sum + (a.installmentMonthlyPayment || 0), 0);

    // 预算指标
    const totalBudget = budgets
      .filter(b => b.cycleType === 'monthly' || b.cycleType === 'weekly')
      .reduce((sum, b) => sum + b.amount * (b.cycleType === 'weekly' ? 4 : 1), 0);
    const totalUsed = budgets.reduce((sum, b) => sum + (b.used || 0), 0);
    const budgetCompletionRate = totalBudget > 0 ? (totalUsed / totalBudget) * 100 : 0;
    // 弹性品类平均偏离度
    const flexibleBudgets = budgets.filter(b => b.category === '餐饮' || b.category === '娱乐' || b.category === '购物');
    const avgDeviation = flexibleBudgets.length > 0 
      ? flexibleBudgets.reduce((sum, b) => sum + Math.abs((b.used || 0) - b.amount) / b.amount * 100, 0) / flexibleBudgets.length
      : 0;

    // 风险指标
    const emergencySpendRatio = totalConsumption > 0 ? (attributeBreakdown.one_time_emergency / totalConsumption) * 100 : 0;
    const monthlyInterestCost = creditAccounts.reduce((sum, a) => sum + (a.monthlyInterest || 0), 0);

    return {
      totalConsumption,
      attributeBreakdown,
      cashOutflow,
      netIncome,
      disposableCash,
      totalDebt,
      monthlyRepayment,
      totalInstallmentPayment,
      budgetCompletionRate,
      avgDeviation,
      emergencySpendRatio,
      monthlyInterestCost,
    };
  }, [actualExpenses, actualTransactions, accounts, budgets, today, monthStartISO, monthEndISO]);

  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);

  const attributeStructureOption = useMemo(() => {
    const data = Object.entries(coreMetrics.attributeBreakdown)
      .map(([key, value]) => ({
        name: EXPENSE_ATTRIBUTE_LABELS[key as ExpenseAttribute],
        value,
      }))
      .filter((item) => item.value > 0);
    if (data.length === 0) return null;
    return {
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      legend: { orient: 'vertical', right: '4%', top: 'center' },
      series: [
        {
          name: '支出属性',
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['35%', '50%'],
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
          data,
          color: CHART_COLORS,
        },
      ],
    };
  }, [coreMetrics.attributeBreakdown]);

  const paymentChannelOption = useMemo(() => {
    const channelMap: Record<string, number> = {};
    actualExpenses.forEach((transaction) => {
      const label = getPaymentChannelLabel(transaction, accountMap.get(transaction.accountId));
      channelMap[label] = (channelMap[label] || 0) + transaction.amount;
    });
    const entries = Object.entries(channelMap).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return null;
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: entries.map(([label]) => label) },
      yAxis: { type: 'value', name: '金额 (元)' },
      series: [
        {
          name: '支付渠道',
          type: 'bar',
          data: entries.map(([_, value], index) => ({
            value,
            itemStyle: {
              color: CHART_COLORS[index % CHART_COLORS.length],
              borderRadius: [4, 4, 0, 0],
            },
          })),
        },
      ],
    };
  }, [actualExpenses, accountMap]);

  const categoryTableRows = useMemo(() => {
    const fullMonth = isFullNaturalMonthRange(rangeFrom, rangeTo);
    const { monthStart, monthEnd, daysInMonth } = getMonthBounds(rangeFrom);
    const rangeDays = diffDaysInclusive(rangeFrom, rangeTo);
    const categorySet = new Set<string>([
      ...DEFAULT_CATEGORIES,
      ...actualExpenses.map((transaction) => transaction.category),
      ...budgets.map((budget) => budget.category).filter(Boolean) as string[],
    ]);

    const recentMonthKeys = getRecentMonthKeys(rangeTo, 3);
    return Array.from(categorySet)
      .map((category) => {
        const budgetAmount = budgets
          .filter((budget) => budget.category === category)
          .reduce((sum, budget) => {
            if (budget.cycleType === 'yearly' || budget.cycleType === 'once') return sum;
            if (fullMonth) {
              if (budget.cycleType === 'monthly') return sum + budget.amount;
              if (budget.cycleType === 'weekly') {
                return sum + (weeklyBudgetNormalizeMode === 'days' ? budget.amount * (daysInMonth / 7) : budget.amount * 4);
              }
              if (budget.cycleType === 'custom' && budget.cycleDays) {
                const effectiveStart = budget.startDate > monthStart ? budget.startDate : monthStart;
                if (effectiveStart <= monthEnd) {
                  const overlapDays = Math.min(diffDaysInclusive(effectiveStart, monthEnd), budget.cycleDays);
                  return sum + budget.amount * (overlapDays / budget.cycleDays);
                }
              }
              return sum;
            }
            if (budget.cycleType === 'monthly') return sum + budget.amount * (rangeDays / daysInMonth);
            if (budget.cycleType === 'weekly') return sum + budget.amount * (rangeDays / 7);
            if (budget.cycleType === 'custom' && budget.cycleDays) {
              return sum + budget.amount * (Math.min(rangeDays, budget.cycleDays) / budget.cycleDays);
            }
            return sum;
          }, 0);

        const actualAmount = actualExpenses
          .filter((transaction) => transaction.category === category)
          .reduce((sum, transaction) => sum + transaction.amount, 0);
        const variance = actualAmount - budgetAmount;
        const deviation = budgetAmount > 0 ? (variance / budgetAmount) * 100 : 0;

        const monthlySeries = recentMonthKeys.map((monthKey) =>
          transactions
            .filter((transaction) => transaction.amount < 0 && transaction.category === category)
            .map((transaction) => ({
              ...transaction,
              effectiveDate: getEffectiveTransactionDate(transaction, timelineMode),
            }))
            .filter((transaction) => formatLocalISOYearMonth(parseISODate(transaction.effectiveDate)) === monthKey)
            .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
        );
        const recent3MonthAvg = calcMean(monthlySeries);
        const volatility = recent3MonthAvg > 0 ? (calcStd(monthlySeries) / recent3MonthAvg) * 100 : 0;
        const attribute = inferExpenseAttribute({
          category: category as ITransaction['category'],
          amount: actualAmount,
          note: '',
          expenseAttribute: undefined,
        });

        return {
          category,
          budgetAmount,
          actualAmount,
          variance,
          deviation,
          volatility,
          recent3MonthAvg,
          attribute,
          longTermOver: attribute === 'flexible_monthly' && deviation > 15 && recent3MonthAvg > budgetAmount,
        };
      })
      .filter((row) => row.budgetAmount > 0 || row.actualAmount > 0)
      .sort((a, b) => {
        if (a.longTermOver !== b.longTermOver) return a.longTermOver ? -1 : 1;
        return b.actualAmount - a.actualAmount;
      });
  }, [actualExpenses, budgets, rangeFrom, rangeTo, weeklyBudgetNormalizeMode, transactions, timelineMode]);

  const giniSummary = useMemo(() => {
    const values = categoryTableRows.map((row) => row.actualAmount).filter((value) => value > 0);
    const coefficient = calcGini(values);
    const topCategory = [...categoryTableRows].sort((a, b) => b.actualAmount - a.actualAmount)[0];
    let level = '均衡';
    if (coefficient >= 0.55) level = '高度集中';
    else if (coefficient >= 0.4) level = '中度集中';
    return { coefficient, topCategory, level };
  }, [categoryTableRows]);

  const anomalyItems = useMemo<AnomalyItem[]>(() => {
    const items: AnomalyItem[] = [];

    const dailyBuckets = new Map<string, number>();
    actualExpenses.forEach((transaction) => {
      dailyBuckets.set(transaction.effectiveDate, (dailyBuckets.get(transaction.effectiveDate) || 0) + transaction.amount);
    });
    const dailyValues = Array.from(dailyBuckets.values());
    const dailyMean = calcMean(dailyValues);
    const dailyStd = calcStd(dailyValues);
    const dailyThreshold = dailyMean + 3 * dailyStd;

    Array.from(dailyBuckets.entries())
      .filter(([, value]) => dailyValues.length >= 3 && dailyStd > 0 && value > dailyThreshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([date, value]) => {
        items.push({
          id: `daily-${date}`,
          type: 'daily_large',
          severity: 'high',
          amount: value,
          title: `${date} 出现单日大额消费`,
          description: `单日支出 ¥${value.toFixed(0)}，超过日均值 ¥${dailyMean.toFixed(0)} 的 3σ 阈值（¥${dailyThreshold.toFixed(0)}）`,
        });
      });

    const recentSixMonthKeys = getRecentMonthKeys(rangeTo, 6);
    categoryTableRows
      .filter((row) => row.attribute === 'flexible_monthly')
      .forEach((row) => {
        const monthlySeries = recentSixMonthKeys.map((monthKey) =>
          transactions
            .filter((transaction) => transaction.amount < 0 && transaction.category === row.category)
            .map((transaction) => ({
              ...transaction,
              effectiveDate: getEffectiveTransactionDate(transaction, timelineMode),
            }))
            .filter((transaction) => formatLocalISOYearMonth(parseISODate(transaction.effectiveDate)) === monthKey)
            .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
        );
        const history = monthlySeries.slice(0, -1);
        const currentValue = monthlySeries[monthlySeries.length - 1] || 0;
        const historyMean = calcMean(history);
        const historyStd = calcStd(history);
        const threshold = historyMean + 3 * historyStd;
        if (history.length >= 3 && historyStd > 0 && currentValue > threshold) {
          items.push({
            id: `flex-${row.category}`,
            type: 'flexible_monthly',
            severity: 'medium',
            amount: currentValue,
            title: `${row.category} 月度支出显著偏高`,
            description: `本月 ¥${currentValue.toFixed(0)}，高于近 ${history.length} 个月均值 ¥${historyMean.toFixed(0)} 的 3σ 阈值（¥${threshold.toFixed(0)}）`,
          });
        }
      });

    const impulseTransactions = actualExpenses.filter((transaction) => {
      const note = transaction.note || '';
      return transaction.amount <= 50 && (transaction.category === '餐饮' || /奶茶|零食|咖啡|饮料|甜品/i.test(note));
    });
    const impulseCount = impulseTransactions.length;
    const impulseTotal = impulseTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    if (impulseCount >= 5 && impulseTotal >= 100) {
      items.push({
        id: 'impulse-snacks',
        type: 'impulse',
        severity: 'medium',
        amount: impulseTotal,
        title: '奶茶/零食类高频小额冲动消费',
        description: `当前范围内共 ${impulseCount} 笔，累计 ¥${impulseTotal.toFixed(0)}，建议检查零食、奶茶、咖啡类的连续小额支出`,
      });
    }

    return items.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
      return (b.amount || 0) - (a.amount || 0);
    });
  }, [actualExpenses, categoryTableRows, rangeTo, timelineMode, transactions]);

  const historyMonthKeys = useMemo(() => getRecentMonthKeys(rangeTo, 6), [rangeTo]);
  const forecastMonthKeys = useMemo(
    () => Array.from({ length: 6 }, (_, index) => shiftMonthKey(formatLocalISOYearMonth(parseISODate(rangeTo)), index + 1)),
    [rangeTo],
  );

  const rigidExpenseSeries = useMemo(
    () =>
      buildMonthlySeries(
        transactions,
        timelineMode,
        (transaction) => transaction.amount < 0 && inferExpenseAttribute(transaction) === 'rigid_fixed',
        historyMonthKeys,
      ),
    [transactions, timelineMode, historyMonthKeys],
  );
  const flexibleExpenseSeries = useMemo(
    () =>
      buildMonthlySeries(
        transactions,
        timelineMode,
        (transaction) => transaction.amount < 0 && inferExpenseAttribute(transaction) === 'flexible_monthly',
        historyMonthKeys,
      ),
    [transactions, timelineMode, historyMonthKeys],
  );
  const annualExpenseSeries = useMemo(
    () =>
      buildMonthlySeries(
        transactions,
        timelineMode,
        (transaction) => transaction.amount < 0 && inferExpenseAttribute(transaction) === 'annual_cycle',
        historyMonthKeys,
      ),
    [transactions, timelineMode, historyMonthKeys],
  );
  const incomeSeries = useMemo(
    () =>
      historyMonthKeys.map((monthKey) =>
        transactions
          .filter((transaction) => transaction.amount > 0)
          .map((transaction) => ({
            ...transaction,
            effectiveDate: getEffectiveTransactionDate(transaction, timelineMode),
          }))
          .filter((transaction) => formatLocalISOYearMonth(parseISODate(transaction.effectiveDate)) === monthKey)
          .reduce((sum, transaction) => sum + transaction.amount, 0),
      ),
    [transactions, timelineMode, historyMonthKeys],
  );

  const rigidForecast = useMemo(() => buildForecastBands(rigidExpenseSeries, forecastMonthKeys), [rigidExpenseSeries, forecastMonthKeys]);
  const flexibleForecast = useMemo(() => buildForecastBands(flexibleExpenseSeries, forecastMonthKeys), [flexibleExpenseSeries, forecastMonthKeys]);
  const annualForecast = useMemo(() => buildForecastBands(annualExpenseSeries, forecastMonthKeys), [annualExpenseSeries, forecastMonthKeys]);
  const incomeForecast = useMemo(() => buildForecastBands(incomeSeries, forecastMonthKeys), [incomeSeries, forecastMonthKeys]);

  const creditExpenseRatio = useMemo(() => {
    const creditExpense = actualExpenses
      .filter((transaction) => {
        const account = accountMap.get(transaction.accountId);
        return account?.type === 'credit_card' || account?.type === 'alipay_huabei';
      })
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    return coreMetrics.totalConsumption > 0 ? Math.min(0.95, creditExpense / coreMetrics.totalConsumption) : 0.35;
  }, [actualExpenses, accountMap, coreMetrics.totalConsumption]);

  const monthlyInstallmentBase = useMemo(
    () => accounts.reduce((sum, account) => sum + (account.installmentMonthlyPayment || 0), 0),
    [accounts],
  );

  const cashflowForecastRows = useMemo(() => {
    return forecastMonthKeys.map((monthKey, index) => {
      const rigid = rigidForecast[index]?.baseline || 0;
      const flexible = flexibleForecast[index]?.baseline || 0;
      const annual = annualForecast[index]?.baseline || 0;
      const income = incomeForecast[index]?.baseline || 0;
      const predictedCreditSpend = (rigid + flexible + annual) * creditExpenseRatio;
      const previousCreditSpend =
        index === 0
          ? ((rigidExpenseSeries[rigidExpenseSeries.length - 1] || 0) +
              (flexibleExpenseSeries[flexibleExpenseSeries.length - 1] || 0) +
              (annualExpenseSeries[annualExpenseSeries.length - 1] || 0)) * creditExpenseRatio
          : (((rigidForecast[index - 1]?.baseline || 0) +
              (flexibleForecast[index - 1]?.baseline || 0) +
              (annualForecast[index - 1]?.baseline || 0)) *
              creditExpenseRatio);
      const directCashFlexible = flexible * (1 - creditExpenseRatio);
      const directCashRigid = rigid * (1 - creditExpenseRatio);
      const annualReserve = annual / 12;
      const emergencyReserve = Math.max((flexible * 0.08), 200);
      const disposable = income - directCashRigid - directCashFlexible - monthlyInstallmentBase - previousCreditSpend - annualReserve - emergencyReserve;
      return {
        monthKey,
        label: getMonthLabel(monthKey),
        income,
        rigid,
        flexible,
        annual,
        predictedCreditSpend,
        nextMonthRepayment: previousCreditSpend,
        installment: monthlyInstallmentBase,
        annualReserve,
        emergencyReserve,
        disposable,
        optimistic: disposable + Math.max(80, income * 0.05),
        conservative: disposable - Math.max(120, (rigid + flexible) * 0.08),
      };
    });
  }, [
    forecastMonthKeys,
    rigidForecast,
    flexibleForecast,
    annualForecast,
    incomeForecast,
    creditExpenseRatio,
    rigidExpenseSeries,
    flexibleExpenseSeries,
    annualExpenseSeries,
    monthlyInstallmentBase,
  ]);

  const disposableCashOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '8%', containLabel: true },
    xAxis: { type: 'category', data: cashflowForecastRows.map((row) => row.label) },
    yAxis: { type: 'value', name: '金额 (元)' },
    series: [
      {
        name: '可支配现金',
        type: 'bar',
        data: cashflowForecastRows.map((row) => ({
          value: row.disposable,
          itemStyle: {
            color: row.disposable < 0 ? '#E5484D' : CHART_COLORS[0],
            borderRadius: [4, 4, 0, 0],
          },
        })),
      },
      {
        name: '乐观',
        type: 'line',
        smooth: true,
        data: cashflowForecastRows.map((row) => row.optimistic),
      },
      {
        name: '保守',
        type: 'line',
        smooth: true,
        data: cashflowForecastRows.map((row) => row.conservative),
      },
    ],
  }), [cashflowForecastRows]);

  const forecastOverviewOption = useMemo(() => {
    const historyLabels = historyMonthKeys.map(getMonthLabel);
    const futureLabels = forecastMonthKeys.map(getMonthLabel);
    const allLabels = [...historyLabels, ...futureLabels];
    const historyValues = historyMonthKeys.map((_, index) => incomeSeries[index] - rigidExpenseSeries[index] - flexibleExpenseSeries[index] - annualExpenseSeries[index]);
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['历史真实值', '预测基准', '预测乐观', '预测保守'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '12%', containLabel: true },
      xAxis: { type: 'category', data: allLabels },
      yAxis: { type: 'value', name: '金额 (元)' },
      series: [
        {
          name: '历史真实值',
          type: 'line',
          smooth: true,
          data: [...historyValues, ...Array.from({ length: futureLabels.length }, () => null)],
        },
        {
          name: '预测基准',
          type: 'line',
          smooth: true,
          data: [...Array.from({ length: historyLabels.length }, () => null), ...cashflowForecastRows.map((row) => row.disposable)],
        },
        {
          name: '预测乐观',
          type: 'line',
          smooth: true,
          lineStyle: { type: 'dashed' },
          data: [...Array.from({ length: historyLabels.length }, () => null), ...cashflowForecastRows.map((row) => row.optimistic)],
        },
        {
          name: '预测保守',
          type: 'line',
          smooth: true,
          lineStyle: { type: 'dashed' },
          data: [...Array.from({ length: historyLabels.length }, () => null), ...cashflowForecastRows.map((row) => row.conservative)],
        },
      ],
    };
  }, [historyMonthKeys, forecastMonthKeys, incomeSeries, rigidExpenseSeries, flexibleExpenseSeries, annualExpenseSeries, cashflowForecastRows]);

  const budgetSuggestionRows = useMemo(() => {
    return categoryTableRows
      .filter((row) => row.budgetAmount > 0)
      .map((row) => {
        let label: '长期超预算' | '预算过剩' | '预算匹配合理' = '预算匹配合理';
        if (row.recent3MonthAvg > row.budgetAmount * 1.15) label = '长期超预算';
        else if (row.recent3MonthAvg < row.budgetAmount * 0.7) label = '预算过剩';
        const suggestedBudget =
          row.longTermOver
            ? Math.round(Math.max(row.budgetAmount, row.recent3MonthAvg * 0.95) / 10) * 10
            : Math.round(Math.max(row.budgetAmount * 0.9, row.recent3MonthAvg) / 10) * 10;
        return {
          ...row,
          label,
          suggestedBudget,
          suggestion:
            label === '长期超预算'
              ? `建议将预算调整至约 ¥${suggestedBudget}，或设置阶段性消费控制目标`
              : label === '预算过剩'
                ? `当前预算富余，若持续 3 个月可考虑下调至约 ¥${suggestedBudget}`
                : '预算区间整体合理，可继续保持并观察波动',
        };
      })
      .sort((a, b) => {
        const order = { 长期超预算: 0, 预算过剩: 1, 预算匹配合理: 2 };
        return order[a.label] - order[b.label];
      });
  }, [categoryTableRows]);

  const flexibleTrendOption = useMemo(() => {
    const flexibleCategories = categoryTableRows.filter((row) => row.attribute === 'flexible_monthly').slice(0, 3);
    if (flexibleCategories.length === 0) return null;
    const monthKeys = getRecentMonthKeys(rangeTo, 6);
    const series = flexibleCategories.flatMap((row, index) => {
      const actualSeries = monthKeys.map((monthKey) =>
        transactions
          .filter((transaction) => transaction.amount < 0 && transaction.category === row.category)
          .map((transaction) => ({
            ...transaction,
            effectiveDate: getEffectiveTransactionDate(transaction, timelineMode),
          }))
          .filter((transaction) => formatLocalISOYearMonth(parseISODate(transaction.effectiveDate)) === monthKey)
          .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0),
      );
      const budgetSeries = monthKeys.map(() => row.budgetAmount);
      return [
        {
          name: `${row.category} 实际`,
          type: 'line',
          smooth: true,
          data: actualSeries,
          lineStyle: { color: CHART_COLORS[index % CHART_COLORS.length] },
        },
        {
          name: `${row.category} 预算`,
          type: 'line',
          smooth: true,
          lineStyle: { type: 'dashed', color: CHART_COLORS[index % CHART_COLORS.length] },
          data: budgetSeries,
        },
      ];
    });
    return {
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '12%', containLabel: true },
      xAxis: { type: 'category', data: monthKeys.map(getMonthLabel) },
      yAxis: { type: 'value', name: '金额 (元)' },
      series,
    };
  }, [categoryTableRows, rangeTo, transactions, timelineMode]);

  // ---- 账单周期统计 ----
  const billingCycleOption = useMemo(() => {
    const billingAccounts = accounts.filter(
      (a) => (a.type === 'credit_card' || a.type === 'alipay_huabei') && a.billingDay,
    );
    if (billingAccounts.length === 0) return null;

    const now = new Date();
    const names: string[] = [];
    const values: number[] = [];

    billingAccounts.forEach((acc) => {
      const { start, end } = getBillingCycleRange(acc.billingDay!, now);
      const total = actualExpenses
        .filter((t) => t.accountId === acc.id && t.date >= start && t.date <= end)
        .reduce((sum, t) => sum + t.amount, 0);
      names.push(acc.name);
      values.push(total);
    });

    return {
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: names, axisLabel: { rotate: 20 } },
      yAxis: { type: 'value', name: '支出 (元)' },
      series: [
        {
          name: '本期账单支出',
          type: 'bar',
          data: values,
          itemStyle: {
            color: CHART_COLORS[0],
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    };
  }, [accounts, actualExpenses]);

  // ---- 预算执行对比 ----
  const budgetCompareOption = useMemo(() => {
    if (budgets.length === 0) return null;
    const fullMonth = isFullNaturalMonthRange(rangeFrom, rangeTo);
    const { monthStart, monthEnd, daysInMonth } = getMonthBounds(rangeFrom);
    const rangeDays = diffDaysInclusive(rangeFrom, rangeTo);

    const compareRows = budgets
      .filter((b) => b.cycleType !== 'yearly')
      .filter((b) => b.cycleType !== 'once')
      .map((budget) => {
        let budgetAmountInRange = 0;
        let usedStart = rangeFrom;
        let usedEnd = actualCutoff;

        if (fullMonth) {
          usedStart = monthStart;
          usedEnd = actualCutoff < monthEnd ? actualCutoff : monthEnd;
          if (budget.cycleType === 'monthly') {
            budgetAmountInRange = budget.amount;
          } else if (budget.cycleType === 'weekly') {
            budgetAmountInRange =
              weeklyBudgetNormalizeMode === 'days' ? budget.amount * (daysInMonth / 7) : budget.amount * 4;
          } else if (budget.cycleType === 'custom') {
            const cycleDays = budget.cycleDays || 0;
            const effectiveStart = budget.startDate > monthStart ? budget.startDate : monthStart;
            if (effectiveStart <= monthEnd && cycleDays > 0) {
              const overlapRaw = diffDaysInclusive(effectiveStart, monthEnd);
              const overlapDays = Math.min(overlapRaw, cycleDays);
              const effectiveEnd = formatLocalISODate(addDays(parseISODate(effectiveStart), overlapDays - 1));
              usedStart = effectiveStart;
              usedEnd = effectiveEnd < usedEnd ? effectiveEnd : usedEnd;
              budgetAmountInRange = budget.amount * (overlapDays / cycleDays);
            }
          }
        } else {
          if (budget.cycleType === 'monthly') {
            budgetAmountInRange = budget.amount * (rangeDays / daysInMonth);
          } else if (budget.cycleType === 'weekly') {
            budgetAmountInRange = budget.amount * (rangeDays / 7);
          } else if (budget.cycleType === 'custom') {
            const cycleDays = budget.cycleDays || 0;
            if (cycleDays > 0) {
              const overlapDays = Math.min(rangeDays, cycleDays);
              budgetAmountInRange = budget.amount * (overlapDays / cycleDays);
            }
          }
        }

        const usedAmount =
          usedStart <= usedEnd
            ? transactions
                .filter((t) => t.amount < 0)
                .filter((t) => t.budgetId === budget.id)
                .filter((t) => t.date >= usedStart && t.date <= usedEnd)
                .reduce((sum, t) => sum + Math.abs(t.amount), 0)
            : 0;

        return {
          id: budget.id,
          name: budget.name,
          cycleType: budget.cycleType,
          budgetAmountInRange,
          usedAmount,
        };
      })
      .filter((row) => row.budgetAmountInRange > 0 || row.usedAmount > 0)
      .sort((a, b) => b.usedAmount - a.usedAmount);

    const names = compareRows.map((r) => r.name);
    const budgetAmounts = compareRows.map((r) => r.budgetAmountInRange);
    const usedAmounts = compareRows.map((r) => r.usedAmount);

    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['预算金额', '已使用'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '12%', containLabel: true },
      xAxis: { type: 'category', data: names, axisLabel: { rotate: 15 } },
      yAxis: { type: 'value', name: '金额 (元)' },
      series: [
        {
          name: '预算金额',
          type: 'bar',
          data: budgetAmounts,
          itemStyle: { color: CHART_COLORS[1], borderRadius: [4, 4, 0, 0] },
          barGap: '20%',
        },
        {
          name: '已使用',
          type: 'bar',
          data: usedAmounts.map((v, i) => ({
            value: v,
            itemStyle: {
              color: v > budgetAmounts[i] ? '#E5484D' : CHART_COLORS[0],
              borderRadius: [4, 4, 0, 0],
            },
          })),
        },
      ],
    };
  }, [budgets, rangeFrom, rangeTo, actualCutoff, transactions, weeklyBudgetNormalizeMode]);

  // ---- 分类支出分布 ----
  const categoryPieOption = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    actualExpenses.forEach((t) => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
    });
    const data = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

    return {
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      legend: { orient: 'vertical', right: '5%', top: 'center' },
      series: [
        {
          name: '分类支出',
          type: 'pie',
          radius: ['45%', '75%'],
          center: ['40%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
          data,
          color: CHART_COLORS,
        },
      ],
    };
  }, [actualExpenses]);

  // ---- 时间趋势 ----
  const trendOption = useMemo(() => {
    if (actualExpenses.length === 0) return null;

    const sorted = [...actualExpenses].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    const buckets: Record<string, number> = {};

    sorted.forEach((t) => {
      const d = new Date(t.effectiveDate);
      let key: string;
      if (timeGranularity === 'daily') {
        key = t.effectiveDate;
      } else if (timeGranularity === 'weekly') {
        key = getWeekStart(d);
      } else {
        key = getMonthKey(d);
      }
      buckets[key] = (buckets[key] || 0) + t.amount;
    });

    const entries = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));

    return {
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        data: entries.map(([k]) => k),
        axisLabel: { rotate: 30, fontSize: 11 },
      },
      yAxis: { type: 'value', name: '支出 (元)' },
      series: [
        {
          name: '支出趋势',
          type: 'line',
          data: entries.map(([, v]) => v),
          smooth: true,
          lineStyle: { color: CHART_COLORS[0], width: 2 },
          itemStyle: { color: CHART_COLORS[0] },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(43,167,160,0.25)' },
                { offset: 1, color: 'rgba(43,167,160,0.02)' },
              ],
            },
          },
        },
      ],
    };
  }, [actualExpenses, timeGranularity]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* 页面标题 + 周期切换 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">统计模拟</h1>
            <p className="text-sm text-muted-foreground mt-1">多维度消费数据分析、数据拟合预测与智能建议</p>
          </div>
          <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as StatsPeriod)} className="shrink-0">
            <TabsList className="h-9">
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <TabsTrigger key={value} value={value} className="px-4">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="space-y-1">
              <p className="font-medium">自定义时间范围</p>
              <p className="text-sm text-muted-foreground">统计与预算对比会按该范围计算</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="stats-from">开始</Label>
                <Input id="stats-from" type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="stats-to">结束</Label>
                <Input id="stats-to" type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="stats-mode">统计口径</Label>
                <Select value={timelineMode} onValueChange={(value) => setTimelineMode(value as TimelineMode)}>
                  <SelectTrigger id="stats-mode" className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">消费日</SelectItem>
                    <SelectItem value="cashflow">现金流日</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 核心指标卡分组 */}
        <div className="space-y-4">
          {/* 权责口径指标 */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <BarChart3 className="size-5 text-primary" />
              权责口径（消费发生日）
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>总消费金额</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums text-destructive">
                    ¥{coreMetrics.totalConsumption.toFixed(0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              {Object.entries(coreMetrics.attributeBreakdown).map(([attr, amount]) => (
                <Card key={attr}>
                  <CardHeader className="pb-2">
                    <CardDescription>{EXPENSE_ATTRIBUTE_LABELS[attr as ExpenseAttribute]}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold tabular-nums">
                      ¥{amount.toFixed(0).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {coreMetrics.totalConsumption > 0 ? ((amount / coreMetrics.totalConsumption) * 100).toFixed(0) : 0}%
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* 现金流口径指标 */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Wallet className="size-5 text-primary" />
              现金流口径（实际收支日）
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>当月现金流出</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums text-destructive">
                    ¥{coreMetrics.cashOutflow.toFixed(0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>到手净收入</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums text-success">
                    ¥{coreMetrics.netIncome.toFixed(0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>当月剩余可支配现金</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold tabular-nums ${coreMetrics.disposableCash >= 0 ? 'text-success' : 'text-destructive'}`}>
                    ¥{coreMetrics.disposableCash.toFixed(0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 信贷相关指标 */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <CreditCard className="size-5 text-primary" />
              信贷负债
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>信用卡/花呗总负债</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums text-destructive">
                    ¥{coreMetrics.totalDebt.toFixed(0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>本月待还信贷总额</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold tabular-nums">
                    ¥{coreMetrics.monthlyRepayment.toFixed(0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>分期月供合计</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold tabular-nums">
                    ¥{coreMetrics.totalInstallmentPayment.toFixed(0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* 预算 & 风险指标 */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <PieChart className="size-5 text-primary" />
              预算与风险
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>整体预算完成度</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">
                    {coreMetrics.budgetCompletionRate.toFixed(0)}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>弹性品类平均偏离度</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold tabular-nums">
                    {coreMetrics.avgDeviation.toFixed(0)}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>突发大额支出占比</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className={`text-lg font-semibold tabular-nums ${coreMetrics.emergencySpendRatio > 20 ? 'text-destructive' : ''}`}>
                    {coreMetrics.emergencySpendRatio.toFixed(0)}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>信贷利息月度成本</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold tabular-nums text-destructive">
                    ¥{coreMetrics.monthlyInterestCost.toFixed(0)}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {timelineMode === 'cashflow' && (
          <Card>
            <CardHeader>
              <CardTitle>预算-现金流差异</CardTitle>
              <CardDescription>显示信用消费因账单/还款日后移带来的资金支出延后</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {shiftedTransactions
                .filter((transaction) => transaction.cashOutDate! >= rangeFrom && transaction.cashOutDate! <= rangeTo)
                .slice(0, 8)
                .map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{transaction.note || transaction.category}</p>
                      <p className="text-sm text-muted-foreground">
                        消费日 {transaction.date} {'->'} 现金流日 {transaction.cashOutDate}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums">¥{Math.abs(transaction.amount).toLocaleString()}</p>
                  </div>
                ))}
              {shiftedTransactions.filter((transaction) => transaction.cashOutDate! >= rangeFrom && transaction.cashOutDate! <= rangeTo).length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">当前范围内没有消费日和现金流日分离的支出</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="font-medium">预期支出设置</p>
              <p className="text-sm text-muted-foreground">开启后会将当前范围内到期的预算结算额纳入预期结余</p>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="include-budget-settlement">考虑预算结算</Label>
              <Switch
                id="include-budget-settlement"
                checked={includeBudgetSettlement}
                onCheckedChange={setIncludeBudgetSettlement}
              />
            </div>
          </CardContent>
        </Card>

        {futureExpenseItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>预期支出</CardTitle>
              <CardDescription>展示当前范围内尚未发生的分期账单、未来支出和预算结算</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {futureExpenseItems.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{item.title}</p>
                      <Badge variant="outline" className="text-xs">
                        {item.type === 'budget' ? '预算结算' : item.type === 'installment' ? '分期账单' : '未来支出'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {item.date}
                      {item.accountId ? ` · ${accounts.find((account) => account.id === item.accountId)?.name || '未知账户'}` : ''}
                    </p>
                    {item.originalDate && item.originalDate !== item.date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        消费日 {item.originalDate} {'->'} 现金流日 {item.date}
                      </p>
                    )}
                  </div>
                  <p className="font-semibold text-destructive tabular-nums">¥{item.amount.toLocaleString()}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* 超支预警 */}
        {overBudgetAlerts.length > 0 && (
          <div className="space-y-2">
            {overBudgetAlerts.map((b) => (
              <Alert
                key={b.id}
                variant={b.rate >= 100 ? 'destructive' : 'default'}
                className="cursor-pointer"
                onClick={() => navigate('/budgets')}
              >
                <AlertTriangle className="size-4" />
                <AlertTitle className="flex items-center gap-2">
                  {b.name}
                  <Badge variant={b.rate >= 100 ? 'destructive' : 'secondary'} className="text-xs">
                    {b.rate >= 100 ? '已超支' : '即将超支'}
                  </Badge>
                </AlertTitle>
                <AlertDescription>
                  已使用 ¥{b.used.toFixed(0)} / 预算 ¥{b.amount}（{b.rate.toFixed(0)}%）
                  {b.currentPeriodStart && b.currentPeriodEnd ? ` · 当前周期 ${b.currentPeriodStart} ~ ${b.currentPeriodEnd}` : ''}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* 账单周期统计 */}
        {timelineMode === 'expense' && billingCycleOption && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-5 text-primary" />
                账单周期统计
              </CardTitle>
              <CardDescription>按各信用卡/花呗账单周期统计本期支出</CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts option={billingCycleOption} style={{ height: 320 }} />
            </CardContent>
          </Card>
        )}

        {/* 预算执行对比 */}
        {budgetCompareOption && (
          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>预算执行对比</CardTitle>
                <CardDescription>
                  月维度：周预算按{weeklyBudgetNormalizeMode === 'days' ? '当月天数/7' : '4 周'}折算，自定义周期按当月覆盖天数比例折算；不包含年预算
                </CardDescription>
              </div>
              <div className="flex items-end gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="weekly-normalize" className="text-xs text-muted-foreground">
                    周预算折算
                  </Label>
                  <Select
                    value={weeklyBudgetNormalizeMode}
                    onValueChange={(value) => setWeeklyBudgetNormalizeMode(value as WeeklyBudgetNormalizeMode)}
                  >
                    <SelectTrigger id="weekly-normalize" className="w-[150px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weeks4">按 4 周</SelectItem>
                      <SelectItem value="days">按天数比例</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ReactECharts option={budgetCompareOption} style={{ height: 360 }} />
            </CardContent>
          </Card>
        )}

        {/* 支出结构分析 */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>支出属性占比</CardTitle>
              <CardDescription>刚性固定、弹性月度、年度周期、突发支出的金额占比</CardDescription>
            </CardHeader>
            <CardContent>
              {attributeStructureOption ? (
                <ReactECharts option={attributeStructureOption} style={{ height: 320 }} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">暂无支出属性数据</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>二级品类占比</CardTitle>
              <CardDescription>奶茶、餐饮、房租、交通、购物等细分品类消费占比</CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts option={categoryPieOption} style={{ height: 320 }} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>支付渠道统计</CardTitle>
              <CardDescription>银行卡、花呗、信用卡、分期等支付渠道支出分布</CardDescription>
            </CardHeader>
            <CardContent>
              {paymentChannelOption ? (
                <ReactECharts option={paymentChannelOption} style={{ height: 320 }} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">暂无支付渠道数据</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
          <Card>
            <CardHeader>
              <CardTitle>品类明细对比表</CardTitle>
              <CardDescription>当前筛选周期下的预算、实际发生、偏离度、波动率和近 3 月均值</CardDescription>
            </CardHeader>
            <CardContent>
              {categoryTableRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-3 pr-4 font-medium">品类</th>
                        <th className="py-3 pr-4 font-medium">支出属性</th>
                        <th className="py-3 pr-4 font-medium">预算金额</th>
                        <th className="py-3 pr-4 font-medium">实际发生</th>
                        <th className="py-3 pr-4 font-medium">预算差额</th>
                        <th className="py-3 pr-4 font-medium">偏离度</th>
                        <th className="py-3 pr-4 font-medium">波动率</th>
                        <th className="py-3 pr-4 font-medium">近3月均值</th>
                        <th className="py-3 font-medium">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryTableRows.map((row) => (
                        <tr key={row.category} className="border-b last:border-b-0">
                          <td className="py-3 pr-4 font-medium">{row.category}</td>
                          <td className="py-3 pr-4">
                            <Badge variant="outline">{EXPENSE_ATTRIBUTE_LABELS[row.attribute]}</Badge>
                          </td>
                          <td className="py-3 pr-4 tabular-nums">¥{row.budgetAmount.toFixed(0)}</td>
                          <td className="py-3 pr-4 tabular-nums">¥{row.actualAmount.toFixed(0)}</td>
                          <td className={`py-3 pr-4 tabular-nums ${row.variance > 0 ? 'text-destructive' : 'text-success'}`}>
                            {row.variance > 0 ? '+' : ''}¥{row.variance.toFixed(0)}
                          </td>
                          <td className={`py-3 pr-4 tabular-nums ${row.deviation > 0 ? 'text-destructive' : 'text-foreground'}`}>
                            {row.deviation > 0 ? '+' : ''}{row.deviation.toFixed(0)}%
                          </td>
                          <td className="py-3 pr-4 tabular-nums">{row.volatility.toFixed(0)}%</td>
                          <td className="py-3 pr-4 tabular-nums">¥{row.recent3MonthAvg.toFixed(0)}</td>
                          <td className="py-3">
                            {row.longTermOver ? (
                              <Badge variant="destructive">长期超预算</Badge>
                            ) : row.deviation > 0 ? (
                              <Badge variant="secondary">超预算</Badge>
                            ) : (
                              <Badge variant="outline">正常</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">当前范围暂无品类对比数据</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>不均衡分析</CardTitle>
              <CardDescription>基尼系数反映资金是否过度集中在少数品类</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">资金分布基尼系数</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{giniSummary.coefficient.toFixed(2)}</p>
                <p className="mt-1 text-sm">
                  结果判断：
                  <span className={`ml-1 font-medium ${giniSummary.coefficient >= 0.55 ? 'text-destructive' : giniSummary.coefficient >= 0.4 ? 'text-amber-600' : 'text-success'}`}>
                    {giniSummary.level}
                  </span>
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">最高集中品类</p>
                {giniSummary.topCategory ? (
                  <>
                    <p className="mt-2 font-semibold">{giniSummary.topCategory.category}</p>
                    <p className="text-sm text-muted-foreground">
                      实际发生 ¥{giniSummary.topCategory.actualAmount.toFixed(0)}，偏离度 {giniSummary.topCategory.deviation.toFixed(0)}%
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">当前范围暂无支出</p>
                )}
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">自动识别提示</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {giniSummary.coefficient >= 0.55
                    ? '当前资金明显集中，建议重点复盘房租、大额购物、娱乐等高占比项目。'
                    : giniSummary.coefficient >= 0.4
                      ? '当前资金有一定集中趋势，建议继续跟踪高占比品类的月度波动。'
                      : '当前资金分布相对均衡，可重点关注弹性支出是否稳定在预算区间内。'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>异常消费识别</CardTitle>
            <CardDescription>基于 3σ 准则识别单日大额、月度异常弹性支出和高频小额冲动消费</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {anomalyItems.length > 0 ? (
              anomalyItems.map((item) => (
                <div key={item.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{item.title}</p>
                        <Badge variant={item.severity === 'high' ? 'destructive' : 'secondary'}>
                          {item.severity === 'high' ? '高风险' : '关注'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    {typeof item.amount === 'number' && (
                      <p className="font-semibold tabular-nums text-destructive">¥{item.amount.toFixed(0)}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">当前范围内未识别到明显异常消费</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>分品类预测面板</CardTitle>
              <CardDescription>基于 Holt / Holt-Winters 对刚性、弹性、年度开销和收入进行未来 6 个月预测</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { title: '刚性支出', rows: rigidForecast },
                { title: '弹性支出', rows: flexibleForecast },
                { title: '年度开销', rows: annualForecast },
                { title: '现金收入', rows: incomeForecast },
              ].map((block) => (
                <div key={block.title} className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-medium">{block.title}</p>
                    <Badge variant="outline">未来 6 个月</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {block.rows.slice(0, 3).map((row) => (
                      <div key={row.monthKey} className="rounded-md bg-muted/40 p-3 text-sm">
                        <p className="font-medium">{row.label}</p>
                        <p className="mt-2 text-muted-foreground">乐观 ¥{row.optimistic.toFixed(0)}</p>
                        <p className="text-foreground">基准 ¥{row.baseline.toFixed(0)}</p>
                        <p className="text-destructive/80">保守 ¥{row.conservative.toFixed(0)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>信贷滞后换算</CardTitle>
              <CardDescription>预测消费中的信用支出按 1 个月滞后转化为下月新增还款压力</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {cashflowForecastRows.map((row) => (
                <div key={row.monthKey} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{row.label}</p>
                      <p className="text-sm text-muted-foreground">
                        预估刷卡/花呗消费 ¥{row.predictedCreditSpend.toFixed(0)}，对应下月新增还款压力 ¥{row.nextMonthRepayment.toFixed(0)}
                      </p>
                    </div>
                    <Badge variant={row.nextMonthRepayment > row.income * 0.3 ? 'destructive' : 'secondary'}>
                      {(row.nextMonthRepayment / Math.max(row.income, 1) * 100).toFixed(0)}% 收入占比
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>月度可支配现金预测表</CardTitle>
            <CardDescription>收入减去刚性现金支出、直接现金弹性支出、分期月供、滞后信贷还款、年度储备金与应急预留金后的结果</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">月份</th>
                    <th className="py-3 pr-4 font-medium">总收入预测</th>
                    <th className="py-3 pr-4 font-medium">刚性现金支出</th>
                    <th className="py-3 pr-4 font-medium">直接现金弹性支出</th>
                    <th className="py-3 pr-4 font-medium">分期固定月供</th>
                    <th className="py-3 pr-4 font-medium">新增信贷还款</th>
                    <th className="py-3 pr-4 font-medium">年度储备金</th>
                    <th className="py-3 pr-4 font-medium">应急预留金</th>
                    <th className="py-3 pr-4 font-medium">基准</th>
                    <th className="py-3 pr-4 font-medium">乐观</th>
                    <th className="py-3 font-medium">保守</th>
                  </tr>
                </thead>
                <tbody>
                  {cashflowForecastRows.map((row) => (
                    <tr key={row.monthKey} className="border-b last:border-b-0">
                      <td className="py-3 pr-4 font-medium">{row.label}</td>
                      <td className="py-3 pr-4 tabular-nums">¥{row.income.toFixed(0)}</td>
                      <td className="py-3 pr-4 tabular-nums">¥{(row.rigid * (1 - creditExpenseRatio)).toFixed(0)}</td>
                      <td className="py-3 pr-4 tabular-nums">¥{(row.flexible * (1 - creditExpenseRatio)).toFixed(0)}</td>
                      <td className="py-3 pr-4 tabular-nums">¥{row.installment.toFixed(0)}</td>
                      <td className="py-3 pr-4 tabular-nums">¥{row.nextMonthRepayment.toFixed(0)}</td>
                      <td className="py-3 pr-4 tabular-nums">¥{row.annualReserve.toFixed(0)}</td>
                      <td className="py-3 pr-4 tabular-nums">¥{row.emergencyReserve.toFixed(0)}</td>
                      <td className={`py-3 pr-4 tabular-nums ${row.disposable < 0 ? 'text-destructive' : 'text-success'}`}>¥{row.disposable.toFixed(0)}</td>
                      <td className="py-3 pr-4 tabular-nums">¥{row.optimistic.toFixed(0)}</td>
                      <td className={`py-3 tabular-nums ${row.conservative < 0 ? 'text-destructive' : 'text-foreground'}`}>¥{row.conservative.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>未来 6 个月可支配现金</CardTitle>
              <CardDescription>负值月份自动标红，乐观/保守两条线同步展示</CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts option={disposableCashOption} style={{ height: 360 }} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>历史真实值 + 预测区间</CardTitle>
              <CardDescription>对比最近 6 个月历史净现金与未来 6 个月预测结果</CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts option={forecastOverviewOption} style={{ height: 360 }} />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
          <Card>
            <CardHeader>
              <CardTitle>预算偏差总表</CardTitle>
              <CardDescription>横向对比预算品类，并自动标记长期超预算、预算过剩、预算合理</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-3 pr-4 font-medium">品类</th>
                      <th className="py-3 pr-4 font-medium">预算</th>
                      <th className="py-3 pr-4 font-medium">实际</th>
                      <th className="py-3 pr-4 font-medium">预算差额</th>
                      <th className="py-3 pr-4 font-medium">偏离度</th>
                      <th className="py-3 pr-4 font-medium">近3月均值</th>
                      <th className="py-3 pr-4 font-medium">建议预算</th>
                      <th className="py-3 font-medium">标签</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetSuggestionRows.map((row) => (
                      <tr key={row.category} className="border-b last:border-b-0">
                        <td className="py-3 pr-4 font-medium">{row.category}</td>
                        <td className="py-3 pr-4 tabular-nums">¥{row.budgetAmount.toFixed(0)}</td>
                        <td className="py-3 pr-4 tabular-nums">¥{row.actualAmount.toFixed(0)}</td>
                        <td className={`py-3 pr-4 tabular-nums ${row.variance > 0 ? 'text-destructive' : 'text-success'}`}>¥{row.variance.toFixed(0)}</td>
                        <td className="py-3 pr-4 tabular-nums">{row.deviation.toFixed(0)}%</td>
                        <td className="py-3 pr-4 tabular-nums">¥{row.recent3MonthAvg.toFixed(0)}</td>
                        <td className="py-3 pr-4 tabular-nums">¥{row.suggestedBudget.toFixed(0)}</td>
                        <td className="py-3">
                          <Badge variant={row.label === '长期超预算' ? 'destructive' : row.label === '预算过剩' ? 'secondary' : 'outline'}>
                            {row.label}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>预算优化建议</CardTitle>
              <CardDescription>根据近 3 个月均值与预算差异自动生成建议</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {budgetSuggestionRows.slice(0, 6).map((row) => (
                <div key={row.category} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{row.category}</p>
                    <Badge variant={row.label === '长期超预算' ? 'destructive' : row.label === '预算过剩' ? 'secondary' : 'outline'}>
                      {row.label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{row.suggestion}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {flexibleTrendOption && (
          <Card>
            <CardHeader>
              <CardTitle>弹性品类跟踪曲线</CardTitle>
              <CardDescription>奶茶、餐饮、娱乐等弹性品类的月度实际值与预算值双线对比</CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts option={flexibleTrendOption} style={{ height: 360 }} />
            </CardContent>
          </Card>
        )}

        {/* 时间趋势 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>支出趋势</CardTitle>
              <CardDescription>按时间粒度查看支出变化趋势</CardDescription>
            </div>
            <Tabs
              value={timeGranularity}
              onValueChange={(v) => setTimeGranularity(v as TimeGranularity)}
            >
              <TabsList className="h-8">
                <TabsTrigger value="daily" className="text-xs px-3">日</TabsTrigger>
                <TabsTrigger value="weekly" className="text-xs px-3">周</TabsTrigger>
                <TabsTrigger value="monthly" className="text-xs px-3">月</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {trendOption ? (
              <ReactECharts option={trendOption} style={{ height: 340 }} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-12">暂无支出数据</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
