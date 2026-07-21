import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Pencil, Trash2 } from 'lucide-react';
import type { ITransaction } from '@/types/finance';

interface TransactionTableProps {
  filtered: ITransaction[];
  getAccountName: (id: string) => string;
  getAccountType: (id: string) => string;
  getBudgetName: (id: string) => string;
  getTransactionTypeLabel: (type?: string) => string;
  isCashFlowShifted: (txn: ITransaction) => boolean;
  EXPENSE_ATTRIBUTE_LABELS: Record<string, string>;
  hasActiveFilters: boolean;
  onEdit: (txn: ITransaction) => void;
  onDelete: (txn: ITransaction) => void;
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const generatePaginationItems = (current: number, total: number): (number | 'ellipsis')[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | 'ellipsis')[] = [1];
  if (current > 3) items.push('ellipsis');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    items.push(i);
  }
  if (current < total - 2) items.push('ellipsis');
  items.push(total);
  return items;
};

export const TransactionTable: React.FC<TransactionTableProps> = ({
  filtered,
  getAccountName,
  getAccountType,
  getBudgetName,
  getTransactionTypeLabel,
  isCashFlowShifted,
  EXPENSE_ATTRIBUTE_LABELS,
  hasActiveFilters,
  onEdit,
  onDelete,
  totalCount,
  page,
  pageSize,
  onPageChange,
}) => {
  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            交易记录
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2 align-middle">
                已筛选
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <p className="text-lg">暂无交易记录</p>
              <p className="text-sm mt-1">
                {hasActiveFilters ? '尝试调整筛选条件' : '点击"添加记录"开始记账'}
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">日期</TableHead>
                    <TableHead className="whitespace-nowrap">账户</TableHead>
                    <TableHead className="whitespace-nowrap">分类</TableHead>
                    <TableHead className="whitespace-nowrap">类型</TableHead>
                    <TableHead className="whitespace-nowrap text-right">金额</TableHead>
                    <TableHead className="whitespace-nowrap">备注</TableHead>
                    <TableHead className="whitespace-nowrap">预算</TableHead>
                    <TableHead className="whitespace-nowrap text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((txn) => (
                    <TableRow key={txn.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        <div>{txn.date}</div>
                        {isCashFlowShifted(txn) && (
                          <div className="text-xs text-muted-foreground">
                            现金流日 {txn.cashOutDate}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="text-sm font-medium">{getAccountName(txn.accountId)}</div>
                        <div className="text-xs text-muted-foreground">
                          {getAccountType(txn.accountId)}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="text-xs">
                          {txn.category}
                        </Badge>
                        {txn.expenseAttribute && (
                          <div className="mt-1">
                            <Badge variant="secondary" className="text-[11px]">
                              {EXPENSE_ATTRIBUTE_LABELS[txn.expenseAttribute]}
                            </Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={txn.transactionType && txn.transactionType !== 'normal' ? 'secondary' : 'outline'} className="text-xs">
                          {getTransactionTypeLabel(txn.transactionType)}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`whitespace-nowrap text-right text-sm font-semibold tabular-nums ${
                          txn.amount >= 0 ? 'text-success' : 'text-destructive'
                        }`}
                      >
                        {txn.amount >= 0 ? '+' : ''}¥{Math.abs(txn.amount).toLocaleString()}
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <span className="block truncate text-sm">{txn.note || '-'}</span>
                        {txn.transferAccountId && (
                          <span className="block truncate text-xs text-muted-foreground">
                            对方账户：{getAccountName(txn.transferAccountId)}
                          </span>
                        )}
                        {txn.installmentPlanId && txn.installmentIndex && txn.installmentTotal && (
                          <span className="block truncate text-xs text-muted-foreground">
                            分期：第 {txn.installmentIndex}/{txn.installmentTotal} 期
                          </span>
                        )}
                        {txn.installmentFee != null && txn.installmentFee > 0 && (
                          <span className="block truncate text-xs text-muted-foreground">
                            含手续费：¥{txn.installmentFee.toLocaleString()}
                          </span>
                        )}
                        {isCashFlowShifted(txn) && (
                          <span className="block truncate text-xs text-muted-foreground">
                            记账日 {txn.date}，预计还款日 {txn.cashOutDate}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {txn.isBudgeted && txn.budgetId ? (
                          <Badge variant="secondary" className="text-xs">
                            {getBudgetName(txn.budgetId)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onEdit(txn)}
                            aria-label="编辑"
                            disabled={txn.transactionType === 'repayment_out' || txn.transactionType === 'repayment_in'}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => onDelete(txn)}
                            aria-label="删除"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalCount > pageSize && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => { e.preventDefault(); if (page > 1) onPageChange(page - 1); }}
                aria-disabled={page <= 1}
                className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
            {generatePaginationItems(page, Math.ceil(totalCount / pageSize)).map((item, idx) => {
              if (item === 'ellipsis') {
                return (
                  <PaginationItem key={`ellipsis-${idx}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                );
              }
              return (
                <PaginationItem key={item}>
                  <PaginationLink
                    href="#"
                    onClick={(e) => { e.preventDefault(); onPageChange(item as number); }}
                    isActive={item === page}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => { e.preventDefault(); if (page < Math.ceil(totalCount / pageSize)) onPageChange(page + 1); }}
                aria-disabled={page >= Math.ceil(totalCount / pageSize)}
                className={page >= Math.ceil(totalCount / pageSize) ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </>
  );
};
