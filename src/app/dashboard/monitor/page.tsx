'use client';

import { useEffect, useState } from 'react';
import { useMonitor } from '@/components/dashboard/monitor-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RefreshCw, Radio, Camera, BrainCircuit,
  Clock, Eye, Users, ShoppingCart, TrendingUp,
  CircleDot, Timer, Play, Pause,
} from 'lucide-react';
import dynamic from 'next/dynamic';

// 动态导入服务端音频录制组件（仅客户端，避免 SSR 问题）
const ServerAudioRecorder = dynamic(
  () => import('@/components/dashboard/server-audio-recorder'),
  { ssr: false }
);

interface Room {
  id: string; roomId: string; roomName: string; liveStatus: string;
  startTime: string | null; coverUrl?: string; description?: string;
  online?: string;
}

interface RecordingStatus {
  sessionId: number;
  roomId: string;
  roomName: string | null;
  status: string;
  startTime: string | null;
  lastAnalysisTime: string | null;
  lastSnapshotSeq: number;
  nextAnalysisIn: number | null;
  isAnalyzing: boolean;
  recordingDuration: number | null;
}

interface NumberAnalysis { total: string | number; inStart: string | number; notStart: string | number; }

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  STARTING:     { label: '直播中',   color: 'bg-green-500' },
  NOT_STARTED:  { label: '未开播',   color: 'bg-yellow-500' },
  STARTED:      { label: '已结束',   color: 'bg-muted-foreground' },
  ENDED:        { label: '已结束',   color: 'bg-muted-foreground' },
  RECORDING:    { label: '录制中',   color: 'bg-blue-500' },
  ANALYZING:    { label: '分析中',   color: 'bg-amber-500' },
  ERROR:        { label: '异常',     color: 'bg-destructive' },
};

