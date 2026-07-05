'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3, Download, FileText, Loader2, MessageSquare,
  RefreshCw, ShoppingBag, Star, Trash2, TrendingUp, Upload, Users, X
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

interface Session {
  id: number; roomId: string; roomName: string | null; status: string;
  startTime: string | null; endTime: string | null; anchorName: string | null;
  templateName: string | null; roomType: string | null;
}
interface Report {
  id: number; sessionId: number; reportType: string; segmentSeq: number | null;
  analysisText: string | null; skillVersion: string | null; createdAt: string;
  anchorName: string | null; templateName: string | null; roomType: string | null;
  overallScore?: number | string; anchorScore?: number | string; interactionScore?: number | string;
  conversionScore?: number | string; sentimentScore?: number | string; rhythmScore?: number | string;
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
  // Batch operations
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

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
      }
    } catch (err) {
      console.error('[Reports] 获取会话失败:', err);
      toast.error('获取会话失败');
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    if (sessions.length > 0 && !selectedAnchor) {
      const firstAnchor = sessions[0].anchorName || '未知主播';
      setSelectedAnchor(firstAnchor);
      setSelectedSession(sessions[0]);
      fetch(`/api/reports/${sessions[0].id}`)
        .then(res => res.json())
        .then(json => {
          if (json.success) setReports(json.data.reports || []);
        })
        .catch(err => console.error('[Reports] 自动加载报告失败:', err));
    }
  }, [sessions, selectedAnchor]);

  const anchorGroups = sessions.reduce<Record<string, Session[]>>((acc, s) => {
    const anchor = s.anchorName || '未知主播';
    if (!acc[anchor]) acc[anchor] = [];
    acc[anchor].push(s);
    return acc;
  }, {});

  const anchorNames = Object.keys(anchorGroups);
  const filteredSessions = selectedAnchor ? (anchorGroups[selectedAnchor] || []) : sessions;

  const handleSelectSession = (session: Session) => {
    setSelectedSession(session);
    setSelectedIds(new Set());
    fetchReports(session.id);
  };

  // Batch toggle
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === reports.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reports.map(r => r.id)));
    }
  };

  // Export single report as DOCX
  const handleExportSingle = async (report: Report) => {
    try {
      const res = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportIds: [report.id], format: 'docx' }),
      });
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `分析报告_${report.reportType === 'final' ? '终场' : `片段${report.segmentSeq}`}_${report.id}.docx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('导出成功');
    } catch {
      toast.error('导出失败');
    }
  };

  // Batch export
  const handleBatchExport = async () => {
    if (selectedIds.size === 0) { toast.error('请先选择报告'); return; }
    setExporting(true);
    try {
      const res = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportIds: Array.from(selectedIds), format: 'docx' }),
      });
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `分析报告_批量导出_${selectedIds.size}份.docx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`成功导出 ${selectedIds.size} 份报告`);
      setSelectedIds(new Set());
      setBatchMode(false);
    } catch {
      toast.error('批量导出失败');
    } finally {
      setExporting(false);
    }
  };

  // Export all reports for current session
  const handleExportAll = async () => {
    if (!selectedSession) return;
    setExporting(true);
    try {
      const allIds = reports.map(r => r.id);
      const res = await fetch('/api/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportIds: allIds, format: 'docx' }),
      });
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `分析报告_全部_${selectedSession.roomName || selectedSession.roomId}.docx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`成功导出 ${allIds.length} 份报告`);
    } catch {
      toast.error('导出全部报告失败');
    } finally {
      setExporting(false);
    }
  };

  // Delete single report
  const handleDeleteSingle = async (report: Report) => {
    if (!confirm(`确定删除该${report.reportType === 'final' ? '终场' : '片段'}分析报告？`)) return;
    try {
      const res = await fetch('/api/reports/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportIds: [report.id] }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('删除成功');
        if (selectedSession) fetchReports(selectedSession.id);
        if (selectedReport?.id === report.id) setSelectedReport(null);
      } else {
        toast.error(json.error || '删除失败');
      }
    } catch {
      toast.error('删除失败');
    }
  };

  // Batch delete
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) { toast.error('请先选择报告'); return; }
    if (!confirm(`确定删除选中的 ${selectedIds.size} 份报告？此操作不可恢复！`)) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/reports/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportIds: Array.from(selectedIds) }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`成功删除 ${selectedIds.size} 份报告`);
        setSelectedIds(new Set());
        setBatchMode(false);
        if (selectedSession) fetchReports(selectedSession.id);
        if (selectedReport && selectedIds.has(selectedReport.id)) setSelectedReport(null);
      } else {
        toast.error(json.error || '批量删除失败');
      }
    } catch {
      toast.error('批量删除失败');
    } finally {
      setDeleting(false);
    }
  };

  // Import reports
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/reports/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reports: Array.isArray(data) ? data : data.reports || [data] }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`成功导入 ${json.data?.imported || 0} 份报告`);
        fetchSessions();
        if (selectedSession) fetchReports(selectedSession.id);
      } else {
        toast.error(json.error || '导入失败');
      }
    } catch {
      toast.error('导入文件格式错误');
    }
    if (importRef.current) importRef.current.value = '';
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
        <div className="flex items-center gap-2">
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
            <Upload className="h-3 w-3 mr-1" />导入
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchSessions()}>
            <RefreshCw className="h-3 w-3 mr-1" />刷新
          </Button>
        </div>
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
              onClick={() => { setSelectedAnchor(name); setSelectedSession(null); setReports([]); setSelectedIds(new Set()); }}
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

      {/* 主内容区：左右分栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ minHeight: 'calc(100vh - 260px)' }}>
        {/* 左侧：会话列表 */}
        <div className="lg:col-span-1 flex flex-col">
          <Card className="flex flex-col flex-1">
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                {selectedAnchor || '全部主播'}
                {selectedAnchor === '雅文老师' && (
                  <Badge className="bg-primary text-primary-foreground text-xs">核心基准</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              <ScrollArea className="h-full max-h-[calc(100vh-300px)]">
                {filteredSessions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">暂无分析会话</p>
                  </div>
                ) : (
                  <div className="space-y-2 pr-1">
                    {filteredSessions.map(s => (
                      <div
                        key={s.id}
                        onClick={() => handleSelectSession(s)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedSession?.id === s.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate flex-1">{s.roomName || s.templateName || s.roomId}</span>
                          <Badge variant="outline" className="text-xs shrink-0">{s.status}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {s.startTime ? new Date(s.startTime).toLocaleString('zh-CN') : '--'}
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
        <div className="lg:col-span-2 flex flex-col">
          <Card className="flex flex-col flex-1">
            <CardHeader className="pb-2 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {selectedSession ? `${selectedSession.roomName || selectedSession.templateName || selectedSession.roomId} 的报告` : '请选择会话'}
                </CardTitle>
                {selectedSession && reports.length > 0 && (
                  <div className="flex items-center gap-1">
                    {batchMode ? (
                      <>
                        <Button variant="outline" size="sm" onClick={toggleSelectAll} className="text-xs h-7">
                          <Checkbox checked={selectedIds.size === reports.length} className="mr-1 h-3 w-3" />
                          {selectedIds.size === reports.length ? '取消全选' : '全选'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleBatchExport} disabled={exporting || selectedIds.size === 0} className="text-xs h-7">
                          {exporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                          导出({selectedIds.size})
                        </Button>
                        <Button variant="destructive" size="sm" onClick={handleBatchDelete} disabled={deleting || selectedIds.size === 0} className="text-xs h-7">
                          {deleting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
                          删除({selectedIds.size})
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setBatchMode(false); setSelectedIds(new Set()); }} className="text-xs h-7">
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={handleExportAll} disabled={exporting} className="text-xs h-7">
                          {exporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                          全部导出
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setBatchMode(true)} className="text-xs h-7">
                          批量操作
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
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
                <ScrollArea className="h-full max-h-[calc(100vh-300px)]">
                  <div className="space-y-3 pr-1">
                    {reports.map(report => (
                      <div
                        key={report.id}
                        className={`p-4 rounded-lg border transition-colors ${batchMode ? 'cursor-default' : 'hover:bg-muted/30 cursor-pointer'}`}
                        onClick={() => { if (!batchMode) setSelectedReport(report); }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {batchMode && (
                              <Checkbox
                                checked={selectedIds.has(report.id)}
                                onCheckedChange={() => toggleSelect(report.id)}
                                onClick={e => e.stopPropagation()}
                              />
                            )}
                            {report.reportType === 'final' ? (
                              <Badge className="bg-primary text-primary-foreground text-xs">终场分析</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">片段 #{report.segmentSeq || '?'}</Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {new Date(report.createdAt).toLocaleString('zh-CN')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {report.overallScore && (
                              <Badge variant="outline" className="text-xs font-bold">
                                <Star className="h-3 w-3 mr-1 text-primary" />
                                {Number(report.overallScore || 0).toFixed(1)}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">v{report.skillVersion || '?'}</span>
                            {/* Single report actions */}
                            {!batchMode && (
                              <div className="flex items-center gap-1 ml-2">
                                <Button
                                  variant="ghost" size="sm" className="h-6 w-6 p-0"
                                  onClick={e => { e.stopPropagation(); handleExportSingle(report); }}
                                  title="导出DOCX"
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                  onClick={e => { e.stopPropagation(); handleDeleteSingle(report); }}
                                  title="删除"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                        {/* 五维评分条 */}
                        {report.overallScore && (
                          <div className="flex gap-1 mb-2">
                            {[
                              { key: 'anchorScore', label: '话术', color: 'var(--chart-1)' },
                              { key: 'interactionScore', label: '互动', color: 'var(--chart-2)' },
                              { key: 'conversionScore', label: '转化', color: 'var(--chart-3)' },
                              { key: 'sentimentScore', label: '舆情', color: 'var(--chart-4)' },
                              { key: 'rhythmScore', label: '节奏', color: 'var(--chart-5)' },
                            ].map(dim => {
                              const score = Number(report[dim.key as keyof Report]) || 0;
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
                        {/* 报告内容预览 */}
                        <div className="text-sm text-muted-foreground">
                          {report.analysisText ? (
                            <div className="relative">
                              <p className="line-clamp-4">
                                {report.analysisText.replace(/^#+\s*/gm, '').replace(/---/g, '').replace(/\n{2,}/g, '\n').slice(0, 300)}
                              </p>
                              {!batchMode && (
                                <span className="text-primary text-xs ml-1 hover:underline">点击查看完整报告 →</span>
                              )}
                            </div>
                          ) : (
                            <span>无内容</span>
                          )}
                        </div>
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
              {selectedReport?.reportType === 'final' ? (
                <Badge className="bg-primary text-primary-foreground">终场分析</Badge>
              ) : (
                <Badge variant="outline">片段 #{selectedReport?.segmentSeq}</Badge>
              )}
              分析报告
              {selectedReport?.templateName && (
                <Badge className="bg-secondary text-secondary-foreground">{selectedReport.templateName}</Badge>
              )}
              {selectedReport?.anchorName && (
                <Badge variant="outline" className="text-xs">{selectedReport.anchorName}</Badge>
              )}
              <div className="ml-auto flex items-center gap-1">
                {selectedReport && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleExportSingle(selectedReport)} className="text-xs h-7">
                      <Download className="h-3 w-3 mr-1" />导出DOCX
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => { handleDeleteSingle(selectedReport); setSelectedReport(null); }} className="text-xs h-7">
                      <Trash2 className="h-3 w-3 mr-1" />删除
                    </Button>
                  </>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            {selectedReport?.analysisText ? (
              <RenderMarkdown content={selectedReport.analysisText} />
            ) : (
              <p className="text-center text-muted-foreground py-8">无报告内容</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
