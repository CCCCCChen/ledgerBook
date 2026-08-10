import { useState, useMemo, useCallback, useEffect, type FormEvent } from 'react';
import { Plus, Download, Upload, TrendingUp, Wallet, PiggyBank, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { IBudget, BudgetCycleType, IIncomeBudget, IAccount } from '@/types/finance';
import { DEFAULT_CATEGORIES, BUDGET_CYCLE_LABELS } from '@/data/finance';
import { exportAllData, importAllData } from '@/lib/storage';
import {
  createBudget, deleteBudget, loadBudgets, updateBudget,
  loadAccounts, loadIncomeBudgets, createIncomeBudget, updateIncomeBudget, deleteIncomeBudget,
} from '@/lib/data-service';
import { getElectronAPI, isElectronRuntime } from '@/lib/electron-api';
import type { BudgetWithStats } from '@/api';
import { nowLocalISODate } from '@/lib/date';

import { BudgetForm } from './BudgetForm';
import { BudgetList } from './BudgetList';

// ============================================================
// Constants & Helpers
// ============================================================

const IS_ELECTRON = isElectronRuntime();

function getTodayISO(): string {
  return nowLocalISODate();
}

function getProgressColor(rate: number): string {
  if (rate > 100) return 'bg-destructive';
  if (rate >= 80) return 'bg-warning';
  return 'bg-success';
}

interface ExpenseFormData {
  name: string;
  amount: string;
  cycleType: string;
  startDate: string;
  endDate: string;
  cycleDays: string;
  category: string;
  isExpenseBudget: boolean;
}

interface IncomeBudgetFormData {
  name: string;
  amount: string;
  cycleType: string;
  expectedDate: string;
  accountId: string;
  cycleDays: string;
  startDate: string;
  endDate: string;
  note: string;
}

const EMPTY_EXPENSE_FORM: ExpenseFormData = {
  name: '',
  amount: '',
  cycleType: 'monthly',
  startDate: getTodayISO(),
  endDate: '',
  cycleDays: '30',
  category: '__all__',
  isExpenseBudget: true,
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

// ============================================================
// BudgetsPage
// ============================================================

export default function BudgetsPage() {
  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');

  // Data
  const [budgets, setBudgets] = useState<BudgetWithStats[]>([]);
  const [incomeBudgets, setIncomeBudgets] = useState<IIncomeBudget[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);

  // Expense Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExpenseFormData>(EMPTY_EXPENSE_FORM);
  const [deleteTarget, setDeleteTarget] = useState<IBudget | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Income Dialog
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);
  const [incomeForm, setIncomeForm] = useState<IncomeBudgetFormData>(EMPTY_INCOME_FORM);
  const [deleteIncomeTarget, setDeleteIncomeTarget] = useState<IIncomeBudget | null>(null);

  // Grouping
  const [expenseGroupingMode, setExpenseGroupingMode] = useState<GroupingMode>('time');
  const [incomeGroupingMode, setIncomeGroupingMode] = useState<GroupingMode>('time');

  const [importInput, setImportInput] = useState<string>('');

  // Helpers
  const getAccountName = (accountId?: string) => {
    if (!accountId) return '未指定账户';
    const acc = accounts.find((a) => a.id === accountId);
    return acc?.name || '未知账户';
  };

  const getCategoryLabel = (c: string): string => c === '__all__' ? '不限' : c;
  const getCycleLabel = (cycleType: string): string =>
    (BUDGET_CYCLE_LABELS as Record<string, string>)[cycleType] || cycleType;

  // Load data
  const refreshBudgets = useCallback(async () => {
    const bdgs = await loadBudgets();
    setBudgets(bdgs);
  }, []);

  const refreshIncomeBudgets = useCallback(async () => {
    try {
      const list = await loadIncomeBudgets();
      setIncomeBudgets(list || []);
    } catch (e) {
      console.error('load income budgets failed', e);
    }
  }, []);

  const refreshAccounts = useCallback(async () => {
    const accs = await loadAccounts();
    setAccounts(accs);
  }, []);

  useEffect(() => {
    void refreshBudgets();
    void refreshIncomeBudgets();
    void refreshAccounts();
  }, [refreshBudgets, refreshIncomeBudgets, refreshAccounts]);

  // Derived
  const overBudgetItems = useMemo(() => budgets.filter((b) => b.rate > 100), [budgets]);
  const warningItems = useMemo(() => budgets.filter((b) => b.rate >= 80 && b.rate <= 100), [budgets]);

  // 分组筛选：支持 全部 / 周期 / 分类 三种维度
  const [viewMode, setViewMode] = useState<'flat' | 'byCycle' | 'byCategory'>('flat');
  const cycleOrder: string[] = ['monthly', 'weekly', 'yearly', 'custom', 'once'];
  const cycleGroups = useMemo(() => {
    const g = new Map<string, BudgetWithStats[]>();
    budgets.forEach((b) => {
      const key = b.cycleType || 'custom';
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(b);
    });
    return Array.from(g.entries())
      .sort(([a], [b]) => (cycleOrder.indexOf(a) === -1 ? 99 : cycleOrder.indexOf(a)) - (cycleOrder.indexOf(b) === -1 ? 99 : cycleOrder.indexOf(b)));
  }, [budgets]);
  const categoryGroups = useMemo(() => {
    const g = new Map<string, BudgetWithStats[]>();
    budgets.forEach((b) => {
      const key = b.category || '其他';
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(b);
    });
    return Array.from(g.entries()).sort(([a], [b]) => a.localeCompare(b, 'zh-CN'));
  }, [budgets]);

  const renderBudgetList = (list: BudgetWithStats[]) => (
    <BudgetList
      budgets={list}
      getCategoryLabel={getCategoryLabel}
      getCycleLabel={getCycleLabel}
      onEdit={openExpenseEdit}
      onDelete={handleExpenseDelete}
    />
  );

  // Expense submit
  const handleExpenseSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.amount) return;
    setSubmitting(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        amount: Number(form.amount),
        cycleType: form.cycleType as BudgetCycleType,
        category: form.category === '__all__' ? undefined : form.category,
      };
      if (form.cycleType === 'custom' && form.cycleDays) {
        payload.cycleConfig = { days: Number(form.cycleDays) };
      }
      if (form.cycleType === 'range') {
        payload.startDate = form.startDate;
        payload.endDate = form.endDate;
      }
      if (form.cycleType === 'once') {
        payload.startDate = form.startDate;
      }

      if (editingId) {
        await updateBudget(editingId, payload);
      } else {
        await createBudget(payload);
      }

      await refreshBudgets();
      setDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_EXPENSE_FORM);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSubmitting(false);
    }
  }, [form, editingId, refreshBudgets]);

  // Expense delete
  const handleExpenseDelete = useCallback(async (b: BudgetWithStats) => {
    setDeleteTarget(b);
  }, []);

  const confirmExpenseDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteBudget(deleteTarget.id);
      await refreshBudgets();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, refreshBudgets]);

  // Open edit dialog
  const openExpenseEdit = useCallback((b: BudgetWithStats) => {
    setEditingId(b.id);
    setForm({
      name: b.name || '',
      amount: String(b.amount || ''),
      cycleType: b.cycleType || 'monthly',
      startDate: b.startDate || getTodayISO(),
      endDate: b.endDate || '',
      cycleDays: (b as any).cycleConfig?.days ? String((b as any).cycleConfig.days) : '30',
      category: b.category || '__all__',
      isExpenseBudget: true,
    });
    setDialogOpen(true);
  }, []);

  const openExpenseAdd = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_EXPENSE_FORM);
    setDialogOpen(true);
  }, []);

  // Income submit
  const handleIncomeSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!incomeForm.name.trim() || !incomeForm.amount) return;
    setSubmitting(true);
    try {
      const payload: any = {
        name: incomeForm.name.trim(),
        amount: Number(incomeForm.amount),
        cycleType: incomeForm.cycleType,
        expectedDate: incomeForm.expectedDate,
        accountId: incomeForm.accountId || undefined,
        note: incomeForm.note,
      };
      if (incomeForm.cycleType === 'custom' && incomeForm.cycleDays) {
        payload.cycleConfig = { days: Number(incomeForm.cycleDays) };
      }
      if (incomeForm.cycleType === 'range') {
        payload.startDate = incomeForm.startDate;
        payload.endDate = incomeForm.endDate;
      }

      if (editingIncomeId) {
        await updateIncomeBudget(editingIncomeId, payload);
      } else {
        await createIncomeBudget(payload);
      }

      await refreshIncomeBudgets();
      setIncomeDialogOpen(false);
      setEditingIncomeId(null);
      setIncomeForm(EMPTY_INCOME_FORM);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSubmitting(false);
    }
  }, [incomeForm, editingIncomeId, refreshIncomeBudgets]);

  const handleIncomeDelete = useCallback(async (b: IIncomeBudget) => {
    setDeleteIncomeTarget(b);
  }, []);

  const confirmIncomeDelete = useCallback(async () => {
    if (!deleteIncomeTarget) return;
    try {
      await deleteIncomeBudget(deleteIncomeTarget.id!);
      await refreshIncomeBudgets();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDeleteIncomeTarget(null);
    }
  }, [deleteIncomeTarget, refreshIncomeBudgets]);

  const openIncomeEdit = useCallback((b: IIncomeBudget) => {
    setEditingIncomeId(b.id || null);
    setIncomeForm({
      name: b.name || '',
      amount: String(b.amount || ''),
      cycleType: b.cycleType,
      expectedDate: b.expectedDate || getTodayISO(),
      accountId: b.accountId || '',
      cycleDays: (b as any).cycleConfig?.days ? String((b as any).cycleConfig.days) : '30',
      startDate: b.startDate || getTodayISO(),
      endDate: b.endDate || '',
      note: b.note || '',
    });
    setIncomeDialogOpen(true);
  }, []);

  const openIncomeAdd = useCallback(() => {
    setEditingIncomeId(null);
    setIncomeForm(EMPTY_INCOME_FORM);
    setIncomeDialogOpen(true);
  }, []);

  // Export / Import
  const handleExport = useCallback(async () => {
    try {
      exportAllData();
      toast.success('导出成功');
    } catch (err) {
      toast.error(`导出失败: ${String(err)}`);
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!importInput.trim()) return;
    try {
      await importAllData(importInput.trim());
      await refreshBudgets();
      await refreshIncomeBudgets();
      await refreshAccounts();
      setImportInput('');
      toast.success('导入成功');
    } catch (err) {
      toast.error(`导入失败: ${String(err)}`);
    }
  }, [importInput, refreshBudgets, refreshIncomeBudgets, refreshAccounts]);

  // ============================================================
  // Income Budget Card List Component (inline, lighter)
  // ============================================================
  const IncomeBudgetCardList = () => {
    if (incomeBudgets.length === 0) {
      return (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-lg">暂无收入预算</p>
            <p className="text-sm mt-1">计划每个月的预期收入</p>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {incomeBudgets.map((ib) => (
          <Card key={ib.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate flex items-center gap-2">
                    {ib.name}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {getCycleLabel(ib.cycleType)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getAccountName(ib.accountId)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openIncomeEdit(ib)}><Edit className="size-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleIncomeDelete(ib)}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold tabular-nums text-success">¥{ib.amount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {ib.note ? `备注: ${ib.note}` : '预期收入'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">预算管理</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="size-3.5 mr-1.5" />导出</Button>
          <Button size="sm" onClick={activeTab === 'expense' ? openExpenseAdd : openIncomeAdd}>
            <Plus className="size-3.5 mr-1.5" />
            {activeTab === 'expense' ? '添加预算' : '添加收入预算'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'expense' | 'income')}>
        <TabsList>
          <TabsTrigger value="expense">支出预算</TabsTrigger>
          <TabsTrigger value="income">收入预算</TabsTrigger>
        </TabsList>

        {/* Expense Budget Tab */}
        <TabsContent value="expense" className="space-y-4">
          {overBudgetItems.length > 0 && (
            <Card className="border-destructive/50">
              <CardHeader className="pb-2"><CardTitle className="text-base text-destructive">超支预警</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {overBudgetItems.map((b) => (
                    <div key={b.id} className="flex items-center justify-between text-sm">
                      <span>{b.name}</span>
                      <span className="text-destructive font-semibold">{Math.round(b.rate)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 视图切换：平铺 / 按周期分组 / 按分类分组 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">分组查看：</span>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-auto">
              <TabsList>
                <TabsTrigger value="flat">全部</TabsTrigger>
                <TabsTrigger value="byCycle">按周期</TabsTrigger>
                <TabsTrigger value="byCategory">按分类</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {viewMode === 'flat' && renderBudgetList(budgets)}

          {viewMode === 'byCycle' && (
            <div className="space-y-6">
              {cycleGroups.length === 0 && (
                <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">暂无预算</CardContent></Card>
              )}
              {cycleGroups.map(([cycleType, list]) => (
                <div key={cycleType} className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold text-foreground">
                      {getCycleLabel(cycleType)}
                      <span className="text-xs font-normal text-muted-foreground ml-2">{list.length} 项</span>
                    </h2>
                  </div>
                  {renderBudgetList(list)}
                </div>
              ))}
            </div>
          )}

          {viewMode === 'byCategory' && (
            <div className="space-y-6">
              {categoryGroups.length === 0 && (
                <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">暂无预算</CardContent></Card>
              )}
              {categoryGroups.map(([category, list]) => (
                <div key={category} className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-sm font-semibold text-foreground">
                      {getCategoryLabel(category)}
                      <span className="text-xs font-normal text-muted-foreground ml-2">{list.length} 项</span>
                    </h2>
                  </div>
                  {renderBudgetList(list)}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Income Budget Tab */}
        <TabsContent value="income" className="space-y-4">
          <IncomeBudgetCardList />
        </TabsContent>
      </Tabs>

      {/* Expense Form Dialog */}
      <BudgetForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingId={editingId}
        form={form}
        onChange={setForm}
        onSubmit={handleExpenseSubmit}
        submitting={submitting}
        expenseCategories={DEFAULT_CATEGORIES.map((c: any) => c.value || c)}
        incomeCategories={[]}
        budgetType="expense"
      />

      {/* Income Form Dialog */}
      <BudgetForm
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        editingId={editingIncomeId}
        form={{
          name: incomeForm.name,
          amount: incomeForm.amount,
          cycleType: incomeForm.cycleType,
          startDate: incomeForm.startDate,
          endDate: incomeForm.endDate,
          cycleDays: incomeForm.cycleDays,
          category: '__all__',
          isExpenseBudget: false,
        }}
        onChange={(f) => setIncomeForm({ ...incomeForm, ...f, isExpenseBudget: undefined } as IncomeBudgetFormData)}
        onSubmit={handleIncomeSubmit}
        submitting={submitting}
        expenseCategories={[]}
        incomeCategories={[]}
        budgetType="income"
      />

      {/* Delete Alert */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-sm">
            <CardHeader><CardTitle>确认删除</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm">确定要删除预算 "{deleteTarget.name}" 吗？</p>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>取消</Button>
                <Button variant="destructive" size="sm" onClick={confirmExpenseDelete}>删除</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      {deleteIncomeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-sm">
            <CardHeader><CardTitle>确认删除</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm">确定要删除收入预算 "{deleteIncomeTarget.name}" 吗？</p>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setDeleteIncomeTarget(null)}>取消</Button>
                <Button variant="destructive" size="sm" onClick={confirmIncomeDelete}>删除</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Import Dialog */}
      <ImportDialog
        open={!!importInput || false}
        importInput={importInput}
        setImportInput={setImportInput}
        onImport={handleImport}
        onClose={() => setImportInput('')}
      />
    </div>
  );
}

// Import/Export helper sub-component
function ImportDialog({ open, importInput, setImportInput, onImport, onClose }: any) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-lg">
        <CardHeader><CardTitle>导入数据</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">粘贴 JSON 数据后点击导入。导入将替换所有现有数据。</p>
          <textarea
            className="w-full h-64 text-sm font-mono border rounded-md p-3"
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
            <Button size="sm" onClick={onImport}>导入</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
