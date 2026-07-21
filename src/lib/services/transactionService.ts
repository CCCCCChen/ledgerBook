// ============================================================
// 交易服务模块
// ============================================================
import { transactionsApi } from '@/api/index';
import type { ITransaction, TransactionCategory, ExpenseAttribute, IAccount } from '@/types/finance';
import { isElectronRuntime } from '../electron-api';
import { lsLoadTransactions, lsSaveTransactions, lsLoadAccounts } from '../storage';
import { resolveTransactionCashOutDate } from '../cashflow';
import { formatLocalISODate, nowLocalISODate } from '../date';

export { lsLoadTransactions, lsSaveTransactions };
export { nowLocalISODate };

export async function loadTransactions(): Promise<ITransaction[]> {
  if (isElectronRuntime()) {
    try {
      const res = await transactionsApi.list();
      return res.success ? res.data : lsLoadTransactions();
    } catch {
      return lsLoadTransactions();
    }
  }
  return lsLoadTransactions();
}

export async function saveTransactions(transactions: ITransaction[]): Promise<void> {
  if (isElectronRuntime()) return;
  lsSaveTransactions(transactions);
}

export async function createTransaction(data: Partial<ITransaction>): Promise<ITransaction | null> {
  if (isElectronRuntime()) {
    try {
      const res = await transactionsApi.create(data as any);
      return res.success ? res.data : null;
    } catch {
      return null;
    }
  }
  const id = `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const transactionType = data.transactionType || 'normal';
  const isTransfer = transactionType === 'transfer';
  const isRepaymentOut = transactionType === 'repayment_out';
  const isRepaymentIn = transactionType === 'repayment_in';
  const isInstallmentBill = transactionType === 'installment_bill';
  const isNormal = transactionType === 'normal';

  const amount = Number(data.amount || 0);
  const date = data.date || nowLocalISODate();

  const base: Partial<ITransaction> = {
    id,
    date,
    amount,
    transactionType,
    category: (data.category as TransactionCategory) || '其他',
    note: data.note || '',
    isBudgeted: Boolean(data.isBudgeted),
    budgetId: data.budgetId || undefined,
    accountId: data.accountId || '',
    transferAccountId: data.transferAccountId || undefined,
    pairedTransactionId: data.pairedTransactionId || undefined,
    expenseAttribute: (data.expenseAttribute as ExpenseAttribute) || undefined,
    cashOutDate: data.cashOutDate || undefined,
    installmentPlanId: data.installmentPlanId || undefined,
    installmentIndex: data.installmentIndex || undefined,
    installmentTotal: data.installmentTotal || undefined,
    installmentFee: data.installmentFee || undefined,
    repaymentTargetAccountId: data.repaymentTargetAccountId || undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (isNormal) {
    const finalAmount = data.isExpense === false ? Math.abs(amount) : -Math.abs(amount);
    const accounts = lsLoadAccounts();
    const accountMap = new Map(accounts.map((a: IAccount) => [a.id, a]));
    const newTxn: ITransaction = {
      ...base,
      amount: finalAmount,
      cashOutDate: resolveTransactionCashOutDate(
        { ...base, amount: finalAmount, date } as ITransaction,
        accountMap.get(base.accountId || ''),
      ) || undefined,
    } as ITransaction;
    const txns = lsLoadTransactions();
    txns.push(newTxn);
    lsSaveTransactions(txns);
    return newTxn;
  }

  if (isRepaymentOut) {
    const txns = lsLoadTransactions();
    const repaymentIn: ITransaction = {
      ...base,
      id: `txn-${Date.now() + 1}-${Math.random().toString(36).slice(2, 8)}`,
      transactionType: 'repayment_in',
      amount: Math.abs(amount),
      accountId: data.repaymentTargetAccountId || '',
      pairedTransactionId: id,
    } as ITransaction;
    const repaymentOut: ITransaction = {
      ...base,
      amount: -Math.abs(amount),
      pairedTransactionId: repaymentIn.id,
    } as ITransaction;
    txns.push(repaymentOut, repaymentIn);
    lsSaveTransactions(txns);
    return repaymentOut;
  }

  if (isInstallmentBill) {
    const installmentCount = Number(data.installmentCount || 3);
    const feeTotal = Number(data.feeTotal || 0);
    const perAmount = -Math.abs(amount);
    const perFee = feeTotal > 0 ? feeTotal / installmentCount : 0;
    const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const txns = lsLoadTransactions();
    for (let i = 0; i < installmentCount; i++) {
      const instDate = new Date(`${date}T00:00:00`);
      instDate.setMonth(instDate.getMonth() + i);
      txns.push({
        ...base,
        id: `txn-${Date.now() + i}-${Math.random().toString(36).slice(2, 8)}`,
        date: formatLocalISODate(instDate),
        amount: perAmount,
        installmentPlanId: planId,
        installmentIndex: i + 1,
        installmentTotal: installmentCount,
        installmentFee: perFee > 0 ? perFee : undefined,
        note: `${data.note || '分期账单'}（第 ${i + 1}/${installmentCount} 期）`,
      } as ITransaction);
    }
    lsSaveTransactions(txns);
    return txns.find((t) => t.installmentPlanId === planId && t.installmentIndex === 1) || null;
  }

  if (isTransfer) {
    const txns = lsLoadTransactions();
    const transferIn: ITransaction = {
      ...base,
      id: `txn-${Date.now() + 1}-${Math.random().toString(36).slice(2, 8)}`,
      transactionType: 'transfer',
      amount: Math.abs(amount),
      accountId: data.transferAccountId || '',
      pairedTransactionId: id,
      note: data.note || '账户转账（转入）',
    } as ITransaction;
    const transferOut: ITransaction = {
      ...base,
      amount: -Math.abs(amount),
      pairedTransactionId: transferIn.id,
      note: data.note || '账户转账（转出）',
    } as ITransaction;
    txns.push(transferOut, transferIn);
    lsSaveTransactions(txns);
    return transferOut;
  }

  const txns = lsLoadTransactions();
  txns.push(base as ITransaction);
  lsSaveTransactions(txns);
  return base as ITransaction;
}

export async function updateTransaction(
  id: string,
  data: Partial<ITransaction>,
  scope: 'single' | 'plan' = 'single',
): Promise<ITransaction | null> {
  if (isElectronRuntime()) {
    try {
      const res = await transactionsApi.update(id, { ...data, editScope: scope } as any);
      return res.success ? res.data : null;
    } catch {
      return null;
    }
  }
  const txns = lsLoadTransactions();
  const idx = txns.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const amount = data.amount !== undefined ? Number(data.amount) : txns[idx].amount;
  const category = (data.category ?? txns[idx].category) as TransactionCategory;
  const baseNote = data.note ?? txns[idx].note ?? '';
  const expenseAttribute =
    amount < 0 ? (data.expenseAttribute ?? txns[idx].expenseAttribute) : undefined;
  const isBudgeted = data.isBudgeted != null ? Boolean(data.isBudgeted) : txns[idx].isBudgeted;
  const budgetId = isBudgeted ? (data.budgetId ?? txns[idx].budgetId) : undefined;
  const now = new Date().toISOString();
  const baseDate = data.date ?? txns[idx].date;
  const accounts = lsLoadAccounts();
  const accountMap = new Map(accounts.map((account: IAccount) => [account.id, account]));
  const planId = (data as any)?.installmentPlanId || txns[idx].installmentPlanId;

  if (scope === 'plan' && planId) {
    txns.forEach((transaction) => {
      if (transaction.installmentPlanId !== planId) return;
      const suffix =
        transaction.installmentIndex && transaction.installmentTotal
          ? `（第 ${transaction.installmentIndex}/${transaction.installmentTotal} 期）`
          : '';
      if (transaction.installmentIndex) {
        const date = new Date(`${baseDate}T00:00:00`);
        date.setMonth(date.getMonth() + (transaction.installmentIndex - 1));
        transaction.date = formatLocalISODate(date);
      }
      transaction.amount = amount;
      transaction.category = category;
      transaction.expenseAttribute = expenseAttribute;
      transaction.note = suffix ? `${baseNote || '分期账单'}${suffix}` : baseNote || '分期账单';
      transaction.isBudgeted = isBudgeted;
      transaction.budgetId = budgetId;
      transaction.cashOutDate =
        resolveTransactionCashOutDate(transaction, accountMap.get(transaction.accountId)) || undefined;
      transaction.updatedAt = now;
    });
  } else {
    const suffix =
      txns[idx].installmentIndex && txns[idx].installmentTotal
        ? `（第 ${txns[idx].installmentIndex}/${txns[idx].installmentTotal} 期）`
        : '';
    txns[idx] = {
      ...txns[idx],
      date: data.date ?? txns[idx].date,
      amount,
      category,
      expenseAttribute,
      note: suffix ? `${baseNote || '分期账单'}${suffix}` : baseNote || '分期账单',
      isBudgeted,
      budgetId,
      cashOutDate:
        resolveTransactionCashOutDate(
          {
            ...txns[idx],
            date: data.date ?? txns[idx].date,
            amount,
          },
          accountMap.get(txns[idx].accountId),
        ) || undefined,
      updatedAt: now,
    };
  }
  lsSaveTransactions(txns);
  return txns[idx];
}

export async function deleteTransaction(id: string, scope: 'single' | 'plan' = 'single'): Promise<boolean> {
  if (isElectronRuntime()) {
    try {
      await transactionsApi.remove(id, scope);
      return true;
    } catch {
      return false;
    }
  }
  const current = lsLoadTransactions();
  const existing = current.find((t) => t.id === id);
  if (!existing) return false;
  const todayISO = nowLocalISODate();
  const txns = current.filter((transaction) => {
    if (existing.pairedTransactionId) {
      return transaction.pairedTransactionId !== existing.pairedTransactionId;
    }
    if (existing.installmentPlanId) {
      if (scope === 'plan') {
        const firstDate = current
          .filter((t) => t.installmentPlanId === existing.installmentPlanId)
          .map((t) => t.date)
          .sort()[0];
        if (firstDate && firstDate <= todayISO) {
          return true;
        }
        return transaction.installmentPlanId !== existing.installmentPlanId;
      }
      return transaction.id !== id;
    }
    return transaction.id !== id;
  });
  if (existing.installmentPlanId && scope === 'plan') {
    const firstDate = current
      .filter((t) => t.installmentPlanId === existing.installmentPlanId)
      .map((t) => t.date)
      .sort()[0];
    if (firstDate && firstDate <= todayISO) return false;
  }
  lsSaveTransactions(txns);
  return true;
}
