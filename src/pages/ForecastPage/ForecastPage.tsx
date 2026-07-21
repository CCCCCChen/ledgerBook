import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight, Target, Calendar, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { IAccount, IBudget, IIncomeBudgetProjection, IPlannedExpense, ITransaction, TransactionCategory } from '@/types/finance';
import { DEFAULT_CATEGORIES } from '@/data/finance';
import {
  createPlannedExpense,
  deletePlannedExpense,
  loadAccounts,
  loadBudgets,
  loadPlannedExpenses,
  loadTransactions,
  updatePlannedExpense,
} from '@/lib/data-service';
import { loadSavingsGoal, saveSavingsGoal, deleteSavingsGoal, type SavingsGoal } from '@/lib/goal-service';
import { listBudgetSettlementsForRange } from '@/lib/finance-utils';
import { formatLocalISODate, nowLocalISODate } from '@/lib/date';
import { getEffectiveTransactionDate } from '@/lib/cashflow';
import { forecastApi, incomeBudgetsApi } from '@/api';

interface ForecastItem {
  id: string;
  type: 'installment' | 'future' | 'budget' | 'planned';
  title: string;
  date: string;
  amount: number;
  accountId: string;
  originalDate?: string;
  note?: string;
}

interface PlannedExpenseFormData {
  name: string;
  amount: string;
  plannedDate: string;
  accountId: string;
  category: TransactionCategory;
  note: string;
}

interface ImpactResult {
  baseline: { minBalance: number; minDate: string; endBalance: number };
  withExpense: { minBalance: number; minDate: string; endBalance: number };
  delta: { minBalance: number; endBalance: number };
}

