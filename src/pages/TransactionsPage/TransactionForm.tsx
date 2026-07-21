import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import type { TransactionFormData } from './TransactionsPage';

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  editingMeta: any;
  form: TransactionFormData;
  onChange: (form: TransactionFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitting: boolean;
  accounts: { id: string; name: string }[];
  debitAccounts: { id: string; name: string }[];
  repaymentTargets: { id: string; name: string }[];
  budgets: { id: string; name: string }[];
  shouldShowExpenseAttribute: boolean;
  CATEGORIES: string[];
  EXPENSE_ATTRIBUTE_OPTIONS: string[];
  EXPENSE_ATTRIBUTE_LABELS: Record<string, string>;
  impactResult: any;
  impactLoading: boolean;
  impactStartBalance: string;
  impactSafetyLine: string;
  impactIncludePlannedExpenses: boolean;
  impactIncludeBudgetSettlement: boolean;
  onImpactStartBalanceChange: (v: string) => void;
  onImpactSafetyLineChange: (v: string) => void;
  onImpactIncludePlannedExpensesChange: (v: boolean) => void;
  onImpactIncludeBudgetSettlementChange: (v: boolean) => void;
  onRunImpact: () => void;
  onDeleteInstallmentPlan: () => void;
  currentPlanStarted: boolean;
}

