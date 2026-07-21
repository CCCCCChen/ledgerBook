import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Play } from 'lucide-react';

interface SimulationPanelProps {
  rangeMonths: string;
  onRangeMonthsChange: (v: string) => void;
  hasParamChanges: boolean;
  onResetToDefault: () => void;
  useFixedEndDate: boolean;
  onUseFixedEndDateChange: (v: boolean) => void;
  fixedEndDate: string;
  onFixedEndDateChange: (v: string) => void;
  selectedStrategy: string;
  onStrategyChange: () => void;
  includeIncomeBudgets: boolean;
  onIncludeIncomeBudgetsChange: (v: boolean) => void;
  includePlannedExpenses: boolean;
  onIncludePlannedExpensesChange: (v: boolean) => void;
  includeBudgetSettlement: boolean;
  onIncludeBudgetSettlementChange: (v: boolean) => void;
  startBalance: string;
  onStartBalanceChange: (v: string) => void;
  safetyLine: string;
  onSafetyLineChange: (v: string) => void;
  onRun: () => void;
  loading: boolean;
  activeTab: string;
  onTabChange: (v: string) => void;
}

export const SimulationPanel: React.FC<SimulationPanelProps> = ({
  rangeMonths,
  onRangeMonthsChange,
  hasParamChanges,
  onResetToDefault,
  useFixedEndDate,
  onUseFixedEndDateChange,
  fixedEndDate,
  onFixedEndDateChange,
  includeIncomeBudgets,
  onIncludeIncomeBudgetsChange,
  includePlannedExpenses,
  onIncludePlannedExpensesChange,
  includeBudgetSettlement,
  onIncludeBudgetSettlementChange,
  startBalance,
  onStartBalanceChange,
  safetyLine,
  onSafetyLineChange,
  onRun,
  loading,
  activeTab,
  onTabChange,
}) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">现金流模拟器</CardTitle>
          <div className="flex items-center gap-2">
            {hasParamChanges && (
              <Button variant="ghost" size="sm" onClick={onResetToDefault} className="text-xs">
                恢复默认
              </Button>
            )}
            <Button size="sm" onClick={onRun} disabled={loading} className="gap-1.5">
              <Play className="size-3.5" />
              {loading ? '计算中...' : '运行模拟'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={onTabChange}>
          <TabsList className="mb-4">
            <TabsTrigger value="basic">基础参数</TabsTrigger>
            <TabsTrigger value="options">选项</TabsTrigger>
            <TabsTrigger value="balance">余额设置</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sim-range-months">模拟月数</Label>
                <Input
                  id="sim-range-months"
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  value={rangeMonths}
                  onChange={(e) => onRangeMonthsChange(e.target.value)}
                  placeholder="如 6"
                />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <Switch
                  id="sim-fixed-end"
                  checked={useFixedEndDate}
                  onCheckedChange={onUseFixedEndDateChange}
                />
                <Label htmlFor="sim-fixed-end" className="cursor-pointer">
                  固定结束日期
                </Label>
              </div>
            </div>
            {useFixedEndDate && (
              <div className="grid gap-1.5">
                <Label htmlFor="sim-end-date">结束日期</Label>
                <Input
                  id="sim-end-date"
                  type="date"
                  value={fixedEndDate}
                  onChange={(e) => onFixedEndDateChange(e.target.value)}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="options" className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="sim-include-income-budgets" className="cursor-pointer">
                计入收入预算（月度预期收入）
              </Label>
              <Switch
                id="sim-include-income-budgets"
                checked={includeIncomeBudgets}
                onCheckedChange={onIncludeIncomeBudgetsChange}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sim-include-planned" className="cursor-pointer">
                计入预估支出
              </Label>
              <Switch
                id="sim-include-planned"
                checked={includePlannedExpenses}
                onCheckedChange={onIncludePlannedExpensesChange}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sim-include-budget-settlement" className="cursor-pointer">
                计入预算结算差额
              </Label>
              <Switch
                id="sim-include-budget-settlement"
                checked={includeBudgetSettlement}
                onCheckedChange={onIncludeBudgetSettlementChange}
              />
            </div>
          </TabsContent>

          <TabsContent value="balance" className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sim-start-balance">起始余额</Label>
              <Input
                id="sim-start-balance"
                type="number"
                step="0.01"
                value={startBalance}
                onChange={(e) => onStartBalanceChange(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                留空则自动从现有账户余额推算
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sim-safety-line">资金安全线</Label>
              <Input
                id="sim-safety-line"
                type="number"
                step="0.01"
                value={safetyLine}
                onChange={(e) => onSafetyLineChange(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                模拟结果中低于此线将高亮提示
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
