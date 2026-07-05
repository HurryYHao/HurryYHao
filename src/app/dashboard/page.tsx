'use client';

import Link from 'next/link';
import {
  Users, Eye, MessageSquare,
  Radio, CircleDot, BarChart3, RefreshCw, Clock,
  Camera, BrainCircuit, Timer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useMonitor } from '@/components/dashboard/monitor-provider';

interface Room {
  id: string;
  roomId: string;
  roomName: string;
  liveStatus: string;
  startTime: string | null;
  coverUrl?: string;
  description?: string;
  online?: string;
  anchorId?: string;
  roomType?: 'normal' | 'intelligence';
  templateName?: string;
  liveData?: {
    onlineCount: number;
    totalWatchCount: number;
    commentCount: number;
    commenterCnt: number;
    orderTotalAmount: number;
    orderCount: number;
  };
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

function formatDuration(minutes: number | null): string {
  if (minutes == null) return '-';
  if (minutes < 60) return `${minutes}分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export default function DashboardPage() {
  const { monitorData, dataLoading, manualPoll, manualLoading, nextRefreshIn, lastPollTime } = useMonitor();
  const activeTab = 'normal';
  const setActiveTab = (_v: string) => {};

  const data = monitorData;

  const formatNum = (n: number | undefined | null) => {
    if (n == null) return '-';
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return n.toLocaleString();
  };

  const formatMoney = (n: number | undefined | null) => {
    if (n == null) return '-';
    if (n >= 10000) return '¥' + (n / 10000).toFixed(1) + '万';
    return '¥' + n.toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'STARTING': return 'bg-primary text-primary-foreground';
      case 'STARTED': return 'bg-muted text-muted-foreground';
      case 'NOT_STARTED': return 'bg-muted/50 text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'STARTING': return '直播中';
      case 'STARTED': return '已结束';
      case 'NOT_STARTED': return '未开播';
      default: return status;
    }
  };

  const recordingStatus: RecordingStatus[] = data?.recordingStatus || [];
  const liveRooms: Room[] = (data?.rooms || []).filter(r => r.liveStatus === 'STARTING');

  if (dataLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 + 实时指示器 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">直播概览</h1>
          <p className="text-sm text-muted-foreground mt-1">
            实时监控鑫云直播平台数据 · 每30分钟自动分析
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            {nextRefreshIn}s后刷新
            {lastPollTime && (
              <span className="text-muted-foreground/60">
                · 上次 {lastPollTime.toLocaleTimeString('zh-CN')}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => manualPoll()}
            disabled={manualLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${manualLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {/* ===== 直播中 ===== */}
      {liveRooms.length > 0 && (
        <Card className="border-red-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="relative flex h-5 w-5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-5 w-5 bg-red-500 items-center justify-center">
                    <Radio className="h-3 w-3 text-white" />
                  </span>
                </span>
                直播监控中
                <Badge variant="destructive" className="text-[10px] px-1.5 ml-1">
                  {liveRooms.length}场
                </Badge>
              </CardTitle>
              <Badge variant="outline" className="border-primary/30 text-primary">
                实时数据
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {liveRooms.map(room => {
                const isRecording = recordingStatus.some(r => r.roomId === room.roomId);
                return (
                  <div key={room.roomId} className="flex items-center gap-4 p-3 rounded-lg border border-red-500/10 bg-red-500/5 hover:bg-red-500/10 transition-colors">
                    {room.coverUrl ? (
                      <div className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0">
                        <img src={room.coverUrl} alt={room.roomName} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="relative w-16 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                        <Radio className="h-6 w-6 text-red-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{room.roomName}</p>
                        {isRecording && (
                          <Badge className="text-[10px] bg-red-500/20 text-red-600 border-red-500/30">
                            <CircleDot className="h-3 w-3 mr-0.5" />录制中
                          </Badge>
                        )}
                        {room.roomType === 'intelligence' && (
                          <Badge variant="secondary" className="text-[10px]">智能</Badge>
                        )}
                      </div>
                      {isRecording && (() => {
                        const rs = recordingStatus.find(r => r.roomId === room.roomId);
                        if (!rs) return null;
                        return (
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              录制 {formatDuration(rs.recordingDuration)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Camera className="h-3 w-3" />
                              第{rs.lastSnapshotSeq}段
                            </span>
                            {rs.nextAnalysisIn != null && (
                              <span className="flex items-center gap-1 text-amber-600">
                                <Timer className="h-3 w-3" />
                                {rs.nextAnalysisIn}分钟后分析
                              </span>
                            )}
                            {rs.isAnalyzing && (
                              <Badge className="text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30">
                                <BrainCircuit className="h-3 w-3 mr-0.5" />分析中
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary ml-auto">
                              每30分钟自动分析
                            </Badge>
                          </div>
                        );
                      })()}
                      {!isRecording && room.liveData ? (
                        <div className="flex items-center gap-4 mt-1.5 text-xs">
                          <span className="flex items-center gap-1 text-primary font-mono">
                            <Users className="h-3 w-3" />{formatNum(room.liveData.onlineCount)}在线
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <Eye className="h-3 w-3 text-muted-foreground" />{formatNum(room.liveData.totalWatchCount)}观看
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <MessageSquare className="h-3 w-3 text-muted-foreground" />{formatNum(room.liveData.commentCount)}评论
                          </span>
                          {room.liveData.orderTotalAmount > 0 && (
                            <span className="flex items-center gap-1 font-mono text-emerald-600">
                              ¥{formatMoney(room.liveData.orderTotalAmount)}
                            </span>
                          )}
                        </div>
                      ) : !isRecording && (
                        <p className="text-xs text-muted-foreground mt-1">数据获取中...</p>
                      )}
                    </div>
                    <Link href={`/dashboard/live?roomId=${room.roomId}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        <BarChart3 className="h-3 w-3 mr-1" />
                        数据大盘
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 直播间列表 */}
      <Tabs defaultValue="normal" value={activeTab} onValueChange={setActiveTab}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">直播间</CardTitle>
              <TabsList>
                <TabsTrigger value="normal" className="flex items-center gap-1">
                  普通直播
                  <Badge variant="secondary" className="ml-1">{(data?.rooms?.filter(r => r.roomType === 'normal') ?? []).length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="intelligence" className="flex items-center gap-1">
                  智能直播
                  <Badge variant="secondary" className="ml-1">{(data?.rooms?.filter(r => r.roomType === 'intelligence') ?? []).length}</Badge>
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            <TabsContent value="normal">
              {data?.rooms && data.rooms.filter(r => r.roomType === 'normal').length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {data.rooms.filter(r => r.roomType === 'normal').map(room => {
                    const isRecording = recordingStatus.some(r => r.roomId === room.roomId);
                    return (
                      <Card key={room.roomId} className="overflow-hidden border hover:shadow-md transition-shadow">
                        {room.coverUrl && (
                          <div className="relative h-36 bg-muted">
                            <img src={room.coverUrl} alt={room.roomName} className="w-full h-full object-cover" />
                            <Badge className={`absolute top-2 right-2 text-xs ${getStatusColor(room.liveStatus)}`}>
                              {getStatusText(room.liveStatus)}
                            </Badge>
                            {isRecording && (
                              <Badge className="absolute top-2 left-2 text-xs bg-red-500/80 text-white">
                                <CircleDot className="h-3 w-3 mr-1" />录制中
                              </Badge>
                            )}
                            {room.liveStatus === 'STARTING' && room.liveData && (
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-3 py-1.5 flex items-center gap-3 text-white text-xs">
                                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{formatNum(room.liveData.onlineCount)}</span>
                                <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatNum(room.liveData.totalWatchCount)}</span>
                                <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{formatNum(room.liveData.commentCount)}({formatNum(room.liveData.commenterCnt)}人)</span>
                              </div>
                            )}
                          </div>
                        )}
                        <CardContent className="p-3">
                          <h3 className="font-medium text-sm truncate mb-1" title={room.roomName}>
                            {room.roomName}
                          </h3>
                          {room.description && (
                            <p className="text-xs text-muted-foreground truncate mb-2">{room.description}</p>
                          )}
                          {room.liveStatus === 'STARTING' && room.liveData && (
                            <div className="grid grid-cols-4 gap-2 mb-2 bg-primary/5 rounded-md p-2">
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">在线</p>
                                <p className="text-sm font-bold font-mono text-primary">{formatNum(room.liveData.onlineCount)}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">观看</p>
                                <p className="text-sm font-bold font-mono">{formatNum(room.liveData.totalWatchCount)}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">评论</p>
                                <p className="text-sm font-bold font-mono">{formatNum(room.liveData.commentCount)}</p>
                                <p className="text-[10px] text-muted-foreground">{formatNum(room.liveData.commenterCnt)}人</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">成交</p>
                                <p className="text-sm font-bold font-mono text-emerald-600">{formatMoney(room.liveData.orderTotalAmount)}</p>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {room.startTime || '未定'}
                            </div>
                            <Link href={`/dashboard/live?roomId=${room.roomId}`}>
                              <Button variant="outline" size="sm" className="h-7 text-xs">
                                <BarChart3 className="h-3 w-3 mr-1" />
                                数据大盘
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Radio className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>暂无普通直播房间</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="intelligence">
              {data?.rooms && data.rooms.filter(r => r.roomType === 'intelligence').length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {data.rooms.filter(r => r.roomType === 'intelligence').map(room => {
                    const isRecording = recordingStatus.some(r => r.roomId === room.roomId);
                    return (
                      <Card key={room.roomId} className="overflow-hidden border hover:shadow-md transition-shadow">
                        {room.coverUrl && (
                          <div className="relative h-36 bg-muted">
                            <img src={room.coverUrl} alt={room.roomName} className="w-full h-full object-cover" />
                            <Badge className={`absolute top-2 right-2 text-xs ${getStatusColor(room.liveStatus)}`}>
                              {getStatusText(room.liveStatus)}
                            </Badge>
                            {isRecording && (
                              <Badge className="absolute top-2 left-2 text-xs bg-red-500/80 text-white">
                                <CircleDot className="h-3 w-3 mr-1" />录制中
                              </Badge>
                            )}
                            {room.liveStatus === 'STARTING' && room.liveData && (
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-3 py-1.5 flex items-center gap-3 text-white text-xs">
                                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{formatNum(room.liveData.onlineCount)}</span>
                                <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{formatNum(room.liveData.totalWatchCount)}</span>
                                <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{formatNum(room.liveData.commentCount)}({formatNum(room.liveData.commenterCnt)}人)</span>
                              </div>
                            )}
                          </div>
                        )}
                        <CardContent className="p-3">
                          {room.templateName ? (
                            <>
                              <h3 className="font-medium text-sm truncate mb-1" title={room.templateName}>
                                {room.templateName}
                              </h3>
                              <Badge variant="secondary" className="mb-2">智能模板</Badge>
                              <p className="text-xs text-muted-foreground truncate mb-2">{room.roomName}</p>
                            </>
                          ) : (
                            <h3 className="font-medium text-sm truncate mb-1" title={room.roomName}>
                              {room.roomName}
                            </h3>
                          )}
                          {room.description && (
                            <p className="text-xs text-muted-foreground truncate mb-2">{room.description}</p>
                          )}
                          {room.liveStatus === 'STARTING' && room.liveData && (
                            <div className="grid grid-cols-4 gap-2 mb-2 bg-primary/5 rounded-md p-2">
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">在线</p>
                                <p className="text-sm font-bold font-mono text-primary">{formatNum(room.liveData.onlineCount)}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">观看</p>
                                <p className="text-sm font-bold font-mono">{formatNum(room.liveData.totalWatchCount)}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">评论</p>
                                <p className="text-sm font-bold font-mono">{formatNum(room.liveData.commentCount)}</p>
                                <p className="text-[10px] text-muted-foreground">{formatNum(room.liveData.commenterCnt)}人</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">成交</p>
                                <p className="text-sm font-bold font-mono text-emerald-600">{formatMoney(room.liveData.orderTotalAmount)}</p>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {room.startTime || '未定'}
                            </div>
                            <Link href={`/dashboard/live?roomId=${room.roomId}`}>
                              <Button variant="outline" size="sm" className="h-7 text-xs">
                                <BarChart3 className="h-3 w-3 mr-1" />
                                数据大盘
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Radio className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>暂无智能直播房间</p>
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>

      {/* 最近会话 */}
      {data?.recentSessions && data.recentSessions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">最近分析会话</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentSessions.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Badge variant={s.status === 'ended' ? 'secondary' : 'default'} className="text-xs">
                      {s.status}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{s.roomName}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.startTime} → {s.endTime}
                      </p>
                    </div>
                  </div>
                  <Link href={`/dashboard/reports?sessionId=${s.id}`}>
                    <Button variant="ghost" size="sm" className="text-xs">查看报告</Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
