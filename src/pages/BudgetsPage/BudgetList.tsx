import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Pencil, Trash2 } from 'lucide-react';
import type { BudgetWithStats } from '@/api';

interface BudgetListProps {
  budgets: BudgetWithStats[];
  getCategoryLabel: (c: string) => string;
  getCycleLabel: (cycleType: string) => string;
  onEdit: (b: BudgetWithStats) => void;
  onDelete: (b: BudgetWithStats) => void;
}

const getProgressColor = (rate: number): string => {
  if (rate >= 100) return 'bg-destructive';
  if (rate >= 80) return 'bg-amber-500';
  return 'bg-primary';
};

const getProgressTextColor = (rate: number): string => {
  if (rate >= 100) return 'text-destructive';
  if (rate >= 80) return 'text-amber-500';
  return 'text-foreground';
};

/**
 * 格式化预算周期时间范围
 * - weekly / monthly：M/D ~ M/D（同年），YYYY/M/D ~ YYYY/M/D（跨年）
 * - yearly：YYYY/M/D ~ YYYY/M/D
 * - once / custom：按实际日期显示
 */
const formatCycleDateRange = (start?: string, end?: string, cycleType?: string): string | null => {
  if (!start || !end) return null;
  try {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;

    const sameYear = s.getFullYear() === e.getFullYear();
    const fmtShort = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    const fmtFull = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

    if (cycleType === 'yearly') {
      return `${fmtFull(s)} ~ ${fmtFull(e)}`;
    }

    return sameYear ? `${fmtShort(s)} ~ ${fmtShort(e)}` : `${fmtFull(s)} ~ ${fmtFull(e)}`;
  } catch {
    return null;
  }
};

export const BudgetList: React.FC<BudgetListProps> = ({
  budgets,
  getCategoryLabel,
  getCycleLabel,
  onEdit,
  onDelete,
}) => {
  if (budgets.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <p className="text-lg">暂无预算项目</p>
          <p className="text-sm mt-1">创建一个预算来追踪你的支出或收入目标</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
      {budgets.map((budget) => {
        const rate = budget.rate ?? 0;
        const isOverBudget = rate >= 100;
        const isWarning = rate >= 80 && rate < 100;
        const dateRange = formatCycleDateRange(
          budget.currentPeriodStart,
          budget.currentPeriodEnd,
          budget.cycleType,
        );

        return (
          <Card
            key={budget.id}
            className={`overflow-hidden ${
              isOverBudget ? 'border-destructive/50' : isWarning ? 'border-amber-500/50' : ''
            }`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="truncate">{budget.name}</span>
                    {isOverBudget && (
                      <Badge variant="destructive" className="text-[10px] shrink-0">
                        超预算
                      </Badge>
                    )}
                    {isWarning && (
                      <Badge className="bg-amber-500 text-white text-[10px] shrink-0">
                        即将超支
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {budget.category && (budget.category as string) !== '__all__' && (
                      <Badge variant="outline" className="text-xs">
                        {getCategoryLabel(budget.category)}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {getCycleLabel(budget.cycleType)}
                    </span>
                    {dateRange && (
                      <span className="text-xs text-muted-foreground">
                        {dateRange}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onEdit(budget)}
                    aria-label="编辑"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => onDelete(budget)}
                    aria-label="删除"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-2">
                <Progress
                  value={Math.min(rate, 100)}
                  indicatorClassName={getProgressColor(rate)}
                  className="h-2"
                />
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <p className={`text-sm font-semibold tabular-nums ${getProgressTextColor(rate)}`}>
                    ¥{Math.round(budget.used).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">已使用</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold tabular-nums">
                    {rate.toFixed(0)}%
                  </p>
                  <p className="text-xs text-muted-foreground">使用率</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    ¥{Math.round(budget.remaining).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">剩余</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                总额 {budget.amount.toLocaleString()} 元
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
