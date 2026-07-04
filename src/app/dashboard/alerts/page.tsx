'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, AlertTriangle, CheckCircle, Clock, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface Alert {
  id: number;
  session_id: number;
  alert_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'warning';
  title: string;
  description: string;
  evidence: any;
  suggestion: string;
  status: 'open' | 'resolved' | 'auto_resolved';
  triggered_at: string;
  resolved_at: string | null;
  live_sessions?: {
    room_name: string;
    anchor_name: string;
  };
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    fetchAlerts();
  }, [filterStatus]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/alerts', window.location.origin);
      if (filterStatus !== 'all') {
        url.searchParams.set('status', filterStatus);
      }
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: number) => {
    try {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'resolved' })
      });
      if (res.ok) {
        fetchAlerts();
      }
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/10 text-red-500 border-red-200';
      case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-200';
      case 'warning':
      case 'medium': return 'bg-yellow-500/10 text-yellow-600 border-yellow-200';
      default: return 'bg-blue-500/10 text-blue-500 border-blue-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high': return <AlertCircle className="w-5 h-5 text-red-500" />;
      default: return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">实时预警中心</h1>
        <p className="text-muted-foreground mt-2">
          监控直播过程中的异常指标和风险点，并提供实时纠偏建议。
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterStatus === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            全部
          </button>
          <button
            onClick={() => setFilterStatus('open')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterStatus === 'open' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            待处理
          </button>
          <button
            onClick={() => setFilterStatus('resolved')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterStatus === 'resolved' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            已解决
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : alerts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <CheckCircle className="w-12 h-12 mb-4 text-green-500/50" />
            <p>当前没有符合条件的预警记录</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {alerts.map((alert) => (
            <Card key={alert.id} className={`overflow-hidden ${alert.status === 'open' ? 'border-l-4 border-l-red-500' : 'opacity-75'}`}>
              <div className="p-6 flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        {getSeverityIcon(alert.severity)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">{alert.title}</h3>
                          <Badge variant="outline" className={getSeverityColor(alert.severity)}>
                            {alert.severity === 'critical' ? '严重' : alert.severity === 'high' ? '高风险' : '中风险'}
                          </Badge>
                          {alert.status !== 'open' && (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                              <CheckCircle className="w-3 h-3 mr-1" /> 已解决
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {format(new Date(alert.triggered_at), 'MM-dd HH:mm:ss', { locale: zhCN })}
                          </span>
                          {alert.live_sessions && (
                            <span className="flex items-center gap-1">
                              直播间: {alert.live_sessions.room_name} 
                              {alert.live_sessions.anchor_name && ` (${alert.live_sessions.anchor_name})`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pl-8 text-sm">
                    <p className="text-foreground leading-relaxed">
                      {alert.description}
                    </p>
                    {alert.suggestion && (
                      <div className="mt-3 bg-primary/5 p-3 rounded-md border border-primary/10">
                        <span className="font-medium text-primary">建议动作：</span>
                        <span className="text-muted-foreground ml-2">{alert.suggestion}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="md:w-48 flex flex-col justify-center items-end gap-2 border-t md:border-t-0 md:border-l pt-4 md:pt-0 pl-0 md:pl-6">
                  {alert.status === 'open' && (
                    <button
                      onClick={() => handleResolve(alert.id)}
                      className="w-full px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
                    >
                      标记为已处理
                    </button>
                  )}
                  <button className="w-full px-4 py-2 bg-muted text-muted-foreground text-sm font-medium rounded-md hover:bg-muted/80 transition-colors">
                    查看详细数据
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}