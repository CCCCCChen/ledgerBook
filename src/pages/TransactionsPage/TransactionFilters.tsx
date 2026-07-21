import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, ArrowUpDown, X } from 'lucide-react';

interface TransactionFiltersProps {
  searchKeyword: string;
  onSearchChange: (v: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  sortAsc: boolean;
  onToggleSort: () => void;
  filterAccountId: string;
  onAccountFilterChange: (v: string) => void;
  filterCategory: string;
  onCategoryFilterChange: (v: string) => void;
  filterDateFrom: string;
  onDateFromChange: (v: string) => void;
  filterDateTo: string;
  onDateToChange: (v: string) => void;
  accounts: { id: string; name: string }[];
  CATEGORIES: string[];
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export const TransactionFilters: React.FC<TransactionFiltersProps> = ({
  searchKeyword,
  onSearchChange,
  showFilters,
  onToggleFilters,
  sortAsc,
  onToggleSort,
  filterAccountId,
  onAccountFilterChange,
  filterCategory,
  onCategoryFilterChange,
  filterDateFrom,
  onDateFromChange,
  filterDateTo,
  onDateToChange,
  accounts,
  CATEGORIES,
  hasActiveFilters,
  onClearFilters,
}) => {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Input
              placeholder="搜索交易备注..."
              value={searchKeyword}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Filter toggle */}
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            onClick={onToggleFilters}
            className="gap-1.5"
          >
            <Filter className="size-3.5" />
            筛选
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">!</Badge>
            )}
          </Button>

          {/* Sort toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleSort}
            className="gap-1.5"
          >
            <ArrowUpDown className="size-3.5" />
            {sortAsc ? '升序' : '降序'}
          </Button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="grid gap-1.5">
              <Label>账户</Label>
              <Select value={filterAccountId} onValueChange={onAccountFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="全部账户" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部账户</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>分类</Label>
              <Select value={filterCategory} onValueChange={onCategoryFilterChange}>
                <SelectTrigger>
                  <SelectValue placeholder="全部分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部分类</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>开始日期</Label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>结束日期</Label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => onDateToChange(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Active filters summary */}
        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">当前筛选：</span>
            {filterDateFrom && (
              <Badge variant="secondary" className="text-xs gap-1">
                自 {filterDateFrom}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-3.5 w-3.5 ml-0.5"
                  onClick={() => onDateFromChange('')}
                >
                  <X className="size-2.5" />
                </Button>
              </Badge>
            )}
            {filterDateTo && (
              <Badge variant="secondary" className="text-xs gap-1">
                至 {filterDateTo}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-3.5 w-3.5 ml-0.5"
                  onClick={() => onDateToChange('')}
                >
                  <X className="size-2.5" />
                </Button>
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onClearFilters}>
              清除筛选
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
