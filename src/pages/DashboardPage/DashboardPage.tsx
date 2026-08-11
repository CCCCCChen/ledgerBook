import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { AlertTriangle, TrendingUp, Wallet, CreditCard, PieChart, BarChart3, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Pencil, ShieldAlert, X, CalendarClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CHART_COLORS } from '@/lib/chart-colors';
import { DEFAULT_CATEGORIES, EXPENSE_ATTRIBUTE_LABELS } from '@/data/finance';
import type { ITransaction, IAccount, ExpenseAttribute } from '@/types/finance';
import { loadAccounts, loadBudgets, loadTransactions } from '@/lib/data-service';
import SummaryCards from './SummaryCards';
import BudgetProgress from './BudgetProgress';
import AlertPanel from './AlertPanel';
import RecentTransactions from './RecentTransactions';
import DashboardSkeleton from './DashboardSkeleton';
import { formatLocalISODate, formatLocalISOYearMonth } from '@/lib/date';
import { getEffectiveTransactionDate } from '@/lib/cashflow';
import { getDefaultTimeRange, shiftTimeRange, getMonthLabel } from '@shared/TimeRange';
import { aggregateExpenses, classifyPlanStatus } from '@shared/expense-aggregation';
import type { PlanStatus } from '@shared/expense-aggregation';
import type { TimeRange } from '@shared/TimeRange';
import { normalizeBudgetToCurrentMonth } from '@shared/installment-utils';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

type StatsPeriod = 'month' | 'quarter' | 'halfyear' | 'year';
const PERIOD_LABELS: Record<StatsPeriod, string> = {
  month: '本月',
  quarter: '近3月',
  halfyear: '半年',
  year: '全年',
};

