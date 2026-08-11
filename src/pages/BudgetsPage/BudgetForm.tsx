import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

export interface BudgetFormData {
  name: string;
  amount: string;
  cycleType: string;
  startDate: string;
  endDate: string;
  cycleDays: string;
  category: string;
  isExpenseBudget: boolean;
}

export const EMPTY_BUDGET_FORM: BudgetFormData = {
  name: '',
  amount: '',
  cycleType: 'monthly',
  startDate: '',
  endDate: '',
  cycleDays: '',
  category: '__all__',
  isExpenseBudget: true,
};

interface BudgetFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  form: BudgetFormData;
  onChange: (form: BudgetFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  expenseCategories: string[];
  incomeCategories: string[];
  budgetType: 'expense' | 'income';
}

export const BudgetForm: React.FC<BudgetFormProps> = ({
  open,
  onOpenChange,
  editingId,
  form,
  onChange,
  onSubmit,
  submitting,
  expenseCategories,
  incomeCategories,
  budgetType,
}) => {
  const categories = budgetType === 'expense' ? expenseCategories : incomeCategories;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editingId ? '编辑预算' : `添加${budgetType === 'expense' ? '支出' : '收入'}预算`}
            </DialogTitle>
            <DialogDescription>
              设置预算项目名称、金额与周期
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid gap-1.5">
              <Label htmlFor="budget-name">预算名称</Label>
              <Input
                id="budget-name"
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                placeholder="如：当月餐饮、季度旅行基金"
                required
              />
            </div>

            {/* Amount */}
            <div className="grid gap-1.5">
              <Label htmlFor="budget-amount">预算金额</Label>
              <Input
                id="budget-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => onChange({ ...form, amount: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>

            {/* Cycle type */}
            <div className="grid gap-1.5">
              <Label>预算周期</Label>
              <Select
                value={form.cycleType}
                onValueChange={(v) => onChange({ ...form, cycleType: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">按月（自然月）</SelectItem>
                  <SelectItem value="weekly">按周</SelectItem>
                  <SelectItem value="yearly">每年固定</SelectItem>
                  <SelectItem value="custom">自定义天数</SelectItem>
                  <SelectItem value="range">日期范围</SelectItem>
                  <SelectItem value="once">一次性</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.cycleType === 'once' && (
              <div className="grid gap-1.5">
                <Label htmlFor="budget-start-date">记账日期</Label>
                <Input
                  id="budget-start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => onChange({ ...form, startDate: e.target.value })}
                  required
                />
              </div>
            )}

            {form.cycleType === 'yearly' && (
              <div className="grid gap-1.5">
                <Label htmlFor="budget-start-date">起始年份</Label>
                <Input
                  id="budget-start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => onChange({ ...form, startDate: e.target.value })}
                  required
                />
              </div>
            )}

            {form.cycleType === 'range' && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="budget-start-date">开始日期</Label>
                  <Input
                    id="budget-start-date"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => onChange({ ...form, startDate: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="budget-end-date">结束日期</Label>
                  <Input
                    id="budget-end-date"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => onChange({ ...form, endDate: e.target.value })}
                    required
                  />
                </div>
              </>
            )}

            {form.cycleType === 'custom' && (
              <div className="grid gap-1.5">
                <Label htmlFor="budget-cycle-days">周期天数</Label>
                <Input
                  id="budget-cycle-days"
                  type="number"
                  min="1"
                  step="1"
                  value={form.cycleDays}
                  onChange={(e) => onChange({ ...form, cycleDays: e.target.value })}
                  placeholder="如 90（每90天重置）"
                  required
                />
              </div>
            )}

            {/* Category scope */}
            <div className="grid gap-1.5">
              <Label>分类范围</Label>
              <Select
                value={form.category}
                onValueChange={(v) => onChange({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">不限分类</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                选择具体分类后，仅统计该分类消费；选择"不限"则统计所有支出/收入。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? '保存中...' : editingId ? '更新' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
