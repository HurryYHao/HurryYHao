'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, AlertTriangle, CheckCircle, Clock, Search, Filter, RefreshCw, Radio } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface LiveSession {
  roomName: string;
  anchorName: string;
  startTime: string;
}

interface Alert {
  id: number;
  sessionId: number;
  alertType: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | 'warning';
  title: string;
  description: string;
  evidence: any;
  suggestion: string;
  status: 'open' | 'resolved' | 'auto_resolved';
  triggeredAt: string;
  resolvedAt: string | null;
  offsetMinutes: number | null;
  session?: LiveSession;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAlerts = useCallback(async () => {
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
      setLastRefresh(new Date());
    }
  }, [filterStatus]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // 自动刷新 - 每60秒
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAlerts]);

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

  const formatLiveTime = (alert: Alert) => {
    // 优先显示直播相对时间
    if (alert.offsetMinutes !== null && alert.offsetMinutes !== undefined) {
      const hours = Math.floor(alert.offsetMinutes / 60);
      const mins = alert.offsetMinutes % 60;
      if (hours > 0) {
        return `直播第 ${hours}小时${mins > 0 ? mins + '分' : ''}`;
      }
      return `直播第 ${mins} 分钟`;
    }
    // 回退到绝对时间
    try {
      return format(new Date(alert.triggeredAt), 'MM-dd HH:mm:ss', { locale: zhCN });
    } catch {
      return alert.triggeredAt || '未知时间';
    }
  };

  const openAlerts = alerts.filter(a => a.status === 'open');
  const highAlerts = alerts.filter(a => a.severity === 'high' || a.severity === 'critical');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            实时预警中心
            {autoRefresh && (
              <span className="flex items-center gap-1 text-xs font-normal text-primary">
                <Radio className="w-3 h-3 animate-pulse" /> 实时监控中
              </span>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            监控直播过程中的异常指标和风险点，每分钟自动分析
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { fetchAlerts(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-input rounded-md hover:bg-muted/50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </button>
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              上次更新: {format(lastRefresh, 'HH:mm:ss')}
            </span>
          )}
        </div>
      </div>

      {/* 概览统计 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">待处理预警</p>
                <p className="text-2xl font-bold">{openAlerts.length}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">高风险预警</p>
                <p className="text-2xl font-bold">{highAlerts.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">今日总预警</p>
                <p className="text-2xl font-bold">{alerts.length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterStatus === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            全部 ({alerts.length})
          </button>
          <button
            onClick={() => setFilterStatus('open')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterStatus === 'open' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            待处理 ({openAlerts.length})
          </button>
          <button
            onClick={() => setFilterStatus('resolved')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filterStatus === 'resolved' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            已解决
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded border-input"
          />
          自动刷新（60秒）
        </label>
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
            <p className="text-xs mt-1">系统每分钟自动分析直播数据并生成预警</p>
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
                            {alert.severity === 'critical' ? '严重' : alert.severity === 'high' ? '高风险' : alert.severity === 'medium' ? '中风险' : '低风险'}
                          </Badge>
                          {alert.status !== 'open' && (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                              <CheckCircle className="w-3 h-3 mr-1" /> 已解决
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            {formatLiveTime(alert)}
                          </span>
                          {alert.triggeredAt && !isNaN(new Date(alert.triggeredAt).getTime()) && (
                            <span className="text-xs">
                              ({format(new Date(alert.triggeredAt), 'MM-dd HH:mm:ss', { locale: zhCN })})
                            </span>
                          )}
                          {alert.session && (
                            <span className="flex items-center gap-1">
                              {alert.session.roomName}
                              {alert.session.anchorName && ` - ${alert.session.anchorName}`}
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
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
