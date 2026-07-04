'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Activity, MessageSquare, ShoppingBag, AlertTriangle, PlayCircle, Search } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

interface TimelineEvent {
  id: number;
  session_id: number;
  timestamp: string;
  offset_seconds: number;
  event_type: string;
  content: string;
  metrics: any;
  source: string;
  importance: 'low' | 'medium' | 'high';
}

interface MinuteMetric {
  minute_index: number;
  online_count: number;
  comment_count: number;
  order_count: number;
  paid_count: number;
  paid_amount: number;
}

export default function TimelinePage() {
  const [sessions, setSessions] = useState<{id: number, room_name: string, start_time: string}[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [metrics, setMetrics] = useState<MinuteMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterSource, setFilterSource] = useState('all');

  // Load recent sessions first
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch('/api/sessions');
        if (res.ok) {
          const data = await res.json();
          // 处理两种可能的格式：data.data.sessions 或直接 data.data
          let sessions = [];
          if (data.data?.sessions && Array.isArray(data.data.sessions)) {
            sessions = data.data.sessions;
          } else if (data.data && Array.isArray(data.data)) {
            sessions = data.data;
          }
          
          if (sessions.length > 0) {
            setSessions(sessions);
            setSelectedSession(sessions[0].id.toString());
          }
        }
      } catch (err) {
        console.error('Failed to fetch sessions:', err);
      }
    };
    fetchSessions();
  }, []);

  // Load timeline data when session changes
  useEffect(() => {
    if (!selectedSession) return;
    
    const fetchTimelineData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/timeline?session_id=${selectedSession}`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data.data.events || []);
          setMetrics(data.data.metrics || []);
        }
      } catch (error) {
        console.error('Failed to fetch timeline:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTimelineData();
  }, [selectedSession]);

  const getEventIcon = (source: string, type: string) => {
    if (type.includes('peak') || source === 'chart') return <Activity className="w-4 h-4 text-blue-500" />;
    if (source === 'comment') return <MessageSquare className="w-4 h-4 text-green-500" />;
    if (source === 'order') return <ShoppingBag className="w-4 h-4 text-orange-500" />;
    if (source === 'ai' || type.includes('alert')) return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (source === 'asr' || source === 'system') return <PlayCircle className="w-4 h-4 text-purple-500" />;
    return <Clock className="w-4 h-4 text-gray-500" />;
  };

  const formatOffset = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const filteredEvents = events.filter(e => filterSource === 'all' || e.source === filterSource);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            统一直播时间轴
          </h1>
          <p className="text-muted-foreground mt-2">
            将业务指标、评论、话术、预警与 AI 动作映射到统一时间轴，精准归因“哪个动作导致了哪个结果”。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            className="border border-input rounded-md px-3 py-2 text-sm bg-background"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.room_name} ({format(new Date(s.start_time), 'MM-dd HH:mm')})
              </option>
            ))}
            {sessions.length === 0 && <option value="">暂无直播场次</option>}
          </select>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4" /> 关键节点与动作归因
                </CardTitle>
                <div className="flex items-center gap-2">
                  <select 
                    className="border border-input rounded-md px-2 py-1 text-xs bg-background"
                    value={filterSource}
                    onChange={e => setFilterSource(e.target.value)}
                  >
                    <option value="all">全部分类</option>
                    <option value="chart">指标波动</option>
                    <option value="comment">评论舆情</option>
                    <option value="asr">主播话术</option>
                    <option value="order">交易转化</option>
                    <option value="ai">AI诊断预警</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Search className="w-10 h-10 mb-4 opacity-20" />
                  <p>该场次暂无时间轴事件记录</p>
                </div>
              ) : (
                <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
                <div className="relative p-6">
                  <div className="absolute left-[59px] top-6 bottom-6 w-px bg-border"></div>
                  <div className="space-y-8">
                    {filteredEvents.map((event, idx) => (
                      <div key={event.id || idx} className="relative flex items-start gap-6 group">
                        <div className="w-10 text-xs font-medium text-muted-foreground pt-1 shrink-0 text-right">
                          {formatOffset(event.offset_seconds)}
                        </div>
                        <div className="absolute left-[34px] w-8 h-8 bg-background border-2 border-border rounded-full flex items-center justify-center z-10 group-hover:border-primary transition-colors">
                          {getEventIcon(event.source, event.event_type)}
                        </div>
                        <div className="flex-1 bg-muted/30 rounded-lg border p-4 group-hover:border-primary/50 group-hover:shadow-sm transition-all ml-4">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <h4 className="font-semibold text-sm">{event.content}</h4>
                            <div className="flex items-center gap-2 shrink-0">
                              {event.importance === 'high' && (
                                <Badge variant="destructive" className="h-5 text-[10px] px-1.5">关键</Badge>
                              )}
                              <Badge variant="outline" className="h-5 text-[10px] px-1.5 capitalize">{event.source}</Badge>
                            </div>
                          </div>
                          
                          {/* 关联指标展示 */}
                          {event.metrics && (
                            <div className="mt-3 flex flex-wrap gap-3">
                              {Object.entries(event.metrics).map(([k, v]) => (
                                <div key={k} className="bg-background border rounded px-2 py-1 text-xs flex items-center gap-1.5">
                                  <span className="text-muted-foreground">{k}:</span>
                                  <span className="font-medium text-foreground">{String(v)}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 模拟的归因分析 */}
                          {event.source === 'order' && event.event_type === 'payment_peak' && (
                            <div className="mt-3 p-2 bg-green-500/10 border border-green-500/20 rounded-md text-xs text-green-700 flex items-start gap-1.5">
                              <PlayCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <p><strong>AI 归因：</strong>此转化峰值大概率由 2 分钟前（{formatOffset(event.offset_seconds - 120)}）主播抛出的限时福利话术直接促成。</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 w-[420px] shrink-0">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">全局指标趋势</CardTitle>
            </CardHeader>
            <CardContent>
              {/* 在线人数趋势折线图 */}
              <div className="mb-6">
                <h4 className="text-sm font-medium mb-2 text-muted-foreground">在线人数趋势</h4>
                <div className="h-56 bg-muted/30 rounded-md border p-2">
                  {metrics.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metrics.slice(0, 120).map((m) => ({
                        minute: m.minute_index,
                        online: m.online_count || 0
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis 
                          dataKey="minute" 
                          tick={{ fontSize: 10 }} 
                          tickFormatter={(v: number) => `${v}分`}
                          interval="preserveStartEnd"
                        />
                        <YAxis tick={{ fontSize: 10 }} width={40} />
                        <Tooltip 
                          formatter={(value: number) => [`${value}人`, '在线人数']}
                          labelFormatter={(label: number) => `第${label}分钟`}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="online" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={false}
                          name="在线人数"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      暂无数据
                    </div>
                  )}
                </div>
              </div>
              
              {/* 成交转化柱状图 */}
              <div>
                <h4 className="text-sm font-medium mb-2 text-muted-foreground">成交转化（每10分钟聚合）</h4>
                <div className="h-56 bg-muted/30 rounded-md border p-2">
                  {metrics.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={Array.from({ length: Math.ceil(metrics.length / 10) }, (_, i) => {
                        const slice = metrics.slice(i * 10, (i + 1) * 10);
                        const orders = slice.reduce((sum, m) => sum + (m.order_count || 0), 0);
                        const paid = slice.reduce((sum, m) => sum + (m.paid_count || 0), 0);
                        return {
                          period: `${i * 10}-${(i + 1) * 10}分`,
                          orders,
                          paid
                        };
                      }).slice(0, 12)}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis tick={{ fontSize: 9 }} dataKey="period" />
                        <YAxis tick={{ fontSize: 10 }} width={40} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="orders" fill="hsl(var(--chart-1))" name="下单" />
                        <Bar dataKey="paid" fill="hsl(var(--chart-2))" name="支付" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      暂无数据
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">时间轴数据源状态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><Activity className="w-4 h-4"/> 实时指标数据</span>
                <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">已同步</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><PlayCircle className="w-4 h-4"/> ASR 语音转写</span>
                <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">已同步</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><MessageSquare className="w-4 h-4"/> 评论弹幕</span>
                <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">已同步</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><ShoppingBag className="w-4 h-4"/> 订单流水</span>
                <Badge variant="outline" className="bg-yellow-50 text-yellow-600 border-yellow-200">延迟 2min</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}