// GET /api/live-data?roomId={roomId} - 获取直播间实时数据大盘
// 全部使用管理页统计 API (clsjcorp.com)，无需 LiveToken
import { NextRequest, NextResponse } from 'next/server';
import { getLiveList } from '@/lib/server/monitor';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getLiveSpaceId } from '@/lib/server/auth';
import {
  fetchNewoldData,
  fetchAnalysis,
  fetchChartData,
  fetchAllMemberData,
  fetchAllComments,
  fetchOrderAnalysis,
  fetchAllOrderAnalysisPage,
} from '@/lib/server/fetcher';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('roomId');

    if (!roomId) {
      return NextResponse.json(
        { success: false, error: '缺少 roomId 参数' },
        { status: 400 }
      );
    }

    // 获取 liveSpaceId（管理页 API，无需 LiveToken）
    const liveSpaceId = await getLiveSpaceId(roomId);

    // 并行获取所有数据
    const [roomsResult, adminDataResult, snapshotsResult] = await Promise.allSettled([
      // 1. 房间基础信息（从平台列表中查找）
      getLiveList(1, 100),
      // 2. 管理页统计数据（全部从 clsjcorp.com 获取）
      (async () => {
        if (!liveSpaceId) {
          console.warn(`live-data: 无法获取liveSpaceId for room ${roomId}`);
          return {
            newoldData: null,
            analysisData: null,
            chartData: null,
            comments: { records: [], total: 0 },
            orderSummary: null,
            orderDetails: { records: [], total: 0 },
            members: { records: [], total: 0 },
          };
        }
        const [newoldResult, analysisResult, chartResult, commentsResult, orderSummaryResult, orderDetailsResult, membersResult] = await Promise.allSettled([
          fetchNewoldData(roomId, liveSpaceId),
          fetchAnalysis(roomId, liveSpaceId),
          fetchChartData(roomId, liveSpaceId),
          fetchAllComments(roomId, liveSpaceId),
          fetchOrderAnalysis(roomId, liveSpaceId),
          fetchAllOrderAnalysisPage(roomId, liveSpaceId),
          fetchAllMemberData(roomId, liveSpaceId),
        ]);
        return {
          newoldData: newoldResult.status === 'fulfilled' ? newoldResult.value : null,
          analysisData: analysisResult.status === 'fulfilled' ? analysisResult.value : null,
          chartData: chartResult.status === 'fulfilled' ? chartResult.value : null,
          comments: commentsResult.status === 'fulfilled' ? commentsResult.value : { records: [], total: 0 },
          orderSummary: orderSummaryResult.status === 'fulfilled' ? orderSummaryResult.value : null,
          orderDetails: orderDetailsResult.status === 'fulfilled' ? orderDetailsResult.value : { records: [], total: 0 },
          members: membersResult.status === 'fulfilled' ? membersResult.value : { records: [], total: 0 },
        };
      })(),
      // 3. 数据库中已有的快照历史
      (async () => {
        const client = getSupabaseClient();
        const { data, error } = await client
          .from('live_sessions')
          .select('id, status, start_time, end_time, last_snapshot_seq')
          .eq('room_id', roomId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error || !data || data.length === 0) {
          return { session: null, snapshots: [] };
        }

        const session = data[0];
        const { data: snapshots, error: snapError } = await client
          .from('snapshot_data')
          .select('*')
          .eq('session_id', session.id)
          .order('snapshot_seq', { ascending: true });

        if (snapError) {
          return { session, snapshots: [] };
        }

        return { session, snapshots: snapshots || [] };
      })(),
    ]);

    // 从平台列表中找到对应房间信息
    const rooms = roomsResult.status === 'fulfilled' ? roomsResult.value.rooms : [];
    const roomInfo = rooms.find((r) => r.roomId === roomId) || null;

    // 提取管理页统计数据
    const adminData = adminDataResult.status === 'fulfilled' ? adminDataResult.value : null;
    const newoldData = adminData?.newoldData as Record<string, string> | null;
    const analysisData = adminData?.analysisData as Record<string, unknown> | null;
    const orderSummary = adminData?.orderSummary as Record<string, unknown> | null;

    // 从 getAnalysis 提取核心指标
    // 优先使用房间列表的online字段（实时在线），然后尝试图表数据最新值，最后用峰值
    let onlineCount = Number(roomInfo?.online || 0);
    if (!onlineCount) {
      onlineCount = analysisData?.peakConcurrentViewers ? Number(analysisData.peakConcurrentViewers) : 0;
      const chartData = adminData?.chartData as Record<string, unknown> | undefined;
      const onlineList = chartData?.onlineUserCntList as number[] | undefined;
      if (onlineList && onlineList.length > 0) {
        for (let i = onlineList.length - 1; i >= 0; i--) {
          if (onlineList[i] != null && onlineList[i] > 0) {
            onlineCount = onlineList[i];
            break;
          }
        }
      }
    }
    const metrics = {
      onlineCount,
      totalWatchCount: analysisData?.watcherCnt ? parseInt(String(analysisData.watcherCnt), 10) : 0,
      viewCnt: analysisData?.viewCnt ? Number(analysisData.viewCnt) : 0,
      commentCount: analysisData?.commentCnt ? parseInt(String(analysisData.commentCnt), 10) : 0,
      commenterCnt: analysisData?.commenterCnt ? parseInt(String(analysisData.commenterCnt), 10) : 0,
      totalAmount: orderSummary?.totalAmount ? String(orderSummary.totalAmount) : (analysisData?.transactionAmount ? String(analysisData.transactionAmount) : '0'),
      totalCount: orderSummary?.totalCount ? Number(orderSummary.totalCount) : (analysisData?.transactionCnt ? Number(analysisData.transactionCnt) : 0),
      payUserCnt: analysisData?.payUserCnt ? Number(analysisData.payUserCnt) : 0,
      avgWatchTimeSeconds: analysisData?.avgWatchTimeSeconds ? String(analysisData.avgWatchTimeSeconds) : '0',
      newFanWatchCnt: newoldData?.nwatcherCnt || '0',
    };

    // 评论：从 msgBody.body JSON 提取 content，从 serverExtension 提取身份信息
    const recentComments = ((adminData?.comments as { records: Array<Record<string, unknown>>; total: number })?.records || [])
      .filter((c) => {
        const msgBody = c.msgBody as Record<string, unknown> | undefined;
        const serverExt = msgBody?.serverExtension as Record<string, unknown> | undefined;
        return (
          c.msgType === 'TEXT' &&
          c.examineState === 'EXAMINE_OK' &&
          serverExt?.role === 'AUDIENCE' &&
          serverExt?.videoScript !== true &&
          serverExt?.amuseOneself !== true
        );
      })
      .map((c) => {
        const msgBody = c.msgBody as Record<string, unknown>;
        const serverExt = msgBody?.serverExtension as Record<string, unknown>;
        let content = '';
        try {
          const bodyObj = JSON.parse(String(msgBody.body || '{}'));
          content = bodyObj.content || '';
        } catch { /* ignore */ }
        return {
          id: c.id,
          userName: c.fromNickName || '',
          userId: c.fromUserId || '',
          content,
          newUser: serverExt?.newUser || false,
          fromClientType: msgBody?.fromClientType || '',
          msgTimestamp: msgBody?.msgTimestamp || '',
          eventTime: c.eventTime || '',
        };
      });

    // 订单详情：只显示支付成功的订单
    const recentOrders = ((adminData?.orderDetails as { records: Array<Record<string, unknown>>; total: number })?.records || [])
      .filter((o) => {
        const payStatus = String(o.payStatus || '');
        return payStatus === 'SUCCESS' || payStatus === 'PAID' || payStatus === '已支付';
      })
      .map((o) => {
        const payStatus = String(o.payStatus || '');
        let orderStatus = '未支付';
        if (payStatus === 'SUCCESS' || payStatus === 'PAID' || payStatus === '已支付') {
          orderStatus = '支付成功';
        } else if (payStatus === 'NOTPAY') {
          orderStatus = '未支付';
        } else if (payStatus === 'CLOSED') {
          orderStatus = '已关闭';
        } else if (payStatus === 'REFUND') {
          orderStatus = '已退款';
        } else if (payStatus) {
          orderStatus = payStatus;
        }
        return {
          id: o.id,
          goodsName: o.goodsName || o.productName || '--',
          payAmount: o.payPrice || o.payAmount || o.goodsPrice || 0,
          goodsPrice: o.goodsPrice || 0,
          orderStatus,
          payTime: o.payTime || o.createdTime || '',
          payStatus: payStatus,
          buyCount: o.buyCount || 0,
          clickCount: o.clickCount || 0,
        };
      });

    // 商品数据：从全部订单明细中聚合（每个商品的点击/购买/支付统计，含漏斗数据）
    const orderRecords = (adminData?.orderDetails as { records: Array<Record<string, unknown>>; total: number })?.records || [];
    const goodsMap = new Map<string, { goodsName: string; goodsPrice: number; clickCount: number; buyCount: number; paidCount: number; unpaidCount: number; totalPaidAmount: number }>();
    for (const o of orderRecords) {
      const name = String(o.goodsName || o.productName || '');
      if (!name) continue;
      const price = Number(o.goodsPrice || 0);
      const click = Number(o.clickCount || 0);
      const buy = Number(o.buyCount || 0);
      const payStatus = String(o.payStatus || '');
      const isPaid = payStatus === 'SUCCESS' || payStatus === 'PAID' || payStatus === '已支付';
      const isUnpaid = payStatus === 'NOTPAY';
      const payPrice = Number(o.payPrice || o.payAmount || 0);
      const existing = goodsMap.get(name);
      if (existing) {
        existing.clickCount += click;
        existing.buyCount += buy;
        if (isPaid) {
          existing.paidCount += 1;
          existing.totalPaidAmount += payPrice || price;
        }
        if (isUnpaid) existing.unpaidCount += 1;
      } else {
        goodsMap.set(name, {
          goodsName: name, goodsPrice: price, clickCount: click, buyCount: buy,
          paidCount: isPaid ? 1 : 0, unpaidCount: isUnpaid ? 1 : 0,
          totalPaidAmount: isPaid ? (payPrice || price) : 0,
        });
      }
    }
    const goods = Array.from(goodsMap.values());

    // 在线用户：从 getMemberData 获取全部数据
    const memberRecords = (adminData?.members as { records: Array<Record<string, unknown>>; total: number })?.records || [];
    const onlineUsers = memberRecords.map((m) => {
      const watchSeconds = Number(m.totalWatchTimeSeconds || 0);
      const isOnline = m.online === true || m.online === 'true';
      return {
        id: m.id || m.memberId,
        userName: m.nickName || m.memberName || '',
        userId: m.memberId || m.userId || '',
        userType: (m as Record<string, unknown>).newUser === true ? '新学员' : '老学员',
        watchDuration: watchSeconds > 0 ? `${Math.floor(watchSeconds / 60)}分${watchSeconds % 60}秒` : '--',
        online: isOnline,
        firstEnterTime: m.firstEnterTime || '',
        lastEnterTime: m.lastEnterTime || '',
        commentCount: m.commentCount || 0,
      };
    });

    // 构建大盘数据
    const dashboard = {
      // 房间基础信息
      room: roomInfo ? {
        roomId: roomInfo.roomId,
        roomName: roomInfo.roomName,
        liveStatus: roomInfo.liveStatus,
        coverUrl: roomInfo.coverUrl || null,
        description: roomInfo.description || null,
        startTime: roomInfo.startTime,
      } : { roomId, roomName: '', liveStatus: 'UNKNOWN', coverUrl: null, description: null, startTime: null },

      // 实时概览指标
      metrics,

      // 新老粉数据
      newoldFans: newoldData ? {
        newFanWatchCnt: newoldData.nwatcherCnt || '0',
        newFanPayCount: newoldData.ntransactionUserCnt || '0',
        newFanConversionRate: newoldData.nconversionRate || '0',
        newFanWatch30Cnt: newoldData.nwatcher30Cnt || '0',
        oldFanWatchCnt: newoldData.owatcherCnt || '0',
        oldFanPayCount: newoldData.otransactionUserCnt || '0',
        oldFanConversionRate: newoldData.oconversionRate || '0',
        oldFanWatch30Cnt: newoldData.owatcher30Cnt || '0',
      } : null,

      // 趋势图数据
      chartData: adminData?.chartData || null,

      // 最近评论（已映射字段名）
      recentComments,

      // 最近订单（已映射字段名）
      recentOrders,

      // 商品数据（从订单聚合）
      goods,

      // 在线用户
      onlineUsers,

      // 数据库会话和快照历史
      session: snapshotsResult.status === 'fulfilled' ? snapshotsResult.value.session : null,
      snapshots: snapshotsResult.status === 'fulfilled' ? snapshotsResult.value.snapshots : [],
    };

    return NextResponse.json({ success: true, data: dashboard });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取直播数据失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
