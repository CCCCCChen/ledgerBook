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
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { CHART_COLORS } from '@/lib/chart-colors';
import { ACCOUNT_TYPE_LABELS } from '@/data/finance';
import type { ITransaction, IBudget, IAccount } from '@/types/finance';
import { loadAccounts, loadBudgets, loadTransactions } from '@/lib/data-service';
import { listBudgetSettlementsForRange } from '@/lib/finance-utils';
import { formatLocalISODate, formatLocalISOYearMonth } from '@/lib/date';
import type { BudgetWithStats } from '@/api';
import { getEffectiveTransactionDate } from '@/lib/cashflow';

type TimeGranularity = 'daily' | 'weekly' | 'monthly';
type TimelineMode = 'expense' | 'cashflow';
type WeeklyBudgetNormalizeMode = 'weeks4' | 'days';

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

export default function StatisticsPage() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithStats[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [timeGranularity, setTimeGranularity] = useState<TimeGranularity>('daily');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('expense');
  const [includeBudgetSettlement, setIncludeBudgetSettlement] = useState(true);
  const [weeklyBudgetNormalizeMode, setWeeklyBudgetNormalizeMode] = useState<WeeklyBudgetNormalizeMode>('weeks4');
  const today = new Date();
  const todayISO = formatLocalISODate(today);
  const monthStartISO = formatLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEndISO = formatLocalISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  const [rangeFrom, setRangeFrom] = useState(monthStartISO);
  const [rangeTo, setRangeTo] = useState(monthEndISO);

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

  // ---- 账户支出对比 ----
  const accountCompareOption = useMemo(() => {
    if (accounts.length === 0) return null;
    const names = accounts.map((a) => a.name);
    const values = accounts.map((a) =>
      actualExpenses.filter((t) => t.accountId === a.id).reduce((sum, t) => sum + t.amount, 0),
    );

    return {
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: names, axisLabel: { rotate: 20 } },
      yAxis: { type: 'value', name: '支出 (元)' },
      series: [
        {
          name: '总支出',
          type: 'bar',
          data: values.map((v, i) => ({
            value: v,
            itemStyle: {
              color: CHART_COLORS[i % CHART_COLORS.length],
              borderRadius: [4, 4, 0, 0],
            },
          })),
        },
      ],
    };
  }, [accounts, actualExpenses]);

  const totalExpense = useMemo(() => actualExpenses.reduce((sum, t) => sum + t.amount, 0), [actualExpenses]);
  const totalIncome = useMemo(
    () => actualTransactions.filter((t) => t.amount > 0 && t.transactionType !== 'repayment_in').reduce((sum, t) => sum + t.amount, 0),
    [actualTransactions],
  );
  const currentBalance = totalIncome - totalExpense;
  const expectedOutflow = useMemo(
    () => futureExpenseItems.reduce((sum, item) => sum + item.amount, 0),
    [futureExpenseItems],
  );
  const expectedBalance = currentBalance - expectedOutflow;

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">统计分析</h1>
          <p className="text-sm text-muted-foreground mt-1">多维度消费数据分析、预算追踪与现金流观察</p>
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="space-y-1">
              <p className="font-medium">时间范围</p>
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

        {/* 概览卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>总支出</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-destructive">
                ¥{totalExpense.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>总收入</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-success">
                ¥{totalIncome.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>交易笔数</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{actualTransactions.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>预算项目</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{budgets.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>预期结余</CardDescription>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold tabular-nums ${expectedBalance >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                ¥{expectedBalance.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {timelineMode === 'cashflow' ? '按现金流日' : '按消费日'}待发生支出 ¥{expectedOutflow.toLocaleString()}
              </p>
            </CardContent>
          </Card>
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

        {/* 分类支出分布 + 账户支出对比 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>分类支出分布</CardTitle>
              <CardDescription>各消费分类的支出占比</CardDescription>
            </CardHeader>
            <CardContent>
              <ReactECharts option={categoryPieOption} style={{ height: 320 }} />
            </CardContent>
          </Card>

          {accountCompareOption && (
            <Card>
              <CardHeader>
                <CardTitle>账户支出对比</CardTitle>
                <CardDescription>各账户总支出金额对比</CardDescription>
              </CardHeader>
              <CardContent>
                <ReactECharts option={accountCompareOption} style={{ height: 320 }} />
              </CardContent>
            </Card>
          )}
        </div>

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
