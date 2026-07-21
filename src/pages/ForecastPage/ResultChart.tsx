import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface BalancePoint {
  date: string;
  balance: number;
}

interface ResultChartProps {
  hasData: boolean;
  chartPoints: BalancePoint[];
  baselinePoints: BalancePoint[];
  safetyLine: number;
  minBalance: number;
  minDate: string;
  endBalance: number;
  showBaseline: boolean;
}

const Sparkline: React.FC<{ points: BalancePoint[]; color: string; height?: number }> = ({
  points,
  color,
  height = 120,
}) => {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-xs text-muted-foreground">数据不足</p>
      </div>
    );
  }

  const values = points.map((p) => p.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 8;

  const normalized = points.map((p, i) => {
    const x = padding + (i / (points.length - 1)) * (100 - padding * 2);
    const y = padding + (1 - (p.balance - min) / range) * ((height - padding * 2) / (height / (height - 16)));
    return `${x},${height - y}`;
  });

  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      <polyline
        points={normalized.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="0.4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

export const ResultChart: React.FC<ResultChartProps> = ({
  hasData,
  chartPoints,
  baselinePoints,
  safetyLine,
  minBalance,
  minDate,
  endBalance,
  showBaseline,
}) => {
  if (!hasData) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <p className="text-lg">尚未运行模拟</p>
          <p className="text-sm mt-1">设置参数后点击"运行模拟"</p>
        </CardContent>
      </Card>
    );
  }

  const isBelowSafety = safetyLine > 0 && minBalance < safetyLine;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          现金流曲线
          {showBaseline && (
            <Badge variant="outline" className="ml-2 text-xs">
              含基线对比
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">最低余额</p>
            <p
              className={`text-base font-semibold tabular-nums ${
                isBelowSafety ? 'text-destructive' : 'text-foreground'
              }`}
            >
              ¥{Math.round(minBalance).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{minDate}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">期末余额</p>
            <p className="text-base font-semibold tabular-nums">
              ¥{Math.round(endBalance).toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">安全线</p>
            <p className="text-base font-semibold tabular-nums">
              ¥{Math.round(safetyLine).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Chart area */}
        <div className="rounded-lg border bg-muted/30 overflow-hidden">
          <div className="relative">
            <Sparkline points={chartPoints} color="hsl(221.2 83.2% 53.3%)" height={200} />
            {showBaseline && baselinePoints.length > 0 && (
              <div className="relative -mt-[200px]">
                <Sparkline points={baselinePoints} color="hsl(0 0% 60%)" height={200} />
              </div>
            )}
          </div>
          {safetyLine > 0 && (
            <div
              className="border-t border-dashed border-destructive/50 mx-4 relative"
              style={{
                bottom: `${
                  chartPoints.length > 0
                    ? (1 -
                        (safetyLine - Math.min(...chartPoints.map((p) => p.balance))) /
                          Math.max(1, Math.max(...chartPoints.map((p) => p.balance)) - Math.min(...chartPoints.map((p) => p.balance))))
                    : 0
                }`,
              }}
            >
              <span className="absolute right-2 -top-3 text-[10px] text-destructive bg-background px-1">
                安全线
              </span>
            </div>
          )}
        </div>

        {showBaseline && (
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 rounded-full bg-primary" />
              当前方案
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 rounded-full bg-muted-foreground/50" />
              基线
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
