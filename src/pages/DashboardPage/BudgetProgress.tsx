import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BudgetItem {
  category: string;
  budgetAmount: number;
  actualAmount: number;
  progress: number;
}

function daysRemainingInMonth(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate();
}

export default function BudgetProgress({ budgetData }: { budgetData: BudgetItem[] }) {
  const navigate = useNavigate();
  const daysLeft = daysRemainingInMonth();

  const getTooltipText = (item: BudgetItem) => {
    const remaining = item.budgetAmount - item.actualAmount;
    const dailySuggestion = daysLeft > 0 ? Math.round(remaining / daysLeft) : 0;
    if (remaining >= 0) {
      return `剩余可用 ¥${remaining.toLocaleString()}` +
        (daysLeft > 0 ? ` / 日均建议 ¥${dailySuggestion.toLocaleString()}` : ' / 月末最后一天');
    }
    return `已超支 ¥${Math.abs(remaining).toLocaleString()}，建议削减其他品类`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="size-5 text-primary" />
          本月预算执行
        </CardTitle>
        <CardDescription>各品类预算使用进度（仅显示已设预算的品类）</CardDescription>
      </CardHeader>
      <CardContent>
        {budgetData.length > 0 ? (
          <TooltipProvider delayDuration={300}>
            <div className="space-y-4">
              {budgetData.map((item) => {
                const isOver = item.progress >= 100;
                const isWarn = !isOver && item.progress >= 80;
                const barColor = isOver ? 'bg-red-600' : isWarn ? 'bg-yellow-500' : 'bg-success';
                const barWidth = Math.min(item.progress, 100);
                const overPct = item.budgetAmount > 0
                  ? Math.round((item.actualAmount / item.budgetAmount - 1) * 100)
                  : 0;

                return (
                  <Tooltip key={item.category}>
                    <TooltipTrigger asChild>
                      <div
                        className="cursor-pointer group"
                        onClick={() => navigate('/budgets')}
                      >
                        <div className="flex justify-between text-sm mb-1">
                          <span className={isOver ? 'text-red-600 font-semibold' : ''}>
                            {item.category}
                          </span>
                          <span className={isOver ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>
                            ¥{item.actualAmount.toFixed(0)} / ¥{item.budgetAmount.toFixed(0)}
                            {isOver && overPct > 0 && ` (+${overPct}%)`}
                          </span>
                        </div>
                        <div className={`w-full rounded-full h-2 ${isOver ? 'bg-red-100' : 'bg-secondary'} relative overflow-visible group-hover:scale-y-150 transition-transform origin-center`}>
                          <div
                            className={`h-2 rounded-full transition-all ${barColor} ${isOver ? 'animate-pulse' : ''}`}
                            style={{ width: `${barWidth}%` }}
                          />
                          {isOver && (
                            <div
                              className="absolute top-0 left-0 h-full bg-red-400/50"
                              style={{ width: '100%', borderRight: '2px dashed #ef4444' }}
                            />
                          )}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-52">
                      <p>{getTooltipText(item)}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        ) : (
          <p
            className="text-sm text-muted-foreground text-center py-8 cursor-pointer hover:text-primary transition-colors"
            onClick={() => navigate('/budgets')}
          >
            暂无预算数据，前往预算页设置
          </p>
        )}
      </CardContent>
    </Card>
  );
}
