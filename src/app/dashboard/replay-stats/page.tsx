'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  RefreshCw,
  Radio,
  Camera,
  BrainCircuit,
  Clock,
  Eye,
  Users,
  ShoppingCart,
  TrendingUp,
  CircleDot,
  Timer,
  Play,
  Pause,
  PlayCircle,
  BarChart3,
  Activity,
  ArrowLeft
} from 'lucide-react';

interface ReplayRoom {
  id: string;
  roomId: string;
  roomName: string;
  intelligenceRoom: boolean;
  liveStatus: string;
  startTime: string;
  downTime: string;
  intelligenceTemplateId?: string;
  templateName?: string;
  coverUrl?: string;
}

interface ReplaySession {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isAnalyzed: boolean;
  analyzedAt: string | null;
  roomId?: string;
  roomName?: string;
  templateName?: string;
}

interface DbReplaySession {
  id: number;
  room_id: string;
  room_name: string;
  live_space_id: string;
  start_time: string;
  end_time: string;
  status: string;
  anchor_name: string;
  last_snapshot_seq: number;
  created_at: string;
  updated_at: string;
  session_type: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  STARTING: { label: '直播中', color: 'bg-green-500' },
  NOT_STARTED: { label: '未开播', color: 'bg-yellow-500' },
  STARTED: { label: '已结束', color: 'bg-muted-foreground' },
  ENDED: { label: '已结束', color: 'bg-muted-foreground' },
  IN_PLAYBACK: { label: '回放中', color: 'bg-blue-500' },
  RECORDING: { label: '录制中', color: 'bg-blue-500' },
  ANALYZING: { label: '分析中', color: 'bg-amber-500' },
  ERROR: { label: '异常', color: 'bg-destructive' },
};

