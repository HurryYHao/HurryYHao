// GET /api/monitor/status - 获取监控状态概览（只读）
// POST /api/monitor/status - 手动触发状态轮询
import { NextRequest, NextResponse } from 'next/server';
import { getNumberAnalysis, getLiveList, pollLiveStatus, getRecordingStatus, checkAndRunScheduledAnalysis, type LiveRoom } from '@/lib/server/monitor';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { fetchAnalysis, fetchOrderAnalysis, fetchChartData } from '@/lib/server/fetcher';
import { getLiveSpaceId } from '@/lib/server/auth';

export async function GET(request: NextRequest) {
  try {
    // ===== 1. 获取平台统计 =====
    let numberAnalysis = { total: 0, inStart: 0, notStart: 0 };
    try {
      numberAnalysis = await getNumberAnalysis();
    } catch {
      // Token 可能未初始化
    }

    // ===== 2. 获取直播列表 =====
    let rooms: LiveRoom[] = [];
    try {
      const result = await getLiveList(1, 50);
      rooms = result.rooms;
    } catch {
      // ignore
    }

    // ===== 3. 获取数据库中的活跃会话 =====
    const client = getSupabaseClient();
    const { data: activeSessions, error } = await client
      .from('live_sessions')
      .select('*')
      .in('status', ['idle', 'recording', 'analyzing'])
      .order('created_at', { ascending: false });

    if (error) throw new Error(`查询活跃会话失败: ${error.message}`);

    // 获取最近的已完成会话
    const { data: recentSessions, error: recentError } = await client
      .from('live_sessions')
      .select('*')
      .eq('status', 'ended')
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) throw new Error(`查询历史会话失败: ${recentError.message}`);

    // ===== 4. 对正在直播的房间获取实时统计数据 =====
    const liveRooms = rooms.filter((r) => r.liveStatus === 'STARTING');
    type RoomLiveStats = {
      roomId: string;
      onlineCount: number;
      totalWatchCount: number;
      commentCount: number;
      commenterCnt: number;
      totalAmount: number;
      totalOrders: number;
    };
    const liveStatsMap: Record<string, Partial<RoomLiveStats>> = {};

    if (liveRooms.length > 0) {
      const statsPromises = liveRooms.map(async (room) => {
        try {
          const liveSpaceId = await getLiveSpaceId(room.roomId);
          if (!liveSpaceId) {
            console.warn(`无法获取liveSpaceId for room ${room.roomId}`);
            return { roomId: room.roomId };
          }
          const [analysisResult, orderResult, chartResult] = await Promise.allSettled([
            fetchAnalysis(room.roomId, liveSpaceId),
            fetchOrderAnalysis(room.roomId, liveSpaceId),
            fetchChartData(room.roomId, liveSpaceId),
          ]);
          const analysis = analysisResult.status === 'fulfilled' ? analysisResult.value : {};
          const order = orderResult.status === 'fulfilled' ? orderResult.value : {};
          const chart = chartResult.status === 'fulfilled' ? chartResult.value : {};
          // fetchAnalysis: peakConcurrentViewers=峰值在线, watcherCnt=观看人次, commentCnt=评论数, commenterCnt=评论人数
          // fetchOrderAnalysis: totalAmount=成交金额, totalCount=成交单数
          // fetchChartData: 图表时序数据，从onlineUserCntList取最新在线人数
          // 优先使用房间列表的online字段（实时在线），然后尝试图表数据最新值，最后用峰值
          let currentOnline = Number(room.online || 0);
          if (!currentOnline) {
            currentOnline = Number((analysis as Record<string, unknown>).peakConcurrentViewers || 0);
            // 从图表数据的在线人数列表中取最新值（最后一个非零值）
            const onlineList = (chart as Record<string, unknown>).onlineUserCntList as number[] | undefined;
            if (onlineList && onlineList.length > 0) {
              for (let i = onlineList.length - 1; i >= 0; i--) {
                if (onlineList[i] != null && onlineList[i] > 0) {
                  currentOnline = onlineList[i];
                  break;
                }
              }
            }
          }
          return {
            roomId: room.roomId,
            onlineCount: currentOnline,
            totalWatchCount: Number((analysis as Record<string, unknown>).watcherCnt || 0),
            commentCount: Number((analysis as Record<string, unknown>).commentCnt || 0),
            commenterCnt: Number((analysis as Record<string, unknown>).commenterCnt || 0),
            totalAmount: Number((order as Record<string, unknown>).totalAmount || 0),
            totalOrders: Number((order as Record<string, unknown>).totalCount || 0),
          };
        } catch {
          return { roomId: room.roomId };
        }
      });
      const statsResults = await Promise.all(statsPromises);
      for (const s of statsResults) {
        liveStatsMap[s.roomId ?? ''] = s;
      }
    }

    // 汇总所有直播中的实时数据
    const allStats = Object.values(liveStatsMap);
    const liveSummary = {
      totalOnline: allStats.reduce((sum, s) => sum + (s.onlineCount || 0), 0),
      totalWatch: allStats.reduce((sum, s) => sum + (s.totalWatchCount || 0), 0),
      totalComments: allStats.reduce((sum, s) => sum + (s.commentCount || 0), 0),
      totalCommenters: allStats.reduce((sum, s) => sum + (s.commenterCnt || 0), 0),
      totalAmount: allStats.reduce((sum, s) => sum + (s.totalAmount || 0), 0),
      totalOrders: allStats.reduce((sum, s) => sum + (s.totalOrders || 0), 0),
      liveRoomCount: liveRooms.length,
    };

    // ===== 5. 获取录制/分析状态 =====
    let recordingStatus: Array<{
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
    }> = [];
    try {
      recordingStatus = await getRecordingStatus();
    } catch (err) {
      console.error('[MonitorStatus] 获取录制状态异常:', err instanceof Error ? err.message : err);
    }

    return NextResponse.json({
      success: true,
      data: {
        numberAnalysis,
        rooms: rooms.map((r) => {
          const stats = liveStatsMap[r.roomId];
          return {
            ...r,
            liveData: stats ? {
              onlineCount: stats.onlineCount || 0,
              totalWatchCount: stats.totalWatchCount || 0,
              commentCount: stats.commentCount || 0,
              commenterCnt: stats.commenterCnt || 0,
              orderTotalAmount: stats.totalAmount || 0,
              orderCount: stats.totalOrders || 0,
            } : null,
          };
        }),
        activeSessions: activeSessions || [],
        recentSessions: recentSessions || [],
        liveSummary,
        recordingStatus,
        autoAnalysisTriggered: [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取监控状态失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/monitor/status - 手动触发状态轮询
export async function POST() {
  try {
    const result = await pollLiveStatus();
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : '轮询失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
