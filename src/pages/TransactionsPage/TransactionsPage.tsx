import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { FileDown, FileUp, Plus } from 'lucide-react';
import {
  loadTransactions,
  loadAccounts,
  loadBudgets,
  loadIncomeBudgets,
  loadPlannedExpenses,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/lib/data-service';
import { forecastApi } from '@/lib/data-service';
import type { ITransaction, IAccount, ExpenseAttribute, TransactionCategory } from '@/types/finance';
import { TransactionForm } from './TransactionForm';
import { TransactionTable } from './TransactionTable';
import { TransactionFilters } from './TransactionFilters';

// ============================================================
// Types & Constants
// ============================================================

export interface TransactionFormData {
  date: string;
  amount: string;
  isExpense: boolean;
  category: string;
  expenseAttribute: string;
  note: string;
  isBudgeted: boolean;
  budgetId: string;
  accountId: string;
  transactionType: string;
  repaymentTargetAccountId: string;
  installmentCount: string;
  feeTotal: string;
  editScope: string;
}

export const EMPTY_FORM: TransactionFormData = {
  date: new Date().toISOString().slice(0, 10),
  amount: '',
  isExpense: true,
  category: '其他',
  expenseAttribute: '',
  note: '',
  isBudgeted: false,
  budgetId: '',
  accountId: '',
  transactionType: 'normal',
  repaymentTargetAccountId: '',
  installmentCount: '3',
  feeTotal: '',
  editScope: 'plan',
};

const CATEGORIES: string[] = ['餐饮', '购物', '交通', '娱乐', '住房', '其他'];

const EXPENSE_ATTRIBUTE_OPTIONS: string[] = ['rigid_fixed', 'flexible_monthly', 'annual_cycle', 'one_time_emergency'];
const EXPENSE_ATTRIBUTE_LABELS: Record<string, string> = {
  rigid_fixed: '刚性固定支出',
  flexible_monthly: '弹性月度支出',
  annual_cycle: '年度周期支出',
  one_time_emergency: '一次性突发支出',
};

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  normal: '普通',
  transfer: '转账',
  repayment_out: '还款（扣款）',
  repayment_in: '还款（到账）',
  installment_bill: '分期',
};

const PAGE_SIZE = 20;

// ============================================================
// TransactionsPage
// ============================================================

