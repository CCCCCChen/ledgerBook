import { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CreditCard, TrendingDown, PieChart } from 'lucide-react';
import type { IAccount, ITransaction } from '@/types/finance';
import { loadAccounts, loadTransactions } from '@/lib/data-service';
import { formatLocalISOYearMonth, formatLocalISODate } from '@/lib/date';
import { getBillingCycleRange } from '@/lib/finance-utils';
import { getEffectiveTransactionDate } from '@/lib/cashflow';
import { accountsApi, type AccountDebtInfo } from '@/api/index';

export default function CreditDebtPage() {
  const [accounts, setAccounts] = useState<IAccount[]>([]);
  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  const [debtData, setDebtData] = useState<Map<string, AccountDebtInfo>>(new Map());
  const [prepayAmount, setPrepayAmount] = useState('1000');

  useEffect(() => {
    void Promise.all([loadTransactions(), loadAccounts()]).then(([txns, accts]) => {
      setTransactions(txns);
      setAccounts(accts);
      // 为每个信用账户加载负债聚合数据
      const creditAccts = accts.filter(
        (a) => a.type === 'credit_card' || a.type === 'alipay_huabei'
      );
      void Promise.all(
        creditAccts.map((a) =>
          accountsApi.debt(a.id).then((res) => (res.success ? { id: a.id, data: res.data } : null))
        )
      ).then((results) => {
        const map = new Map<string, AccountDebtInfo>();
        results.forEach((r) => {
          if (r) map.set(r.id, r.data);
        });
        setDebtData(map);
      });
    });
  }, []);

  const creditAccounts = useMemo(() => accounts.filter((account) => account.type === 'credit_card' || account.type === 'alipay_huabei'), [accounts]);

  const today = useMemo(() => new Date(), []);
  const todayISO = useMemo(() => formatLocalISODate(today), [today]);

  const creditStats = useMemo(() => {
    const stats: Record<
      string,
      {
        totalDebt: number;
        monthlyRepayment: number;
        totalInstallment: number;
        monthlyInstallment: number;
        totalInterest: number;
        monthlyInterest: number;
      }
    > = {};

    creditAccounts.forEach((account) => {
      const accountTxns = transactions.filter((t) => t.accountId === account.id);

      // 1. 总负债：信用账户历史总支出 - 总还款入账
      const totalSpend = accountTxns
        .filter((t) => t.amount < 0)
        .filter((t) => t.transactionType !== 'repayment_in')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const totalRepaid = accountTxns
        .filter((t) => t.amount > 0 && (t.transactionType === 'normal' || t.transactionType === 'repayment_in'))
        .reduce((sum, t) => sum + t.amount, 0);
      const totalDebt = Math.max(0, totalSpend - totalRepaid);

      // 2. 本月待还：按账单周期统计当月到期的信用支出
      let monthlyRepayment = 0;
      if (account.billingDay) {
        const cycle = getBillingCycleRange(account.billingDay, today);
        const cycleSpend = accountTxns
          .filter((t) => t.amount < 0)
          .filter((t) => t.date >= cycle.start && t.date <= cycle.end)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        monthlyRepayment = cycleSpend;
      }

      // 3. 分期相关（近似用 transactionType='installment_bill' 汇总）
      const installments = accountTxns.filter((t) => t.transactionType === 'installment_bill');
      const totalInstallment = installments.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const monthlyInstallment = installments
        .filter((t) => {
          const date = new Date(getEffectiveTransactionDate(t, 'cashflow') || t.date);
          return formatLocalISOYearMonth(date) === formatLocalISOYearMonth(today);
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const totalInterest = installments.reduce((sum, t) => sum + (t.installmentFee || 0), 0);
      const monthlyInterest = installments
        .filter((t) => {
          const date = new Date(getEffectiveTransactionDate(t, 'cashflow') || t.date);
          return formatLocalISOYearMonth(date) === formatLocalISOYearMonth(today);
        })
        .reduce((sum, t) => sum + (t.installmentFee || 0), 0);

      stats[account.id] = {
        totalDebt,
        monthlyRepayment,
        totalInstallment,
        monthlyInstallment,
        totalInterest,
        monthlyInterest,
      };
    });

    return stats;
  }, [creditAccounts, transactions, today]);

  const annualInterestData = useMemo(() => {
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    const cutoffISO = formatLocalISODate(twelveMonthsAgo);

    const byAccount: Record<string, { name: string; interest: number }> = {};
    creditAccounts.forEach(acc => {
      const accountTxns = transactions.filter(t => t.accountId === acc.id);
      const installments = accountTxns.filter(
        t => t.transactionType === 'installment_bill' && t.date >= cutoffISO
      );
      const annualInterest = installments.reduce((sum, t) => sum + (t.installmentFee || 0), 0);
      byAccount[acc.id] = { name: acc.name, interest: annualInterest };
    });

    const totalAnnualInterest = Object.values(byAccount).reduce((s, a) => s + a.interest, 0);

    const annualTxns = transactions.filter(t => t.date >= cutoffISO);
    const annualIncome = annualTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const avgMonthlyIncome = annualIncome > 0 ? Math.round(annualIncome / 12) : 0;
    const dailyIncome = avgMonthlyIncome > 0 ? Math.round(avgMonthlyIncome / 30) : 0;
    const daysEquivalent = dailyIncome > 0 ? Math.round(totalAnnualInterest / dailyIncome) : 0;

    return { byAccount, totalAnnualInterest, daysEquivalent };
  }, [creditAccounts, transactions, today]);

  const annualInterestPieOption = useMemo(() => {
    const accounts = Object.values(annualInterestData.byAccount).filter(a => a.interest > 0);
    if (accounts.length === 0) return null;
    return {
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c}' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        data: accounts.map(a => ({ name: a.name, value: a.interest })),
        label: { formatter: '{b}\n¥{c}' },
        emphasis: {
          label: { fontSize: 16, fontWeight: 'bold' },
        },
      }],
    };
  }, [annualInterestData]);

  const summary = useMemo(() => {
    let totalDebt = 0;
    let monthlyRepayment = 0;
    let totalInstallmentPayment = 0;
    let monthlyInterest = 0;
    let totalInterest = 0;

    // 从 API 负债数据汇总
    debtData.forEach((info) => {
      totalDebt += info.totalDebt;
      totalInstallmentPayment += info.installmentMonthlyPayment;
    });

    // 从客户端计算本月待还和利息
    Object.values(creditStats).forEach((stat) => {
      monthlyRepayment += stat.monthlyRepayment;
      monthlyInterest += stat.monthlyInterest;
      totalInterest += stat.totalInterest;
    });

    return { totalDebt, monthlyRepayment, totalInstallmentPayment, monthlyInterest, totalInterest };
  }, [creditStats, debtData]);

  const repaymentPressureRows = useMemo(() => {
    const incomeBase = 15000; // 后续可改为可配置或从历史收入推断
    return creditAccounts.map((account) => {
      const stat = creditStats[account.id] || { totalDebt: 0, monthlyRepayment: 0, monthlyInstallment: 0, monthlyInterest: 0 };
      const monthlyTotal = stat.monthlyRepayment + stat.monthlyInstallment + stat.monthlyInterest;
      const ratio = incomeBase > 0 ? (monthlyTotal / incomeBase) * 100 : 0;
      return {
        ...account,
        monthlyRepayment: stat.monthlyRepayment,
        monthlyInstallment: stat.monthlyInstallment,
        monthlyInterest: stat.monthlyInterest,
        monthlyTotal,
        ratio,
      };
    });
  }, [creditAccounts, creditStats]);

  const prepaymentSimulation = useMemo(() => {
    const amount = Number(prepayAmount || 0);
    const monthlyRelief = creditAccounts.length > 0 ? amount / Math.max(creditAccounts.length * 6, 1) : 0;
    const afterDebt = Math.max(0, summary.totalDebt - amount);
    return { amount, monthlyRelief, afterDebt };
  }, [prepayAmount, summary.totalDebt, creditAccounts.length]);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">信贷与负债</h1>
          <p className="text-sm text-muted-foreground mt-1">统一查看花呗、信用卡、分期月供、利息成本与提前还款影响</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="size-5 text-primary" />
              年度利息成本
            </CardTitle>
            <CardDescription>过去 12 个月各信用账户的分期利息汇总</CardDescription>
          </CardHeader>
          <CardContent>
            {annualInterestData.totalAnnualInterest === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">过去一年无分期利息支出，继续保持</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col justify-center items-center md:items-start space-y-2">
                  <p className="text-sm text-muted-foreground">年度总利息</p>
                  <p className="text-4xl font-bold tabular-nums text-destructive">¥{annualInterestData.totalAnnualInterest.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">
                    过去一年你为负债支付了 {annualInterestData.daysEquivalent > 0 ? `相当于 ${annualInterestData.daysEquivalent} 天的收入` : '利息成本'}
                  </p>
                </div>
                <div className="md:col-span-2">
                  {annualInterestPieOption ? (
                    <ReactECharts option={annualInterestPieOption} style={{ height: 220 }} />
                  ) : null}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>当前总负债</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-destructive">¥{summary.totalDebt.toFixed(0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>本月待还</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">¥{summary.monthlyRepayment.toFixed(0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>分期月供合计</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">¥{summary.totalInstallmentPayment.toFixed(0).toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>月度利息</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums text-destructive">¥{summary.monthlyInterest.toFixed(0).toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>负债台账汇总</CardTitle>
            <CardDescription>多账户分离展示信用卡、花呗的总负债、账单日、还款日、分期期数与利息</CardDescription>
          </CardHeader>
          <CardContent>
            {creditAccounts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-3 pr-4 font-medium">账户</th>
                      <th className="py-3 pr-4 font-medium">当前总负债</th>
                      <th className="py-3 pr-4 font-medium">本月待还</th>
                      <th className="py-3 pr-4 font-medium">账单日</th>
                      <th className="py-3 pr-4 font-medium">还款日</th>
                      <th className="py-3 pr-4 font-medium">分期月供</th>
                      <th className="py-3 pr-4 font-medium">月度利息</th>
                      <th className="py-3 font-medium">累计利息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditAccounts.map((account) => {
                      const stat = creditStats[account.id] || { totalDebt: 0, monthlyRepayment: 0, monthlyInstallment: 0, monthlyInterest: 0, totalInterest: 0 };
                      const apiDebt = debtData.get(account.id);
                      return (
                        <tr key={account.id} className="border-b last:border-b-0">
                          <td className="py-3 pr-4 font-medium">{account.name}</td>
                          <td className="py-3 pr-4 tabular-nums text-destructive">¥{(apiDebt?.totalDebt ?? stat.totalDebt).toFixed(0).toLocaleString()}</td>
                          <td className="py-3 pr-4 tabular-nums">¥{stat.monthlyRepayment.toFixed(0).toLocaleString()}</td>
                          <td className="py-3 pr-4">{account.billingDay || '-'}</td>
                          <td className="py-3 pr-4">{account.repaymentDay || '-'}</td>
                          <td className="py-3 pr-4 tabular-nums">¥{(apiDebt?.installmentMonthlyPayment ?? stat.monthlyInstallment).toFixed(0).toLocaleString()}</td>
                          <td className="py-3 pr-4 tabular-nums text-destructive">¥{stat.monthlyInterest.toFixed(0).toLocaleString()}</td>
                          <td className="py-3 tabular-nums text-destructive">¥{stat.totalInterest.toFixed(0).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-10 text-center">当前还没有信用卡或花呗账户</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>信贷现金流压力测算</CardTitle>
              <CardDescription>估算未来每月信贷还款金额，并标记高于月收入 30% 的风险账户</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {repaymentPressureRows.map((row) => (
                <div key={row.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-sm text-muted-foreground">
                        每月还款 ¥{row.monthlyTotal.toFixed(0).toLocaleString()}，占假定月收入 15000 的 {row.ratio.toFixed(0)}%
                      </p>
                    </div>
                    <Badge variant={row.ratio > 30 ? 'destructive' : 'secondary'}>
                      {row.ratio > 30 ? '高风险' : '可控'}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>提前还款模拟</CardTitle>
              <CardDescription>输入一次性提前还款金额，估算后续月度现金流释放效果</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1.5">
                <Label htmlFor="prepay-amount">提前还款金额</Label>
                <Input id="prepay-amount" type="number" min="0" value={prepayAmount} onChange={(event) => setPrepayAmount(event.target.value)} />
              </div>
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm text-muted-foreground">模拟结果</p>
                <p className="font-medium flex items-center gap-2">
                  <TrendingDown className="size-4 text-success" />
                  还款后总负债约 ¥{prepaymentSimulation.afterDebt.toFixed(0).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">
                  按 6 个月均摊，后续每月可支配现金约提升 ¥{prepaymentSimulation.monthlyRelief.toFixed(0).toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
