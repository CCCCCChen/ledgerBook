import type { IAccount, ITransaction } from '@/types/finance';
import { formatLocalISODate } from './date';

function parseISODate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function getSafeMonthDay(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

function isCreditAccount(account?: IAccount | null): boolean {
  return account?.type === 'credit_card' || account?.type === 'alipay_huabei';
}

export function resolveAccountCashOutDate(date: string, account?: IAccount | null): string | undefined {
  if (!account) {
    return date;
  }
  if (isCreditAccount(account)) {
    if (!account.billingDay || !account.repaymentDay) {
      return undefined;
    }
    return getCashOutDate(date, account.billingDay, account.repaymentDay);
  }
  return date;
}

export function getCashOutDate(transactionDate: string, billingDay: number, repaymentDay: number): string {
  const date = parseISODate(transactionDate);
  const txDay = date.getDate();

  const cycleStartMonthOffset = txDay >= billingDay ? 0 : -1;
  const cycleStart = getSafeMonthDay(date.getFullYear(), date.getMonth() + cycleStartMonthOffset, billingDay);
  const nextCycleStart = getSafeMonthDay(cycleStart.getFullYear(), cycleStart.getMonth() + 1, billingDay);
  const cycleEnd = new Date(nextCycleStart);
  cycleEnd.setDate(cycleEnd.getDate() - 1);

  const cashMonthOffset = repaymentDay > billingDay ? 0 : 1;
  const cashDate = getSafeMonthDay(cycleEnd.getFullYear(), cycleEnd.getMonth() + cashMonthOffset, repaymentDay);
  return formatLocalISODate(cashDate);
}

export function resolveTransactionCashOutDate(
  transaction: Pick<ITransaction, 'date' | 'amount' | 'transactionType' | 'accountId'>,
  account?: IAccount | null,
): string | undefined {
  if (transaction.transactionType === 'repayment_out' || transaction.transactionType === 'repayment_in') {
    return undefined;
  }
  if (transaction.amount >= 0) {
    return undefined;
  }
  return resolveAccountCashOutDate(transaction.date, account);
}

export function getEffectiveTransactionDate(
  transaction: Pick<ITransaction, 'date' | 'cashOutDate' | 'amount'>,
  mode: 'expense' | 'cashflow',
): string {
  if (mode === 'cashflow' && transaction.amount < 0 && transaction.cashOutDate) {
    return transaction.cashOutDate;
  }
  return transaction.date;
}
