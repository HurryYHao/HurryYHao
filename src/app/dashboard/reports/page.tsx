'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3, FileText, Loader2, MessageSquare,
  RefreshCw, ShoppingBag, Star, TrendingUp, Users
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface Session {
  id: number; room_id: string; room_name: string | null; status: string;
  start_time: string | null; end_time: string | null; anchor_name: string | null;
  template_name: string | null; room_type: string | null;
}
interface Report {
  id: number; session_id: number; report_type: string; segment_seq: number | null;
  analysis_text: string | null; skill_version: string | null; created_at: string;
  anchor_name: string | null; template_name: string | null; room_type: string | null;
  overall_score?: number; anchor_score?: number; interaction_score?: number;
  conversion_score?: number; sentiment_score?: number; rhythm_score?: number;
}

const DIMENSIONS = [
  { key: 'anchor_script', label: '主播话术', icon: MessageSquare, color: 'var(--chart-1)' },
  { key: 'interaction', label: '互动热度', icon: Users, color: 'var(--chart-2)' },
  { key: 'conversion', label: '商品转化', icon: ShoppingBag, color: 'var(--chart-3)' },
  { key: 'sentiment', label: '评论舆情', icon: TrendingUp, color: 'var(--chart-4)' },
  { key: 'rhythm', label: '直播节奏', icon: BarChart3, color: 'var(--chart-5)' },
];

function RenderMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) return <h1 key={i} className="text-xl font-bold mt-4 mb-2">{trimmed.slice(2)}</h1>;
        if (trimmed.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold mt-4 mb-2">{trimmed.slice(3)}</h2>;
        if (trimmed.startsWith('### ')) return <h3 key={i} className="text-base font-medium mt-3 mb-1">{trimmed.slice(4)}</h3>;
        if (trimmed.startsWith('- ')) return <li key={i} className="ml-4 text-sm">{trimmed.slice(2)}</li>;
        if (trimmed.startsWith('---')) return <hr key={i} className="my-4 border-border" />;
        if (trimmed === '') return <br key={i} />;
        return <p key={i} className="text-sm leading-relaxed">{trimmed}</p>;
      })}
    </div>
  );
}

