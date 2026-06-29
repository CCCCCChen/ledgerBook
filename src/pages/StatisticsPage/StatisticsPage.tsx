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

type TimeGranularity = 'daily' | 'weekly' | 'monthly';

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

function getMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
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
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function StatisticsPage() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [budgets, setBudgets] = useState<IBudget[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [timeGranularity, setTimeGranularity] = useState<TimeGranularity>('daily');
  const [includeBudgetSettlement, setIncludeBudgetSettlement] = useState(true);
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const monthStartISO = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const monthEndISO = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
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
    () => transactions.filter((transaction) => transaction.date >= rangeFrom && transaction.date <= rangeTo),
    [transactions, rangeFrom, rangeTo],
  );

  const actualCutoff = useMemo(() => (todayISO < rangeTo ? todayISO : rangeTo), [todayISO, rangeTo]);

  const actualTransactions = useMemo(
    () => filteredTransactions.filter((transaction) => transaction.date <= actualCutoff),
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
      .filter((transaction) => transaction.amount < 0 && transaction.date > actualCutoff && transaction.date >= futureFrom)
      .map((transaction) => ({ ...transaction, amount: Math.abs(transaction.amount) }));
  }, [filteredTransactions, actualCutoff, futureFrom, rangeTo]);

  const budgetSettlementItems = useMemo(
    () =>
      listBudgetSettlementsForRange(budgets, transactions, rangeFrom, rangeTo)
        .filter((item) => item.expectedAmount > 0)
        .filter((item) => item.cycleEnd >= futureFrom),
    [budgets, transactions, rangeFrom, rangeTo, futureFrom],
  );

  const futureExpenseItems = useMemo(() => {
    const transactionItems = futureExpenseTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.transactionType === 'installment_bill' ? 'installment' : 'future',
      title: transaction.note || '未来支出',
      date: transaction.date,
      amount: transaction.amount,
      accountId: transaction.accountId,
    }));
    const budgetItems = includeBudgetSettlement
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

  const rangeBudgetUsedMap = useMemo(() => {
    const map: Record<string, number> = {};
    filteredTransactions.forEach((transaction) => {
      if (transaction.amount >= 0) return;
      if (!transaction.budgetId) return;
      map[transaction.budgetId] = (map[transaction.budgetId] || 0) + Math.abs(transaction.amount);
    });
    return map;
  }, [filteredTransactions]);

  // ---- 超支预警 ----
  const overBudgetAlerts = useMemo(() => {
    return budgets
      .map((b) => {
        const used = rangeBudgetUsedMap[b.id] || 0;
        const rate = b.amount > 0 ? used / b.amount : 0;
        return { ...b, used, rate };
      })
      .filter((b) => b.rate > 0.8)
      .sort((a, b) => b.rate - a.rate);
  }, [budgets, rangeBudgetUsedMap]);

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
    const names = budgets.map((b) => b.name);
    const budgetAmounts = budgets.map((b) => b.amount);
    const usedAmounts = budgets.map((budget) => rangeBudgetUsedMap[budget.id] || 0);

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
  }, [budgets, rangeBudgetUsedMap]);

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

    const sorted = [...actualExpenses].sort((a, b) => a.date.localeCompare(b.date));
    const buckets: Record<string, number> = {};

    sorted.forEach((t) => {
      const d = new Date(t.date);
      let key: string;
      if (timeGranularity === 'daily') {
        key = t.date;
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
          <p className="text-sm text-muted-foreground mt-1">多维度消费数据分析与预算追踪</p>
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
              <p className="text-2xl font-bold tabular-nums">{transactions.length}</p>
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
              <p className="text-xs text-muted-foreground mt-1">本月待发生支出 ¥{expectedOutflow.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="font-medium">预期支出设置</p>
              <p className="text-sm text-muted-foreground">开启后会将当前月内到期的预算结算额纳入预期结余</p>
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
              <CardDescription>展示本月尚未发生的分期账单、未来支出和预算结算</CardDescription>
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
                variant={b.rate >= 1 ? 'destructive' : 'default'}
                className="cursor-pointer"
                onClick={() => navigate('/budgets')}
              >
                <AlertTriangle className="size-4" />
                <AlertTitle className="flex items-center gap-2">
                  {b.name}
                  <Badge variant={b.rate >= 1 ? 'destructive' : 'secondary'} className="text-xs">
                    {b.rate >= 1 ? '已超支' : '即将超支'}
                  </Badge>
                </AlertTitle>
                <AlertDescription>
                  已使用 ¥{b.used.toFixed(0)} / 预算 ¥{b.amount}（{(b.rate * 100).toFixed(0)}%）
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {/* 账单周期统计 */}
        {billingCycleOption && (
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
            <CardHeader>
              <CardTitle>预算执行对比</CardTitle>
              <CardDescription>预算金额 vs 实际已使用金额</CardDescription>
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
