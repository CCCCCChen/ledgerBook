import { useState, useMemo, useCallback, useEffect, type FormEvent } from 'react';
import { Plus, Edit, Trash2, AlertTriangle, PiggyBank, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { IBudget, BudgetCycleType, ITransaction, TransactionCategory } from '@/types/finance';
import { DEFAULT_CATEGORIES, BUDGET_CYCLE_LABELS } from '@/data/finance';
import { exportAllData, importAllData } from '@/lib/storage';
import { createBudget, deleteBudget, loadBudgets, loadTransactions, updateBudget } from '@/lib/data-service';
import { getElectronAPI, isElectronRuntime } from '@/lib/electron-api';

const CYCLE_OPTIONS: BudgetCycleType[] = ['once', 'weekly', 'monthly', 'yearly'];

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function getBudgetUsed(budgetId: string, transactions: { budgetId?: string; amount: number }[]): number {
  return transactions
    .filter((t) => t.budgetId === budgetId && t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
}

function getUsageRate(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((used / total) * 100);
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
  category: TransactionCategory | 'all';
}

const EMPTY_FORM: BudgetFormData = {
  name: '',
  amount: '',
  cycleType: 'monthly',
  startDate: getTodayISO(),
  endDate: '',
  category: 'all',
};

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<IBudget[]>([]);
  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BudgetFormData>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<IBudget | null>(null);
  const [importInput, setImportInput] = useState<string>('');

  const refreshBudgets = useCallback(async () => {
    const [bdgs, txns] = await Promise.all([loadBudgets(), loadTransactions()]);
    setBudgets(bdgs);
    setTransactions(txns);
  }, []);

  useEffect(() => {
    void refreshBudgets();
  }, [refreshBudgets]);

  // 预算使用统计
  const budgetStats = useMemo(() => {
    return budgets.map((b) => {
      const used = getBudgetUsed(b.id, transactions);
      const rate = getUsageRate(used, b.amount);
      return { ...b, used, rate };
    });
  }, [budgets, transactions]);

  // 超支预警列表
  const overBudgetItems = useMemo(
    () => budgetStats.filter((b) => b.rate > 100),
    [budgetStats],
  );

  const warningItems = useMemo(
    () => budgetStats.filter((b) => b.rate >= 80 && b.rate <= 100),
    [budgetStats],
  );

  // 打开新建 Dialog
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  // 打开编辑 Dialog
  const openEdit = (budget: IBudget) => {
    setEditingId(budget.id);
    setForm({
      name: budget.name,
      amount: String(budget.amount),
      cycleType: budget.cycleType,
      startDate: budget.startDate,
      endDate: budget.endDate || '',
      category: budget.category || 'all',
    });
    setDialogOpen(true);
  };

  // 提交表单
  const handleSubmit = async (e: FormEvent) => {
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

    if (editingId) {
      const updated = await updateBudget(editingId, {
        name: form.name.trim(),
        amount: amountNum,
        cycleType: form.cycleType,
        startDate: form.startDate,
        endDate: form.cycleType === 'once' ? form.endDate : undefined,
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

  // 删除预算
  const handleDelete = async () => {
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

  // 导入数据
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
                <PiggyBank className="size-5 text-primary" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">预算管理</h1>
            </div>
            <p className="text-muted-foreground max-w-xl">
              设定支出预算，追踪每笔花销是否在预算范围内，告别超支焦虑
            </p>
          </div>
        </section>

        {/* 超支预警 */}
        {(overBudgetItems.length > 0 || warningItems.length > 0) && (
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

        {/* 操作栏 */}
        <section className="w-full py-0">
          <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-wrap items-center gap-3">
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              新建预算
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="size-4" />
              导出数据
            </Button>
            {isElectronRuntime ? (
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={handleImportDatabase}>
                  <Upload className="size-4" />
                  导入数据库
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 ml-auto">
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
        </section>

        {/* 预算卡片列表 */}
        <section className="w-full py-0">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            {budgetStats.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                  <PiggyBank className="size-12 text-muted-foreground/40" />
                  <p className="text-muted-foreground">还没有预算项目</p>
                  <Button variant="outline" onClick={openCreate}>
                    <Plus className="size-4" />
                    创建第一个预算
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {budgetStats.map((budget) => (
                  <Card key={budget.id} className="group">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate">{budget.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-1.5">
                            <Badge variant="secondary" className="text-xs">
                              {BUDGET_CYCLE_LABELS[budget.cycleType]}
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
                            onClick={() => openEdit(budget)}
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
                      {/* 金额信息 */}
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                          ¥{budget.amount.toLocaleString()}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          剩余 ¥{(budget.amount - budget.used).toLocaleString()}
                        </span>
                      </div>

                      {/* 进度条 */}
                      <div className="space-y-1.5">
                        <Progress
                          value={Math.min(budget.rate, 100)}
                          className="h-2 [&>*]:bg-primary"
                        />

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>已使用 ¥{budget.used.toLocaleString()}</span>
                          <Badge variant={getBadgeVariant(budget.rate)} className="text-xs">
                            {budget.rate}%
                          </Badge>
                        </div>
                      </div>

                      {/* 日期信息 */}
                      <div className="text-xs text-muted-foreground">
                        {budget.cycleType === 'once' && budget.endDate ? (
                          <span>
                            {budget.startDate} ~ {budget.endDate}
                          </span>
                        ) : (
                          <span>自 {budget.startDate} 起</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 新建/编辑 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
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
                    setForm((prev) => ({ ...prev, cycleType: v as BudgetCycleType }))
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

      {/* 删除确认 */}
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
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
