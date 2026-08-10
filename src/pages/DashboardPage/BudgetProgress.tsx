import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface BudgetItem {
  category: string;
  budgetAmount: number;
  actualAmount: number;
  progress: number;
}

export default function BudgetProgress({ budgetData }: { budgetData: BudgetItem[] }) {
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
          <div className="space-y-4">
            {budgetData.map((item) => {
              const isOver = item.progress >= 100;
              const isWarn = !isOver && item.progress >= 80;
              const barColor = isOver ? 'bg-red-600' : isWarn ? 'bg-yellow-500' : 'bg-success';
              const barWidth = Math.min(item.progress, 100);
              return (
                <div key={item.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className={isOver ? 'text-red-600 font-semibold' : ''}>{item.category}</span>
                    <span className={isOver ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>
                      ¥{item.actualAmount.toFixed(0)} / ¥{item.budgetAmount.toFixed(0)}
                      {isOver && ` (+${item.progress - 100}%)`}
                    </span>
                  </div>
                  <div className={`w-full rounded-full h-2 ${isOver ? 'bg-red-100' : 'bg-secondary'}`}>
                    <div className={`h-2 rounded-full transition-all ${barColor} ${isOver ? 'animate-pulse' : ''}`} style={{ width: `${barWidth}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">暂无预算数据，前往预算页设置</p>
        )}
      </CardContent>
    </Card>
  );
}
