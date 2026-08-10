import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

interface AlertItem {
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

export default function AlertPanel({ alerts }: { alerts: AlertItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-primary" />
          预警中心
        </CardTitle>
        <CardDescription>汇总超支、风险、大额支出等信息</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.length > 0 ? (
          alerts.map((alert, i) => (
            <Alert key={i} variant="default" className={
              alert.severity === 'high' ? 'border-l-4 border-l-destructive' :
              alert.severity === 'medium' ? 'border-l-4 border-l-warning' :
              'border-l-4 border-l-muted-foreground/25'
            }>
              <AlertTitle className="flex items-center gap-2">
                {alert.title}
                <Badge variant="secondary">
                  {alert.severity === 'high' ? '高风险' : alert.severity === 'medium' ? '关注' : '提示'}
                </Badge>
              </AlertTitle>
              <AlertDescription>{alert.description}</AlertDescription>
            </Alert>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">当前无风险预警，财务状况良好</p>
        )}
      </CardContent>
    </Card>
  );
}