function formatDuration(minutes: number | null): string {
  if (minutes == null) return '-';
  if (minutes < 60) return `${minutes}分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}小时${m}分钟` : `${h}小时`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function MonitorPage() {
  const { polling, togglePolling, manualPoll, manualLoading, logs, activeSessions, snapshot, analyze, addLog } = useMonitor();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [numberAnalysis, setNumberAnalysis] = useState<NumberAnalysis | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [logCollapsed, setLogCollapsed] = useState(false);

  /* --- 加载房间列表 --- */
  useEffect(() => {
    loadRooms();
  }, []);

  /* --- 监听轮询日志，检测自动分析 --- */
  useEffect(() => {
    // 轮询时刷新录制状态
    if (logs.length > 0) {
      loadRecordingStatus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs.length]);

  async function loadRooms() {
    setLoading(true);
    try {
      const res = await fetch('/api/monitor/status');
      const json = await res.json();
      if (json.success) {
        setRooms(json.data.rooms || []);
        setNumberAnalysis(json.data.numberAnalysis || null);
        setRecordingStatus(json.data.recordingStatus || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function loadRecordingStatus() {
    try {
      const res = await fetch('/api/monitor/status');
      const json = await res.json();
      if (json.success) {
        setRecordingStatus(json.data.recordingStatus || []);

        // 检测自动分析触发
        const triggered = json.data.autoAnalysisTriggered || [];
        if (triggered.length > 0) {
          for (const t of triggered) {
            addLog('info', `[自动分析] 触发片段分析: 房间${t.roomId}, 第${t.segmentSeq}段`);
          }
        }
      }
    } catch { /* ignore */ }
  }

  const liveRooms = rooms.filter(r => r.liveStatus === 'STARTING');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">直播监控</h1>
          <p className="text-muted-foreground mt-1">监控鑫云平台直播状态，自动录制数据与30分钟片段分析</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadRooms(); manualPoll(); }} disabled={manualLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${manualLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">{numberAnalysis?.total ?? '-'}</p>
                <p className="text-xs text-muted-foreground">总房间数</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Radio className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono text-green-500">
                  {numberAnalysis?.inStart ?? '0'}
                </p>
                <p className="text-xs text-muted-foreground">直播中</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <CircleDot className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold font-mono">{recordingStatus.length}</p>
                <p className="text-xs text-muted-foreground">录制中会话</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Timer className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${polling ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`} />
                  <p className="text-sm font-medium">{polling ? '轮询中' : '已停止'}</p>
                </div>
                <p className="text-xs text-muted-foreground">30秒/次 · 自动分析30分/次</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===== 录制与分析状态卡片 ===== */}
      {recordingStatus.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleDot className="h-5 w-5 text-blue-500 animate-pulse" />
              录制与分析状态
            </CardTitle>
            <CardDescription>
              正在录制的直播会自动每30分钟执行一次片段分析，直播结束后生成终场分析报告
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recordingStatus.map((rs) => (
                <div
                  key={rs.sessionId}
                  className="p-4 rounded-lg border border-border bg-muted/30 space-y-3"
                >
                  {/* 第一行：基本信息 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="h-3 w-3 rounded-full bg-red-500" />
                        <div className="absolute inset-0 h-3 w-3 rounded-full bg-red-500 animate-ping opacity-75" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {rs.roomName || `房间 ${rs.roomId}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ID: {rs.roomId}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {rs.isAnalyzing && (
                        <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30">
                          <BrainCircuit className="h-3 w-3 mr-1" />
                          分析中...
                        </Badge>
                      )}
                      <Badge variant={rs.status === 'recording' ? 'default' : 'secondary'}>
                        {rs.status === 'recording' ? '录制中' : '分析中'}
                      </Badge>
                    </div>
                  </div>

                  {/* 第二行：录制详情 */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">录制时长:</span>
                      <span className="font-mono font-medium">{formatDuration(rs.recordingDuration)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">已抓取:</span>
                      <span className="font-mono font-medium">第{rs.lastSnapshotSeq}段</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <BrainCircuit className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">上次分析:</span>
                      <span className="font-mono font-medium">{formatTime(rs.lastAnalysisTime)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Timer className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-muted-foreground">下次分析:</span>
                      <span className="font-mono font-medium text-amber-600">
                        {rs.nextAnalysisIn != null ? `${rs.nextAnalysisIn}分钟后` : '-'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Play className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">开播:</span>
                      <span className="font-mono font-medium">{formatTime(rs.startTime)}</span>
                    </div>
                  </div>

                  {/* 第三行：进度条 */}
                  {rs.nextAnalysisIn != null && (
                    <div className="space-y-1">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-1000"
                          style={{ width: `${Math.max(0, 100 - (rs.nextAnalysisIn / 30) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground text-right">
                        分析进度 {Math.max(0, 100 - Math.round((rs.nextAnalysisIn / 30) * 100))}%
                      </p>
                    </div>
                  )}

                  {/* 第四行：手动操作 */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => snapshot(rs.sessionId)}>
                      <Camera className="h-3.5 w-3.5 mr-1" />
                      手动快照
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => analyze(rs.sessionId)}>
                      <BrainCircuit className="h-3.5 w-3.5 mr-1" />
                      手动分析
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== 直播音频录制 ===== */}
      {liveRooms.length > 0 && (
        <div className="space-y-4">
          {liveRooms.map(room => (
            <ServerAudioRecorder
              key={room.roomId}
              roomId={room.roomId}
              roomName={room.roomName}
            />
          ))}
        </div>
      )}

      {/* 活跃会话（来自 Provider） */}
      {activeSessions.length > 0 && recordingStatus.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-green-500 animate-pulse" />
              活跃直播会话
            </CardTitle>
            <CardDescription>当前正在监控的直播场次，可手动触发数据抓取和分析</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                    <div>
                      <p className="font-medium text-foreground">
                        {session.room_name || `房间 ${session.room_id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        开始: {session.start_time || '-'} · 片段: #{session.last_snapshot_seq}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => snapshot(session.id)}>
                      <Camera className="h-3.5 w-3.5 mr-1" />
                      快照
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => analyze(session.id)}>
                      <BrainCircuit className="h-3.5 w-3.5 mr-1" />
                      分析
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 无录制会话时的提示 */}
      {recordingStatus.length === 0 && activeSessions.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-muted">
                <CircleDot className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">暂无录制中的直播</p>
                <p className="text-sm text-muted-foreground mt-1">
                  开启轮询后，系统会自动检测开播并开始录制数据，每30分钟自动执行片段分析
                </p>
              </div>
              <Button
                variant={polling ? 'secondary' : 'default'}
                onClick={togglePolling}
              >
                {polling ? (
                  <><Pause className="h-4 w-4 mr-2" />停止轮询</>
                ) : (
                  <><Play className="h-4 w-4 mr-2" />开启轮询监控</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Room list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            直播房间列表
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4 p-3">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>暂无房间数据</p>
              <p className="text-sm mt-1">请先在设置页完成登录</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => {
                const status = STATUS_MAP[room.liveStatus] || { label: room.liveStatus, color: 'bg-muted-foreground' };
                const isLive = room.liveStatus === 'STARTING';
                const isRecording = recordingStatus.some(r => r.roomId === room.roomId);
                return (
                  <div
                    key={room.roomId}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="relative">
                      <div className={`h-3 w-3 rounded-full ${status.color} ${isLive ? 'animate-pulse' : ''}`} />
                      {isRecording && (
                        <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate">
                          {room.roomName || room.id}
                        </p>
                        <Badge variant={isLive ? 'default' : 'secondary'} className="text-[10px] shrink-0">
                          {status.label}
                        </Badge>
                        {isRecording && (
                          <Badge variant="outline" className="text-[10px] shrink-0 border-blue-500/50 text-blue-500">
                            录制中
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ID: {room.roomId}
                        {room.startTime && ` · 开播: ${room.startTime}`}
                        {room.online && ` · 在线: ${room.online}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Operation logs */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setLogCollapsed(!logCollapsed)}>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              操作日志
              <Badge variant="secondary" className="text-[10px]">{logs.length}</Badge>
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {logCollapsed ? '展开' : '收起'}
            </span>
          </div>
        </CardHeader>
        {!logCollapsed && (
          <CardContent>
            <div className="max-h-64 overflow-y-auto space-y-1 font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">暂无日志</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex gap-2 py-0.5">
                    <span className="text-muted-foreground shrink-0">{log.time}</span>
                    <span className={log.level === 'error' ? 'text-destructive' : log.level === 'info' ? 'text-primary' : 'text-foreground'}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
