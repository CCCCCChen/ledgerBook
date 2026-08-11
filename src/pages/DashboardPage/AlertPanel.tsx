import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AlertItem {
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  target?: string;
}

export default function AlertPanel({ alerts }: { alerts: AlertItem[] }) {
  const navigate = useNavigate();

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
              <div className="flex items-start justify-between gap-2 col-start-2">
                <div className="flex-1 min-w-0">
                  <AlertTitle className="flex items-center gap-2">
                    {alert.title}
                    <Badge variant="secondary">
                      {alert.severity === 'high' ? '高风险' : alert.severity === 'medium' ? '关注' : '提示'}
                    </Badge>
                  </AlertTitle>
                  <AlertDescription className="text-xs">{alert.description}</AlertDescription>
                </div>
                {alert.target && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 gap-1 text-xs"
                    onClick={() => navigate(alert.target!)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    查看明细
                  </Button>
                )}
              </div>
            </Alert>
          ))
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">当前无风险预警，财务状况良好</p>
        )}
      </CardContent>
    </Card>
  );
}
