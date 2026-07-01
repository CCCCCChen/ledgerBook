import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { incomeBudgetsApi } from '@/api';
import type { IIncomeBudgetProjection, IAccount } from '@/types/finance';
import { loadAccounts, loadTransactions } from '@/lib/data-service';
import { nowLocalISODate, addMonths, formatDate } from '@/lib/date';

// 现金流分析页
export default function CashFlowPage() {
  const [months, setMonths] = useState(6);
  const [startBalance, setStartBalance] = useState(0);
  const [projections, setProjections] = useState<IIncomeBudgetProjection[]>([]);
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');

  const startDate = nowLocalISODate();
  const endDate = useMemo(() => {
    return addMonths(startDate, months);
  }, [startDate, months]);

  const loadData = useCallback(async () => {
    try {
      // 加载收入预算预测
      const res = await incomeBudgetsApi.projection(startDate, endDate);
      setProjections(res || []);

      // 加载账户
      const accs = await loadAccounts();
      setAccounts(accs);

      // 加载交易记录
      const txns = await loadTransactions();
      setTransactions(txns);
    } catch (e) {
      console.error('加载现金流数据失败', e);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // 计算每月收入
  const monthlyIncome = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of projections) {
      const month = p.projectionDate.substring(0, 7);
      map[month] = (map[month] || 0) + p.amount;
    }
    return map;
  }, [projections]);

  // 估算每月支出（基于历史数据简单平均）
  const monthlyExpenseEstimate = useMemo(() => {
    // 简单估算：取历史3个月平均支出
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const recentTxns = transactions.filter((t) => {
      const d = new Date(t.date);
      return d >= threeMonthsAgo && t.amount < 0;
    });

    if (recentTxns.length === 0) return 0;
    const totalExpense = Math.abs(recentTxns.reduce((sum, t) => sum + t.amount, 0));
    return Math.round(totalExpense / 3);
  }, [transactions]);

  // 生成现金流预测数据
  const cashFlowData = useMemo(() => {
    const data = [];
    let balance = startBalance;
    const now = new Date(startDate);

    for (let i = 0; i < months; i++) {
      const monthDate = new Date(now);
      monthDate.setMonth(monthDate.getMonth() + i);
      const monthKey = formatDate(monthDate, 'yyyy-MM');

      const income = monthlyIncome[monthKey] || 0;
      const expense = monthlyExpenseEstimate;
      const netFlow = income - expense;
      balance += netFlow;

      data.push({
        month: monthKey,
        monthLabel: formatDate(monthDate, 'yyyy年M月'),
        income,
        expense,
        netFlow,
        balance,
      });
    }

    return data;
  }, [startDate, months, monthlyIncome, monthlyExpenseEstimate, startBalance]);

  // 统计数据
  const stats = useMemo(() => {
    if (cashFlowData.length === 0) return null;
    const totalIncome = cashFlowData.reduce((sum, d) => sum + d.income, 0);
    const totalExpense = cashFlowData.reduce((sum, d) => sum + d.expense, 0);
    const endBalance = cashFlowData[cashFlowData.length - 1].balance;
    const minBalance = Math.min(...cashFlowData.map((d) => d.balance));
    return { totalIncome, totalExpense, endBalance, minBalance };
  }, [cashFlowData]);

  return (
    <div className="min-h-screen bg-background">
      <main className="space-y-8">
        {/* Hero */}
        <section className="w-full bg-gradient-to-br from-primary/5 via-background to-accent/30 py-12 md:py-16">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <DollarSign className="size-5 text-primary" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">现金流分析</h1>
            </div>
            <p className="text-muted-foreground max-w-xl">
              结合收入预算和历史支出数据，预测未来现金流走势
            </p>
          </div>
        </section>

        {/* 参数设置 */}
        <section className="w-full">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">预测参数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label>预测周期</Label>
                    <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">未来 3 个月</SelectItem>
                        <SelectItem value="6">未来 6 个月</SelectItem>
                        <SelectItem value="12">未来 12 个月</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="start-balance">初始余额（元）</Label>
                    <Input
                      id="start-balance"
                      type="number"
                      value={startBalance}
                      onChange={(e) => setStartBalance(Number(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>统计账户</Label>
                    <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部账户</SelectItem>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 统计卡片 */}
        {stats && (
          <section className="w-full">
            <div className="max-w-7xl mx-auto px-4 md:px-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="size-4 text-success" />
                      <span className="text-sm text-muted-foreground">预计总收入</span>
                    </div>
                    <p className="text-2xl font-bold text-success tabular-nums">
                      ¥{stats.totalIncome.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="size-4 text-destructive" />
                      <span className="text-sm text-muted-foreground">预计总支出</span>
                    </div>
                    <p className="text-2xl font-bold text-destructive tabular-nums">
                      ¥{stats.totalExpense.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="size-4 text-primary" />
                      <span className="text-sm text-muted-foreground">期末余额</span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums">
                      ¥{stats.endBalance.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="size-4 text-warning" />
                      <span className="text-sm text-muted-foreground">最低余额</span>
                    </div>
                    <p className={`text-2xl font-bold tabular-nums ${stats.minBalance < 0 ? 'text-destructive' : ''}`}>
                      ¥{stats.minBalance.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        )}

        {/* 月度明细 */}
        <section className="w-full">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">月度现金流明细</CardTitle>
                <CardDescription>
                  基于收入预算和历史月均支出估算
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {cashFlowData.map((item) => (
                    <div
                      key={item.month}
                      className="flex items-center justify-between p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="font-medium">{item.monthLabel}</div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">收入</div>
                          <div className="text-sm font-medium text-success flex items-center gap-1">
                            <ArrowUpRight className="size-3" />
                            ¥{item.income.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">支出</div>
                          <div className="text-sm font-medium text-destructive flex items-center gap-1">
                            <ArrowDownRight className="size-3" />
                            ¥{item.expense.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">净流入</div>
                          <div className={`text-sm font-semibold ${item.netFlow >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {item.netFlow >= 0 ? '+' : ''}¥{item.netFlow.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-right min-w-[100px]">
                          <div className="text-xs text-muted-foreground">累计余额</div>
                          <div className="text-sm font-bold tabular-nums">
                            ¥{item.balance.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 收入预算来源 */}
        <section className="w-full pb-12">
          <div className="max-w-7xl mx-auto px-4 md:px-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">收入预算来源</CardTitle>
                <CardDescription>
                  以下收入预算参与了现金流预测
                </CardDescription>
              </CardHeader>
              <CardContent>
                {projections.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    暂无收入预算数据，请到预算页添加收入预算
                  </div>
                ) : (
                  <div className="space-y-2">
                    {projections.slice(0, 10).map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div>
                          <div className="font-medium text-sm">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.projectionDate}</div>
                        </div>
                        <Badge variant="secondary" className="text-success bg-success/10">
                          +¥{p.amount.toLocaleString()}
                        </Badge>
                      </div>
                    ))}
                    {projections.length > 10 && (
                      <div className="text-center text-sm text-muted-foreground pt-2">
                        还有 {projections.length - 10} 条收入记录...
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