export default function ForecastPage() {
  const navigate = useNavigate();
  const today = new Date();
  const todayISO = formatLocalISODate(today);
  const monthStartISO = formatLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEndISO = formatLocalISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [budgets, setBudgets] = useState<IBudget[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [plannedExpenses, setPlannedExpenses] = useState<IPlannedExpense[]>([]);
  const [savingsGoal, setSavingsGoal] = useState<SavingsGoal | null>(null);
  const [monthlyProjections, setMonthlyProjections] = useState<IIncomeBudgetProjection[]>([]);
  const [rangeFrom, setRangeFrom] = useState(monthStartISO);
  const [rangeTo, setRangeTo] = useState(monthEndISO);
  const [includeBudgetSettlement, setIncludeBudgetSettlement] = useState(true);
  const [includePlannedExpenses, setIncludePlannedExpenses] = useState(true);
  const [startBalance, setStartBalance] = useState('0');
  const [safetyLine, setSafetyLine] = useState('0');
  const [impactForm, setImpactForm] = useState<{ date: string; amount: string; accountId: string }>({
    date: nowLocalISODate(),
    amount: '',
    accountId: '',
  });
  const [impactLoading, setImpactLoading] = useState(false);
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [goalForm, setGoalForm] = useState<{ targetAmount: string; deadline: string }>({
    targetAmount: '',
    deadline: '',
  });
  const [impactResult, setImpactResult] = useState<ImpactResult | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IPlannedExpense | null>(null);
  const [form, setForm] = useState<PlannedExpenseFormData>({
    name: '',
    amount: '',
    plannedDate: nowLocalISODate(),
    accountId: '',
    category: '其他',
    note: '',
  });

  const refreshAll = useCallback(async () => {
    try {
      const [txns, bdgs, accts, planned, projections] = await Promise.all([
        loadTransactions(),
        loadBudgets(),
        loadAccounts(),
        loadPlannedExpenses(),
        incomeBudgetsApi.projection(rangeFrom, rangeTo),
      ]);
      setTransactions(txns);
      setBudgets(bdgs);
      setAccounts(accts);
      setPlannedExpenses(planned);
      setMonthlyProjections(projections || []);
    } catch (error) {
      toast.error(`加载预测数据失败：${String(error)}`);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    setSavingsGoal(loadSavingsGoal());
  }, []);

  const monthlyProjectionTable = useMemo(() => {
    const now = new Date();
    const historyTxns = transactions.filter(t => {
      const d = new Date(t.date);
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 3);
      return d >= cutoff && t.amount < 0;
    });
    const avgExpense = historyTxns.length > 0
      ? Math.round(Math.abs(historyTxns.reduce((s, t) => s + t.amount, 0)) / 3)
      : 0;

    const monthMap: Record<string, { income: number }> = {};
    monthlyProjections.forEach(p => {
      const month = p.projectionDate.substring(0, 7);
      if (!monthMap[month]) monthMap[month] = { income: 0 };
      monthMap[month].income += p.amount;
    });

    const months = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b));
    const data = [];
    let balance = Number(startBalance || 0);
    for (const [month, { income }] of months) {
      const expense = avgExpense;
      const netFlow = income - expense;
      balance += netFlow;
      data.push({ month, income, expense, netFlow, balance });
    }
    return data;
  }, [monthlyProjections, transactions, startBalance]);

  const futureFrom = useMemo(() => (todayISO > rangeFrom ? todayISO : rangeFrom), [todayISO, rangeFrom]);
  const [simulateFrom, setSimulateFrom] = useState(futureFrom);

  useEffect(() => {
    setSimulateFrom((prev) => {
      if (!prev) return futureFrom;
      if (prev < futureFrom) return futureFrom;
      return prev;
    });
  }, [futureFrom]);

  useEffect(() => {
    if (!rangeTo || !simulateFrom) return;
    if (simulateFrom > rangeTo) {
      setSimulateFrom(rangeTo);
    }
  }, [simulateFrom, rangeTo]);

  const futureExpenseTransactions = useMemo(() => {
    if (rangeTo < futureFrom) return [];
    return transactions
      .filter((transaction) => transaction.amount < 0)
      .map((transaction) => ({
        ...transaction,
        effectiveDate: getEffectiveTransactionDate(transaction, 'cashflow'),
        amount: Math.abs(transaction.amount),
      }))
      .filter((transaction) => transaction.effectiveDate >= futureFrom && transaction.effectiveDate <= rangeTo);
  }, [transactions, futureFrom, rangeTo]);

  const futureTransactionsForBalance = useMemo(() => {
    if (rangeTo < simulateFrom) return [];
    return transactions
      .map((transaction) => ({
        ...transaction,
        effectiveDate: getEffectiveTransactionDate(transaction, 'cashflow'),
      }))
      .filter((transaction) => transaction.effectiveDate >= simulateFrom && transaction.effectiveDate <= rangeTo);
  }, [transactions, simulateFrom, rangeTo]);

  const budgetSettlementItems = useMemo(() => {
    if (!includeBudgetSettlement) return [];
    return listBudgetSettlementsForRange(budgets, transactions, rangeFrom, rangeTo)
      .filter((item) => item.expectedAmount > 0)
      .filter((item) => item.cycleEnd >= futureFrom);
  }, [budgets, transactions, rangeFrom, rangeTo, includeBudgetSettlement, futureFrom]);

  const budgetSettlementCashflowEvents = useMemo(() => {
    if (!includeBudgetSettlement || rangeTo < simulateFrom) return [];
    return listBudgetSettlementsForRange(budgets, transactions, simulateFrom, rangeTo)
      .filter((item) => item.expectedAmount > 0)
      .map((item) => ({
        id: `budget-${item.budgetId}-${item.cycleEnd}`,
        date: item.cycleEnd,
        amount: -item.expectedAmount,
        title: `${item.budgetName} 预算结算`,
      }));
  }, [budgets, transactions, simulateFrom, rangeTo, includeBudgetSettlement]);

  const futurePlannedExpenses = useMemo(() => {
    if (!includePlannedExpenses || rangeTo < futureFrom) return [];
    return plannedExpenses
      .map((item) => ({
        ...item,
        effectiveDate: item.cashOutDate || item.plannedDate,
      }))
      .filter((item) => item.effectiveDate >= futureFrom && item.effectiveDate <= rangeTo);
  }, [plannedExpenses, includePlannedExpenses, futureFrom, rangeTo]);

  const plannedExpenseCashflowEvents = useMemo(() => {
    if (!includePlannedExpenses || rangeTo < simulateFrom) return [];
    return plannedExpenses
      .map((item) => ({
        ...item,
        effectiveDate: item.cashOutDate || item.plannedDate,
      }))
      .filter((item) => item.effectiveDate >= simulateFrom && item.effectiveDate <= rangeTo)
      .map((item) => ({
        id: item.id,
        date: item.effectiveDate,
        amount: -Math.abs(item.amount),
        title: item.name,
      }));
  }, [plannedExpenses, includePlannedExpenses, simulateFrom, rangeTo]);

  function parseISODate(date: string): Date {
    return new Date(`${date}T00:00:00`);
  }

  function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  const dateBuckets = useMemo(() => {
    if (!simulateFrom || !rangeTo || simulateFrom > rangeTo) return [];
    const from = parseISODate(simulateFrom);
    const to = parseISODate(rangeTo);
    const result: string[] = [];
    let cursor = from;
    while (formatLocalISODate(cursor) <= rangeTo) {
      result.push(formatLocalISODate(cursor));
      cursor = addDays(cursor, 1);
      if (result.length > 1500) break;
    }
    return result;
  }, [simulateFrom, rangeTo]);

  const balanceSeries = useMemo(() => {
    const starting = Number(startBalance || 0);
    if (!dateBuckets.length) {
      return { dates: [], balances: [], minBalance: starting, minDate: simulateFrom || rangeFrom, endBalance: starting };
    }

    const dailyDelta = new Map<string, number>();
    futureTransactionsForBalance.forEach((t) => {
      dailyDelta.set(t.effectiveDate, (dailyDelta.get(t.effectiveDate) || 0) + Number(t.amount));
    });
    plannedExpenseCashflowEvents.forEach((e) => {
      dailyDelta.set(e.date, (dailyDelta.get(e.date) || 0) + e.amount);
    });
    budgetSettlementCashflowEvents.forEach((e) => {
      dailyDelta.set(e.date, (dailyDelta.get(e.date) || 0) + e.amount);
    });

    const balances: number[] = [];
    let balance = starting;
    let minBalance = balance;
    let minDate = dateBuckets[0];
    dateBuckets.forEach((date) => {
      balance += dailyDelta.get(date) || 0;
      balances.push(balance);
      if (balance < minBalance) {
        minBalance = balance;
        minDate = date;
      }
    });
    return { dates: dateBuckets, balances, minBalance, minDate, endBalance: balances[balances.length - 1] ?? starting };
  }, [dateBuckets, startBalance, futureTransactionsForBalance, plannedExpenseCashflowEvents, budgetSettlementCashflowEvents, simulateFrom, rangeFrom]);

  const balanceOption = useMemo(() => {
    if (balanceSeries.dates.length === 0) return null;
    const safety = Number(safetyLine || 0);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
      xAxis: { type: 'category', data: balanceSeries.dates, axisLabel: { rotate: 30, fontSize: 11 } },
      yAxis: { type: 'value', name: '余额 (元)' },
      dataZoom: [
        { type: 'inside' },
        { type: 'slider', height: 18, bottom: 0 },
      ],
      series: [
        {
          name: '预测余额',
          type: 'line',
          data: balanceSeries.balances,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2 },
          itemStyle: { color: '#2BA7A0' },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(43,167,160,0.25)' },
                { offset: 1, color: 'rgba(43,167,160,0.02)' },
              ],
            },
          },
          markLine: {
            symbol: 'none',
            lineStyle: { color: '#E5484D', type: 'dashed' },
            data: [{ yAxis: safety }],
          },
          markPoint: {
            data: [
              { type: 'min', name: '最低' },
            ],
          },
        },
      ],
    };
  }, [balanceSeries, safetyLine]);

  const forecastItems = useMemo<ForecastItem[]>(() => {
    const transactionItems: ForecastItem[] = futureExpenseTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.transactionType === 'installment_bill' ? 'installment' : 'future',
      title: transaction.note || '未来支出',
      date: transaction.effectiveDate,
      originalDate: transaction.date,
      amount: transaction.amount,
      accountId: transaction.accountId,
      note: transaction.note,
    }));
    const settlementItems: ForecastItem[] = budgetSettlementItems.map((item) => ({
      id: `budget-${item.budgetId}-${item.cycleEnd}`,
      type: 'budget',
      title: `${item.budgetName} 预算结算`,
      date: item.cycleEnd,
      amount: item.expectedAmount,
      accountId: '',
    }));
    const plannedItems: ForecastItem[] = futurePlannedExpenses.map((item) => ({
      id: item.id,
      type: 'planned',
      title: item.name,
      date: item.cashOutDate || item.plannedDate,
      originalDate: item.plannedDate,
      amount: item.amount,
      accountId: item.accountId || '',
      note: item.note,
    }));
    return [...transactionItems, ...plannedItems, ...settlementItems].sort((a, b) => a.date.localeCompare(b.date));
  }, [futureExpenseTransactions, futurePlannedExpenses, budgetSettlementItems]);

  const expectedOutflow = useMemo(() => forecastItems.reduce((sum, item) => sum + item.amount, 0), [forecastItems]);

  const goalAnalysis = useMemo(() => {
    if (!savingsGoal) return null;

    const endBalance = monthlyProjectionTable.length > 0
      ? monthlyProjectionTable[monthlyProjectionTable.length - 1].balance
      : Number(startBalance || 0);

    const gap = savingsGoal.targetAmount - endBalance;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(`${savingsGoal.deadline}T00:00:00`);
    const diffMs = deadline.getTime() - today.getTime();
    const monthsRemaining = Math.max(1, Math.ceil(diffMs / (30.44 * 24 * 60 * 60 * 1000)));

    const monthlyExtra = gap > 0 ? Math.ceil(gap / monthsRemaining) : 0;
    const progress = savingsGoal.targetAmount > 0
      ? Math.min(100, Math.round((endBalance / savingsGoal.targetAmount) * 100))
      : 0;

    return { endBalance, gap, monthsRemaining, monthlyExtra, progress };
  }, [savingsGoal, monthlyProjectionTable, startBalance]);

  const sortedPlannedExpenses = useMemo(
    () => [...plannedExpenses].sort((a, b) => (a.cashOutDate || a.plannedDate).localeCompare(b.cashOutDate || b.plannedDate)),
    [plannedExpenses],
  );

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: '',
      amount: '',
      plannedDate: nowLocalISODate(),
      accountId: '',
      category: '其他',
      note: '',
    });
  };

  const resetGoalForm = () => {
    setGoalForm({ targetAmount: '', deadline: '' });
    setGoalFormOpen(false);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (item: IPlannedExpense) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      amount: String(item.amount),
      plannedDate: item.plannedDate,
      accountId: item.accountId || '',
      category: item.category,
      note: item.note,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('请输入预估支出名称');
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error('请输入有效金额');
      return;
    }

    const payload = {
      name: form.name.trim(),
      amount: Number(form.amount),
      plannedDate: form.plannedDate,
      accountId: form.accountId || undefined,
      category: form.category,
      note: form.note.trim(),
    };

    const result = editingId
      ? await updatePlannedExpense(editingId, payload)
      : await createPlannedExpense(payload);

    if (!result) {
      toast.error(editingId ? '预估支出更新失败' : '预估支出创建失败');
      return;
    }

    toast.success(editingId ? '预估支出已更新' : '预估支出已创建');
    setDialogOpen(false);
    resetForm();
    await refreshAll();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deletePlannedExpense(deleteTarget.id);
    if (!ok) {
      toast.error('预估支出删除失败');
      return;
    }
    toast.success('预估支出已删除');
    setDeleteTarget(null);
    await refreshAll();
  };

  const handleSaveGoal = () => {
    const amount = Number(goalForm.targetAmount);
    if (!amount || amount <= 0) {
      toast.error('请输入有效目标金额');
      return;
    }
    if (!goalForm.deadline) {
      toast.error('请选择截止日期');
      return;
    }
    const goal: SavingsGoal = {
      targetAmount: amount,
      deadline: goalForm.deadline,
      createdAt: savingsGoal?.createdAt || new Date().toISOString(),
    };
    saveSavingsGoal(goal);
    setSavingsGoal(goal);
    resetGoalForm();
    toast.success('储蓄目标已保存');
  };

  const handleDeleteGoal = () => {
    deleteSavingsGoal();
    setSavingsGoal(null);
    toast.success('储蓄目标已清除');
  };

  const runImpact = async (override?: Partial<{ date: string; amount: string; accountId: string }>) => {
    const nextImpactForm = { ...impactForm, ...override };
    if (!simulateFrom || simulateFrom > rangeTo) {
      toast.error('请先设置有效的模拟范围');
      return;
    }
    if (!nextImpactForm.date) {
      toast.error('请选择消费日期');
      return;
    }
    if (!nextImpactForm.amount || Number(nextImpactForm.amount) <= 0) {
      toast.error('请输入有效金额');
      return;
    }
    setImpactLoading(true);
    try {
      const res = await forecastApi.impact({
        rangeFrom: simulateFrom,
        rangeTo,
        startBalance: Number(startBalance || 0),
        includePlannedExpenses,
        includeBudgetSettlement,
        simulatedExpense: {
          date: nextImpactForm.date,
          amount: Number(nextImpactForm.amount),
          accountId: nextImpactForm.accountId || undefined,
        },
      });
      if (!res.success) {
        toast.error('影响评估失败');
        return;
      }
      setImpactResult(res.data);
    } catch (error) {
      toast.error(`影响评估失败：${String(error)}`);
    } finally {
      setImpactLoading(false);
    }
  };

  const evaluatePlannedExpense = async (item: IPlannedExpense) => {
    const next = {
      date: item.plannedDate,
      amount: String(item.amount),
      accountId: item.accountId || '',
    };
    setImpactForm(next);
    setImpactResult(null);
    await runImpact(next);
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">预期账单</h1>
            <p className="text-sm text-muted-foreground mt-1">查看未来支出、分期账单以及预算结算对结余的影响</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/statistics')}>
            查看统计
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="space-y-1">
              <p className="font-medium">时间范围</p>
              <p className="text-sm text-muted-foreground">仅展示该范围内尚未发生的支出</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="forecast-from">开始</Label>
                <Input id="forecast-from" type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="forecast-to">结束</Label>
                <Input id="forecast-to" type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Label htmlFor="forecast-budget">考虑预算结算</Label>
                <Switch id="forecast-budget" checked={includeBudgetSettlement} onCheckedChange={setIncludeBudgetSettlement} />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Label htmlFor="forecast-planned">考虑预估支出</Label>
                <Switch id="forecast-planned" checked={includePlannedExpenses} onCheckedChange={setIncludePlannedExpenses} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>现金流模拟器</CardTitle>
            <CardDescription>以现金流日为准，叠加未来交易、预估支出、预算结算，预测余额曲线</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sim-from">模拟起始日</Label>
                <Input id="sim-from" type="date" value={simulateFrom} onChange={(e) => setSimulateFrom(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sim-balance">起始余额</Label>
                <Input
                  id="sim-balance"
                  type="number"
                  step="0.01"
                  value={startBalance}
                  onChange={(e) => setStartBalance(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sim-safety">安全线</Label>
                <Input
                  id="sim-safety"
                  type="number"
                  step="0.01"
                  value={safetyLine}
                  onChange={(e) => setSafetyLine(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <p className="text-xs text-muted-foreground">最低余额</p>
                <p className={`text-base font-semibold tabular-nums ${balanceSeries.minBalance < Number(safetyLine || 0) ? 'text-destructive' : 'text-foreground'}`}>
                  ¥{Math.round(balanceSeries.minBalance).toLocaleString()} · {balanceSeries.minDate}
                </p>
              </div>
              <div className="grid gap-1">
                <p className="text-xs text-muted-foreground">期末余额</p>
                <p className="text-base font-semibold tabular-nums">¥{Math.round(balanceSeries.endBalance).toLocaleString()}</p>
              </div>
            </div>
            {balanceOption ? (
              <ReactECharts option={balanceOption} style={{ height: 360 }} />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">请选择有效的模拟范围</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>大额消费影响评估</CardTitle>
            <CardDescription>在当前预测范围内，比较“基线”与“额外增加一笔消费”后的最低余额差异</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="impact-date">消费日期</Label>
                <Input
                  id="impact-date"
                  type="date"
                  value={impactForm.date}
                  onChange={(e) => setImpactForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="impact-amount">金额</Label>
                <Input
                  id="impact-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={impactForm.amount}
                  onChange={(e) => setImpactForm((prev) => ({ ...prev, amount: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>支付账户</Label>
                <Select
                  value={impactForm.accountId || 'none'}
                  onValueChange={(value) => setImpactForm((prev) => ({ ...prev, accountId: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="选择账户" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">稍后确定</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => void runImpact()} disabled={impactLoading}>
                {impactLoading ? '评估中...' : '查看影响'}
              </Button>
            </div>

            {impactResult ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">基线最低余额</p>
                  <p className="text-xl font-bold tabular-nums">¥{Math.round(impactResult.baseline.minBalance).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">日期 {impactResult.baseline.minDate}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">新增消费后最低余额</p>
                  <p className={`text-xl font-bold tabular-nums ${impactResult.withExpense.minBalance < Number(safetyLine || 0) ? 'text-destructive' : 'text-foreground'}`}>
                    ¥{Math.round(impactResult.withExpense.minBalance).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">日期 {impactResult.withExpense.minDate}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground">最低余额变化</p>
                  <p className="text-xl font-bold tabular-nums">
                    ¥{Math.round(impactResult.delta.minBalance).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    期末余额变化 ¥{Math.round(impactResult.delta.endBalance).toLocaleString()}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">填入一笔消费后点击“查看影响”。</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>月度收支预测</CardTitle>
            <CardDescription>基于收入预算和历史支出数据，预测未来月度现金流</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {monthlyProjectionTable.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">暂无收入预算数据，请在预算页设置收入预算后查看</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="size-4 text-success" />
                      <span className="text-xs text-muted-foreground">预计总收入</span>
                    </div>
                    <p className="text-lg font-bold text-success tabular-nums">
                      ¥{monthlyProjectionTable.reduce((s, d) => s + d.income, 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="size-4 text-destructive" />
                      <span className="text-xs text-muted-foreground">预计总支出</span>
                    </div>
                    <p className="text-lg font-bold text-destructive tabular-nums">
                      ¥{monthlyProjectionTable.reduce((s, d) => s + d.expense, 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="size-4 text-primary" />
                      <span className="text-xs text-muted-foreground">期末余额</span>
                    </div>
                    <p className="text-lg font-bold tabular-nums">
                      ¥{monthlyProjectionTable.length > 0 ? monthlyProjectionTable[monthlyProjectionTable.length - 1].balance.toLocaleString() : '0'}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="size-4 text-yellow-500" />
                      <span className="text-xs text-muted-foreground">最低余额</span>
                    </div>
                    <p className={`text-lg font-bold tabular-nums ${Math.min(...monthlyProjectionTable.map(d => d.balance)) < 0 ? 'text-destructive' : ''}`}>
                      ¥{Math.min(...monthlyProjectionTable.map(d => d.balance)).toLocaleString()}
                    </p>
                  </div>
                </div>
                {monthlyProjectionTable.map(item => (
                  <div key={item.month} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                    <div className="font-medium text-sm min-w-[80px]">{item.month}</div>
                    <div className="flex items-center gap-4">
                      <div className="text-right min-w-[80px]">
                        <div className="text-xs text-muted-foreground">收入</div>
                        <div className="text-sm font-medium text-success flex items-center justify-end gap-1">
                          <ArrowUpRight className="size-3" />
                          ¥{item.income.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right min-w-[80px]">
                        <div className="text-xs text-muted-foreground">支出</div>
                        <div className="text-sm font-medium text-destructive flex items-center justify-end gap-1">
                          <ArrowDownRight className="size-3" />
                          ¥{item.expense.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right min-w-[80px]">
                        <div className="text-xs text-muted-foreground">净流入</div>
                        <div className={`text-sm font-semibold ${item.netFlow >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {item.netFlow >= 0 ? '+' : ''}¥{item.netFlow.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right min-w-[80px]">
                        <div className="text-xs text-muted-foreground">累计余额</div>
                        <div className="text-sm font-bold tabular-nums">¥{item.balance.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>收入预算来源</CardTitle>
            <CardDescription>以下收入预算参与了月度预测</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyProjections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">暂无收入预算数据，请到预算页添加</p>
            ) : (
              <div className="space-y-2">
                {monthlyProjections.slice(0, 10).map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <div className="font-medium text-sm">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.projectionDate}</div>
                    </div>
                    <Badge variant="secondary" className="text-success bg-success/10">
                      +¥{p.amount.toLocaleString()}
                    </Badge>
                  </div>
                ))}
                {monthlyProjections.length > 10 && (
                  <div className="text-center text-sm text-muted-foreground pt-2">
                    还有 {monthlyProjections.length - 10} 条收入记录...
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="size-5 text-primary" />
                储蓄目标追踪
              </CardTitle>
              <CardDescription>设定储蓄目标，根据预测曲线追踪缺口</CardDescription>
            </div>
            {savingsGoal && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setGoalFormOpen(true)}>
                  <Edit2 className="size-3.5" />
                  调整
                </Button>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleDeleteGoal}>
                  <Trash2 className="size-3.5" />
                  清除
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!savingsGoal && !goalFormOpen ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Target className="size-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground mb-4">还没有设定储蓄目标</p>
                <Button variant="outline" onClick={() => setGoalFormOpen(true)}>
                  <Plus className="size-4" />
                  设定目标
                </Button>
              </div>
            ) : goalFormOpen ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="goal-amount">目标金额 (¥)</Label>
                    <Input
                      id="goal-amount"
                      type="number"
                      min="0"
                      step="100"
                      value={goalForm.targetAmount}
                      onChange={(e) => setGoalForm(prev => ({ ...prev, targetAmount: e.target.value }))}
                      placeholder={savingsGoal ? String(savingsGoal.targetAmount) : '如：100000'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="goal-deadline">截止日期</Label>
                    <Input
                      id="goal-deadline"
                      type="date"
                      value={goalForm.deadline}
                      onChange={(e) => setGoalForm(prev => ({ ...prev, deadline: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={handleSaveGoal}>
                    {savingsGoal ? '更新目标' : '保存目标'}
                  </Button>
                  {savingsGoal && (
                    <Button variant="outline" onClick={resetGoalForm}>取消</Button>
                  )}
                </div>
              </div>
            ) : savingsGoal && goalAnalysis ? (
              <div className="space-y-4">
                {/* 进度条 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">储蓄进度</span>
                    <span className="text-sm font-semibold tabular-nums">{goalAnalysis.progress}%</span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${goalAnalysis.progress}%`,
                        background: goalAnalysis.progress >= 100
                          ? 'linear-gradient(90deg, #2BA7A0, #47C9A0)'
                          : 'linear-gradient(90deg, #3B82F6, #6366F1)',
                      }}
                    />
                  </div>
                </div>

                {/* 核心数据卡片 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="size-4 text-primary" />
                      <span className="text-xs text-muted-foreground">目标金额</span>
                    </div>
                    <p className="text-lg font-bold tabular-nums">
                      ¥{savingsGoal.targetAmount.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="size-4 text-success" />
                      <span className="text-xs text-muted-foreground">预测期末余额</span>
                    </div>
                    <p className="text-lg font-bold text-success tabular-nums">
                      ¥{Math.round(goalAnalysis.endBalance).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="size-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">截止日期</span>
                    </div>
                    <p className="text-lg font-bold tabular-nums">{savingsGoal.deadline}</p>
                  </div>
                  <div className={`rounded-lg border p-3 ${goalAnalysis.gap > 0 ? 'border-destructive/30' : 'border-success/30'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {goalAnalysis.gap > 0 ? (
                        <TrendingDown className="size-4 text-destructive" />
                      ) : (
                        <TrendingUp className="size-4 text-success" />
                      )}
                      <span className="text-xs text-muted-foreground">缺口</span>
                    </div>
                    <p className={`text-lg font-bold tabular-nums ${goalAnalysis.gap > 0 ? 'text-destructive' : 'text-success'}`}>
                      {goalAnalysis.gap > 0
                        ? `差 ¥${Math.round(goalAnalysis.gap).toLocaleString()}`
                        : '可达成'}
                    </p>
                  </div>
                </div>

                {/* 每月需多存（仅缺口>0时显示） */}
                {goalAnalysis.gap > 0 && (
                  <div className="rounded-lg bg-secondary/30 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="size-4 text-primary" />
                      <span className="font-medium text-sm">达成建议</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      距离 <strong>{savingsGoal.deadline}</strong> 还有约 <strong>{goalAnalysis.monthsRemaining} 个月</strong>，
                      每个月需额外储蓄 <strong className="text-primary">¥{goalAnalysis.monthlyExtra.toLocaleString()}</strong> 才能达成目标。
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      当前每月净流入参考下方「月度收支预测」的净流入列。
                    </p>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>预估支出管理</CardTitle>
              <CardDescription>录入尚未发生但已计划的消费，预测时会按现金流日纳入未来支出</CardDescription>
            </div>
            <Button onClick={openCreateDialog} size="sm">
              <Plus className="size-4" />
              新增预估支出
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedPlannedExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">暂无预估支出</p>
            ) : (
              sortedPlannedExpenses.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{item.name}</p>
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      预计消费日 {item.plannedDate}
                      {item.accountId ? ` · ${accounts.find((account) => account.id === item.accountId)?.name || '未知账户'}` : ' · 未指定账户'}
                    </p>
                    {item.cashOutDate && item.cashOutDate !== item.plannedDate && (
                      <p className="text-xs text-muted-foreground mt-1">现金流出日 {item.cashOutDate}</p>
                    )}
                    {item.note && <p className="text-xs text-muted-foreground mt-1">{item.note}</p>}
                  </div>
                  <div className="flex items-start gap-3">
                    <p className="font-semibold text-destructive tabular-nums pt-1">¥{item.amount.toLocaleString()}</p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => void evaluatePlannedExpense(item)}
                        aria-label="评估预估支出"
                      >
                        <TrendingUp className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(item)} aria-label="编辑预估支出">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(item)}
                        aria-label="删除预估支出"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>本范围内预期支出</CardTitle>
            <CardDescription>合计 ¥{expectedOutflow.toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {forecastItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">暂无预期支出</p>
            ) : (
              forecastItems.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{item.title}</p>
                      <Badge variant="outline" className="text-xs">
                        {item.type === 'budget'
                          ? '预算结算'
                          : item.type === 'installment'
                            ? '分期账单'
                            : item.type === 'planned'
                              ? '预估支出'
                              : '未来支出'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {item.date}
                      {item.accountId ? ` · ${accounts.find((account) => account.id === item.accountId)?.name || '未知账户'}` : ''}
                    </p>
                    {'originalDate' in item && item.originalDate && item.originalDate !== item.date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        消费日 {item.originalDate}，现金流出日 {item.date}
                      </p>
                    )}
                    {item.note && item.note !== item.title && (
                      <p className="text-xs text-muted-foreground mt-1">{item.note}</p>
                    )}
                  </div>
                  <p className="font-semibold text-destructive tabular-nums">¥{item.amount.toLocaleString()}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[85dvh] overflow-y-auto">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingId ? '编辑预估支出' : '新增预估支出'}</DialogTitle>
              <DialogDescription>这类支出不会立即进入真实流水，只参与未来现金流预测</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-1.5">
                <Label htmlFor="planned-name">名称</Label>
                <Input
                  id="planned-name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="如：8 月显示器采购"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="planned-amount">金额</Label>
                <Input
                  id="planned-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="planned-date">预计消费日</Label>
                <Input
                  id="planned-date"
                  type="date"
                  value={form.plannedDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, plannedDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>支付账户</Label>
                <Select
                  value={form.accountId || 'none'}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, accountId: value === 'none' ? '' : value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择账户" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">稍后确定</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>分类</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, category: value as TransactionCategory }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="planned-note">备注</Label>
                <Textarea
                  id="planned-note"
                  value={form.note}
                  onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                  rows={3}
                  placeholder="可填写用途、预期品牌、是否可推迟等"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                取消
              </Button>
              <Button type="submit">{editingId ? '更新' : '创建'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除预估支出</AlertDialogTitle>
            <AlertDialogDescription>删除后将不再参与未来现金流预测，真实流水不会受影响。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