type TimelineMode = 'expense' | 'cashflow';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('expense');
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>('month');
  const [rangeFrom, setRangeFrom] = useState<string>('');
  const [rangeTo, setRangeTo] = useState<string>('');
  const [timeRange, setTimeRange] = useState<TimeRange>(getDefaultTimeRange());
  const [planStatusFilter, setPlanStatusFilter] = useState<PlanStatus | null>(null);
  const [trendDimension, setTrendDimension] = useState<'amount' | 'proportion' | 'deviation'>('amount');
  const [zoomMonths, setZoomMonths] = useState<Set<string> | null>(null);

  // 键盘快捷键
  useKeyboardShortcuts({
    onShiftMonth: (dir) => setTimeRange((prev) => shiftTimeRange(prev, dir as 1 | -1)),
    onSearch: () => navigate('/'),
    timeRange,
  });

  // 撤销 Toast：时间范围切换后 5s 内可撤销
  const prevTimeRangeRef = useRef<TimeRange>(timeRange);
  const undoTimeRange = useCallback((next: TimeRange) => {
    const prev = timeRange;
    prevTimeRangeRef.current = prev;
    setTimeRange(next);
    toast(`${getMonthLabel(next)}`, {
      description: '按撤销可返回上一时间范围',
      duration: 5000,
      action: {
        label: '撤销',
        onClick: () => {
          setTimeRange(prevTimeRangeRef.current);
        },
      },
    });
  }, [timeRange]);

  // 同步 timeRange 到日期范围
  useEffect(() => {
    setRangeFrom(formatLocalISODate(timeRange.start));
    setRangeTo(formatLocalISODate(timeRange.end));
  }, [timeRange]);

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
      setLoading(false);
    };
    loadData();
  }, []);

  // 信用卡/花呗还款属于内部转账，不纳入收入/支出合计
  const REPAYMENT_CATEGORIES = new Set(['信用卡还款', '花呗还款']);
  const isRepayment = (txn: ITransaction) => REPAYMENT_CATEGORIES.has(txn.category);

  // 辅助函数：计算日期范围
  const getDateRange = (period: StatsPeriod) => {
    const now = new Date();
    let start, end;
    switch (period) {
      case 'month':
        start = timeRange.start;
        end = timeRange.end;
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
    if (selectedPeriod === 'month') {
      const tr = getDefaultTimeRange();
      setTimeRange(tr);
      return;
    }
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
  // D7 — 计划状态逐笔标注（用于计数 + 过滤联动）
  // ==========================================
  const transactionPlanStatuses = useMemo(() => {
    const result = new Map<number | string, PlanStatus>();
    const budgetMap = new Map(budgets.map((b: any) => [String(b.id), b]));
    const budgetAccUsed = new Map<string, number>();

    const expenses = transactions
      .filter(t => t.amount < 0 && t.date >= formatLocalISODate(timeRange.start) && t.date <= formatLocalISODate(timeRange.end))
      .sort((a, b) => a.date.localeCompare(b.date));

    expenses.forEach(t => {
      const ps = classifyPlanStatus(t as any, budgetMap, budgetAccUsed);
      result.set(t.id!, ps);
      if (t.budgetId) {
        const key = String(t.budgetId);
        budgetAccUsed.set(key, (budgetAccUsed.get(key) || 0) + Math.abs(t.amount));
      }
    });
    return result;
  }, [transactions, budgets, timeRange]);

  // D7: 过滤联动 — 点击卡片后筛选交易
  const statusFilteredTransactions = useMemo(() => {
    if (!planStatusFilter) return filteredTransactions;
    return filteredTransactions.filter(t => {
      if (t.amount >= 0) return true;
      return transactionPlanStatuses.get(t.id!) === planStatusFilter;
    });
  }, [filteredTransactions, transactionPlanStatuses, planStatusFilter]);

  // zoomMonths 联动过滤最近交易
  const trendFilteredTransactions = useMemo(() => {
    if (!zoomMonths) return statusFilteredTransactions;
    return statusFilteredTransactions.filter((txn) => {
      const m = txn.date.substring(0, 7); // YYYY-MM
      return zoomMonths.has(m);
    });
  }, [statusFilteredTransactions, zoomMonths]);

  // ==========================================
  // 1. 财务状态概览
  // ==========================================
  const financialOverview = useMemo(() => {
    const income = statusFilteredTransactions
      .filter((txn) => txn.amount > 0 && !isRepayment(txn))
      .reduce((sum, txn) => sum + txn.amount, 0);

    const expenses = statusFilteredTransactions
      .filter((txn) => txn.amount < 0 && !isRepayment(txn))
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0);

    const savingRate = income > 0 ? Math.max(0, Math.min(100, ((income - expenses) / income) * 100)) : 0;

    // 支出属性拆分
    const rigidExpenses = statusFilteredTransactions
      .filter((txn) => txn.amount < 0 && inferExpenseAttribute(txn) === 'rigid_fixed')
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0);
    const flexibleExpenses = statusFilteredTransactions
      .filter((txn) => txn.amount < 0 && inferExpenseAttribute(txn) === 'flexible_monthly')
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0);

    // 现金安全月数（估算：账户总余额 / 月均支出）
    const accountBalances = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
    const monthlyAverageExpense = expenses;
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
  }, [statusFilteredTransactions, accounts, budgets]);

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

    const thisIncome = thisMonthTxns.filter(t => t.amount > 0 && !isRepayment(t)).reduce((s, t) => s + t.amount, 0);
    const thisExpense = thisMonthTxns.filter(t => t.amount < 0 && !isRepayment(t)).reduce((s, t) => s + Math.abs(t.amount), 0);
    const lastIncome = lastMonthTxns.filter(t => t.amount > 0 && !isRepayment(t)).reduce((s, t) => s + t.amount, 0);
    const lastExpense = lastMonthTxns.filter(t => t.amount < 0 && !isRepayment(t)).reduce((s, t) => s + Math.abs(t.amount), 0);

    const incomeChange = lastIncome > 0 ? ((thisIncome - lastIncome) / lastIncome * 100) : 0;
    const expenseChange = lastExpense > 0 ? ((thisExpense - lastExpense) / lastExpense * 100) : 0;
    const thisSaving = thisIncome - thisExpense;
    const lastSaving = lastIncome - lastExpense;
    const savingChange = lastSaving !== 0 ? ((thisSaving - lastSaving) / Math.abs(lastSaving) * 100) : 0;

    return { incomeChange, expenseChange, savingChange, thisIncome, thisExpense, lastIncome, lastExpense };
  }, [transactions]);

  // ==========================================
  // 3. 本月预算执行进度
  //    需求：同分类同时有周预算 + 月预算 → 累加折算后的当月口径
  //      weekly   amount × 4.345
  //      monthly  amount × 当月已过天数比例
  //      yearly   amount ÷ 12
  //      custom   amount × (自定义周期&当月重叠天数 / 周期天数)
  // ==========================================
  const aggregated = useMemo(() => {
    return aggregateExpenses({
      transactions,
      budgets,
      refDate: timeRange.start,
      monthStart: formatLocalISODate(timeRange.start),
      monthEnd: formatLocalISODate(timeRange.end),
    });
  }, [transactions, budgets, timeRange]);

  // D7: 上月聚合（用于环比 MoM）
  const prevAggregated = useMemo(() => {
    const prevStart = new Date(timeRange.start.getFullYear(), timeRange.start.getMonth() - 1, 1);
    const prevEnd = new Date(timeRange.start.getFullYear(), timeRange.start.getMonth(), 0);
    return aggregateExpenses({
      transactions,
      budgets,
      refDate: prevStart,
      monthStart: formatLocalISODate(prevStart),
      monthEnd: formatLocalISODate(prevEnd),
    });
  }, [transactions, budgets, timeRange]);

  // D7: 四张计划状态卡片数据
  type PlanStatusCard = {
    key: PlanStatus;
    label: string;
    amount: number;
    count: number;
    pct: number;
    prevPct: number;
    icon: typeof CheckCircle2;
    colorClass: string;
    bgClass: string;
    borderClass: string;
  };

  const planStatusMeta = useMemo((): Array<{ key: PlanStatus; label: string; icon: typeof CheckCircle2; colorClass: string; bgClass: string; borderClass: string }> => [
    { key: 'planned', label: '计划内', icon: CheckCircle2, colorClass: 'text-emerald-600', bgClass: 'bg-emerald-50', borderClass: 'border-emerald-200' },
    { key: 'over_budget', label: '超预算', icon: AlertCircle, colorClass: 'text-rose-600', bgClass: 'bg-rose-50', borderClass: 'border-rose-200' },
    { key: 'unplanned_adjustment', label: '计划外调整', icon: Pencil, colorClass: 'text-amber-600', bgClass: 'bg-amber-50', borderClass: 'border-amber-200' },
    { key: 'unexpected', label: '意外支出', icon: ShieldAlert, colorClass: 'text-red-600', bgClass: 'bg-red-50', borderClass: 'border-red-200' },
  ], []);

  const planStatusCards = useMemo((): PlanStatusCard[] => {
    const { planStatusSummary, totalExpense } = aggregated.overall;
    const prevTotal = prevAggregated.overall.totalExpense || 1;

    const statusCounts: Record<PlanStatus, number> = { planned: 0, over_budget: 0, unexpected: 0, unplanned_adjustment: 0 };
    transactionPlanStatuses.forEach(ps => { statusCounts[ps]++; });

    return planStatusMeta.map(d => ({
      ...d,
      amount: planStatusSummary[d.key],
      count: statusCounts[d.key],
      pct: totalExpense > 0 ? Math.round((planStatusSummary[d.key] / totalExpense) * 100) : 0,
      prevPct: prevTotal > 0 ? Math.round((prevAggregated.overall.planStatusSummary[d.key] / prevTotal) * 100) : 0,
    }));
  }, [aggregated, prevAggregated, transactionPlanStatuses]);

  // ==========================================
  // D8 — 分类矩阵（类别 × 计划状态）
  // ==========================================
  const [selectedMatrixCell, setSelectedMatrixCell] = useState<{ category: string; status: PlanStatus } | null>(null);

  type MatrixCell = { category: string; status: PlanStatus; amount: number; count: number; txns: ITransaction[] };

  const categoryPlanStatusMatrix = useMemo((): MatrixCell[] => {
    const cells: Record<string, Record<string, { amount: number; count: number; txns: ITransaction[] }>> = {};
    const allCategories = new Set<string>();

    statusFilteredTransactions
      .filter(t => t.amount < 0)
      .forEach(t => {
        const cat = t.category || '其他';
        const ps = transactionPlanStatuses.get(t.id!) || 'unplanned_adjustment';
        allCategories.add(cat);
        if (!cells[cat]) cells[cat] = {};
        if (!cells[cat][ps]) cells[cat][ps] = { amount: 0, count: 0, txns: [] };
        cells[cat][ps].amount += Math.abs(t.amount);
        cells[cat][ps].count += 1;
        cells[cat][ps].txns.push(t);
      });

    const statuses: PlanStatus[] = ['planned', 'over_budget', 'unplanned_adjustment', 'unexpected'];
    const result: MatrixCell[] = [];
    for (const cat of Array.from(allCategories).sort()) {
      for (const st of statuses) {
        const c = cells[cat]?.[st];
        result.push({ category: cat, status: st, amount: c?.amount || 0, count: c?.count || 0, txns: c?.txns || [] });
      }
    }
    return result;
  }, [statusFilteredTransactions, transactionPlanStatuses]);

  // 矩阵中最大金额（用于热力图颜色映射）
  const matrixMaxAmount = useMemo(
    () => Math.max(1, ...categoryPlanStatusMatrix.map(c => c.amount)),
    [categoryPlanStatusMatrix],
  );

  const budgetProgressData = useMemo(() => {
    const catMap = new Map(aggregated.budgetProgressByCategory.map(bp => [bp.category, bp]));
    return DEFAULT_CATEGORIES
      .map(category => {
        const bp = catMap.get(category);
        if (!bp || bp.budgetAmount <= 0) return null;
        return {
          category,
          budgetAmount: bp.budgetAmount,
          actualAmount: bp.used,
          progress: bp.rate,
        };
      })
      .filter(Boolean);
  }, [aggregated]);

  // ==========================================
  // 4. 预警中心
  // ==========================================
  const alerts = useMemo(() => {
    const items: { title: string; description: string; severity: 'high' | 'medium' | 'low'; target?: string }[] = [];

    // 1. 负债压力
    if (financialOverview.debtPressure > 30) {
      items.push({
        title: '信用卡还款压力大',
        description: `下月还款预计占收入 ${financialOverview.debtPressure}%`,
        severity: 'high',
        target: '/credit-debt',
      });
    } else if (financialOverview.debtPressure > 20) {
      items.push({
        title: '信用卡还款压力上升',
        description: `下月还款预计占收入 ${financialOverview.debtPressure}%`,
        severity: 'medium',
        target: '/credit-debt',
      });
    }

    // 2. 预算超支（按超出比例分级：≥200% high / 150-200% medium / <150% low）
    budgetProgressData.filter((b: any) => b.progress >= 100).forEach((item: any) => {
      const ratio = item.actualAmount / item.budgetAmount;
      const severity: 'high' | 'medium' | 'low' = ratio >= 2 ? 'high' : ratio >= 1.5 ? 'medium' : 'low';
      items.push({
        title: `${item.category} 超预算`,
        description: `已花费 ¥${item.actualAmount.toFixed(0)} / 预算 ¥${item.budgetAmount.toFixed(0)}`,
        severity,
        target: '/budgets',
      });
    });

    // 3. 大额支出识别
    const largeExpenses = statusFilteredTransactions
      .filter((txn) => Math.abs(txn.amount) > 2000)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    if (largeExpenses.length > 0) {
      largeExpenses.slice(0, 3).forEach((txn) => {
        items.push({
          title: '大额支出提醒',
          description: `${txn.date} 在 ${txn.category} 花费 ¥${Math.abs(txn.amount).toFixed(0)}`,
          severity: 'medium',
          target: '/',
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
  }, [financialOverview, budgetProgressData, statusFilteredTransactions]);

  // ==========================================
  // 5. 财务趋势图
  // ==========================================
  const trendMonthLabels = useMemo(() => {
    const months: Date[] = [];
    const monthCounts: Record<StatsPeriod, number> = { month: 1, quarter: 3, halfyear: 6, year: 12 };
    const count = monthCounts[selectedPeriod] || 6;
    const anchorEnd = selectedPeriod === 'month' ? new Date(timeRange.end) : new Date();
    for (let i = count - 1; i >= 0; i--) {
      months.push(new Date(anchorEnd.getFullYear(), anchorEnd.getMonth() - i, 1));
    }
    return months.map((m) => formatLocalISOYearMonth(m));
  }, [selectedPeriod, timeRange]);

  const trendChartOption = useMemo(() => {
    const months: Date[] = [];
    const monthCounts: Record<StatsPeriod, number> = { month: 1, quarter: 3, halfyear: 6, year: 12 };
    const count = monthCounts[selectedPeriod] || 6;
    const anchorEnd = selectedPeriod === 'month' ? new Date(timeRange.end) : new Date();
    for (let i = count - 1; i >= 0; i--) {
      months.push(new Date(anchorEnd.getFullYear(), anchorEnd.getMonth() - i, 1));
    }

    const incomeData: number[] = [];
    const expenseData: number[] = [];
    const savingData: number[] = [];
    const deviationData: number[] = [];
    const budgetData: number[] = [];
    const monthlyTransactions: { monthKey: string; txns: ITransaction[] }[] = [];

    months.forEach((month) => {
      const monthStart = formatLocalISODate(new Date(month.getFullYear(), month.getMonth(), 1));
      const monthEnd = formatLocalISODate(new Date(month.getFullYear(), month.getMonth() + 1, 0));
      const txnsInMonth = transactions.filter((txn) => txn.date >= monthStart && txn.date <= monthEnd);

      const income = txnsInMonth.filter((txn) => txn.amount > 0 && !isRepayment(txn)).reduce((sum, txn) => sum + txn.amount, 0);
      const expense = txnsInMonth.filter((txn) => txn.amount < 0 && !isRepayment(txn)).reduce((sum, txn) => sum + Math.abs(txn.amount), 0);
      incomeData.push(Math.round(income));
      expenseData.push(Math.round(expense));
      savingData.push(Math.round(income - expense));

      // 偏离维度数据
      const midMonth = new Date(month.getFullYear(), month.getMonth(), 15);
      const totalBudget = budgets.reduce((sum, b) => {
        const norm = normalizeBudgetToCurrentMonth(b, { refDate: midMonth });
        return sum + (norm?.normalizedBudgetAmount ?? 0);
      }, 0);
      budgetData.push(Math.round(totalBudget));
      deviationData.push(Math.round(expense - totalBudget));

      monthlyTransactions.push({
        monthKey: formatLocalISOYearMonth(month),
        txns: txnsInMonth,
      });
    });

    // 截至今日竖线标记：本月非月末时在当前月位置添加标记
    const today = new Date();
    const isLastDayOfMonth = today.getDate() === new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const todayMonthLabel = formatLocalISOYearMonth(today);
    const todayIndex = trendMonthLabels.indexOf(todayMonthLabel);
    const todayMarkLine = todayIndex >= 0 && !isLastDayOfMonth
      ? {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed' as const, color: '#faad14', width: 1.5 },
          data: [{ xAxis: todayMonthLabel, label: { formatter: '截至今日', fontSize: 11 } }],
        }
      : undefined;

    // ---- 金额维度 ----
    if (trendDimension === 'amount') {
      return {
        animationDurationUpdate: 500,
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
              recentTxns.forEach((txn) => {
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
        xAxis: { type: 'category', data: trendMonthLabels, ...(todayMarkLine ? { markLine: todayMarkLine } : {}) },
        yAxis: { type: 'value', name: '金额' },
        series: [
          { name: '收入', type: 'line', data: incomeData, smooth: true, itemStyle: { color: CHART_COLORS[0] } },
          { name: '支出', type: 'line', data: expenseData, smooth: true, itemStyle: { color: '#E54848' } },
          { name: '储蓄', type: 'line', data: savingData, smooth: true, itemStyle: { color: CHART_COLORS[1] } },
        ],
        dataZoom: [
          { type: 'slider', start: 0, end: 100, height: 20, bottom: 0 },
          { type: 'inside' },
        ],
      };
    }

    // ---- 占比维度 ----
    if (trendDimension === 'proportion') {
      const expenseRateData = incomeData.map((inc, i) => inc > 0 ? Math.round(expenseData[i] / inc * 100) : 0);
      const savingRateData = incomeData.map((inc, i) => inc > 0 ? Math.round(savingData[i] / inc * 100) : 0);
      return {
        animationDurationUpdate: 500,
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            if (!params || params.length === 0) return '';
            let result = `<strong>${params[0].axisValue}</strong><br/>`;
            params.forEach((param: any) => {
              result += `${param.marker} ${param.seriesName}: ${param.value}%<br/>`;
            });
            return result;
          },
        },
        legend: { data: ['支出率', '储蓄率'], bottom: 0 },
        grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
        xAxis: { type: 'category', data: trendMonthLabels, ...(todayMarkLine ? { markLine: todayMarkLine } : {}) },
        yAxis: { type: 'value', name: '占比 (%)', max: 100, axisLabel: { formatter: '{value}%' } },
        series: [
          { name: '支出率', type: 'line', data: expenseRateData, smooth: true, itemStyle: { color: '#E54848' }, areaStyle: { opacity: 0.08, color: '#E54848' } },
          { name: '储蓄率', type: 'line', data: savingRateData, smooth: true, itemStyle: { color: CHART_COLORS[0] }, areaStyle: { opacity: 0.08, color: CHART_COLORS[0] } },
        ],
        dataZoom: [
          { type: 'slider', start: 0, end: 100, height: 20, bottom: 0 },
          { type: 'inside' },
        ],
      };
    }

    // ---- 偏离维度 ----
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const idx = params[0].dataIndex;
          const actual = expenseData[idx];
          const budget = budgetData[idx];
          const diff = actual - budget;
          const color = diff > 0 ? '#E54848' : '#52c41a';
          const sign = diff > 0 ? '超支' : '结余';
          let result = `<strong>${trendMonthLabels[idx]}</strong><br/>`;
          result += `实际支出: ¥${actual.toLocaleString()}<br/>`;
          result += `预算: ¥${budget.toLocaleString()}<br/>`;
          result += `<span style="color:${color};font-weight:bold">${sign} ¥${Math.abs(diff).toLocaleString()}</span>`;
          return result;
        },
      },
      legend: { data: ['偏离'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: { type: 'category', data: trendMonthLabels, ...(todayMarkLine ? { markLine: todayMarkLine } : {}) },
      yAxis: { type: 'value', name: '偏离 (¥)', axisLabel: { formatter: (v: number) => (v >= 0 ? '+' : '') + v.toLocaleString() } },
      series: [
        {
          name: '偏离',
          type: 'bar',
          data: deviationData,
        },
      ],
      dataZoom: [
        { type: 'slider', start: 0, end: 100, height: 20, bottom: 0 },
        { type: 'inside' },
      ],
    };
  }, [transactions, selectedPeriod, timeRange, trendDimension, budgets, trendMonthLabels]);

  // ==========================================
  // 6. 分类支出分布（饼图）
  // ==========================================
  const categoryPieChartOption = useMemo(() => {
    const categoryTotals = new Map<string, number>();

    statusFilteredTransactions
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
    statusFilteredTransactions
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
              const label = txn.note.trim() || '（无备注）';
              result += `${label} - ¥${Math.abs(txn.amount).toLocaleString()} (${txn.date})<br/>`;
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
  }, [statusFilteredTransactions]);

  // ==========================================
  // 7. 账户支出对比（柱状图）
  // ==========================================
  const accountBarChartOption = useMemo(() => {
    const accountTotals = new Map<string, number>();

    statusFilteredTransactions
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
    statusFilteredTransactions
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
  }, [statusFilteredTransactions, accounts]);

  // ==========================================
  // Render
  // ==========================================

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      {/* ① 标题行 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">财务仪表盘</h1>
            {selectedPeriod === 'month' && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-2"
                  onClick={() => undoTimeRange(shiftTimeRange(timeRange, -1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[80px] text-center tabular-nums">
                  {getMonthLabel(timeRange)}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => undoTimeRange(shiftTimeRange(timeRange, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">财务概况、预警与支出分析</p>
        </div>
          <Tabs value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as StatsPeriod)} className="shrink-0">
            <TabsList className="h-9">
              {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                <TabsTrigger key={value} value={value} className="px-4">{label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => navigate(`/forecast?from=${rangeFrom}&to=${rangeTo}`)}
          >
            <CalendarClock className="h-4 w-4" />
            现金流预测
          </Button>
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

        {/* D7 计划状态总览卡 */}
        <div className="grid grid-cols-4 gap-3">
          {planStatusCards.map(card => {
            const isActive = planStatusFilter === card.key;
            const isUnexpected = card.key === 'unexpected';
            const showWarning = isUnexpected && card.pct > 10;
            const moMDiff = card.pct - card.prevPct;
            const moMSign = moMDiff > 0 ? '+' : '';
            const Icon = card.icon;

            return (
              <div
                key={card.key}
                onClick={() => setPlanStatusFilter(isActive ? null : card.key)}
                className={`
                  cursor-pointer rounded-lg border-2 p-3 transition-all
                  ${card.bgClass} ${card.borderClass}
                  ${isActive ? 'ring-2 ring-offset-1 ring-primary shadow-md' : 'hover:shadow-sm'}
                  ${showWarning ? 'border-red-500 bg-red-50 ring-1 ring-red-300' : ''}
                `}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`h-4 w-4 ${card.colorClass}`} />
                  <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
                </div>
                <div className="text-lg font-bold">¥{card.amount.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{card.count} 笔</div>
                <div
                  className="text-xs font-semibold mt-0.5"
                  title={`上月占比 ${card.prevPct}%${moMDiff !== 0 ? `（${moMSign}${moMDiff}%）` : '（持平）'}`}
                >
                  <span className={showWarning ? 'text-red-600' : card.colorClass}>
                    {card.pct}%
                  </span>
                  {moMDiff !== 0 && (
                    <span className={`ml-0.5 ${moMDiff > 0 ? (isUnexpected ? 'text-red-500' : 'text-rose-500') : 'text-emerald-500'}`}>
                      {moMSign}{moMDiff}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ========== D8 分类矩阵 ========== */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">分类 × 计划状态矩阵</CardTitle>
            <CardDescription>金额色深越大 → 支出越多；点击单元格查看明细</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-1.5 px-2 font-medium text-muted-foreground text-xs w-20">类别</th>
                    {(['planned', 'over_budget', 'unplanned_adjustment', 'unexpected'] as PlanStatus[]).map(st => {
                      const meta = planStatusMeta.find(m => m.key === st)!;
                      const Icon = meta.icon;
                      return (
                        <th key={st} className={`text-center py-1.5 px-1 font-medium text-xs ${meta.colorClass}`}>
                          <div className="flex items-center justify-center gap-0.5">
                            <Icon className="h-3 w-3" />
                            <span>{meta.label}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const categories = Array.from(new Set(categoryPlanStatusMatrix.map(c => c.category)));
                    return categories.map(cat => (
                      <tr key={cat}>
                        <td className="py-1 px-2 font-medium text-xs whitespace-nowrap">{cat}</td>
                        {(['planned', 'over_budget', 'unplanned_adjustment', 'unexpected'] as PlanStatus[]).map(st => {
                          const cell = categoryPlanStatusMatrix.find(c => c.category === cat && c.status === st)!;
                          // 热力图颜色：从最浅到最深
                          const ratio = cell.amount / matrixMaxAmount;
                          const blueIntensity = Math.round(ratio * 220);
                          const bgColor = cell.amount > 0
                            ? `rgba(59, 130, 246, ${(0.08 + ratio * 0.55).toFixed(2)})`
                            : 'transparent';
                          const selected = selectedMatrixCell?.category === cat && selectedMatrixCell?.status === st;
                          return (
                            <td
                              key={st}
                              className={`text-center py-1.5 px-1 cursor-pointer transition-colors rounded ${selected ? 'ring-2 ring-blue-400' : ''}`}
                              style={{ backgroundColor: bgColor }}
                              onClick={() => setSelectedMatrixCell(cell.count > 0 ? { category: cat, status: st } : null)}
                              title={cell.amount > 0 ? `${cat} · ${planStatusMeta.find(m => m.key === st)!.label}：¥${cell.amount.toLocaleString()}（${cell.count}笔）` : '无数据'}
                            >
                              {cell.amount > 0 ? (
                                <>
                                  <div className="font-semibold text-xs" style={{ color: `rgb(${Math.round(30 + ratio * 160)}, ${Math.round(64 - ratio * 30)}, ${Math.round(210 - ratio * 100)})` }}>
                                    ¥{cell.amount >= 1000 ? `${(cell.amount / 1000).toFixed(1)}k` : cell.amount.toLocaleString()}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">{cell.count}笔</div>
                                </>
                              ) : (
                                <span className="text-muted-foreground/30 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
            {categoryPlanStatusMatrix.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">暂无数据</p>
            )}
          </CardContent>
        </Card>

        {/* D8 明细抽屉 */}
        {selectedMatrixCell && (() => {
          const drawerCell = categoryPlanStatusMatrix.find(
            c => c.category === selectedMatrixCell!.category && c.status === selectedMatrixCell!.status
          )!;
          const stMeta = planStatusMeta.find(m => m.key === drawerCell.status)!;
          return (
            <>
              <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedMatrixCell(null)} />
              <div className="fixed right-0 top-0 h-full w-96 bg-background border-l z-50 overflow-y-auto shadow-xl animate-slide-in-right">
                <div className="p-4 border-b sticky top-0 bg-background z-10 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">{drawerCell.category}</h3>
                    <p className={`text-xs flex items-center gap-1 mt-0.5 ${stMeta.colorClass}`}>
                      <stMeta.icon className="h-3 w-3" />{stMeta.label}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedMatrixCell(null)} className="h-7 w-7">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="p-4">
                  <div className="flex gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">合计</span>
                      <span className="font-semibold ml-2">¥{drawerCell.amount.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">笔数</span>
                      <span className="font-semibold ml-2">{drawerCell.count}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {drawerCell.txns.map(txn => {
                      const acct = accounts.find(a => a.id === txn.accountId);
                      return (
                        <div key={txn.id} className="p-2.5 border rounded-md text-sm hover:bg-accent/50 transition-colors">
                          <div className="flex justify-between items-start">
                            <span className="font-medium">{txn.note || '无备注'}</span>
                            <span className="font-semibold text-rose-600">¥{Math.abs(txn.amount).toLocaleString()}</span>
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                            <span>{txn.date}</span>
                            {acct && <span>{acct.name}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* ④ 本月环比 */}
        {monthOverMonth && (() => {
          const incomeDiff = monthOverMonth.thisIncome - monthOverMonth.lastIncome;
          const incomeUp = incomeDiff >= 0;
          const expenseDiff = monthOverMonth.thisExpense - monthOverMonth.lastExpense;
          const expenseUp = expenseDiff >= 0;
          return (
          <Card>
            <CardHeader><CardTitle className="text-base">本月环比</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>本月收入</span><span className="font-semibold">¥{monthOverMonth.thisIncome.toLocaleString()}</span></div>
              <div className="flex justify-between">
                <span>上月收入</span>
                <span className={incomeUp ? 'text-emerald-600' : 'text-rose-600'}>
                  <span className="font-semibold">¥{monthOverMonth.lastIncome.toLocaleString()}</span>
                  {incomeDiff !== 0 && (
                    <span className="ml-1 text-xs">({incomeUp ? '+' : ''}{incomeDiff.toLocaleString()})</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between"><span>本月支出</span><span className="font-semibold">¥{monthOverMonth.thisExpense.toLocaleString()}</span></div>
              <div className="flex justify-between">
                <span>上月支出</span>
                <span className={expenseUp ? 'text-rose-600' : 'text-emerald-600'}>
                  <span className="font-semibold">¥{monthOverMonth.lastExpense.toLocaleString()}</span>
                  {expenseDiff !== 0 && (
                    <span className="ml-1 text-xs">({expenseUp ? '+' : ''}{expenseDiff.toLocaleString()})</span>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
          );
        })()}

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
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">财务趋势</CardTitle>
              <div className="flex gap-1 bg-muted rounded-md p-0.5">
                {(['amount', 'proportion', 'deviation'] as const).map((dim) => (
                  <button key={dim} type="button"
                    className={`px-3 py-1 text-xs rounded-sm transition-colors ${trendDimension === dim ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => { setTrendDimension(dim); setZoomMonths(null); }}>
                    {{ amount: '金额', proportion: '占比', deviation: '偏离' }[dim]}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {trendChartOption ? (
              <ReactECharts
                key={trendDimension}
                option={trendChartOption}
                style={{ height: 320 }}
                onEvents={{
                  dataZoom: (params: any) => {
                    const start = params.start || 0;
                    const end = params.end || 100;
                    if (start === 0 && end === 100) {
                      setZoomMonths(null);
                      return;
                    }
                    const total = trendMonthLabels.length;
                    const si = Math.floor(start / 100 * total);
                    const ei = Math.min(total - 1, Math.ceil(end / 100 * total) - 1);
                    const visible = new Set<string>();
                    for (let i = si; i <= ei; i++) visible.add(trendMonthLabels[i]);
                    setZoomMonths(visible.size === total ? null : visible);
                  },
                }}
              />
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">暂无数据</p>
            )}
          </CardContent>
        </Card>

        {/* ⑩ 最近交易 */}
        <RecentTransactions transactions={trendFilteredTransactions} accounts={accounts} />
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
