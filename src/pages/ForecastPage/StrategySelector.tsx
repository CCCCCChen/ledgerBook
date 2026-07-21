import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings } from 'lucide-react';

interface Strategy {
  id: string;
  label: string;
}

interface StrategySelectorProps {
  strategies: Strategy[];
  selectedStrategy: string;
  onSelect: (id: string) => void;
  onCustomize: () => void;
}

export const StrategySelector: React.FC<StrategySelectorProps> = ({
  strategies,
  selectedStrategy,
  onSelect,
  onCustomize,
}) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">策略选择</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {strategies.map((strategy) => (
            <Button
              key={strategy.id}
              variant={selectedStrategy === strategy.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => onSelect(strategy.id)}
            >
              {strategy.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={onCustomize}
            className="gap-1.5"
          >
            <Settings className="size-3.5" />
            自定义
          </Button>
        </div>
        {selectedStrategy && (
          <div className="mt-3">
            <Badge variant="secondary" className="text-xs">
              当前策略：
              {strategies.find((s) => s.id === selectedStrategy)?.label || selectedStrategy}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