const TransactionsPage: React.FC = () => {

  // Data
  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TransactionFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<ITransaction | null>(null);
  const [deleteScope, setDeleteScope] = useState<'single' | 'plan'>('plan');

  // Filters & sort
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortAsc, setSortAsc] = useState(false);
  const [filterAccountId, setFilterAccountId] = useState('__all__');
  const [filterCategory, setFilterCategory] = useState('__all__');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Impact assessment
  const [impactResult, setImpactResult] = useState<any>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactStartBalance, setImpactStartBalance] = useState('0');
  const [impactSafetyLine, setImpactSafetyLine] = useState('0');
  const [impactIncludePlannedExpenses, setImpactIncludePlannedExpenses] = useState(true);
  const [impactIncludeBudgetSettlement, setImpactIncludeBudgetSettlement] = useState(false);

  // Load data
  const fetchData = useCallback(async () => {
    const [txns, accts, buds] = await Promise.all([
      loadTransactions(),
      loadAccounts(),
      loadBudgets(),
    ]);
    setTransactions(txns);
    setAccounts(accts);
    setBudgets(buds);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Helpers
  const getAccountName = useCallback(
    (id: string) => accounts.find((a) => a.id === id)?.name || '未知',
    [accounts],
  );
  const getAccountType = useCallback(
    (id: string) => accounts.find((a) => a.id === id)?.type || '',
    [accounts],
  );
  const getBudgetName = useCallback(
    (id: string) => budgets.find((b: any) => b.id === id)?.name || '未知',
    [budgets],
  );
  const getTransactionTypeLabel = useCallback(
    (type?: string) => TRANSACTION_TYPE_LABELS[type || 'normal'] || '普通',
    [],
  );
  const isCashFlowShifted = useCallback(
    (txn: ITransaction) => !!txn.cashOutDate && txn.cashOutDate !== txn.date,
    [],
  );

  const currentPlanStarted = useMemo(() => {
    if (!editingId) return false;
    const txn = transactions.find((t) => t.id === editingId);
    if (!txn?.installmentPlanId) return false;
    const firstDate = transactions
      .filter((t) => t.installmentPlanId === txn.installmentPlanId)
      .map((t) => t.date)
      .sort()[0];
    return firstDate && firstDate <= new Date().toISOString().slice(0, 10);
  }, [editingId, transactions]);

  const editingMeta = useMemo(() => {
    if (!editingId) return null;
    return transactions.find((t) => t.id === editingId) || null;
  }, [editingId, transactions]);

  // Filtering & sorting
  const filtered = useMemo(() => {
    let result = [...transactions];

    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      result = result.filter(
        (t) =>
          (t.note || '').toLowerCase().includes(kw) ||
          (t.category || '').toLowerCase().includes(kw),
      );
    }

    if (filterAccountId !== '__all__') {
      result = result.filter((t) => t.accountId === filterAccountId);
    }
    if (filterCategory !== '__all__') {
      result = result.filter((t) => t.category === filterCategory);
    }
    if (filterDateFrom) {
      result = result.filter((t) => t.date >= filterDateFrom);
    }
    if (filterDateTo) {
      result = result.filter((t) => t.date <= filterDateTo);
    }

    result.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date) || a.amount - b.amount;
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [transactions, searchKeyword, filterAccountId, filterCategory, filterDateFrom, filterDateTo, sortAsc]);

  const hasActiveFilters = useMemo(
    () =>
      filterAccountId !== '__all__' ||
      filterCategory !== '__all__' ||
      !!filterDateFrom ||
      !!filterDateTo,
    [filterAccountId, filterCategory, filterDateFrom, filterDateTo],
  );

  const clearFilters = useCallback(() => {
    setFilterAccountId('__all__');
    setFilterCategory('__all__');
    setFilterDateFrom('');
    setFilterDateTo('');
    setPage(1);
  }, []);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // Totals
  const totalIncome = useMemo(
    () => filtered.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
    [filtered],
  );
  const totalExpense = useMemo(
    () => filtered.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    [filtered],
  );

  // Form handlers
  const openAddDialog = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImpactResult(null);
    setFormOpen(true);
  }, []);

  const openEditDialog = useCallback(
    (txn: ITransaction) => {
      setEditingId(txn.id);
      setForm({
        date: txn.date || '',
        amount: String(Math.abs(txn.amount)),
        isExpense: txn.amount < 0,
        category: txn.category || '其他',
        expenseAttribute: txn.expenseAttribute || '',
        note: txn.note || '',
        isBudgeted: Boolean(txn.isBudgeted),
        budgetId: txn.budgetId || '',
        accountId: txn.accountId || '',
        transactionType: txn.transactionType || 'normal',
        repaymentTargetAccountId: txn.repaymentTargetAccountId || '',
        installmentCount: txn.installmentTotal ? String(txn.installmentTotal) : '3',
        feeTotal: '',
        editScope: 'plan',
      });
      setImpactResult(null);
      setFormOpen(true);
    },
    [],
  );

  const handleCancel = useCallback(() => {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setImpactResult(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.accountId || !form.amount || !form.date) return;

      if (form.transactionType === 'repayment_out' && !form.repaymentTargetAccountId) {
        toast.error('请选择还款目标账户');
        return;
      }

      setSubmitting(true);
      try {
        const amount = Number(form.amount);
        const payload: any = {
          date: form.date,
          amount,
          category: form.category as TransactionCategory,
          note: form.note,
          isBudgeted: form.isBudgeted,
          budgetId: form.isBudgeted ? form.budgetId || undefined : undefined,
          accountId: form.accountId,
          transactionType: form.transactionType,
          expenseAttribute: (form.expenseAttribute || undefined) as ExpenseAttribute | undefined,
        };

        if (form.transactionType === 'repayment_out') {
          payload.repaymentTargetAccountId = form.repaymentTargetAccountId;
        }
        if (form.transactionType === 'installment_bill' && !editingId) {
          payload.installmentCount = Number(form.installmentCount) || 3;
          payload.feeTotal = Number(form.feeTotal) || 0;
        }

        if (form.transactionType === 'normal') {
          payload.isExpense = form.isExpense;
        }

        if (editingId) {
          if (editingMeta?.transactionType === 'installment_bill') {
            await updateTransaction(editingId, payload, form.editScope as 'single' | 'plan');
          } else {
            await updateTransaction(editingId, payload, 'single');
          }
        } else {
          await createTransaction(payload);
        }

        await fetchData();
        handleCancel();
      } catch (err) {
        toast.error('操作失败', { description: String(err) });
      } finally {
        setSubmitting(false);
      }
    },
    [form, editingId, editingMeta, fetchData, handleCancel, toast],
  );

  // Delete
  const handleDelete = useCallback(
    async (txn: ITransaction) => {
      if (txn.transactionType === 'repayment_in') return;
      setDeleteTarget(txn);
      setDeleteScope(txn.installmentPlanId ? 'plan' : 'single');
    },
    [],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      const success = await deleteTransaction(deleteTarget.id, deleteScope);
      if (success) {
        await fetchData();
      } else {
        toast.error('删除失败', { description: '分期已开始执行，无法删除' });
      }
    } catch (err) {
      toast.error('删除失败', { description: String(err) });
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteScope, fetchData, toast]);

  // Impact
  const handleRunImpact = useCallback(async () => {
    if (!form.amount) return;
    setImpactLoading(true);
    try {
      const result = await forecastApi.impact({
        rangeFrom: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
        rangeTo: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
        startBalance: Number(impactStartBalance) || 0,
        includePlannedExpenses: impactIncludePlannedExpenses,
        includeBudgetSettlement: impactIncludeBudgetSettlement,
        simulatedExpense: {
          amount: Number(form.amount),
          date: form.date,
          accountId: form.accountId || undefined,
        },
      });
      setImpactResult(result.data);
    } catch {
      toast.error('评估失败');
    } finally {
      setImpactLoading(false);
    }
  }, [form, impactStartBalance, impactSafetyLine, impactIncludePlannedExpenses, impactIncludeBudgetSettlement, toast]);

  // Delete installment plan
  const handleDeleteInstallmentPlan = useCallback(async () => {
    if (!editingId || !editingMeta?.installmentPlanId) return;
    try {
      const success = await deleteTransaction(editingId, 'plan');
      if (success) {
        await fetchData();
        handleCancel();
      } else {
        toast.error('无法删除', { description: '该分期已开始执行' });
      }
    } catch (err) {
      toast.error('删除失败', { description: String(err) });
    }
  }, [editingId, editingMeta, fetchData, handleCancel, toast]);

  // Import / Export
  const handleExportCsv = useCallback(() => {
    const csv = [
      '日期,账户,分类,类型,金额,备注,预算,支出属性',
      ...filtered.map((t) =>
        [
          t.date,
          getAccountName(t.accountId),
          t.category,
          getTransactionTypeLabel(t.transactionType),
          t.amount,
          `"${(t.note || '').replace(/"/g, '""')}"`,
          t.isBudgeted && t.budgetId ? getBudgetName(t.budgetId) : '',
          t.expenseAttribute || '',
        ].join(','),
      ),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-filtered_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, getAccountName, getTransactionTypeLabel, getBudgetName]);

  const handleExportFullJson = useCallback(async () => {
    try {
      const [txns, accts, buds, incomeBuds, plannedExps] = await Promise.all([
        loadTransactions(),
        loadAccounts(),
        loadBudgets(),
        loadIncomeBudgets(),
        loadPlannedExpenses(),
      ]);
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        scope: 'full-database' as const,
        transactions: txns,
        accounts: accts,
        budgets: buds,
        incomeBudgets: incomeBuds,
        plannedExpenses: plannedExps,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ledgerbook-full-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('全量数据已导出（含 5 张表）');
    } catch (err) {
      toast.error('全量导出失败', { description: String(err) });
    }
  }, []);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const text = ev.target?.result as string;
          const lines = text.split('\n').filter(Boolean);
          if (lines.length < 2) {
            toast.error('文件为空或格式不正确');
            return;
          }
          let imported = 0;
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length < 6) continue;
            await createTransaction({
              date: cols[0]?.trim(),
              accountId: accounts.find((a) => a.name === cols[1]?.trim())?.id || '',
              category: (cols[2]?.trim() || '其他') as TransactionCategory,
              amount: Number(cols[4] || 0),
              note: (cols[5] || '').replace(/^"|"$/g, '').trim(),
            });
            imported++;
          }
          await fetchData();
          toast.success(`成功导入 ${imported} 条记录`);
        } catch (err) {
          toast.error('导入失败', { description: String(err) });
        }
      };
      reader.readAsText(file);
    },
    [accounts, fetchData, toast],
  );

  // Debit accounts for repayment
  const debitAccounts = useMemo(
    () => accounts.filter((a) => a.type !== 'credit_card' && a.type !== 'alipay_huabei'),
    [accounts],
  );
  const repaymentTargets = useMemo(
    () => accounts.filter((a) => a.type === 'credit_card' || a.type === 'alipay_huabei'),
    [accounts],
  );

  // Expense attribute visibility
  const shouldShowExpenseAttribute = form.transactionType !== 'repayment_out' && form.isExpense;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">交易记录</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv"
            onChange={handleImport}
            className="hidden"
            id="import-csv"
          />
          <Button variant="outline" size="sm" onClick={() => document.getElementById('import-csv')?.click()} className="gap-1.5">
            <FileUp className="size-3.5" />
            导入
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
            <FileDown className="size-3.5" />
            导出筛选结果
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleExportFullJson()} className="gap-1.5">
            <FileDown className="size-3.5" />
            导出全量数据
          </Button>
          <Button size="sm" onClick={openAddDialog} className="gap-1.5">
            <Plus className="size-3.5" />
            添加记录
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">交易总数</p>
            <p className="text-lg font-semibold tabular-nums">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">收入合计</p>
            <p className="text-lg font-semibold tabular-nums text-success">¥{totalIncome.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">支出合计</p>
            <p className="text-lg font-semibold tabular-nums text-destructive">¥{totalExpense.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">结余</p>
            <p className={`text-lg font-semibold tabular-nums ${totalIncome - totalExpense >= 0 ? 'text-success' : 'text-destructive'}`}>
              ¥{(totalIncome - totalExpense).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <TransactionFilters
        searchKeyword={searchKeyword}
        onSearchChange={setSearchKeyword}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        sortAsc={sortAsc}
        onToggleSort={() => setSortAsc(!sortAsc)}
        filterAccountId={filterAccountId}
        onAccountFilterChange={setFilterAccountId}
        filterCategory={filterCategory}
        onCategoryFilterChange={setFilterCategory}
        filterDateFrom={filterDateFrom}
        onDateFromChange={setFilterDateFrom}
        filterDateTo={filterDateTo}
        onDateToChange={setFilterDateTo}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        CATEGORIES={CATEGORIES}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
      />

      {/* Table */}
      <TransactionTable
        filtered={paged}
        getAccountName={getAccountName}
        getAccountType={getAccountType}
        getBudgetName={getBudgetName}
        getTransactionTypeLabel={getTransactionTypeLabel}
        isCashFlowShifted={isCashFlowShifted}
        EXPENSE_ATTRIBUTE_LABELS={EXPENSE_ATTRIBUTE_LABELS}
        hasActiveFilters={hasActiveFilters}
        onEdit={openEditDialog}
        onDelete={handleDelete}
        totalCount={filtered.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {/* Form Dialog */}
      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editingId={editingId}
        editingMeta={editingMeta}
        form={form}
        onChange={setForm}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        submitting={submitting}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        debitAccounts={debitAccounts.map((a) => ({ id: a.id, name: a.name }))}
        repaymentTargets={repaymentTargets.map((a) => ({ id: a.id, name: a.name }))}
        budgets={budgets.filter((b: any) => !b.isIncomeBudget).map((b: any) => ({ id: b.id, name: b.name }))}
        shouldShowExpenseAttribute={shouldShowExpenseAttribute}
        CATEGORIES={CATEGORIES}
        EXPENSE_ATTRIBUTE_OPTIONS={EXPENSE_ATTRIBUTE_OPTIONS}
        EXPENSE_ATTRIBUTE_LABELS={EXPENSE_ATTRIBUTE_LABELS}
        impactResult={impactResult}
        impactLoading={impactLoading}
        impactStartBalance={impactStartBalance}
        impactSafetyLine={impactSafetyLine}
        impactIncludePlannedExpenses={impactIncludePlannedExpenses}
        impactIncludeBudgetSettlement={impactIncludeBudgetSettlement}
        onImpactStartBalanceChange={setImpactStartBalance}
        onImpactSafetyLineChange={setImpactSafetyLine}
        onImpactIncludePlannedExpensesChange={setImpactIncludePlannedExpenses}
        onImpactIncludeBudgetSettlementChange={setImpactIncludeBudgetSettlement}
        onRunImpact={handleRunImpact}
        onDeleteInstallmentPlan={handleDeleteInstallmentPlan}
        currentPlanStarted={currentPlanStarted}
      />

      {/* Delete Alert */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.installmentPlanId && deleteScope === 'plan'
                ? '确定要删除整组分期的所有记录吗？已执行的分期日期无法撤销。'
                : '确定要删除这笔交易记录吗？此操作不可撤销。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TransactionsPage;
