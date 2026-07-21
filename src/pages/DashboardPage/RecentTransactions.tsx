import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCard } from 'lucide-react';
import type { ITransaction } from '@/types/finance';

interface RecentTransactionsProps {
  transactions: ITransaction[];
  accounts: { id: string; name: string }[];
}

export default function RecentTransactions({ transactions, accounts }: RecentTransactionsProps) {
  const recent = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="size-5 text-primary" />
          最近交易
        </CardTitle>
        <CardDescription>最近 10 笔交易记录</CardDescription>
      </CardHeader>
      <CardContent>
        {recent.length > 0 ? (
          <div className="divide-y">
            {recent.map((txn) => {
              const accountName = accounts.find(a => a.id === txn.accountId)?.name || '';
              const isIncome = txn.amount > 0;
              return (
                <div key={txn.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{txn.category || '未分类'}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>{txn.date}</span>
                      {accountName && <span>{accountName}</span>}
                      {txn.note && <span className="truncate max-w-[120px]">{txn.note}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className={`text-sm font-semibold tabular-nums ${isIncome ? 'text-success' : 'text-destructive'}`}>
                      {isIncome ? '+' : '-'}¥{Math.abs(txn.amount).toLocaleString()}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{txn.transactionType || '支出'}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">暂无交易记录</p>
        )}
      </CardContent>
    </Card>
  );
}
