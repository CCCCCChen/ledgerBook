import { useState, useMemo, useCallback, useEffect, type FormEvent } from 'react';
import { Plus, Edit, Trash2, AlertTriangle, PiggyBank, Download, Upload, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { IBudget, BudgetCycleType, TransactionCategory, IIncomeBudget, IAccount } from '@/types/finance';
import { DEFAULT_CATEGORIES, BUDGET_CYCLE_LABELS, ACCOUNT_TYPE_LABELS } from '@/data/finance';
import { exportAllData, importAllData } from '@/lib/storage';
import { createBudget, deleteBudget, loadBudgets, updateBudget } from '@/lib/data-service';
import { getElectronAPI, isElectronRuntime } from '@/lib/electron-api';
import { incomeBudgetsApi } from '@/api';
import type { BudgetWithStats } from '@/api';
import { nowLocalISODate } from '@/lib/date';
import { loadAccounts } from '@/lib/data-service';

const CYCLE_OPTIONS: BudgetCycleType[] = ['once', 'weekly', 'monthly', 'yearly', 'custom'];
const IS_ELECTRON = isElectronRuntime();

function getTodayISO(): string {
  return nowLocalISODate();
}

function getProgressColor(rate: number): string {
  if (rate > 100) return 'bg-destructive';
  if (rate >= 80) return 'bg-warning';
  return 'bg-success';
}

function getBadgeVariant(rate: number): 'destructive' | 'outline' | 'secondary' {
  if (rate > 100) return 'destructive';
  if (rate >= 80) return 'outline';
  return 'secondary';
}

interface BudgetFormData {
  name: string;
  amount: string;
  cycleType: BudgetCycleType;
  startDate: string;
  endDate: string;
  cycleDays: string;
  category: TransactionCategory | 'all';
}

interface IncomeBudgetFormData {
  name: string;
  amount: string;
  cycleType: BudgetCycleType;
  expectedDate: string;
  accountId: string;
  cycleDays: string;
  startDate: string;
  endDate: string;
  note: string;
}

const EMPTY_BUDGET_FORM: BudgetFormData = {
  name: '',
  amount: '',
  cycleType: 'monthly',
  startDate: getTodayISO(),
  endDate: '',
  cycleDays: '30',
  category: 'all',
};

const EMPTY_INCOME_FORM: IncomeBudgetFormData = {
  name: '',
  amount: '',
  cycleType: 'monthly',
  expectedDate: getTodayISO(),
  accountId: '',
  cycleDays: '30',
  startDate: getTodayISO(),
  endDate: '',
  note: '',
};

type GroupingMode = 'time' | 'category' | 'cycle';

export default function BudgetsPage() {
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  const [budgets, setBudgets] = useState<BudgetWithStats[]>([]);
  const [incomeBudgets, setIncomeBudgets] = useState<IIncomeBudget[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [expenseGroupingMode, setExpenseGroupingMode] = useState<GroupingMode>('time');
  const [incomeGroupingMode, setIncomeGroupingMode] = useState<GroupingMode>('time');

  // 支出预算 Dialog 状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BudgetFormData>(EMPTY_BUDGET_FORM);
  const [deleteTarget, setDeleteTarget] = useState<IBudget | null>(null);

  // 收入预算 Dialog 状态
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [incomeForm, setIncomeForm] = useState<IncomeBudgetFormData>(EMPTY_INCOME_FORM);
  const [deleteIncomeTarget, setDeleteIncomeTarget] = useState<IIncomeBudget | null>(null);

  const [importInput, setImportInput] = useState<string>('');

  // 获取账户名称 - 移到前面避免初始化顺序问题
  const getAccountName = (accountId?: string) => {
    if (!accountId) return '未指定账户';
    const acc = accounts.find((a) => a.id === accountId);
    return acc?.name || '未知账户';
  };

  // 加载支出预算
  const refreshBudgets = useCallback(async () => {
    const bdgs = await loadBudgets();
    setBudgets(bdgs);
  }, []);

  // 加载收入预算
  const refreshIncomeBudgets = useCallback(async () => {
    try {
      const res = await incomeBudgetsApi.list();
      setIncomeBudgets(res || []);
    } catch (e) {
      console.error('加载收入预算失败', e);
    }
  }, []);

  // 加载账户列表
  const refreshAccounts = useCallback(async () => {
    const accs = await loadAccounts();
    setAccounts(accs);
  }, []);

  useEffect(() => {
    void refreshBudgets();
    void refreshIncomeBudgets();
    void refreshAccounts();
  }, [refreshBudgets, refreshIncomeBudgets, refreshAccounts]);

  // 超支预警列表
  const overBudgetItems = useMemo(
    () => budgets.filter((b) => b.rate > 100),
    [budgets],
  );

  const warningItems = useMemo(
    () => budgets.filter((b) => b.rate >= 80 && b.rate <= 100),
    [budgets],
  );

  // 计算本月预计收入
  const monthlyIncomeTotal = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let total = 0;

    for (const ib of incomeBudgets) {
      if (ib.cycleType === 'once') {
        const d = new Date(ib.expectedDate);
        if (d.getFullYear() === year && d.getMonth() === month) {
          total += ib.amount;
        }
      } else if (ib.cycleType === 'monthly') {
        total += ib.amount;
      } else if (ib.cycleType === 'weekly') {
        total += ib.amount * 4; // 估算
      } else if (ib.cycleType === 'yearly') {
        const d = new Date(ib.expectedDate);
        if (d.getMonth() === month) {
          total += ib.amount;
        }
      }
    }
    return total;
  }, [incomeBudgets]);

  // 支出预算分组
  const groupedExpenseBudgets = useMemo(() => {
    if (budgets.length === 0) return [];

    let grouped: { key: string; label: string; budgets: BudgetWithStats[] }[] = [];

    if (expenseGroupingMode === 'time') {
      // 按时间分组，主要依据开始日期的月份
      const timeGroups = new Map<string, BudgetWithStats[]>();
      
      budgets.forEach((budget) => {
        const date = new Date(budget.startDate);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const label = `${date.getFullYear()}年${date.getMonth() + 1}月`;
        
        if (!timeGroups.has(yearMonth)) {
          timeGroups.set(yearMonth, []);
        }
        timeGroups.get(yearMonth)!.push(budget);
      });

      // 按时间排序
      const sortedKeys = Array.from(timeGroups.keys()).sort();
      
      grouped = sortedKeys.map((key) => ({
        key,
        label: timeGroups.get(key)![0] ? `${new Date(timeGroups.get(key)![0].startDate).getFullYear()}年${new Date(timeGroups.get(key)![0].startDate).getMonth() + 1}月` : key,
        budgets: timeGroups.get(key)!.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
      }));
    } else if (expenseGroupingMode === 'category') {
      // 按分类分组
      const categoryGroups = new Map<string, BudgetWithStats[]>();
      
      budgets.forEach((budget) => {
        const category = budget.category || '未分类';
        if (!categoryGroups.has(category)) {
          categoryGroups.set(category, []);
        }
        categoryGroups.get(category)!.push(budget);
      });

      grouped = Array.from(categoryGroups.entries())
        .map(([category, budgets]) => ({
          key: category,
          label: category,
          budgets: budgets.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    } else if (expenseGroupingMode === 'cycle') {
      // 按周期类型分组
      const cycleGroups = new Map<string, BudgetWithStats[]>();
      
      budgets.forEach((budget) => {
        const cycleLabel = BUDGET_CYCLE_LABELS[budget.cycleType] || '未知周期';
        if (!cycleGroups.has(budget.cycleType)) {
          cycleGroups.set(budget.cycleType, []);
        }
        cycleGroups.get(budget.cycleType)!.push(budget);
      });

      grouped = Array.from(cycleGroups.entries())
        .map(([cycleType, budgets]) => ({
          key: cycleType,
          label: BUDGET_CYCLE_LABELS[cycleType] || '未知周期',
          budgets: budgets.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
        }));
    }

    return grouped;
  }, [budgets, expenseGroupingMode]);

  // 收入预算分组
  const groupedIncomeBudgets = useMemo(() => {
    if (incomeBudgets.length === 0) return [];

    let grouped: { key: string; label: string; budgets: IIncomeBudget[] }[] = [];

    if (incomeGroupingMode === 'time') {
      // 按时间分组
      const timeGroups = new Map<string, IIncomeBudget[]>();
      
      incomeBudgets.forEach((budget) => {
        const date = new Date(budget.startDate);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!timeGroups.has(yearMonth)) {
          timeGroups.set(yearMonth, []);
        }
        timeGroups.get(yearMonth)!.push(budget);
      });

      const sortedKeys = Array.from(timeGroups.keys()).sort();
      
      grouped = sortedKeys.map((key) => ({
        key,
        label: `${new Date(timeGroups.get(key)![0].startDate).getFullYear()}年${new Date(timeGroups.get(key)![0].startDate).getMonth() + 1}月`,
        budgets: timeGroups.get(key)!.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
      }));
    } else if (incomeGroupingMode === 'category') {
      // 按入账账户分组（作为收入的分类）
      const accountGroups = new Map<string, IIncomeBudget[]>();
      
      incomeBudgets.forEach((budget) => {
        const accountName = getAccountName(budget.accountId);
        if (!accountGroups.has(accountName)) {
          accountGroups.set(accountName, []);
        }
        accountGroups.get(accountName)!.push(budget);
      });

      grouped = Array.from(accountGroups.entries())
        .map(([accountName, budgets]) => ({
          key: accountName,
          label: accountName,
          budgets: budgets.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    } else if (incomeGroupingMode === 'cycle') {
      // 按周期类型分组
      const cycleGroups = new Map<string, IIncomeBudget[]>();
      
      incomeBudgets.forEach((budget) => {
        if (!cycleGroups.has(budget.cycleType)) {
          cycleGroups.set(budget.cycleType, []);
        }
        cycleGroups.get(budget.cycleType)!.push(budget);
      });

      grouped = Array.from(cycleGroups.entries())
        .map(([cycleType, budgets]) => ({
          key: cycleType,
          label: BUDGET_CYCLE_LABELS[cycleType] || '未知周期',
          budgets: budgets.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
        }));
    }

    return grouped;
  }, [incomeBudgets, incomeGroupingMode, accounts]);

  // ========== 支出预算操作 ==========

  const openCreateBudget = () => {
    setEditingId(null);
    setForm(EMPTY_BUDGET_FORM);
    setDialogOpen(true);
  };

  const openEditBudget = (budget: IBudget) => {
    setEditingId(budget.id);
    setForm({
      name: budget.name,
      amount: String(budget.amount),
      cycleType: budget.cycleType,
      startDate: budget.startDate,
      endDate: budget.endDate || '',
      cycleDays: budget.cycleDays ? String(budget.cycleDays) : '30',
      category: budget.category || 'all',
    });
    setDialogOpen(true);
  };

  const handleBudgetSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(form.amount);
    if (!form.name.trim()) {
      toast.error('请输入预算名称');
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('请输入有效的预算金额');
      return;
    }
    if (form.cycleType === 'once' && !form.endDate) {
      toast.error('临时预算必须设置结束日期');
      return;
    }
    if (form.cycleType === 'custom' && (!form.cycleDays || Number(form.cycleDays) < 2)) {
      toast.error('自定义周期至少需要 2 天');
      return;
    }

    if (editingId) {
      const updated = await updateBudget(editingId, {
        name: form.name.trim(),
        amount: amountNum,
        cycleType: form.cycleType,
        startDate: form.startDate,
        endDate: form.cycleType === 'once' ? form.endDate : undefined,
        cycleDays: form.cycleType === 'custom' ? Number(form.cycleDays) : undefined,
        category: form.category === 'all' ? undefined : form.category,
      });
      if (!updated) {
        toast.error('预算更新失败');
        return;
      }
      toast.success('预算已更新');
    } else {
      const created = await createBudget({
        name: form.name.trim(),
        amount: amountNum,
        cycleType: form.cycleType,
        startDate: form.startDate,
        endDate: form.cycleType === 'once' ? form.endDate : undefined,
        cycleDays: form.cycleType === 'custom' ? Number(form.cycleDays) : undefined,
        category: form.category === 'all' ? undefined : form.category,
      });
      if (!created) {
        toast.error('预算创建失败');
        return;
      }
      toast.success('预算已创建');
    }

    setDialogOpen(false);
    await refreshBudgets();
  };

  const handleDeleteBudget = async () => {
    if (!deleteTarget) return;
    const ok = await deleteBudget(deleteTarget.id);
    if (!ok) {
      toast.error('预算删除失败');
      return;
    }
    toast.success('预算已删除');
    setDeleteTarget(null);
    await refreshBudgets();
  };

  // ========== 收入预算操作 ==========

  const openCreateIncome = () => {
    setEditingIncomeId(null);
    setIncomeForm({
      ...EMPTY_INCOME_FORM,
      accountId: accounts[0]?.id || '',
    });
    setIncomeDialogOpen(true);
  };

  const openEditIncome = (budget: IIncomeBudget) => {
    setEditingIncomeId(budget.id);
    setIncomeForm({
      name: budget.name,
      amount: String(budget.amount),
      cycleType: budget.cycleType,
      expectedDate: budget.expectedDate,
      accountId: budget.accountId || '',
      cycleDays: budget.cycleDays ? String(budget.cycleDays) : '30',
      startDate: budget.startDate,
      endDate: budget.endDate || '',
      note: budget.note || '',
    });
    setIncomeDialogOpen(true);
  };

  const handleIncomeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(incomeForm.amount);
    if (!incomeForm.name.trim()) {
      toast.error('请输入收入名称');
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('请输入有效的收入金额');
      return;
    }
    if (incomeForm.cycleType === 'custom' && (!incomeForm.cycleDays || Number(incomeForm.cycleDays) < 2)) {
      toast.error('自定义周期至少需要 2 天');
      return;
    }

    try {
      const payload = {
        name: incomeForm.name.trim(),
        amount: amountNum,
        cycleType: incomeForm.cycleType,
        expectedDate: incomeForm.expectedDate,
        accountId: incomeForm.accountId || undefined,
        cycleDays: incomeForm.cycleType === 'custom' ? Number(incomeForm.cycleDays) : undefined,
        startDate: incomeForm.startDate,
        endDate: incomeForm.endDate || undefined,
        note: incomeForm.note,
      };

      if (editingIncomeId) {
        await incomeBudgetsApi.update(editingIncomeId, payload);
        toast.success('收入预算已更新');
      } else {
        await incomeBudgetsApi.create(payload);
        toast.success('收入预算已创建');
      }

      setIncomeDialogOpen(false);
      await refreshIncomeBudgets();
    } catch (e) {
      toast.error('操作失败');
      console.error(e);
    }
  };

  const handleDeleteIncome = async () => {
    if (!deleteIncomeTarget) return;
    try {
      await incomeBudgetsApi.remove(deleteIncomeTarget.id);
      toast.success('收入预算已删除');
      setDeleteIncomeTarget(null);
      await refreshIncomeBudgets();
    } catch (e) {
      toast.error('删除失败');
      console.error(e);
    }
  };

  // ========== 导入导出 ==========

  const handleExport = async () => {
    const electronAPI = getElectronAPI();
    if (electronAPI) {
      const result = await electronAPI.exportDatabase();
      if (result.success) {
        toast.success('数据库已导出');
      } else {
        toast.error(result.error || '导出失败');
      }
      return;
    }
    exportAllData();
    toast.success('数据已导出');
  };

  const handleImportDatabase = async () => {
    const electronAPI = getElectronAPI();
    if (!electronAPI) return;
    const result = await electronAPI.importDatabase();
    if (result.success) {
      toast.success('数据库已导入');
      await refreshBudgets();
      await refreshIncomeBudgets();
    } else {
      toast.error(result.error || '导入失败');
    }
  };

  const handleImportJson = async () => {
    if (!importInput.trim()) {
      toast.error('请粘贴 JSON 数据');
      return;
    }
    const success = importAllData(importInput);
    if (success) {
      toast.success('数据导入成功');
      setImportInput('');
      await refreshBudgets();
      await refreshIncomeBudgets();
    } else {
      toast.error('数据格式不正确');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="space-y-8 md:space-y-12">
        {/* Hero */}
        <section className="w-full bg-gradient-to-br from-primary/5 via-background to-accent/30 py-12 md:py-16">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Wallet className="size-5 text-primary" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">预算管理</h1>
            </div>
            <p className="text-muted-foreground max-w-xl">
              设定支出预算和收入预期，追踪每笔花销，规划现金流
            </p>
          </div>
        </section>

        {/* 超支预警 */}
        {activeTab === 'expense' && (overBudgetItems.length > 0 || warningItems.length > 0) && (
          <section className="w-full py-0">
            <div className="max-w-7xl mx-auto px-4 md:px-6 space-y-3">
              {overBudgetItems.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30"
                >
                  <AlertTriangle className="size-5 text-destructive shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-destructive">{b.name}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      已超支！使用率 {b.rate}%（{b.used} / {b.amount}）
                    </span>
                  </div>
                </div>
              ))}
              {warningItems.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 p-4 rounded-xl bg-warning/10 border border-warning/30"
                >
                  <AlertTriangle className="size-5 text-warning shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-warning">{b.name}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      即将超支！使用率 {b.rate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 收入预算概览 */}
        {activeTab === 'income' && incomeBudgets.length > 0 && (
          <section className="w-full py-0">
            <div className="max-w-7xl mx-auto px-4 md:px-6">
              <Card className="bg-success/5 border-success/20">
                <CardContent className="pt-6 pb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-success/10 flex items-center justify-center">
                      <TrendingUp className="size-5 text-success" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">本月预计收入</p>
                      <p className="text-2xl font-bold text-success tabular-nums">
                        ¥{monthlyIncomeTotal.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    共 {incomeBudgets.length} 项收入预算
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* Tabs */}
        <section className="w-full py-0">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'expense' | 'income')}>
              <div className="flex items-center justify-between mb-4">
                <TabsList>
                  <TabsTrigger value="expense" className="flex items-center gap-2">
                    <PiggyBank className="size-4" />
                    支出预算
                  </TabsTrigger>
                  <TabsTrigger value="income" className="flex items-center gap-2">
                    <TrendingUp className="size-4" />
                    收入预算
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-2">
                  <Button onClick={activeTab === 'expense' ? openCreateBudget : openCreateIncome}>
                    <Plus className="size-4" />
                    {activeTab === 'expense' ? '新建预算' : '新建收入'}
                  </Button>
                  <Button variant="outline" onClick={handleExport}>
                    <Download className="size-4" />
                    导出数据
                  </Button>
                  {IS_ELECTRON ? (
                    <Button variant="outline" size="sm" onClick={handleImportDatabase}>
                      <Upload className="size-4" />
                      导入数据库
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="粘贴 JSON 导入..."
                        value={importInput}
                        onChange={(e) => setImportInput(e.target.value)}
                        className="w-48 text-sm"
                      />
                      <Button variant="outline" size="sm" onClick={handleImportJson}>
                        <Upload className="size-4" />
                        导入
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* 支出预算 Tab */}
              <TabsContent value="expense" className="mt-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">分组方式：</span>
                    <Tabs value={expenseGroupingMode} onValueChange={(v) => setExpenseGroupingMode(v as GroupingMode)}>
                      <TabsList>
                        <TabsTrigger value="time">按时间</TabsTrigger>
                        <TabsTrigger value="category">按分类</TabsTrigger>
                        <TabsTrigger value="cycle">按周期</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>

                {budgets.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                      <PiggyBank className="size-12 text-muted-foreground/40" />
                      <p className="text-muted-foreground">还没有支出预算</p>
                      <Button variant="outline" onClick={openCreateBudget}>
                        <Plus className="size-4" />
                        创建第一个预算
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    {groupedExpenseBudgets.map((group) => (
                      <div key={group.key} className="space-y-3">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          {group.label}
                          <span className="text-sm text-muted-foreground font-normal">
                            ({group.budgets.length} 个预算)
                          </span>
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {group.budgets.map((budget) => (
                            <Card key={budget.id} className="group">
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <CardTitle className="text-base truncate">{budget.name}</CardTitle>
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <Badge variant="secondary" className="text-xs">
                                        {budget.cycleType === 'custom' && budget.cycleDays
                                          ? `每 ${budget.cycleDays} 天`
                                          : BUDGET_CYCLE_LABELS[budget.cycleType]}
                                      </Badge>
                                      {budget.category && (
                                        <Badge variant="outline" className="text-xs">
                                          {budget.category}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => openEditBudget(budget)}
                                      aria-label="编辑"
                                    >
                                      <Edit className="size-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => setDeleteTarget(budget)}
                                      aria-label="删除"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <div className="flex items-baseline justify-between">
                                  <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                                    ¥{budget.amount.toLocaleString()}
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    剩余 ¥{(budget.amount - budget.used).toLocaleString()}
                                  </span>
                                </div>

                                <div className="space-y-1.5">
                                  <Progress value={Math.min(budget.rate, 100)} className={`h-2 ${getProgressColor(budget.rate)}`} />

                                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>已使用 ¥{budget.used.toLocaleString()}</span>
                                    <Badge variant={getBadgeVariant(budget.rate)} className="text-xs">
                                      {budget.rate}%
                                    </Badge>
                                  </div>
                                </div>

                                <div className="text-xs text-muted-foreground">
                                  {budget.cycleType === 'once' && budget.endDate ? (
                                    <span>
                                      {budget.startDate} ~ {budget.endDate}
                                    </span>
                                  ) : budget.currentPeriodStart && budget.currentPeriodEnd ? (
                                    <span>
                                      当前周期：{budget.currentPeriodStart} ~ {budget.currentPeriodEnd}
                                    </span>
                                  ) : (
                                    <span>自 {budget.startDate} 起</span>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* 收入预算 Tab */}
              <TabsContent value="income" className="mt-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">分组方式：</span>
                    <Tabs value={incomeGroupingMode} onValueChange={(v) => setIncomeGroupingMode(v as GroupingMode)}>
                      <TabsList>
                        <TabsTrigger value="time">按时间</TabsTrigger>
                        <TabsTrigger value="category">按账户</TabsTrigger>
                        <TabsTrigger value="cycle">按周期</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>

                {incomeBudgets.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                      <TrendingUp className="size-12 text-muted-foreground/40" />
                      <p className="text-muted-foreground">还没有收入预算</p>
                      <p className="text-sm text-muted-foreground">记录预期收入，用于现金流预测</p>
                      <Button variant="outline" onClick={openCreateIncome}>
                        <Plus className="size-4" />
                        添加第一笔收入
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    {groupedIncomeBudgets.map((group) => (
                      <div key={group.key} className="space-y-3">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          {group.label}
                          <span className="text-sm text-muted-foreground font-normal">
                            ({group.budgets.length} 个预算)
                          </span>
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {group.budgets.map((budget) => (
                            <Card key={budget.id} className="group">
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <CardTitle className="text-base truncate">{budget.name}</CardTitle>
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <Badge variant="secondary" className="text-xs">
                                        {budget.cycleType === 'custom' && budget.cycleDays
                                          ? `每 ${budget.cycleDays} 天`
                                          : BUDGET_CYCLE_LABELS[budget.cycleType]}
                                      </Badge>
                                      <Badge variant="outline" className="text-xs">
                                        {getAccountName(budget.accountId)}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => openEditIncome(budget)}
                                      aria-label="编辑"
                                    >
                                      <Edit className="size-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => setDeleteIncomeTarget(budget)}
                                      aria-label="删除"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                <div className="flex items-baseline justify-between">
                                  <span className="text-2xl font-bold tabular-nums tracking-tight text-success">
                                    +¥{budget.amount.toLocaleString()}
                                  </span>
                                </div>

                                <div className="space-y-1 text-xs text-muted-foreground">
                                  <div className="flex items-center justify-between">
                                    <span>预计入账日</span>
                                    <span className="font-medium text-foreground">{budget.expectedDate}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>开始日期</span>
                                    <span>{budget.startDate}</span>
                                  </div>
                                  {budget.endDate && (
                                    <div className="flex items-center justify-between">
                                      <span>结束日期</span>
                                      <span>{budget.endDate}</span>
                                    </div>
                                  )}
                                </div>

                                {budget.note && (
                                  <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                                    {budget.note}
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </section>
      </main>

      {/* 支出预算 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
          <form onSubmit={handleBudgetSubmit}>
            <DialogHeader>
              <DialogTitle>{editingId ? '编辑预算' : '新建预算'}</DialogTitle>
              <DialogDescription>
                {editingId ? '修改预算项目的详细信息' : '创建一个新的支出预算项目'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="budget-name">预算名称</Label>
                <Input
                  id="budget-name"
                  placeholder="如：奶茶支出"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="budget-amount">预算金额</Label>
                <Input
                  id="budget-amount"
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>周期类型</Label>
                <Select
                  value={form.cycleType}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      cycleType: v as BudgetCycleType,
                      cycleDays: v === 'custom' ? prev.cycleDays || '30' : prev.cycleDays,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {BUDGET_CYCLE_LABELS[opt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="budget-start">开始日期</Label>
                  <Input
                    id="budget-start"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                {form.cycleType === 'once' && (
                  <div className="grid gap-2">
                    <Label htmlFor="budget-end">结束日期</Label>
                    <Input
                      id="budget-end"
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                    />
                  </div>
                )}
                {form.cycleType === 'custom' && (
                  <div className="grid gap-2">
                    <Label htmlFor="budget-cycle-days">周期天数</Label>
                    <Input
                      id="budget-cycle-days"
                      type="number"
                      min="2"
                      step="1"
                      value={form.cycleDays}
                      onChange={(e) => setForm((prev) => ({ ...prev, cycleDays: e.target.value }))}
                    />
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <Label>关联分类（可选）</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, category: v as TransactionCategory | 'all' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="不限分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">不限分类</SelectItem>
                    {DEFAULT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">{editingId ? '保存修改' : '创建预算'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 收入预算 Dialog */}
      <Dialog open={incomeDialogOpen} onOpenChange={setIncomeDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
          <form onSubmit={handleIncomeSubmit}>
            <DialogHeader>
              <DialogTitle>{editingIncomeId ? '编辑收入预算' : '新建收入预算'}</DialogTitle>
              <DialogDescription>
                {editingIncomeId ? '修改收入预期的详细信息' : '添加一笔预期收入，用于现金流预测（不影响账单）'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="income-name">收入名称</Label>
                <Input
                  id="income-name"
                  placeholder="如：工资、兼职收入"
                  value={incomeForm.name}
                  onChange={(e) => setIncomeForm((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="income-amount">收入金额</Label>
                <Input
                  id="income-amount"
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm((prev) => ({ ...prev, amount: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>周期类型</Label>
                <Select
                  value={incomeForm.cycleType}
                  onValueChange={(v) =>
                    setIncomeForm((prev) => ({
                      ...prev,
                      cycleType: v as BudgetCycleType,
                      cycleDays: v === 'custom' ? prev.cycleDays || '30' : prev.cycleDays,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {BUDGET_CYCLE_LABELS[opt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="income-expected">预计入账日期</Label>
                <Input
                  id="income-expected"
                  type="date"
                  value={incomeForm.expectedDate}
                  onChange={(e) => setIncomeForm((prev) => ({ ...prev, expectedDate: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  周期性收入请填写每月/每周的入账日
                </p>
              </div>
              <div className="grid gap-2">
                <Label>入账账户</Label>
                <Select
                  value={incomeForm.accountId}
                  onValueChange={(v) => setIncomeForm((prev) => ({ ...prev, accountId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择账户" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="income-start">开始日期</Label>
                  <Input
                    id="income-start"
                    type="date"
                    value={incomeForm.startDate}
                    onChange={(e) => setIncomeForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="income-end">结束日期（可选）</Label>
                  <Input
                    id="income-end"
                    type="date"
                    value={incomeForm.endDate}
                    onChange={(e) => setIncomeForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              </div>
              {incomeForm.cycleType === 'custom' && (
                <div className="grid gap-2">
                  <Label htmlFor="income-cycle-days">周期天数</Label>
                  <Input
                    id="income-cycle-days"
                    type="number"
                    min="2"
                    step="1"
                    value={incomeForm.cycleDays}
                    onChange={(e) => setIncomeForm((prev) => ({ ...prev, cycleDays: e.target.value }))}
                  />
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="income-note">备注（可选）</Label>
                <Textarea
                  id="income-note"
                  placeholder="补充说明..."
                  value={incomeForm.note}
                  onChange={(e) => setIncomeForm((prev) => ({ ...prev, note: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIncomeDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">{editingIncomeId ? '保存修改' : '创建收入'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 删除支出预算确认 */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除预算「{deleteTarget?.name}」吗？关联的交易记录将解除预算关联，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBudget} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除收入预算确认 */}
      <AlertDialog
        open={deleteIncomeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteIncomeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除收入预算「{deleteIncomeTarget?.name}」吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteIncome} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
