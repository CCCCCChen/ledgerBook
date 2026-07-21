import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Wallet } from 'lucide-react';

export interface FinancialOverview {
  income: number;
  expenses: number;
  savingRate: number;
  rigidExpenses: number;
  flexibleExpenses: number;
  cashSafetyMonths: number;
  totalDebt: number;
  debtPressure: number;
  budgetStatus: string;
}

export default function SummaryCards({ overview }: { overview: FinancialOverview }) {
  const cards = [
    { label: '收入', value: `¥${overview.income.toFixed(0).toLocaleString()}`, color: 'text-success' },
    { label: '支出', value: `¥${overview.expenses.toFixed(0).toLocaleString()}`, color: 'text-destructive' },
    { label: '储蓄率', value: `${overview.savingRate}%`, color: overview.savingRate >= 20 ? 'text-success' : overview.savingRate >= 10 ? '' : 'text-destructive' },
    { label: '必要支出', value: `¥${overview.rigidExpenses.toFixed(0).toLocaleString()}`, color: '' },
    { label: '弹性支出', value: `¥${overview.flexibleExpenses.toFixed(0).toLocaleString()}`, color: '' },
    { label: '现金安全', value: `${overview.cashSafetyMonths} 月`, color: overview.cashSafetyMonths >= 6 ? 'text-success' : overview.cashSafetyMonths >= 3 ? '' : 'text-destructive' },
    { label: '负债压力', value: `${overview.debtPressure}%`, color: overview.debtPressure > 30 ? 'text-destructive' : '' },
    { label: '预算状态', value: overview.budgetStatus, color: overview.budgetStatus === '超支' ? 'text-destructive' : 'text-success' },
    { label: '信用负债', value: `¥${overview.totalDebt.toFixed(0).toLocaleString()}`, color: 'text-destructive' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-5 text-primary" />
          财务状态概览
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          {cards.map((card) => (
            <Card key={card.label} className="col-span-2 md:col-span-1">
              <CardHeader className="pb-2">
                <CardDescription>{card.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className={`text-lg font-semibold tabular-nums ${card.color}`}>{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