export default function ReplayStatsPage() {
  const [rooms, setRooms] = useState<ReplayRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<ReplayRoom | null>(null);
  const [selectedSession, setSelectedSession] = useState<ReplaySession | null>(null);
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [historySessions, setHistorySessions] = useState<DbReplaySession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [startingAnalysis, setStartingAnalysis] = useState(false);
  const [viewMode, setViewMode] = useState<'rooms' | 'dashboard'>('rooms');

  // 获取房间列表
  const fetchRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch('/api/replay-monitor/rooms');
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setRooms(result.data.rooms || []);
        }
      }
    } catch (error) {
      console.error('获取房间列表失败:', error);
    } finally {
      setLoadingRooms(false);
    }
  };

  // 获取历史分析
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/replay-monitor/status');
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          setHistorySessions(result.data.sessions || []);
        }
      }
    } catch (error) {
      console.error('获取历史分析失败:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 直接查看房间数据
  const handleViewRoomStats = async (room: ReplayRoom) => {
    setSelectedRoom(room);
    setStats(null);
    setSessions([]);
    setSelectedSession(null);
    setViewMode('dashboard');
    setLoadingSessions(true);
    setLoadingStats(true);

    try {
      const res = await fetch(`/api/replay-monitor/sessions?roomId=${room.roomId}`);
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          const fetchedSessions = result.data.sessions || result.data || [];
          setSessions(fetchedSessions);

          if (fetchedSessions.length > 0) {
            // 选择第一个场次（最新的）
            const latestSession = fetchedSessions[0];
            setSelectedSession(latestSession);
            // 加载该场次的数据
            const statsRes = await fetch('/api/replay-stats/analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId: room.roomId, liveSpaceId: latestSession.id }),
            });

            if (statsRes.ok) {
              const statsResult = await statsRes.json();
              if (statsResult.success) {
                // 修复：API直接在根对象返回 analysis, chartData, newoldData
                setStats(statsResult);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('获取房间数据失败:', error);
    } finally {
      setLoadingSessions(false);
      setLoadingStats(false);
    }
  };

  // 切换场次查看数据
  const handleSelectSession = async (session: ReplaySession) => {
    setSelectedSession(session);
    setStats(null);
    if (selectedRoom) {
      setLoadingStats(true);
      try {
        const res = await fetch('/api/replay-stats/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: selectedRoom.roomId, liveSpaceId: session.id }),
        });
        if (res.ok) {
          const result = await res.json();
          if (result.success) {
            // 修复：API直接在根对象返回 analysis, chartData, newoldData
            setStats(result);
          }
        }
      } catch (error) {
        console.error('获取统计数据失败:', error);
      } finally {
        setLoadingStats(false);
      }
    }
  };

  // 启动录播分析
  const startAnalysis = async () => {
    if (!selectedRoom || !selectedSession) return;

    setStartingAnalysis(true);
    try {
      const res = await fetch('/api/replay-monitor/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: selectedRoom.roomId,
          roomName: selectedRoom.roomName,
          liveSpaceId: selectedSession.id,
          sessionName: selectedSession.name,
          startTime: selectedSession.startTime,
          endTime: selectedSession.endTime,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          // 更新当前场次的分析状态
          setSessions(prev =>
            prev.map(s =>
              s.id === selectedSession.id
                ? { ...s, isAnalyzed: true, analyzedAt: new Date().toISOString() }
                : s
            )
          );
          setSelectedSession(prev =>
            prev ? { ...prev, isAnalyzed: true, analyzedAt: new Date().toISOString() } : null
          );
          fetchHistory();
        }
      }
    } catch (error) {
      console.error('启动录播分析失败:', error);
    } finally {
      setStartingAnalysis(false);
    }
  };

  // 格式化数字
  const formatNumber = (value: any): string => {
    if (value === null || value === undefined) return '-';
    const num = Number(value);
    return isNaN(num) ? String(value) : num.toLocaleString();
  };

  // 格式化金额
  const formatMoney = (value: any): string => {
    if (value === null || value === undefined) return '-';
    const num = Number(value);
    if (num >= 10000) return '¥' + (num / 10000).toFixed(1) + '万';
    return '¥' + num.toLocaleString();
  };

  useEffect(() => {
    fetchRooms();
    fetchHistory();
  }, []);

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <PlayCircle className="h-6 w-6 text-primary" />
            智能录播大盘
          </h1>
          <p className="text-muted-foreground mt-1">
            智能直播房间数据监控与AI分析，已开启自动开播监控与自动录制
          </p>
        </div>
        <div className="flex gap-2">
          {viewMode === 'dashboard' ? (
            <Button variant="outline" size="sm" onClick={() => setViewMode('rooms')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回房间列表
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchRooms();
                fetchHistory();
              }}
              disabled={loadingRooms || loadingHistory}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${
                  loadingRooms || loadingHistory ? 'animate-spin' : ''
                }`}
              />
              刷新
            </Button>
          )}
        </div>
      </div>

      {viewMode === 'rooms' && (
        <>
          {/* 状态统计 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Eye className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono">{rooms.length}</p>
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
                      {rooms.filter(r => r.liveStatus === 'STARTING').length}
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
                    <p className="text-2xl font-bold font-mono">{historySessions.length}</p>
                    <p className="text-xs text-muted-foreground">已分析场次</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <BrainCircuit className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono">
                      {historySessions.filter(s => s.status === 'analyzing').length}
                    </p>
                    <p className="text-xs text-muted-foreground">分析中</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 活跃分析会话 */}
          {historySessions.some(s => s.status === 'recording' || s.status === 'analyzing') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CircleDot className="h-5 w-5 text-blue-500 animate-pulse" />
                  后台录制与分析
                </CardTitle>
                <CardDescription>
                  系统正在自动执行的监控任务（每30分钟自动片段分析）
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {historySessions
                    .filter(s => s.status === 'recording' || s.status === 'analyzing')
                    .map(session => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
                          <div>
                            <p className="font-medium text-foreground">
                              {session.room_name || `房间 ${session.room_id}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              开始: {session.start_time || '-'} · 快照: #{session.last_snapshot_seq}
                            </p>
                          </div>
                        </div>
                        <Badge variant={session.status === 'analyzing' ? 'default' : 'outline'}>
                          {session.status === 'recording' ? '自动采集中' : 'AI分析中'}
                        </Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 房间列表 - 宫格视图 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-primary" />
                  智能直播房间列表
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {loadingRooms ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-48 rounded-lg" />
                  ))}
                </div>
              ) : rooms.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <PlayCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>暂无智能直播房间</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {rooms.map(room => {
                    const status = STATUS_MAP[room.liveStatus] || {
                      label: room.liveStatus,
                      color: 'bg-muted-foreground',
                    };
                    const isLive = room.liveStatus === 'STARTING';
                    return (
                      <Card
                        key={room.roomId}
                        className="overflow-hidden hover:shadow-lg transition-all cursor-pointer group"
                        onClick={() => handleViewRoomStats(room)}
                      >
                        {room.coverUrl && (
                          <div className="relative h-32 bg-muted overflow-hidden">
                            <img
                              src={room.coverUrl}
                              alt={room.roomName}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <Badge className={`absolute top-2 right-2 text-xs ${status.color}`}>
                              {status.label}
                            </Badge>
                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Button variant="secondary" size="sm" className="font-medium">
                                <BarChart3 className="h-4 w-4 mr-2" />
                                查看数据大盘
                              </Button>
                            </div>
                          </div>
                        )}
                        <CardContent className="p-4">
                          <h3 className="font-medium text-sm truncate mb-1" title={room.roomName}>
                            {room.roomName}
                          </h3>
                          {room.templateName && (
                            <div className="flex items-center gap-1 mb-2">
                              <Badge variant="outline" className="text-xs bg-muted/50">
                                {room.templateName}
                              </Badge>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {room.startTime || '未定'}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {viewMode === 'dashboard' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">{selectedRoom?.roomName}</CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-2">
                    {selectedRoom?.templateName && (
                      <Badge variant="secondary">{selectedRoom.templateName}</Badge>
                    )}
                    <span>ID: {selectedRoom?.roomId}</span>
                  </CardDescription>
                </div>
                {selectedSession && !selectedSession.isAnalyzed && stats && (
                  <Button
                    onClick={startAnalysis}
                    disabled={startingAnalysis}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 shadow-md"
                  >
                    <BrainCircuit className="h-4 w-4 mr-2" />
                    {startingAnalysis ? 'AI分析启动中...' : '生成AI分析报告'}
                  </Button>
                )}
                {selectedSession?.isAnalyzed && (
                  <Badge className="bg-green-500 text-sm py-1 px-3">
                    <BrainCircuit className="h-4 w-4 mr-2" />
                    已完成分析
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* 场次切换栏 */}
              <div className="mb-6">
                <p className="text-sm font-medium mb-3 text-muted-foreground">选择直播场次：</p>
                <div className="flex flex-wrap gap-2">
                  {sessions.map(s => (
                    <Button
                      key={s.id}
                      variant={selectedSession?.id === s.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSelectSession(s)}
                      className="rounded-full"
                    >
                      <PlayCircle className={`h-3 w-3 mr-2 ${selectedSession?.id === s.id ? 'text-primary-foreground' : 'text-primary'}`} />
                      {s.name}
                      {s.isAnalyzed && <BrainCircuit className="h-3 w-3 ml-2 opacity-70" />}
                    </Button>
                  ))}
                  {sessions.length === 0 && !loadingSessions && (
                    <p className="text-muted-foreground text-sm py-2">该房间暂无任何历史场次数据</p>
                  )}
                </div>
              </div>

              <Separator className="mb-6" />

              {/* 加载状态 */}
              {(loadingSessions || loadingStats) && (
                <div className="py-16 flex flex-col items-center justify-center text-muted-foreground">
                  <RefreshCw className="h-10 w-10 animate-spin mb-4 text-primary" />
                  <p className="font-medium">正在获取录播统计数据...</p>
                </div>
              )}

              {/* 数据大盘展示 */}
              {!loadingStats && stats && selectedSession && (
                <div className="space-y-6">
                  {/* 核心指标 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-blue-500/5 border-blue-500/20">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="p-2 bg-blue-500/10 rounded-md">
                            <Users className="h-5 w-5 text-blue-600" />
                          </div>
                          <span className="font-medium text-blue-900 dark:text-blue-400">观看人数</span>
                        </div>
                        <div className="text-3xl font-bold text-foreground">
                          {formatNumber(stats.analysis?.watcherCnt)}
                        </div>
                        <div className="text-sm text-muted-foreground mt-2 font-medium">
                          新学员: {formatNumber(stats.analysis?.nwatcherCnt)}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-green-500/5 border-green-500/20">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="p-2 bg-green-500/10 rounded-md">
                            <Clock className="h-5 w-5 text-green-600" />
                          </div>
                          <span className="font-medium text-green-900 dark:text-green-400">平均观看</span>
                        </div>
                        <div className="text-3xl font-bold text-foreground">
                          {formatNumber(stats.analysis?.avgWatchTime)}<span className="text-lg font-normal text-muted-foreground ml-1">秒</span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-2 font-medium">
                          完播率: {formatNumber(stats.analysis?.completionRate)}%
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-purple-500/5 border-purple-500/20">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="p-2 bg-purple-500/10 rounded-md">
                            <ShoppingCart className="h-5 w-5 text-purple-600" />
                          </div>
                          <span className="font-medium text-purple-900 dark:text-purple-400">成交金额</span>
                        </div>
                        <div className="text-3xl font-bold text-foreground">
                          {formatMoney(stats.analysis?.transactionAmount)}
                        </div>
                        <div className="text-sm text-muted-foreground mt-2 font-medium">
                          共 {formatNumber(stats.analysis?.transactionCnt)} 单
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-orange-500/5 border-orange-500/20">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="p-2 bg-orange-500/10 rounded-md">
                            <Activity className="h-5 w-5 text-orange-600" />
                          </div>
                          <span className="font-medium text-orange-900 dark:text-orange-400">互动评论</span>
                        </div>
                        <div className="text-3xl font-bold text-foreground">
                          {formatNumber(stats.analysis?.commentCnt)}
                        </div>
                        <div className="text-sm text-muted-foreground mt-2 font-medium">
                          互动率: {formatNumber(stats.analysis?.interactionRate)}%
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* 详细统计 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="border-border/50 shadow-sm">
                      <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
                        <CardTitle className="text-base flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-primary" />
                          流量概览
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="grid grid-cols-2 gap-y-8 gap-x-4">
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">峰值在线</div>
                            <div className="text-2xl font-semibold">
                              {formatNumber(stats.analysis?.peakConcurrentViewers)}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">观看次数</div>
                            <div className="text-2xl font-semibold">
                              {formatNumber(stats.analysis?.viewCnt)}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">完播人数</div>
                            <div className="text-2xl font-semibold">
                              {formatNumber(stats.analysis?.complateCnt)}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground mb-1">商品点击</div>
                            <div className="text-2xl font-semibold">
                              {formatNumber(stats.analysis?.productClickCnt)}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50 shadow-sm">
                      <CardHeader className="pb-4 border-b border-border/50 bg-muted/20">
                        <CardTitle className="text-base flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-primary" />
                          转化分析
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div className="space-y-6">
                          <div>
                            <div className="flex justify-between mb-2">
                              <span className="text-sm font-medium">新学员转化率</span>
                              <span className="font-bold text-blue-600">
                                {formatNumber(stats.newoldData?.nconversionRate)}%
                              </span>
                            </div>
                            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 rounded-full" 
                                style={{ width: `${Math.min(Number(stats.newoldData?.nconversionRate || 0), 100)}%` }} 
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between mb-2">
                              <span className="text-sm font-medium">老学员转化率</span>
                              <span className="font-bold text-green-600">
                                {formatNumber(stats.newoldData?.oconversionRate)}%
                              </span>
                            </div>
                            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-green-500 rounded-full" 
                                style={{ width: `${Math.min(Number(stats.newoldData?.oconversionRate || 0), 100)}%` }} 
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}