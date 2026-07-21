import { useState, useMemo, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { AlertTriangle, TrendingUp, Wallet, CreditCard, PieChart, BarChart3 } from 'lucide-react';
import { CHART_COLORS } from '@/lib/chart-colors';
import { DEFAULT_CATEGORIES, EXPENSE_ATTRIBUTE_LABELS } from '@/data/finance';
import type { ITransaction, IAccount, ExpenseAttribute } from '@/types/finance';
import { loadAccounts, loadBudgets, loadTransactions } from '@/lib/data-service';
import SummaryCards from './SummaryCards';
import BudgetProgress from './BudgetProgress';
import AlertPanel from './AlertPanel';
import RecentTransactions from './RecentTransactions';
import { formatLocalISODate, formatLocalISOYearMonth } from '@/lib/date';
import { getEffectiveTransactionDate } from '@/lib/cashflow';

type StatsPeriod = 'month' | 'quarter' | 'halfyear' | 'year';
const PERIOD_LABELS: Record<StatsPeriod, string> = {
  month: '本月',
  quarter: '近3月',
  halfyear: '半年',
  year: '全年',
};

type TimelineMode = 'expense' | 'cashflow';

export default function DashboardPage() {
  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('expense');
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>('month');
  const [rangeFrom, setRangeFrom] = useState<string>('');
  const [rangeTo, setRangeTo] = useState<string>('');

  // 初始化日期范围
  useEffect(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setRangeFrom(formatLocalISODate(monthStart));
    setRangeTo(formatLocalISODate(monthEnd));
  }, []);

  // 加载数据
  useEffect(() => {
    const loadData = async () => {
      const [txns, bdgs, accts] = await Promise.all([
        loadTransactions(),
        loadBudgets(),
        loadAccounts(),
      ]);
      setTransactions(txns);
      setBudgets(bdgs);
      setAccounts(accts);
    };
    loadData();
  }, []);

  // 辅助函数：计算日期范围
  const getDateRange = (period: StatsPeriod) => {
    const now = new Date();
    let start, end;
    switch (period) {
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'quarter':
        start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
        break;
      case 'halfyear':
        start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
    }
    return { rangeFrom: formatLocalISODate(start), rangeTo: formatLocalISODate(end) };
  };

  // 自动设置日期范围
  useEffect(() => {
    const { rangeFrom: from, rangeTo: to } = getDateRange(selectedPeriod);
    setRangeFrom(from);
    setRangeTo(to);
  }, [selectedPeriod]);

  // 筛选交易
  const filteredTransactions = useMemo(() => {
    if (!rangeFrom || !rangeTo) return [];
    return transactions.filter((txn) => {
      const date = getEffectiveTransactionDate(txn, timelineMode);
      return date >= rangeFrom && date <= rangeTo;
    });
  }, [transactions, rangeFrom, rangeTo, timelineMode]);

  // ==========================================
  // 1. 财务状态概览
  // ==========================================
  const financialOverview = useMemo(() => {
    const income = filteredTransactions
      .filter((txn) => txn.amount > 0)
      .reduce((sum, txn) => sum + txn.amount, 0);

    const expenses = filteredTransactions
      .filter((txn) => txn.amount < 0)
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0);

    const savingRate = income > 0 ? Math.max(0, Math.min(100, ((income - expenses) / income) * 100)) : 0;

    // 支出属性拆分
    const rigidExpenses = filteredTransactions
      .filter((txn) => txn.amount < 0 && inferExpenseAttribute(txn) === 'rigid_fixed')
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0);
    const flexibleExpenses = filteredTransactions
      .filter((txn) => txn.amount < 0 && inferExpenseAttribute(txn) === 'flexible_monthly')
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0);

    // 现金安全月数（估算：假设账户总余额 / 月均支出）
    const accountBalances = accounts.reduce((sum, acc) => sum + (acc.totalDebt || 0), 0);
    const monthlyAverageExpense = expenses; // 简化处理
    const cashSafetyMonths = monthlyAverageExpense > 0 ? Math.max(0, accountBalances / monthlyAverageExpense) : 0;

    // 负债压力
    const creditAccounts = accounts.filter((acc) => acc.type === 'credit_card' || acc.type === 'alipay_huabei');
    const totalDebt = creditAccounts.reduce((sum, acc) => sum + (acc.totalDebt || 0), 0);
    const monthlyRepayment = creditAccounts.reduce((sum, acc) => sum + (acc.installmentMonthlyPayment || 0), 0);
    const debtPressure = income > 0 ? Math.round((monthlyRepayment / income) * 100) : 0;

    // 预算状态
    const budgetStatus = (() => {
      const overBudgets = budgets.filter((b) => (b.used || 0) > b.amount);
      if (overBudgets.length > 0) return '超支';
      return '正常';
    })();

    return {
      income,
      expenses,
      savingRate: Math.round(savingRate),
      rigidExpenses,
      flexibleExpenses,
      cashSafetyMonths: Math.round(cashSafetyMonths * 10) / 10,
      totalDebt,
      debtPressure,
      budgetStatus,
    };
  }, [filteredTransactions, accounts, budgets]);

  // ==========================================
  // 2. 本月环比
  // ==========================================
  const monthOverMonth = useMemo(() => {
    const now = new Date();
    const thisMonthStart = formatLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1));
    const thisMonthEnd = formatLocalISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const lastMonthStart = formatLocalISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastMonthEnd = formatLocalISODate(new Date(now.getFullYear(), now.getMonth(), 0));

    const thisMonthTxns = transactions.filter(t => t.date >= thisMonthStart && t.date <= thisMonthEnd);
    const lastMonthTxns = transactions.filter(t => t.date >= lastMonthStart && t.date <= lastMonthEnd);

    const thisIncome = thisMonthTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const thisExpense = thisMonthTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const lastIncome = lastMonthTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const lastExpense = lastMonthTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

    const incomeChange = lastIncome > 0 ? ((thisIncome - lastIncome) / lastIncome * 100) : 0;
    const expenseChange = lastExpense > 0 ? ((thisExpense - lastExpense) / lastExpense * 100) : 0;
    const thisSaving = thisIncome - thisExpense;
    const lastSaving = lastIncome - lastExpense;
    const savingChange = lastSaving !== 0 ? ((thisSaving - lastSaving) / Math.abs(lastSaving) * 100) : 0;

    return { incomeChange, expenseChange, savingChange, thisIncome, thisExpense, lastIncome, lastExpense };
  }, [transactions]);

  // ==========================================
  // 3. 本月预算执行进度
  // ==========================================
  const budgetProgressData = useMemo(() => {
    const now = new Date();
    const monthStart = formatLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = formatLocalISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    return DEFAULT_CATEGORIES.map(category => {
      const budget = budgets.find((b: any) => b.category === category);
      if (!budget || budget.amount <= 0) return null;
      const actual = transactions
        .filter(t => t.amount < 0 && t.category === category && t.date >= monthStart && t.date <= monthEnd)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const progress = Math.min(100, (actual / budget.amount) * 100);
      return { category, budgetAmount: budget.amount, actualAmount: actual, progress };
    }).filter(Boolean);
  }, [transactions, budgets]);

  // ==========================================
  // 4. 预警中心
  // ==========================================
  const alerts = useMemo(() => {
    const items: { title: string; description: string; severity: 'high' | 'medium' | 'low' }[] = [];

    // 1. 负债压力
    if (financialOverview.debtPressure > 30) {
      items.push({
        title: '信用卡还款压力大',
        description: `下月还款预计占收入 ${financialOverview.debtPressure}%`,
        severity: 'high',
      });
    } else if (financialOverview.debtPressure > 20) {
      items.push({
        title: '信用卡还款压力上升',
        description: `下月还款预计占收入 ${financialOverview.debtPressure}%`,
        severity: 'medium',
      });
    }

    // 2. 预算超支
    budgetProgressData.filter((b: any) => b.progress >= 100).forEach((item: any) => {
      items.push({
        title: `${item.category} 超预算`,
        description: `已花费 ¥${item.actualAmount.toFixed(0)} / 预算 ¥${item.budgetAmount.toFixed(0)}`,
        severity: 'medium',
      });
    });

    // 3. 大额支出识别
    const largeExpenses = filteredTransactions
      .filter((txn) => Math.abs(txn.amount) > 2000)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    if (largeExpenses.length > 0) {
      largeExpenses.slice(0, 3).forEach((txn) => {
        items.push({
          title: '大额支出提醒',
          description: `${txn.date} 在 ${txn.category} 花费 ¥${Math.abs(txn.amount).toFixed(0)}`,
          severity: 'medium',
        });
      });
    }

    // 4. 储蓄率
    if (financialOverview.savingRate < 10) {
      items.push({
        title: '储蓄率偏低',
        description: `当前仅为 ${financialOverview.savingRate}%，建议保持在 20% 以上`,
        severity: 'low',
      });
    }

    return items;
  }, [financialOverview, budgetProgressData, filteredTransactions]);

  // ==========================================
  // 5. 财务趋势图
  // ==========================================
  const trendChartOption = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }

    const incomeData: number[] = [];
    const expenseData: number[] = [];
    const savingData: number[] = [];
    const monthlyTransactions: { monthKey: string; txns: ITransaction[] }[] = [];

    months.forEach((month) => {
      const monthStart = formatLocalISODate(new Date(month.getFullYear(), month.getMonth(), 1));
      const monthEnd = formatLocalISODate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
      const txnsInMonth = transactions.filter((txn) => txn.date >= monthStart && txn.date <= monthEnd);

      const income = txnsInMonth.filter((txn) => txn.amount > 0).reduce((sum, txn) => sum + txn.amount, 0);
      const expense = txnsInMonth.filter((txn) => txn.amount < 0).reduce((sum, txn) => sum + Math.abs(txn.amount), 0);
      incomeData.push(Math.round(income));
      expenseData.push(Math.round(expense));
      savingData.push(Math.round(income - expense));

      monthlyTransactions.push({
        monthKey: formatLocalISOYearMonth(month),
        txns: txnsInMonth,
      });
    });

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';

          const monthKey = params[0].axisValue;
          const monthData = monthlyTransactions.find(m => m.monthKey === monthKey);

          let result = `<strong>${monthKey}</strong><br/>`;

          params.forEach((param: any) => {
            result += `${param.marker} ${param.seriesName}: ¥${param.value.toLocaleString()}<br/>`;
          });

          if (monthData && monthData.txns.length > 0) {
            result += `<br/><strong>详细记录（${monthData.txns.length}笔）：</strong><br/>`;

            const recentTxns = monthData.txns.slice(-5).reverse();
            recentTxns.forEach((txn, idx) => {
              const sign = txn.amount > 0 ? '+' : '';
              const color = txn.amount > 0 ? 'color: #52c41a' : 'color: #ff4d4f';
              result += `<span style="${color}">${sign}¥${Math.abs(txn.amount).toLocaleString()}</span> - ${txn.category}<br/>`;
            });

            if (monthData.txns.length > 5) {
              result += `...还有 ${monthData.txns.length - 5} 笔记录`;
            }
          }

          return result;
        },
        enterable: true,
        hideDelay: 1000,
      },
      legend: { data: ['收入', '支出', '储蓄'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: months.map((m) => formatLocalISOYearMonth(m)),
      },
      yAxis: {
        type: 'value',
        name: '金额',
      },
      series: [
        { name: '收入', type: 'line', data: incomeData, smooth: true, itemStyle: { color: CHART_COLORS[0] } },
        { name: '支出', type: 'line', data: expenseData, smooth: true, itemStyle: { color: '#E54848' } },
        { name: '储蓄', type: 'line', data: savingData, smooth: true, itemStyle: { color: CHART_COLORS[1] } },
      ],
    };
  }, [transactions]);

  // ==========================================
  // 6. 分类支出分布（饼图）
  // ==========================================
  const categoryPieChartOption = useMemo(() => {
    const categoryTotals = new Map<string, number>();

    filteredTransactions
      .filter(txn => txn.amount < 0)
      .forEach(txn => {
        const current = categoryTotals.get(txn.category) || 0;
        categoryTotals.set(txn.category, current + Math.abs(txn.amount));
      });

    const pieData = Array.from(categoryTotals.entries())
      .map(([category, amount]) => ({
        name: category,
        value: Math.round(amount),
      }))
      .sort((a, b) => b.value - a.value);

    const categoryTxnsMap = new Map<string, ITransaction[]>();
    filteredTransactions
      .filter(txn => txn.amount < 0)
      .forEach(txn => {
        if (!categoryTxnsMap.has(txn.category)) {
          categoryTxnsMap.set(txn.category, []);
        }
        categoryTxnsMap.get(txn.category)!.push(txn);
      });

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const category = params.name;
          const txns = categoryTxnsMap.get(category) || [];

          let result = `<strong>${category}</strong><br/>`;
          result += `金额：¥${params.value.toLocaleString()}<br/>`;
          result += `占比：${params.percent}%<br/>`;

          if (txns.length > 0) {
            result += `<br/><strong>该分类记录（${txns.length}笔）：</strong><br/>`;
            const sortedTxns = [...txns].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
            sortedTxns.slice(0, 5).forEach(txn => {
              result += `¥${Math.abs(txn.amount).toLocaleString()} - ${txn.date}<br/>`;
            });
            if (txns.length > 5) {
              result += `...还有 ${txns.length - 5} 笔记录`;
            }
          }

          return result;
        },
        enterable: true,
        hideDelay: 1000,
      },
      legend: {
        orient: 'vertical',
        right: '10%',
        top: 'center',
      },
      series: [
        {
          name: '支出分布',
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['35%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2,
          },
          label: {
            show: false,
            position: 'center',
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 20,
              fontWeight: 'bold',
            },
          },
          labelLine: {
            show: false,
          },
          data: pieData,
        },
      ],
    };
  }, [filteredTransactions]);

  // ==========================================
  // 7. 账户支出对比（柱状图）
  // ==========================================
  const accountBarChartOption = useMemo(() => {
    const accountTotals = new Map<string, number>();

    filteredTransactions
      .filter(txn => txn.amount < 0)
      .forEach(txn => {
        const accountName = accounts.find(a => a.id === txn.accountId)?.name || '未知账户';
        const current = accountTotals.get(accountName) || 0;
        accountTotals.set(accountName, current + Math.abs(txn.amount));
      });

    const barData = Array.from(accountTotals.entries())
      .map(([account, amount]) => ({
        name: account,
        value: Math.round(amount),
      }))
      .sort((a, b) => b.value - a.value);

    const accountTxnsMap = new Map<string, ITransaction[]>();
    filteredTransactions
      .filter(txn => txn.amount < 0)
      .forEach(txn => {
        const accountName = accounts.find(a => a.id === txn.accountId)?.name || '未知账户';
        if (!accountTxnsMap.has(accountName)) {
          accountTxnsMap.set(accountName, []);
        }
        accountTxnsMap.get(accountName)!.push(txn);
      });

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';

          const accountName = params[0].name;
          const txns = accountTxnsMap.get(accountName) || [];

          let result = `<strong>${accountName}</strong><br/>`;
          result += `支出总额：¥${params[0].value.toLocaleString()}<br/>`;

          if (txns.length > 0) {
            result += `<br/><strong>该账户记录（${txns.length}笔）：</strong><br/>`;
            const sortedTxns = [...txns].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
            sortedTxns.slice(0, 5).forEach(txn => {
              result += `¥${Math.abs(txn.amount).toLocaleString()} - ${txn.category}<br/>`;
            });
            if (txns.length > 5) {
              result += `...还有 ${txns.length - 5} 笔记录`;
            }
          }

          return result;
        },
        enterable: true,
        hideDelay: 1000,
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: barData.map(d => d.name),
      },
      yAxis: {
        type: 'value',
        name: '金额',
      },
      series: [
        {
          name: '支出',
          type: 'bar',
          data: barData.map(d => d.value),
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    };
  }, [filteredTransactions, accounts]);

  // ==========================================
  // Render
  // ==========================================

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* ① 标题行 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">财务仪表盘</h1>
            <p className="text-sm text-muted-foreground mt-1">财务概况、预警与支出分析</p>
          </div>
          <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as StatsPeriod)} className="shrink-0">
            <TabsList className="h-9">
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <TabsTrigger key={value} value={value} className="px-4">{label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* ② 日期范围 + 统计口径 */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <Label>起始日期</Label>
                <Input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
              </div>
              <div>
                <Label>结束日期</Label>
                <Input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
              </div>
              <div>
                <Label>统计口径</Label>
                <Select value={timelineMode} onValueChange={(v) => setTimelineMode(v as TimelineMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">自然支出</SelectItem>
                    <SelectItem value="cashflow">实际现金流</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ③ 财务状态概览 */}
        <SummaryCards overview={financialOverview} />

        {/* ④ 本月环比 */}
        {monthOverMonth && (
          <Card>
            <CardHeader><CardTitle className="text-base">本月环比</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>本月收入</span><span className="font-semibold">¥{monthOverMonth.thisIncome.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>上月收入</span><span className="font-semibold">¥{monthOverMonth.lastIncome.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>本月支出</span><span className="font-semibold">¥{monthOverMonth.thisExpense.toLocaleString()}</span></div>
              <div className="flex justify-between"><span>上月支出</span><span className="font-semibold">¥{monthOverMonth.lastExpense.toLocaleString()}</span></div>
            </CardContent>
          </Card>
        )}

        {/* ⑤ 预警中心 */}
        <AlertPanel alerts={alerts} />

        {/* ⑥ 本月预算执行 */}
        <BudgetProgress budgetData={budgetProgressData} />

        {/* ⑦ 分类支出分布 */}
        <Card>
          <CardHeader><CardTitle className="text-base">分类支出分布</CardTitle></CardHeader>
          <CardContent>
            {categoryPieChartOption ? (
              <ReactECharts option={categoryPieChartOption} style={{ height: 320 }} />
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">暂无数据</p>
            )}
          </CardContent>
        </Card>

        {/* ⑧ 账户支出对比 */}
        <Card>
          <CardHeader><CardTitle className="text-base">账户支出对比</CardTitle></CardHeader>
          <CardContent>
            {accountBarChartOption ? (
              <ReactECharts option={accountBarChartOption} style={{ height: 320 }} />
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">暂无数据</p>
            )}
          </CardContent>
        </Card>

        {/* ⑨ 财务趋势 */}
        <Card>
          <CardHeader><CardTitle className="text-base">财务趋势</CardTitle></CardHeader>
          <CardContent>
            {trendChartOption ? (
              <ReactECharts option={trendChartOption} style={{ height: 320 }} />
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">暂无数据</p>
            )}
          </CardContent>
        </Card>

        {/* ⑩ 最近交易 */}
        <RecentTransactions transactions={filteredTransactions} accounts={accounts} />
      </main>
    </div>
  );
}

// ==========================================

function inferExpenseAttribute(txn: Partial<ITransaction>): ExpenseAttribute {
  if (txn.expenseAttribute) return txn.expenseAttribute;

  if (txn.category === '住房' || txn.category === '交通') {
    return 'rigid_fixed';
  }

  const note = txn.note || '';
  if (/年费|年度|会员|续费|保险|订阅|学费|体检/.test(note)) {
    return 'annual_cycle';
  }

  const amount = Math.abs(txn.amount || 0);
  if (amount >= 1000 && (txn.category === '购物' || txn.category === '娱乐')) {
    return 'one_time_emergency';
  }

  return 'flexible_monthly';
}
