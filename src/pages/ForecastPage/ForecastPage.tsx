import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { IAccount, IBudget, ITransaction } from '@/types/finance';
import { loadAccounts, loadBudgets, loadTransactions } from '@/lib/data-service';
import { listBudgetSettlementsForRange } from '@/lib/finance-utils';
import { formatLocalISODate } from '@/lib/date';

export default function ForecastPage() {
  const navigate = useNavigate();
  const today = new Date();
  const todayISO = formatLocalISODate(today);
  const monthStartISO = formatLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1));
  const monthEndISO = formatLocalISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [budgets, setBudgets] = useState<IBudget[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [rangeFrom, setRangeFrom] = useState(monthStartISO);
  const [rangeTo, setRangeTo] = useState(monthEndISO);
  const [includeBudgetSettlement, setIncludeBudgetSettlement] = useState(true);

  useEffect(() => {
    (async () => {
      const [txns, bdgs, accts] = await Promise.all([loadTransactions(), loadBudgets(), loadAccounts()]);
      setTransactions(txns);
      setBudgets(bdgs);
      setAccounts(accts);
    })().catch(() => {});
  }, []);

  const futureFrom = useMemo(() => (todayISO > rangeFrom ? todayISO : rangeFrom), [todayISO, rangeFrom]);

  const futureExpenseTransactions = useMemo(() => {
    if (rangeTo < futureFrom) return [];
    return transactions
      .filter((transaction) => transaction.amount < 0 && transaction.date >= futureFrom && transaction.date <= rangeTo)
      .map((transaction) => ({ ...transaction, amount: Math.abs(transaction.amount) }));
  }, [transactions, futureFrom, rangeTo]);

  const budgetSettlementItems = useMemo(() => {
    if (!includeBudgetSettlement) return [];
    return listBudgetSettlementsForRange(budgets, transactions, rangeFrom, rangeTo)
      .filter((item) => item.expectedAmount > 0)
      .filter((item) => item.cycleEnd >= futureFrom);
  }, [budgets, transactions, rangeFrom, rangeTo, includeBudgetSettlement, futureFrom]);

  const forecastItems = useMemo(() => {
    const transactionItems = futureExpenseTransactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.transactionType === 'installment_bill' ? 'installment' : 'future',
      title: transaction.note || '未来支出',
      date: transaction.date,
      amount: transaction.amount,
      accountId: transaction.accountId,
    }));
    const settlementItems = budgetSettlementItems.map((item) => ({
      id: `budget-${item.budgetId}-${item.cycleEnd}`,
      type: 'budget',
      title: `${item.budgetName} 预算结算`,
      date: item.cycleEnd,
      amount: item.expectedAmount,
      accountId: '',
    }));
    return [...transactionItems, ...settlementItems].sort((a, b) => a.date.localeCompare(b.date));
  }, [futureExpenseTransactions, budgetSettlementItems]);

  const expectedOutflow = useMemo(() => forecastItems.reduce((sum, item) => sum + item.amount, 0), [forecastItems]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">预期账单</h1>
            <p className="text-sm text-muted-foreground mt-1">查看未来支出、分期账单以及预算结算对结余的影响</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/statistics')}>
            查看统计
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="space-y-1">
              <p className="font-medium">时间范围</p>
              <p className="text-sm text-muted-foreground">仅展示该范围内尚未发生的支出</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="forecast-from">开始</Label>
                <Input id="forecast-from" type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="forecast-to">结束</Label>
                <Input id="forecast-to" type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Label htmlFor="forecast-budget">考虑预算结算</Label>
                <Switch id="forecast-budget" checked={includeBudgetSettlement} onCheckedChange={setIncludeBudgetSettlement} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>本范围内预期支出</CardTitle>
            <CardDescription>合计 ¥{expectedOutflow.toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {forecastItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">暂无预期支出</p>
            ) : (
              forecastItems.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{item.title}</p>
                      <Badge variant="outline" className="text-xs">
                        {item.type === 'budget' ? '预算结算' : item.type === 'installment' ? '分期账单' : '未来支出'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {item.date}
                      {item.accountId ? ` · ${accounts.find((account) => account.id === item.accountId)?.name || '未知账户'}` : ''}
                    </p>
                  </div>
                  <p className="font-semibold text-destructive tabular-nums">¥{item.amount.toLocaleString()}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
