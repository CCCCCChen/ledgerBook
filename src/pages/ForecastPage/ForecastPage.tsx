import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight, Target, Calendar, Edit2, ArrowDown } from 'lucide-react';
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
        Promise.resolve<IIncomeBudgetProjection[]>([]).catch(() => []), // 占位，保证 Promise.all 不抛错
      ]);
      // 额外尝试拉后端收入预算预测（非 Electron 环境下失败则降级为空数组，不影响整体加载）
      let projectionList: IIncomeBudgetProjection[] = projections || [];
      try {
        const res = await incomeBudgetsApi.projection(rangeFrom, rangeTo);
        if (Array.isArray(res)) projectionList = res;
      } catch {
        // ignore: 非 Electron 环境或接口失败
      }
      setTransactions(txns);
      setBudgets(bdgs);
      setAccounts(accts);
      setPlannedExpenses(planned);
      setMonthlyProjections(projectionList);
    } catch (error) {
      toast.error(`加载预测数据失败：${String(error)}`);
    }
  }, [rangeFrom, rangeTo, startBalance, safetyLine, includePlannedExpenses, includeBudgetSettlement]);

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
      tooltip: {
        trigger: 'axis',
        formatter(params: { name: string; value: number; seriesName: string }[]) {
          if (!params || params.length === 0) return '';
          const p = params[0];
          const diff = p.value - safety;
          const diffStr = diff >= 0 ? `高于安全线 ${diff.toFixed(2)}` : `⚠ 跌破安全线 ${Math.abs(diff).toFixed(2)}`;
          return `${p.name}<br/>${p.seriesName}：${p.value.toFixed(2)}<br/>${diffStr}`;
        },
      },
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
            label: { formatter: '安全线 {c}', position: 'end' },
            data: [{ yAxis: safety }],
          },
          markArea: {
            silent: true,
            itemStyle: { color: 'rgba(229,72,77,0.12)' },
            data: [[
              { yAxis: 0, itemStyle: { color: 'rgba(229,72,77,0.06)' } },
              { yAxis: safety },
            ]],
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
      toast.error('请输入财务事件名称');
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
      toast.error(editingId ? '财务事件更新失败' : '财务事件创建失败');
      return;
    }

    toast.success(editingId ? '财务事件已更新' : '财务事件已创建');
    setDialogOpen(false);
    resetForm();
    await refreshAll();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deletePlannedExpense(deleteTarget.id);
    if (!ok) {
      toast.error('财务事件删除失败');
      return;
    }
    toast.success('财务事件已删除');
    setDeleteTarget(null);
    await refreshAll();
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

  // ============================================================
  // Impact & Goal handlers
  // ============================================================

  const handleRunImpact = useCallback(async () => {
    if (!impactForm.amount || !impactForm.date) return;
    setImpactLoading(true);
    try {
      const res = await forecastApi.impact({
        rangeFrom: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        rangeTo: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
        startBalance: Number(startBalance || 0),
        includePlannedExpenses,
        includeBudgetSettlement,
        simulatedExpense: {
          amount: Number(impactForm.amount),
          date: impactForm.date,
        },
      });
      setImpactResult(res.data);
    } catch {
      toast.error('评估失败');
    } finally {
      setImpactLoading(false);
    }
  }, [impactForm, startBalance, safetyLine, includePlannedExpenses, includeBudgetSettlement]);

  const handleSaveGoal = useCallback(() => {
    const amt = Number(goalForm.targetAmount);
    if (!amt || !goalForm.deadline) return;
    saveSavingsGoal({ targetAmount: amt, deadline: goalForm.deadline, createdAt: new Date().toISOString() });
    setSavingsGoal(loadSavingsGoal());
    setGoalFormOpen(false);
    toast.success('储蓄目标已保存');
  }, [goalForm]);

  const handleDeleteGoal = useCallback(() => {
    deleteSavingsGoal();
    setSavingsGoal(null);
    toast.success('储蓄目标已删除');
  }, []);

  // Planned expense handlers
  const openPlannedDialog = useCallback((id?: string) => {
    if (id) {
      const item = plannedExpenses.find(p => p.id === id);
      if (item) {
        setEditingId(id);
        setForm({
          name: item.name,
          amount: String(item.amount),
          plannedDate: item.plannedDate,
          accountId: item.accountId || '',
          category: item.category || '其他',
          note: item.note || '',
        });
      }
    } else {
      setEditingId(null);
      setForm({ name: '', amount: '', plannedDate: nowLocalISODate(), accountId: '', category: '其他', note: '' });
    }
    setDialogOpen(true);
  }, [plannedExpenses]);

  const handlePlannedSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.amount) return;
    try {
      const payload = {
        name: form.name.trim(),
        amount: Number(form.amount),
        plannedDate: form.plannedDate,
        accountId: form.accountId || undefined,
        category: form.category as TransactionCategory,
        note: form.note,
      };
      if (editingId) {
        await updatePlannedExpense(editingId, payload);
      } else {
        await createPlannedExpense(payload);
      }
      await refreshAll();
      setDialogOpen(false);
    } catch (err) {
      toast.error(String(err));
    }
  }, [form, editingId, refreshAll]);

  const handlePlannedDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deletePlannedExpense(deleteTarget.id);
      await refreshAll();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, refreshAll]);

  // Computed data for sub-components
  const chartPoints = useMemo(() => 
    balanceSeries.dates.map((d, i) => ({ date: d, balance: balanceSeries.balances[i] })),
    [balanceSeries]
  );

  const hasSimulationData = balanceSeries.dates.length > 0;

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">现金流预测</h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看未来支出、分期账单以及预算结算对结余的影响
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/statistics')}>
          查看统计
        </Button>
      </div>

      {/* Summary Strip */}
      {balanceSeries.dates.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">起始余额</p>
                <p className="text-lg font-bold tabular-nums">¥{Number(startBalance || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">最高余额</p>
                <p className="text-lg font-bold tabular-nums text-green-600">
                  ¥{Math.round(Math.max(...balanceSeries.balances)).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">最低余额</p>
                <p className="text-lg font-bold tabular-nums text-red-600">
                  ¥{Math.round(balanceSeries.minBalance).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">期末余额</p>
                <p className="text-lg font-bold tabular-nums">¥{Math.round(balanceSeries.endBalance).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simulation Panel */}
        <Card>
          <CardHeader><CardTitle className="text-base">模拟参数</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label>初始余额</Label>
              <Input type="number" value={startBalance} onChange={(e) => setStartBalance(e.target.value)} />
            </div>
            <div>
              <Label>安全线</Label>
              <Input type="number" value={safetyLine} onChange={(e) => setSafetyLine(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="pe" checked={includePlannedExpenses} onCheckedChange={setIncludePlannedExpenses} />
              <Label htmlFor="pe">含财务事件</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="bs" checked={includeBudgetSettlement} onCheckedChange={setIncludeBudgetSettlement} />
              <Label htmlFor="bs">含预算结算</Label>
            </div>
          </CardContent>
        </Card>

        {/* Result Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">现金流模拟</CardTitle></CardHeader>
          <CardContent>
            {hasSimulationData && chartPoints.length > 0 ? (
              <ReactECharts
                option={(() => {
                  const sVal = Number(safetyLine || 0);
                  return {
                    tooltip: sVal > 0 ? {
                      trigger: 'axis',
                      formatter(params: { name: string; value: number }[]) {
                        if (!params || params.length === 0) return '';
                        const p = params[0];
                        const diff = p.value - sVal;
                        const diffStr = diff >= 0
                          ? `高于安全线 ${diff.toFixed(2)}`
                          : `⚠ 跌破安全线 ${Math.abs(diff).toFixed(2)}`;
                        return `${p.name}<br/>余额：${p.value.toFixed(2)}<br/>${diffStr}`;
                      },
                    } : {},
                    xAxis: { type: 'category', data: chartPoints.map((p: any) => p.date) },
                    yAxis: { type: 'value' },
                    series: [
                      {
                        type: 'line',
                        data: chartPoints.map((p: any) => p.balance),
                        smooth: true,
                        markLine: sVal > 0 ? {
                          symbol: 'none',
                          lineStyle: { color: '#E5484D', type: 'dashed' },
                          label: { formatter: '安全线 {c}', position: 'end' },
                          data: [{ yAxis: sVal }],
                        } : undefined,
                        markArea: sVal > 0 ? {
                          silent: true,
                          itemStyle: { color: 'rgba(229,72,77,0.12)' },
                          data: [[
                            { yAxis: 0, itemStyle: { color: 'rgba(229,72,77,0.06)' } },
                            { yAxis: sVal },
                          ]],
                        } : undefined,
                      },
                    ],
                  };
                })()}
                style={{ height: 320 }}
              />
            ) : (
              <p className="text-muted-foreground text-sm text-center py-8">请先运行模拟以查看结果</p>
            )}
            <div className="grid grid-cols-3 gap-4 mt-4 text-center text-sm">
              <div><p className="text-muted-foreground">最低结余</p><p className="font-semibold text-base">¥{Math.round(balanceSeries.minBalance || 0).toLocaleString()}</p></div>
              <div><p className="text-muted-foreground">最低日期</p><p className="font-semibold text-base">{balanceSeries.minDate || '-'}</p></div>
              <div><p className="text-muted-foreground">期末结余</p><p className="font-semibold text-base">¥{Math.round(balanceSeries.endBalance || 0).toLocaleString()}</p></div>
            </div>
          </CardContent>
        </Card>

        {/* Time Range & Balance Controls */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sim-from">模拟起始日</Label>
                <div className="flex gap-1.5">
                  <Input id="sim-from" type="date" value={simulateFrom} onChange={(e) => setSimulateFrom(e.target.value)} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      const today = new Date();
                      const to = new Date(today);
                      to.setMonth(to.getMonth() + 12);
                      setSimulateFrom(today.toISOString().slice(0, 10));
                      setRangeTo(to.toISOString().slice(0, 10));
                    }}
                  >12个月</Button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sim-balance">起始余额</Label>
                <Input id="sim-balance" type="number" step="0.01" value={startBalance} onChange={(e) => setStartBalance(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sim-safety">安全线</Label>
                <Input id="sim-safety" type="number" step="0.01" value={safetyLine} onChange={(e) => setSafetyLine(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Label htmlFor="forecast-planned">考虑财务事件</Label>
                <Switch id="forecast-planned" checked={includePlannedExpenses} onCheckedChange={setIncludePlannedExpenses} />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Label htmlFor="forecast-budget">考虑预算结算</Label>
                <Switch id="forecast-budget" checked={includeBudgetSettlement} onCheckedChange={setIncludeBudgetSettlement} />
              </div>
            </div>
            {balanceOption ? (
              <ReactECharts option={balanceOption} style={{ height: 360 }} />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">请选择有效的模拟范围</p>
            )}
          </CardContent>
        </Card>

        {/* Impact Assessment */}
        <Card>
          <CardHeader>
            <CardTitle>大额消费影响评估</CardTitle>
            <CardDescription>比较基线与额外一笔消费后的余额差异</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="impact-date">消费日期</Label>
                <Input id="impact-date" type="date" value={impactForm.date} onChange={(e) => setImpactForm({ ...impactForm, date: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="impact-amount">消费金额</Label>
                <Input id="impact-amount" type="number" step="0.01" value={impactForm.amount} onChange={(e) => setImpactForm({ ...impactForm, amount: e.target.value })} placeholder="0.00" />
              </div>
              <Button onClick={handleRunImpact} disabled={impactLoading}>
                {impactLoading ? '评估中...' : '评估影响'}
              </Button>
            </div>
            {impactResult && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">基线最低余额</p>
                  <p className="text-lg font-semibold tabular-nums">¥{Math.round(impactResult.baseline.minBalance).toLocaleString()}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">消费后最低余额</p>
                  <p className={`text-lg font-semibold tabular-nums ${impactResult.withExpense.minBalance < 0 ? 'text-destructive' : ''}`}>
                    ¥{Math.round(impactResult.withExpense.minBalance).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">余额差值</p>
                  <p className="text-lg font-semibold tabular-nums text-destructive">
                    -¥{Math.round(Math.abs(impactResult.delta.minBalance)).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Savings Goal */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>储蓄目标</CardTitle>
              <CardDescription>设置储蓄目标金额与截止日期</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setGoalForm({ targetAmount: '', deadline: '' }); setGoalFormOpen(true); }}>
              {savingsGoal ? '编辑' : '设置'}
            </Button>
          </CardHeader>
          <CardContent>
            {savingsGoal ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold tabular-nums">¥{savingsGoal.targetAmount.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">截止 {savingsGoal.deadline}</p>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDeleteGoal}>删除</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">尚未设置储蓄目标</p>
            )}
          </CardContent>
        </Card>

        {/* Planned Expenses */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>财务事件</CardTitle>
              <CardDescription>手动添加的财务事件项目</CardDescription>
            </div>
            <Button size="sm" onClick={() => openPlannedDialog()}><Plus className="size-3.5 mr-1.5" />添加</Button>
          </CardHeader>
          <CardContent>
            {futurePlannedExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">暂无财务事件</p>
            ) : (
              <div className="divide-y">
                {futurePlannedExpenses.map((item) => {
                  const startBal = Number(startBalance || 0);
                  const safety = Number(safetyLine || 0);
                  const safetyMargin = startBal - safety;
                  const breakAmount = item.amount - safetyMargin;
                  return (
                  <div key={item.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{item.plannedDate}</span>
                        <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                        <span>{accounts.find(a => a.id === item.accountId)?.name || ''}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      {breakAmount > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500 whitespace-nowrap"
                          title={`起始余额 ${startBal.toFixed(2)} − 安全线 ${safety.toFixed(2)} = 安全余量 ${safetyMargin.toFixed(2)}\n此财务事件金额 ${item.amount.toFixed(2)} > 安全余量 ${safetyMargin.toFixed(2)}\n超出 = ${breakAmount.toFixed(2)}（余额将跌破安全线）`}
                        >
                          <ArrowDown className="size-3" />
                          ¥{Math.round(breakAmount).toLocaleString()}
                        </span>
                      )}
                      <span className="text-sm font-semibold tabular-nums text-destructive">
                        -¥{Math.abs(item.amount).toLocaleString()}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPlannedDialog(item.id)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(item)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      {/* Planned Expense Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handlePlannedSubmit}>
            <DialogHeader>
              <DialogTitle>{editingId ? '编辑财务事件' : '添加财务事件'}</DialogTitle>
              <DialogDescription>手动添加一笔未来可能发生的支出</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-1.5">
                <Label>名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：年底旅行" required />
              </div>
              <div className="grid gap-1.5">
                <Label>金额</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" required />
              </div>
              <div className="grid gap-1.5">
                <Label>日期</Label>
                <Input type="date" value={form.plannedDate} onChange={(e) => setForm({ ...form, plannedDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>账户</Label>
                <Select value={form.accountId} onValueChange={(v) => setForm({ ...form, accountId: v })}>
                  <SelectTrigger><SelectValue placeholder="选账户" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>分类</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as TransactionCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEFAULT_CATEGORIES.map((c: any) => (
                      <SelectItem key={c.value || c} value={c.value || c}>{c.label || c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>备注</Label>
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">{editingId ? '更新' : '添加'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除 "{deleteTarget?.name}" 吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handlePlannedDelete} className="bg-destructive">删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Goal Dialog */}
      <Dialog open={goalFormOpen} onOpenChange={setGoalFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>设置储蓄目标</DialogTitle>
            <DialogDescription>输入目标金额与截止日期</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <Label>目标金额</Label>
              <Input type="number" step="0.01" value={goalForm.targetAmount} onChange={(e) => setGoalForm({ ...goalForm, targetAmount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="grid gap-1.5">
              <Label>截止日期</Label>
              <Input type="date" value={goalForm.deadline} onChange={(e) => setGoalForm({ ...goalForm, deadline: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveGoal}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
