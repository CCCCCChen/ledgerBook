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
  if (rate >= 1) return 'bg-destructive';
  if (rate >= 0.8) return 'bg-amber-500';
  return 'bg-primary';
};

const getProgressTextColor = (rate: number): string => {
  if (rate >= 1) return 'text-destructive';
  if (rate >= 0.8) return 'text-amber-500';
  return 'text-foreground';
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
        const isOverBudget = rate >= 1;
        const isWarning = rate >= 0.8 && rate < 1;

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
                  value={Math.min(rate * 100, 100)}
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
                    {(rate * 100).toFixed(0)}%
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
