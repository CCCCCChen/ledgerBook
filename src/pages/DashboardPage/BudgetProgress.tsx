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
              const progressColor = item.progress >= 100 ? 'bg-destructive' : item.progress >= 80 ? 'bg-yellow-500' : 'bg-success';
              return (
                <div key={item.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{item.category}</span>
                    <span className={item.progress >= 100 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                      ¥{item.actualAmount.toFixed(0)} / ¥{item.budgetAmount.toFixed(0)}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${progressColor}`} style={{ width: `${item.progress}%` }} />
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