export default function ReportsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [selectedAnchor, setSelectedAnchor] = useState<string | null>(null);

  // 先定义fetchReports
  const fetchReports = async (sessionId: number) => {
    setReportsLoading(true);
    try {
      const res = await fetch(`/api/reports/${sessionId}`);
      const json = await res.json();
      if (json.success) {
        setReports(json.data.reports || []);
      } else {
        toast.error(json.error || '获取报告失败');
        setReports([]);
      }
    } catch {
      toast.error('获取报告失败');
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  };

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions?page=1&pageSize=50');
      const json = await res.json();
      if (json.success) {
        const sessionList: Session[] = json.data.sessions || [];
        setSessions(sessionList);
        // 自动选择第一个主播和第一个会话
        if (sessionList.length > 0) {
          const firstAnchor = sessionList[0].anchor_name || '未知主播';
          setSelectedAnchor(firstAnchor);
          // 默认选择第一个会话并加载报告
          setSelectedSession(sessionList[0]);
          fetchReports(sessionList[0].id);
        }
      }
    } catch { toast.error('获取会话失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // 按主播分组
  const anchorGroups = sessions.reduce<Record<string, Session[]>>((acc, s) => {
    const anchor = s.anchor_name || '未知主播';
    if (!acc[anchor]) acc[anchor] = [];
    acc[anchor].push(s);
    return acc;
  }, {});

  const anchorNames = Object.keys(anchorGroups);
  const filteredSessions = selectedAnchor ? (anchorGroups[selectedAnchor] || []) : sessions;

  const handleSelectSession = (session: Session) => {
    setSelectedSession(session);
    fetchReports(session.id);
  };

  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" />分析报告</h1>
        <Button variant="outline" size="sm" onClick={() => fetchSessions()}>
          <RefreshCw className="h-3 w-3 mr-1" />刷新
        </Button>
      </div>

      {/* 五维维度图标展示 */}
      <div className="grid grid-cols-5 gap-3">
        {DIMENSIONS.map(dim => (
          <Card key={dim.key} className="text-center">
            <CardContent className="p-3">
              <dim.icon className="h-6 w-6 mx-auto mb-1" style={{ color: dim.color }} />
              <div className="text-xs font-medium">{dim.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 主播分类标签 */}
      {anchorNames.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground mr-1">主播:</span>
          {anchorNames.map(name => (
            <Button
              key={name}
              variant={selectedAnchor === name ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setSelectedAnchor(name); setSelectedSession(null); setReports([]); }}
              className="gap-1"
            >
              {name === '雅文老师' && <Star className="h-3 w-3" />}
              {name}
              <Badge variant="secondary" className="ml-1 text-xs px-1.5">
                {anchorGroups[name].length}
              </Badge>
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：会话列表（按主播过滤） */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {selectedAnchor || '全部主播'}
                {selectedAnchor === '雅文老师' && (
                  <Badge className="bg-primary text-primary-foreground text-xs">核心基准</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                {filteredSessions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">暂无分析会话</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredSessions.map(s => (
                      <div
                        key={s.id}
                        onClick={() => handleSelectSession(s)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedSession?.id === s.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate flex-1">{s.template_name || s.room_name || s.room_id}</span>
                          <Badge variant="outline" className="text-xs shrink-0">{s.status}</Badge>
                        </div>
                        {s.template_name && (
                          <Badge variant="secondary" className="text-xs mt-1">{s.template_name}</Badge>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {s.start_time ? new Date(s.start_time).toLocaleString('zh-CN') : '--'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* 右侧：报告列表 */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {selectedSession ? `${selectedSession.template_name || selectedSession.room_name || selectedSession.room_id} 的报告` : '请选择会话'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedSession ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>选择左侧的会话查看分析报告</p>
                </div>
              ) : reportsLoading ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
              ) : reports.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">该会话暂无分析报告</p>
                  <p className="text-xs mt-1">可以在监控页面手动触发分析</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-3">
                    {reports.map(report => (
                      <div
                        key={report.id}
                        className="p-4 rounded-lg border hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setSelectedReport(report)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {report.report_type === 'final' ? (
                              <Badge className="bg-primary text-primary-foreground text-xs">终场分析</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">片段 #{report.segment_seq || '?'}</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {new Date(report.created_at).toLocaleString('zh-CN')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* 综合评分 */}
                            {report.overall_score && (
                              <Badge variant="outline" className="text-xs font-bold">
                                <Star className="h-3 w-3 mr-1 text-primary" />
                                {report.overall_score.toFixed(1)}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">v{report.skill_version || '?'}</span>
                          </div>
                        </div>
                        {/* 五维评分条 */}
                        {report.overall_score && (
                          <div className="flex gap-1 mb-2">
                            {[
                              { key: 'anchor_score', label: '话术', color: 'var(--chart-1)' },
                              { key: 'interaction_score', label: '互动', color: 'var(--chart-2)' },
                              { key: 'conversion_score', label: '转化', color: 'var(--chart-3)' },
                              { key: 'sentiment_score', label: '舆情', color: 'var(--chart-4)' },
                              { key: 'rhythm_score', label: '节奏', color: 'var(--chart-5)' },
                            ].map(dim => {
                              const score = report[dim.key as keyof Report] as number;
                              return score ? (
                                <div key={dim.key} className="flex-1">
                                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{
                                        width: `${(score / 10) * 100}%`,
                                        background: dim.color
                                      }}
                                    />
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-0.5 text-center">
                                    {score.toFixed(1)}
                                  </div>
                                </div>
                              ) : null;
                            })}
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {report.analysis_text ? report.analysis_text.slice(0, 120) + '...' : '无内容'}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 报告预览弹窗 */}
      <Dialog open={!!selectedReport} onOpenChange={(open) => !open && setSelectedReport(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {selectedReport?.report_type === 'final' ? (
                <Badge className="bg-primary text-primary-foreground">终场分析</Badge>
              ) : (
                <Badge variant="outline">片段 #{selectedReport?.segment_seq}</Badge>
              )}
              分析报告
              {selectedReport?.template_name && (
                <Badge className="bg-secondary text-secondary-foreground">{selectedReport.template_name}</Badge>
              )}
              {selectedReport?.anchor_name && (
                <Badge variant="outline" className="text-xs">{selectedReport.anchor_name}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            {selectedReport?.analysis_text ? (
              <RenderMarkdown content={selectedReport.analysis_text} />
            ) : (
              <p className="text-center text-muted-foreground py-8">无报告内容</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
