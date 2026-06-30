function formatISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISODate(date) {
  return new Date(`${date}T00:00:00`);
}

function getSafeMonthDay(year, month, day) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

function isCreditAccount(account) {
  return account && (account.type === 'credit_card' || account.type === 'alipay_huabei');
}

function resolveAccountCashOutDate(date, account) {
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

function getCashOutDate(transactionDate, billingDay, repaymentDay) {
  const date = parseISODate(transactionDate);
  const txDay = date.getDate();

  const cycleStartMonthOffset = txDay >= billingDay ? 0 : -1;
  const cycleStart = getSafeMonthDay(date.getFullYear(), date.getMonth() + cycleStartMonthOffset, billingDay);
  const nextCycleStart = getSafeMonthDay(cycleStart.getFullYear(), cycleStart.getMonth() + 1, billingDay);
  const cycleEnd = new Date(nextCycleStart);
  cycleEnd.setDate(cycleEnd.getDate() - 1);

  const cashMonthOffset = repaymentDay > billingDay ? 0 : 1;
  const cashDate = getSafeMonthDay(cycleEnd.getFullYear(), cycleEnd.getMonth() + cashMonthOffset, repaymentDay);
  return formatISODate(cashDate);
}

function resolveTransactionCashOutDate(transaction, account) {
  if (transaction.transactionType === 'repayment_out' || transaction.transactionType === 'repayment_in') {
    return undefined;
  }
  if (transaction.amount >= 0) {
    return undefined;
  }
  return resolveAccountCashOutDate(transaction.date, account);
}

module.exports = {
  getCashOutDate,
  resolveAccountCashOutDate,
  resolveTransactionCashOutDate,
};