export const TransactionForm: React.FC<TransactionFormProps> = ({
  open,
  onOpenChange,
  editingId,
  editingMeta,
  form,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  accounts,
  debitAccounts,
  repaymentTargets,
  budgets,
  shouldShowExpenseAttribute,
  CATEGORIES,
  EXPENSE_ATTRIBUTE_OPTIONS,
  EXPENSE_ATTRIBUTE_LABELS,
  impactResult,
  impactLoading,
  impactStartBalance,
  impactSafetyLine,
  impactIncludePlannedExpenses,
  impactIncludeBudgetSettlement,
  onImpactStartBalanceChange,
  onImpactSafetyLineChange,
  onImpactIncludePlannedExpensesChange,
  onImpactIncludeBudgetSettlementChange,
  onRunImpact,
  onDeleteInstallmentPlan,
  currentPlanStarted,
}) => {
  const setForm = onChange;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[85dvh] overflow-y-auto">
        <form onSubmit={onSubmit}>
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
                onChange={(e) => {
                  setForm({ ...form, date: e.target.value });
                }}
                required
              />
            </div>

            {/* Transaction Type */}
            <div className="grid gap-1.5">
              <Label>账户</Label>
              <Select
                value={form.transactionType}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    transactionType: value as TransactionFormData['transactionType'],
                    accountId: '',
                    repaymentTargetAccountId: '',
                    isExpense: value === 'normal' ? form.isExpense : true,
                    installmentCount: value === 'installment_bill' ? form.installmentCount || '3' : form.installmentCount,
                  })
                }
                disabled={!!editingId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="交易类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">普通收支</SelectItem>
                  <SelectItem value="repayment_out">信用卡/花呗还款</SelectItem>
                  <SelectItem value="installment_bill">分期账单自动录入</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editingMeta?.transactionType === 'installment_bill' && (
              <div className="grid gap-1.5">
                <Label>修改范围</Label>
                <Select
                  value={form.editScope}
                  onValueChange={(v) => setForm({ ...form, editScope: v as TransactionFormData['editScope'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plan">整组分期</SelectItem>
                    <SelectItem value="single">仅本期</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Account */}
            <div className="grid gap-1.5">
              <Label>{form.transactionType === 'repayment_out' ? '扣款账户（储蓄卡）' : '账户'}</Label>
              <Select
                value={form.accountId}
                onValueChange={(v) => {
                  setForm({ ...form, accountId: v });
                }}
                disabled={editingMeta?.transactionType === 'installment_bill'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择账户" />
                </SelectTrigger>
                <SelectContent>
                  {(form.transactionType === 'repayment_out' ? debitAccounts : accounts).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.transactionType === 'repayment_out' && (
              <div className="grid gap-1.5">
                <Label>还款目标账户</Label>
                <Select
                  value={form.repaymentTargetAccountId}
                  onValueChange={(v) => setForm({ ...form, repaymentTargetAccountId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择信用卡或花呗账户" />
                  </SelectTrigger>
                  <SelectContent>
                    {repaymentTargets.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Amount + type */}
            <div className="grid gap-1.5">
              <Label htmlFor="txn-amount">金额</Label>
              <div className="flex items-center gap-2">
                {form.transactionType === 'normal' ? (
                  <Button
                    type="button"
                    variant={form.isExpense ? 'destructive' : 'outline'}
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setForm({ ...form, isExpense: !form.isExpense });
                    }}
                  >
                    {form.isExpense ? '支出' : '收入'}
                  </Button>
                ) : (
                  <Badge variant="secondary" className="shrink-0 h-9 px-3 flex items-center">
                    {form.transactionType === 'repayment_out' ? '还款金额' : '每期金额'}
                  </Badge>
                )}
                <Input
                  id="txn-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.amount}
                  onChange={(e) => {
                    setForm({ ...form, amount: e.target.value });
                  }}
                  placeholder="0.00"
                  required
                  className="flex-1"
                />
              </div>
            </div>

            {form.transactionType === 'installment_bill' && (
              <div className="grid gap-1.5">
                <Label htmlFor="txn-installments">分期期数</Label>
                <Input
                  id="txn-installments"
                  type="number"
                  min="2"
                  step="1"
                  value={form.installmentCount}
                  onChange={(e) => setForm({ ...form, installmentCount: e.target.value })}
                  placeholder="如：3 / 6 / 12"
                  disabled={!!editingId}
                />
              </div>
            )}

            {form.transactionType === 'installment_bill' && !editingId && (
              <div className="grid gap-1.5">
                <Label htmlFor="txn-fee-total">分期手续费（总额，可选）</Label>
                <Input
                  id="txn-fee-total"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.feeTotal}
                  onChange={(e) => setForm({ ...form, feeTotal: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            )}

            {/* Category */}
            <div className="grid gap-1.5">
              <Label>分类</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v as any })}
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

            {shouldShowExpenseAttribute && (
              <div className="grid gap-1.5">
                <Label>支出属性</Label>
                <Select
                  value={form.expenseAttribute}
                  onValueChange={(v) => setForm({ ...form, expenseAttribute: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_ATTRIBUTE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {EXPENSE_ATTRIBUTE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  统计页会优先使用这里的显式标记，而不是再按分类自动推断。
                </p>
              </div>
            )}

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
            {form.transactionType !== 'repayment_out' && (
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
            )}

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
                    {budgets.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Impact assessment */}
            {form.transactionType === 'normal' && form.isExpense && (
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">大额消费影响评估</p>
                    <p className="text-xs text-muted-foreground">在未来 6 个月范围内，对比"基线"与"新增本笔消费"后的最低余额</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={onRunImpact} disabled={impactLoading}>
                    {impactLoading ? '评估中...' : '查看影响'}
                  </Button>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="impact-start-balance">起始余额</Label>
                    <Input
                      id="impact-start-balance"
                      type="number"
                      step="0.01"
                      value={impactStartBalance}
                      onChange={(e) => onImpactStartBalanceChange(e.target.value)}
                      className="w-[140px]"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="impact-safety-line">安全线</Label>
                    <Input
                      id="impact-safety-line"
                      type="number"
                      step="0.01"
                      value={impactSafetyLine}
                      onChange={(e) => onImpactSafetyLineChange(e.target.value)}
                      className="w-[140px]"
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <Label htmlFor="impact-include-planned">考虑预估支出</Label>
                    <Switch
                      id="impact-include-planned"
                      checked={impactIncludePlannedExpenses}
                      onCheckedChange={onImpactIncludePlannedExpensesChange}
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <Label htmlFor="impact-include-budget">考虑预算结算</Label>
                    <Switch
                      id="impact-include-budget"
                      checked={impactIncludeBudgetSettlement}
                      onCheckedChange={onImpactIncludeBudgetSettlementChange}
                    />
                  </div>
                </div>

                {impactResult && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">基线最低余额</p>
                      <p className="text-base font-semibold tabular-nums">¥{Math.round(impactResult.baseline.minBalance).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">{impactResult.baseline.minDate}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">新增后最低余额</p>
                      <p
                        className={`text-base font-semibold tabular-nums ${
                          impactResult.withExpense.minBalance < Number(impactSafetyLine || 0) ? 'text-destructive' : 'text-foreground'
                        }`}
                      >
                        ¥{Math.round(impactResult.withExpense.minBalance).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{impactResult.withExpense.minDate}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">最低余额变化</p>
                      <p className="text-base font-semibold tabular-nums">¥{Math.round(impactResult.delta.minBalance).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        期末变化 ¥{Math.round(impactResult.delta.endBalance).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {editingMeta?.transactionType === 'installment_bill' && editingMeta.installmentPlanId && (
              <Button
                type="button"
                variant="destructive"
                onClick={onDeleteInstallmentPlan}
                disabled={currentPlanStarted}
              >
                删除整组分期
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
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
  );
};
