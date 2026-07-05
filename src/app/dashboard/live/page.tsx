'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity, ArrowLeft, ArrowUpDown, Clock, DollarSign, Eye,
  Loader2, MessageSquare, Package, RefreshCw, ShoppingBag,
  Timer, UserCheck, Users, UserX, Zap
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ServerAudioRecorder from '@/components/dashboard/server-audio-recorder';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

/* ---------- types ---------- */
interface RoomInfo {
  roomId: string; roomName: string; liveStatus: string;
  coverUrl: string | null; description: string | null; startTime: string | null;
}
interface Metrics { onlineCount: number; totalWatchCount: number; commentCount: number; commenterCnt: number; totalAmount: number | string; totalCount: number; }
interface NewoldFans {
  newFanWatchCnt: string; newFanPayCount: string; newFanConversionRate: string; newFanWatch30Cnt: string;
  oldFanWatchCnt: string; oldFanPayCount: string; oldFanConversionRate: string; oldFanWatch30Cnt: string;
}
interface LiveData {
  room: RoomInfo; metrics: Metrics; newoldFans: NewoldFans | null;
  goods: Array<Record<string, unknown>>; recentComments: Array<Record<string, unknown>>;
  recentOrders: Array<Record<string, unknown>>; onlineUsers: Array<Record<string, unknown>>;
  session: { id: number; status: string; startTime: string | null; endTime: string | null; lastSnapshotSeq: number } | null;
  snapshots: Array<Record<string, unknown>>;
}

/* ---------- helpers ---------- */
function liveStatusText(s: string) {
  const m: Record<string, string> = { STARTING: '直播中', STARTED: '已结束', NOT_STARTED: '未开播' };
  return m[s] || s;
}
function liveStatusColor(s: string) {
  const m: Record<string, string> = { STARTING: 'bg-primary text-primary-foreground', STARTED: 'bg-muted text-muted-foreground', NOT_STARTED: 'bg-secondary text-secondary-foreground' };
  return m[s] || 'bg-secondary';
}
function fmtMoney(v: number | string) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNum(v: unknown) {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0;
  if (isNaN(n)) return '0';
  return n.toLocaleString('zh-CN');
}
function calcDuration(startTime: string | null): string {
  if (!startTime) return '--';
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const diff = now - start;
  if (diff < 0) return '未开始';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
/* mini sparkline via SVG */
function Sparkline({ data, width = 80, height = 24, color = 'var(--chart-1)' }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (data.length < 2) return <span className="text-xs text-muted-foreground">--</span>;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={pts.join(' ')} />
    </svg>
  );
}

/* ---------- component ---------- */
import { Suspense } from 'react';

function LiveDataPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = searchParams.get('roomId') || '';
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [elapsed, setElapsed] = useState('--');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyRef = useRef<{ online: number[]; watch: number[]; comments: number[] }>({ online: [], watch: [], comments: [] });

  const fetchData = useCallback(async (showToast = false) => {
    if (!roomId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/live-data?roomId=${roomId}`);
      if (!res.ok) throw new Error('请求失败');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '获取数据失败');
      setData(json.data);
      // 记录趋势
      const m = json.data.metrics as Metrics;
      historyRef.current.online.push(m.onlineCount);
      historyRef.current.watch.push(m.totalWatchCount);
      historyRef.current.comments.push(m.commentCount);
      if (historyRef.current.online.length > 30) {
        historyRef.current.online.shift();
        historyRef.current.watch.shift();
        historyRef.current.comments.shift();
      }
      if (showToast) toast.success('数据已刷新');
    } catch (err) {
      if (showToast) toast.error(err instanceof Error ? err.message : '刷新失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [roomId]);

  // 初次加载 + 自动刷新
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (autoRefresh && roomId) {
      intervalRef.current = setInterval(() => fetchData(), 30000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, roomId, fetchData]);

  // 直播时长计时器
  useEffect(() => {
    const timer = setInterval(() => {
      if (data?.room?.startTime && data?.room?.liveStatus === 'STARTING') {
        setElapsed(calcDuration(data.room.startTime));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [data?.room?.startTime, data?.room?.liveStatus]);

  if (!roomId) return <div className="p-8 text-center text-muted-foreground">缺少 roomId 参数</div>;

  if (loading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  );

  const room = data?.room;
  const metrics = data?.metrics;
  const isLive = room?.liveStatus === 'STARTING';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{room?.roomName || roomId}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={liveStatusColor(room?.liveStatus || '')}>{liveStatusText(room?.liveStatus || '')}</Badge>
              {isLive && <span className="text-sm text-muted-foreground flex items-center gap-1"><Timer className="h-3 w-3" />{elapsed}</span>}
              {room?.startTime && !isLive && <span className="text-sm text-muted-foreground">{new Date(room.startTime).toLocaleString('zh-CN')}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={autoRefresh ? 'default' : 'outline'} size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
            <RefreshCw className={`h-3 w-3 mr-1 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
            {autoRefresh ? '30s 自动' : '手动'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            刷新
          </Button>
        </div>
      </div>

      {/* 6 大核心指标 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { title: '在线人数', value: fmtNum(metrics?.onlineCount), icon: Eye, sparkData: historyRef.current.online, color: 'var(--chart-1)' },
          { title: '观看人次', value: fmtNum(metrics?.totalWatchCount), icon: Users, sparkData: historyRef.current.watch, color: 'var(--chart-2)' },
          { title: '评论数', value: fmtNum(metrics?.commentCount), icon: MessageSquare, sparkData: historyRef.current.comments, color: 'var(--chart-3)' },
          { title: '评论人数', value: fmtNum(metrics?.commenterCnt), icon: Users, color: 'var(--chart-5)' },
          { title: '成交金额', value: `¥${fmtMoney(metrics?.totalAmount || 0)}`, icon: DollarSign, color: 'var(--chart-4)' },
          { title: '成交单数', value: fmtNum(metrics?.totalCount), icon: ShoppingBag, color: 'var(--chart-1)' },
        ].map((item) => (
          <Card key={item.title} className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{item.title}</span>
                <item.icon className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <div className="text-xl font-bold mt-1 font-mono">{item.value}</div>
              <div className="absolute bottom-2 right-2 opacity-60">
                {'sparkData' in item && <Sparkline data={(item as { sparkData: number[] }).sparkData} color={(item as { color?: string }).color} />}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 新老粉对比 */}
      {data?.newoldFans && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><UserCheck className="h-4 w-4" />新老学员对比</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="text-sm font-medium text-primary">新学员</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>访问 <span className="font-mono font-bold">{fmtNum(data.newoldFans.newFanWatchCnt)}</span></div>
                  <div>支付 <span className="font-mono font-bold">{fmtNum(data.newoldFans.newFanPayCount)}</span></div>
                  <div>转化率 <span className="font-mono font-bold text-primary">{data.newoldFans.newFanConversionRate}%</span></div>
                  <div>≥30min <span className="font-mono font-bold">{fmtNum(data.newoldFans.newFanWatch30Cnt)}</span></div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">老学员</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>访问 <span className="font-mono font-bold">{fmtNum(data.newoldFans.oldFanWatchCnt)}</span></div>
                  <div>支付 <span className="font-mono font-bold">{fmtNum(data.newoldFans.oldFanPayCount)}</span></div>
                  <div>转化率 <span className="font-mono font-bold">{data.newoldFans.oldFanConversionRate}%</span></div>
                  <div>≥30min <span className="font-mono font-bold">{fmtNum(data.newoldFans.oldFanWatch30Cnt)}</span></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 音频录制 */}
      {roomId && (
        <ServerAudioRecorder roomId={roomId} sessionId={data?.session?.id} roomName={room?.roomName} />
      )}

      {/* 数据详情 Tabs */}
      <Tabs defaultValue="comments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="comments"><MessageSquare className="h-3 w-3 mr-1" />评论</TabsTrigger>
          <TabsTrigger value="orders"><ShoppingBag className="h-3 w-3 mr-1" />订单</TabsTrigger>
          <TabsTrigger value="goods"><Package className="h-3 w-3 mr-1" />商品</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-3 w-3 mr-1" />用户</TabsTrigger>
        </TabsList>

        {/* 评论列表 */}
        <TabsContent value="comments">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">实时评论</CardTitle>
              <CardDescription>已过滤剧本/自刷评论，仅显示真人用户</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户</TableHead>
                      <TableHead>内容</TableHead>
                      <TableHead>新用户</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.recentComments || []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无评论</TableCell></TableRow>
                    ) : (data?.recentComments || []).map((c, i) => (
                      <TableRow key={`c-${i}-${c.id || ''}`}>
                        <TableCell className="font-medium text-xs">{String(c.userName || c.userId || '--').slice(0, 8)}</TableCell>
                        <TableCell className="max-w-[240px] truncate text-sm">{String(c.content || '')}</TableCell>
                        <TableCell>{c.newUser ? <Badge variant="outline" className="text-xs">新</Badge> : ''}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{String(c.fromClientType || '')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {c.eventTime ? String(c.eventTime).slice(11, 16) : c.msgTimestamp ? new Date(Number(c.msgTimestamp)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 订单列表 */}
        <TabsContent value="orders">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">支付成功订单</CardTitle>
              <CardDescription>仅显示支付成功的成交订单</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品</TableHead>
                      <TableHead>金额</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.recentOrders || []).length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">暂无订单</TableCell></TableRow>
                    ) : (data?.recentOrders || []).map((o, i) => (
                      <TableRow key={`o-${i}-${o.id || ''}`}>
                        <TableCell className="max-w-[200px] truncate text-sm">{String(o.goodsName || '--')}</TableCell>
                        <TableCell className="font-mono text-sm">¥{fmtMoney(String(o.payAmount || o.goodsPrice || 0))}</TableCell>
                        <TableCell><Badge variant={String(o.orderStatus).includes('支付') && !String(o.orderStatus).includes('未') ? 'default' : 'secondary'} className="text-xs">{String(o.orderStatus || '--')}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {String(o.payTime || '--')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 商品列表 */}
        <TabsContent value="goods">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">商品漏斗数据</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品名称</TableHead>
                      <TableHead>价格</TableHead>
                      <TableHead>点击</TableHead>
                      <TableHead>下单</TableHead>
                      <TableHead>已支付</TableHead>
                      <TableHead>未支付</TableHead>
                      <TableHead>点击→下单率</TableHead>
                      <TableHead>下单→支付率</TableHead>
                      <TableHead>支付总额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.goods || []).length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">暂无商品</TableCell></TableRow>
                    ) : (data?.goods || []).map((g, i) => {
                      const clicks = Number(g.clickCount || 0);
                      const buys = Number(g.buyCount || 0);
                      const paid = Number(g.paidCount || 0);
                      const unpaid = Number(g.unpaidCount || 0);
                      const totalPaidAmount = Number(g.totalPaidAmount || 0);
                      const clickToBuy = clicks > 0 ? ((buys / clicks) * 100).toFixed(1) : '-';
                      const buyToPaid = buys > 0 ? ((paid / buys) * 100).toFixed(1) : (paid > 0 ? '100' : '-');
                      return (
                        <TableRow key={`g-${i}-${g.goodsName || ''}`}>
                          <TableCell className="max-w-[200px] truncate text-sm">{String(g.goodsName || '--')}</TableCell>
                          <TableCell className="font-mono text-sm">¥{fmtMoney(String(g.goodsPrice || 0))}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtNum(clicks)}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtNum(buys)}</TableCell>
                          <TableCell className="font-mono text-sm text-primary">{fmtNum(paid)}</TableCell>
                          <TableCell className="font-mono text-sm text-destructive">{fmtNum(unpaid)}</TableCell>
                          <TableCell><span className="font-mono text-sm">{clickToBuy}%</span></TableCell>
                          <TableCell><span className="font-mono text-sm">{buyToPaid}%</span></TableCell>
                          <TableCell className="font-mono text-sm">¥{fmtMoney(String(totalPaidAmount))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 用户列表 */}
        <TabsContent value="users">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">在线用户</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>在线时长</TableHead>
                      <TableHead>评论数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.onlineUsers || []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">暂无用户数据</TableCell></TableRow>
                    ) : (data?.onlineUsers || []).map((u, i) => (
                      <TableRow key={`u-${i}-${u.userName || ''}`}>
                        <TableCell className="text-sm">{String(u.userName || u.userId || '--')}</TableCell>
                        <TableCell className="text-xs">{String(u.userType || '--')}</TableCell>
                        <TableCell className="text-xs">{u.online ? <span className="text-primary font-medium">在线</span> : <span className="text-muted-foreground">离线</span>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{String(u.watchDuration || '--')}</TableCell>
                        <TableCell className="text-xs">{String(u.commentCount || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 历史快照 */}
      {data?.snapshots && data.snapshots.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />历史快照数据</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>片段</TableHead>
                    <TableHead>时间</TableHead>
                    <TableHead>观看</TableHead>
                    <TableHead>在线</TableHead>
                    <TableHead>评论</TableHead>
                    <TableHead>成交额</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.snapshots.map((snap, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">#{String(snap.snapshotSeq || i + 1)}</TableCell>
                      <TableCell className="text-xs">{snap.snapshotTime ? new Date(String(snap.snapshotTime)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--'}</TableCell>
                      <TableCell className="font-mono text-sm">{fmtNum(snap.watcher_cnt)}</TableCell>
                      <TableCell className="font-mono text-sm">{fmtNum(snap.online_user_cnt)}</TableCell>
                      <TableCell className="font-mono text-sm">{fmtNum(snap.comment_cnt)}</TableCell>
                      <TableCell className="font-mono text-sm">¥{fmtMoney(String(snap.order_total || 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function LiveDataPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-muted-foreground">Loading...</div>}>
      <LiveDataPageContent />
    </Suspense>
  );
}
