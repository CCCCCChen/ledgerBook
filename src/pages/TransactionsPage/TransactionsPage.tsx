import { useState, useMemo, useCallback, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Plus, Download, Upload, Search, Filter, X, Pencil, Trash2, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import type { IAccount, IBudget, ITransaction, TransactionCategory } from '@/types/finance';
import { DEFAULT_CATEGORIES, ACCOUNT_TYPE_LABELS } from '@/data/finance';
import { exportAllData, importAllData } from '@/lib/storage';
import { createTransaction, deleteTransaction, loadAccounts, loadBudgets, loadTransactions, updateTransaction } from '@/lib/data-service';
import { getElectronAPI, isElectronRuntime } from '@/lib/electron-api';

const CATEGORIES: TransactionCategory[] = DEFAULT_CATEGORIES;

interface TransactionFormData {
  date: string;
  accountId: string;
  amount: string;
  isExpense: boolean;
  category: TransactionCategory;
  note: string;
  isBudgeted: boolean;
  budgetId: string;
}

const EMPTY_FORM: TransactionFormData = {
  date: new Date().toISOString().slice(0, 10),
  accountId: '',
  amount: '',
  isExpense: true,
  category: '餐饮',
  note: '',
  isBudgeted: false,
  budgetId: '',
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [budgets, setBudgets] = useState<IBudget[]>([]);

  // Filters
  const [filterAccountId, setFilterAccountId] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TransactionFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Import
  const [importing, setImporting] = useState(false);

  // Sort
  const [sortAsc, setSortAsc] = useState(false);

  const refreshAll = useCallback(async () => {
    try {
      const [txns, accts, bdgs] = await Promise.all([
        loadTransactions(),
        loadAccounts(),
        loadBudgets(),
      ]);
      setTransactions(txns);
      setAccounts(accts);
      setBudgets(bdgs);
    } catch (error) {
      toast.error(`加载数据失败：${String(error)}`);
    }
  }, []);

  const refreshTransactions = useCallback(async () => {
    try {
      const txns = await loadTransactions();
      setTransactions(txns);
    } catch (error) {
      toast.error(`加载交易记录失败：${String(error)}`);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Filtered & sorted
  const filtered = useMemo(() => {
    let result = [...transactions];

    if (filterAccountId !== 'all') {
      result = result.filter((t) => t.accountId === filterAccountId);
    }
    if (filterCategory !== 'all') {
      result = result.filter((t) => t.category === filterCategory);
    }
    if (filterDateFrom) {
      result = result.filter((t) => t.date >= filterDateFrom);
    }
    if (filterDateTo) {
      result = result.filter((t) => t.date <= filterDateTo);
    }
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.note.toLowerCase().includes(kw) ||
          t.category.toLowerCase().includes(kw)
      );
    }

    result.sort((a, b) => {
      const cmp = new Date(b.date).getTime() - new Date(a.date).getTime();
      return sortAsc ? -cmp : cmp;
    });

    return result;
  }, [transactions, filterAccountId, filterCategory, filterDateFrom, filterDateTo, searchKeyword, sortAsc]);

  // Helpers
  const getAccountName = (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    return acc ? acc.name : '未知账户';
  };
  const getAccountType = (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    return acc ? ACCOUNT_TYPE_LABELS[acc.type as keyof typeof ACCOUNT_TYPE_LABELS] || acc.type : '';
  };
  const getBudgetName = (id: string) => {
    const b = budgets.find((b) => b.id === id);
    return b ? b.name : '';
  };

  // Form handlers
  const openAddDialog = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) });
    setDialogOpen(true);
  };

  const openEditDialog = (txn: ITransaction) => {
    setEditingId(txn.id);
    setForm({
      date: txn.date,
      accountId: txn.accountId,
      amount: String(Math.abs(txn.amount)),
      isExpense: txn.amount < 0,
      category: txn.category,
      note: txn.note,
      isBudgeted: txn.isBudgeted,
      budgetId: txn.budgetId || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.accountId || !form.amount || Number(form.amount) <= 0) {
      toast.error('请填写完整的交易信息');
      return;
    }
    if (form.isBudgeted && !form.budgetId) {
      toast.error('请选择关联的预算项目');
      return;
    }

    setSubmitting(true);
    const amount = Number(form.amount) * (form.isExpense ? -1 : 1);

    try {
      if (editingId) {
        const updated = await updateTransaction(editingId, {
          date: form.date,
          accountId: form.accountId,
          amount,
          category: form.category,
          note: form.note,
          isBudgeted: form.isBudgeted,
          budgetId: form.isBudgeted ? form.budgetId : undefined,
        });
        if (!updated) {
          toast.error('交易记录更新失败');
        } else {
          toast.success('交易记录已更新');
        }
      } else {
        const created = await createTransaction({
          date: form.date,
          accountId: form.accountId,
          amount,
          category: form.category,
          note: form.note,
          isBudgeted: form.isBudgeted,
          budgetId: form.isBudgeted ? form.budgetId : undefined,
        });
        if (!created) {
          toast.error('交易记录创建失败');
        } else {
          toast.success('交易记录已添加');
        }
      }

      await refreshTransactions();
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
    } finally {
      setSubmitting(false);
    }

  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const ok = await deleteTransaction(deleteTarget);
      if (ok) {
        toast.success('交易记录已删除');
        await refreshTransactions();
      } else {
        toast.error('删除失败');
      }
    } catch (error) {
      toast.error(`删除失败：${String(error)}`);
    }
    setDeleteTarget(null);
  };

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
    setImporting(true);
    try {
      const result = await electronAPI.importDatabase();
      if (result.success) {
        toast.success('数据库已导入');
        await refreshAll();
      } else {
        toast.error(result.error || '导入失败');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleImportJson = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') {
        const ok = importAllData(text);
        if (ok) {
          toast.success('数据导入成功');
          void refreshAll();
        } else {
          toast.error('文件格式不正确，导入失败');
        }
      }
      setImporting(false);
      e.target.value = '';
    };
    reader.onerror = () => {
      toast.error('文件读取失败');
      setImporting(false);
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  // Totals
  const totalIncome = useMemo(
    () => filtered.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [filtered]
  );
  const totalExpense = useMemo(
    () => filtered.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
    [filtered]
  );

  const hasActiveFilters =
    filterAccountId !== 'all' ||
    filterCategory !== 'all' ||
    filterDateFrom !== '' ||
    filterDateTo !== '' ||
    searchKeyword.trim() !== '';

  const clearFilters = () => {
    setFilterAccountId('all');
    setFilterCategory('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchKeyword('');
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">总账目表</h1>
            <p className="text-sm text-muted-foreground mt-1">
              管理所有账户的收支记录
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={openAddDialog} size="sm">
              <Plus className="size-4" />
              添加记录
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4" />
              导出
            </Button>
            {isElectronRuntime ? (
              <Button variant="outline" size="sm" onClick={handleImportDatabase} disabled={importing}>
                <Upload className="size-4" />
                {importing ? '导入中...' : '导入'}
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  <Upload className="size-4" />
                  {importing ? '导入中...' : '导入'}
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportJson}
                    className="hidden"
                    disabled={importing}
                  />
                </label>
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                记录数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{filtered.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                收入合计
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-success">
                ¥{totalIncome.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                支出合计
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-destructive">
                ¥{totalExpense.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                结余
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-2xl font-bold tabular-nums ${
                  totalIncome - totalExpense >= 0 ? 'text-foreground' : 'text-destructive'
                }`}
              >
                ¥{(totalIncome - totalExpense).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col gap-3">
              {/* Search bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="搜索备注或分类..."
                    className="bg-background pl-9"
                  />
                </div>
                <Button
                  variant={showFilters ? 'secondary' : 'outline'}
                  size="icon"
                  onClick={() => setShowFilters(!showFilters)}
                  aria-label="筛选"
                >
                  <Filter className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSortAsc(!sortAsc)}
                  aria-label="排序"
                >
                  <ArrowUpDown className="size-4" />
                </Button>
              </div>

              {/* Expandable filters */}
              {showFilters && (
                <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
                  <div className="flex flex-col gap-1.5 min-w-[140px]">
                    <Label className="text-xs text-muted-foreground">账户</Label>
                    <Select value={filterAccountId} onValueChange={setFilterAccountId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="全部账户" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部账户</SelectItem>
                        {accounts.map((a: { id: string; name: string }) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5 min-w-[120px]">
                    <Label className="text-xs text-muted-foreground">分类</Label>
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="全部分类" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部分类</SelectItem>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">开始日期</Label>
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className="h-9 w-[150px]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">结束日期</Label>
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className="h-9 w-[150px]"
                    />
                  </div>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="h-9"
                    >
                      <X className="size-3" />
                      清除筛选
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              交易记录
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2 align-middle">
                  已筛选
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <p className="text-lg">暂无交易记录</p>
                <p className="text-sm mt-1">
                  {hasActiveFilters ? '尝试调整筛选条件' : '点击"添加记录"开始记账'}
                </p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">日期</TableHead>
                      <TableHead className="whitespace-nowrap">账户</TableHead>
                      <TableHead className="whitespace-nowrap">分类</TableHead>
                      <TableHead className="whitespace-nowrap text-right">金额</TableHead>
                      <TableHead className="whitespace-nowrap">备注</TableHead>
                      <TableHead className="whitespace-nowrap">预算</TableHead>
                      <TableHead className="whitespace-nowrap text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((txn) => (
                      <TableRow key={txn.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {txn.date}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="text-sm font-medium">{getAccountName(txn.accountId)}</div>
                          <div className="text-xs text-muted-foreground">
                            {getAccountType(txn.accountId)}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className="text-xs">
                            {txn.category}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`whitespace-nowrap text-right text-sm font-semibold tabular-nums ${
                            txn.amount >= 0 ? 'text-success' : 'text-destructive'
                          }`}
                        >
                          {txn.amount >= 0 ? '+' : ''}¥{Math.abs(txn.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="max-w-[160px]">
                          <span className="block truncate text-sm">{txn.note || '-'}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {txn.isBudgeted && txn.budgetId ? (
                            <Badge variant="secondary" className="text-xs">
                              {getBudgetName(txn.budgetId)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(txn)}
                              aria-label="编辑"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(txn.id)}
                              aria-label="删除"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingId ? '编辑交易记录' : '添加交易记录'}</DialogTitle>
              <DialogDescription>
                {editingId ? '修改交易信息后保存' : '填写交易信息并保存'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* Date */}
              <div className="grid gap-1.5">
                <Label htmlFor="txn-date">日期</Label>
                <Input
                  id="txn-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>

              {/* Account */}
              <div className="grid gap-1.5">
                <Label>账户</Label>
                <Select
                  value={form.accountId}
                  onValueChange={(v) => setForm({ ...form, accountId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择账户" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a: { id: string; name: string }) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount + type */}
              <div className="grid gap-1.5">
                <Label htmlFor="txn-amount">金额</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={form.isExpense ? 'destructive' : 'outline'}
                    size="sm"
                    className="shrink-0"
                    onClick={() => setForm({ ...form, isExpense: !form.isExpense })}
                  >
                    {form.isExpense ? '支出' : '收入'}
                  </Button>
                  <Input
                    id="txn-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    required
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Category */}
              <div className="grid gap-1.5">
                <Label>分类</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as TransactionCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Note */}
              <div className="grid gap-1.5">
                <Label htmlFor="txn-note">备注</Label>
                <Textarea
                  id="txn-note"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="可选备注"
                  rows={2}
                />
              </div>

              {/* Budget toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="txn-budgeted" className="cursor-pointer">
                  是否预算内
                </Label>
                <Switch
                  id="txn-budgeted"
                  checked={form.isBudgeted}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, isBudgeted: checked, budgetId: checked ? form.budgetId : '' })
                  }
                />
              </div>

              {form.isBudgeted && (
                <div className="grid gap-1.5">
                  <Label>关联预算项目</Label>
                  <Select
                    value={form.budgetId}
                    onValueChange={(v) => setForm({ ...form, budgetId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择预算项目" />
                    </SelectTrigger>
                    <SelectContent>
                      {budgets.map((b: { id: string; name: string }) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中...' : editingId ? '更新' : '添加'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后不可恢复，确定要删除这条交易记录吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
