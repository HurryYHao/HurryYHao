// 数据抓取模块 - 全部使用管理页统计API (api.clsjcorp.com)
// 不再使用监播页API (api.xinyuntv.com)，无需 LiveToken

import { adminApiRequest, getLiveSpaceId } from './auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// ==================== 管理页统计API ====================

/**
 * 抓取新老粉学员分布
 * 端点: POST /api/livemanage/statRoomLiveSpace/anyTenant/getNewoldData
 * Header path: /livemanage/openClassesRoom/analysis/{roomId}
 */
export async function fetchNewoldData(roomId: string, liveSpaceId: string): Promise<Record<string, string>> {
  const result = await adminApiRequest<{
    code: number;
    data: { statMemberNewoldDailyVo: Record<string, string> };
    isSuccess: boolean;
  }>('/api/livemanage/statRoomLiveSpace/anyTenant/getNewoldData', {
    body: {
      roomId,
      liveSpaceId,
      channelIds: [],
      channelGroupId: '',
    },
    pathOverride: `/livemanage/openClassesRoom/analysis/${roomId}`,
  });

  return result.data?.statMemberNewoldDailyVo || {};
}

/**
 * 抓取统计概览（新学员占比、平均观看时长等）
 * 端点: POST /api/livemanage/statRoomLiveSpace/anyTenant/getAnalysis
 * Header path: /livemanage/openClassesRoom/analysis/{roomId}
 */
export async function fetchAnalysis(roomId: string, liveSpaceId: string): Promise<Record<string, unknown>> {
  const result = await adminApiRequest<{
    code: number;
    data: Record<string, unknown>;
  }>('/api/livemanage/statRoomLiveSpace/anyTenant/getAnalysis', {
    body: { roomId, liveSpaceId },
    pathOverride: `/livemanage/openClassesRoom/analysis/${roomId}`,
  });

  return result.data || {};
}

/**
 * 抓取分钟级时序数据（在线/互动/营销/订单趋势）
 * 端点: POST /api/livemanage/statRoomLiveSpace/anyTenant/getChartData
 * Header path: /livemanage/openClassesRoom/analysis/{roomId}
 */
export async function fetchChartData(roomId: string, liveSpaceId: string): Promise<Record<string, unknown>> {
  const result = await adminApiRequest<{
    code: number;
    data: Record<string, unknown>;
  }>('/api/livemanage/statRoomLiveSpace/anyTenant/getChartData', {
    body: { roomId, liveSpaceId },
    pathOverride: `/livemanage/openClassesRoom/analysis/${roomId}`,
  });

  return result.data || {};
}

/**
 * 抓取学员分页列表（含观看时长）- 自动分页获取全部数据
 * 端点: POST /api/livemanage/statRoomLiveSpace/anyTenant/getMemberData
 * Header path: /livemanage/openClassesRoom/analysis/{roomId}
 */
export async function fetchMemberData(roomId: string, liveSpaceId: string, page = 1, size = 200): Promise<{
  records: Record<string, unknown>[];
  total: number;
}> {
  const result = await adminApiRequest<{
    code: number;
    data: { records: Record<string, unknown>[]; total: number };
  }>('/api/livemanage/statRoomLiveSpace/anyTenant/getMemberData', {
    body: { model: { roomId, liveSpaceId }, extra: {}, current: page, size },
    pathOverride: `/livemanage/openClassesRoom/analysis/${roomId}`,
  });

  return result.data || { records: [], total: 0 };
}

/**
 * 抓取全部学员数据（自动分页）
 */
export async function fetchAllMemberData(roomId: string, liveSpaceId: string): Promise<{
  records: Record<string, unknown>[];
  total: number;
}> {
  const pageSize = 200;
  const first = await fetchMemberData(roomId, liveSpaceId, 1, pageSize);
  if (first.total <= pageSize || first.records.length >= first.total) return first;

  const totalPages = Math.ceil(first.total / pageSize);
  const allRecords = [...first.records];
  const promises = [];
  for (let p = 2; p <= totalPages; p++) {
    promises.push(fetchMemberData(roomId, liveSpaceId, p, pageSize));
  }
  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === 'fulfilled') allRecords.push(...r.value.records);
  }
  return { records: allRecords, total: first.total };
}

/**
 * 抓取评论消息（含身份过滤）- 自动分页获取全部数据
 * 端点: POST /api/livemanage/imMessage/page
 * Header path: /livemanage/openClassesRoom/analysis/{roomId}
 *
 * 过滤规则: msgType=TEXT + examineState=EXAMINE_OK + role=AUDIENCE + videoScript=false + amuseOneself=false
 */
export async function fetchComments(
  roomId: string,
  liveSpaceId: string,
  page = 1,
  size = 200
): Promise<{
  records: Record<string, unknown>[];
  total: number;
}> {
  const result = await adminApiRequest<{
    code: number;
    data: { records: Record<string, unknown>[]; total: number };
  }>('/api/livemanage/imMessage/page', {
    body: {
      model: { roomId },
      extra: {},
      current: page,
      size,
      channelIds: [],
      channelGroupId: '',
    },
    pathOverride: `/livemanage/openClassesRoom/analysis/${roomId}`,
  });

  return result.data || { records: [], total: 0 };
}

/**
 * 抓取全部评论数据（自动分页）
 */
export async function fetchAllComments(
  roomId: string,
  liveSpaceId: string
): Promise<{
  records: Record<string, unknown>[];
  total: number;
}> {
  const pageSize = 200;
  const first = await fetchComments(roomId, liveSpaceId, 1, pageSize);
  if (first.total <= pageSize || first.records.length >= first.total) return first;

  const totalPages = Math.ceil(first.total / pageSize);
  const allRecords = [...first.records];
  const promises = [];
  for (let p = 2; p <= totalPages; p++) {
    promises.push(fetchComments(roomId, liveSpaceId, p, pageSize));
  }
  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === 'fulfilled') allRecords.push(...r.value.records);
  }
  return { records: allRecords, total: first.total };
}

/**
 * 抓取订单汇总
 * 端点: POST /api/livemanage/order/getOrderAnalysis
 * Header path: /livemanage/openClassesRoom/analysis/{roomId}
 */
export async function fetchOrderAnalysis(roomId: string, liveSpaceId: string): Promise<Record<string, unknown>> {
  const result = await adminApiRequest<{
    code: number;
    data: Record<string, unknown>;
  }>('/api/livemanage/order/getOrderAnalysis', {
    body: { roomId, liveSpaceId },
    pathOverride: `/livemanage/openClassesRoom/analysis/${roomId}`,
  });

  return result.data || {};
}

/**
 * 抓取订单明细分页 - 自动分页获取全部数据
 * 端点: POST /api/livemanage/order/getOrderAnalysisPage
 * Header path: /livemanage/openClassesRoom/analysis/{roomId}
 */
export async function fetchOrderAnalysisPage(
  roomId: string,
  liveSpaceId: string,
  page = 1,
  size = 200
): Promise<{
  records: Record<string, unknown>[];
  total: number;
}> {
  const result = await adminApiRequest<{
    code: number;
    data: { records: Record<string, unknown>[]; total: number };
  }>('/api/livemanage/order/getOrderAnalysisPage', {
    body: { model: { roomId, liveSpaceId }, extra: {}, current: page, size },
    pathOverride: `/livemanage/openClassesRoom/analysis/${roomId}`,
  });

  return result.data || { records: [], total: 0 };
}

/**
 * 抓取全部订单明细数据（自动分页）
 */
export async function fetchAllOrderAnalysisPage(
  roomId: string,
  liveSpaceId: string
): Promise<{
  records: Record<string, unknown>[];
  total: number;
}> {
  const pageSize = 200;
  const first = await fetchOrderAnalysisPage(roomId, liveSpaceId, 1, pageSize);
  if (first.total <= pageSize || first.records.length >= first.total) return first;

  const totalPages = Math.ceil(first.total / pageSize);
  const allRecords = [...first.records];
  const promises = [];
  for (let p = 2; p <= totalPages; p++) {
    promises.push(fetchOrderAnalysisPage(roomId, liveSpaceId, p, pageSize));
  }
  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === 'fulfilled') allRecords.push(...r.value.records);
  }
  return { records: allRecords, total: first.total };
}

// ==================== 辅助：提取评论文本 ====================

/**
 * 从评论消息中提取真实观众评论文本
 * 过滤规则: msgType=TEXT + examineState=EXAMINE_OK + role=AUDIENCE + videoScript=false + amuseOneself=false
 */
export function extractAudienceComments(records: Record<string, unknown>[]): Array<{
  nickname: string;
  content: string;
  timestamp: string;
  isNewUser: boolean;
}> {
  const comments: Array<{ nickname: string; content: string; timestamp: string; isNewUser: boolean }> = [];

  for (const record of records) {
    try {
      const msgBody = record.msgBody as Record<string, unknown> | undefined;
      if (!msgBody) continue;

      const msgType = msgBody.msgType as string;
      if (msgType !== 'TEXT') continue;

      const examineState = record.examineState as string;
      if (examineState !== 'EXAMINE_OK') continue;

      const serverExtension = msgBody.serverExtension as Record<string, unknown> | undefined;
      if (!serverExtension) continue;

      const role = serverExtension.role as string;
      if (role !== 'AUDIENCE') continue;

      const videoScript = serverExtension.videoScript as boolean;
      const amuseOneself = serverExtension.amuseOneself as boolean;
      if (videoScript || amuseOneself) continue;

      // 提取评论文本
      const bodyStr = msgBody.body as string;
      let content = '';
      try {
        const bodyJson = JSON.parse(bodyStr);
        content = bodyJson.content || '';
      } catch {
        content = bodyStr;
      }

      if (!content.trim()) continue;

      comments.push({
        nickname: (msgBody.fromNick as string) || (record.fromNickName as string) || '匿名',
        content,
        timestamp: (msgBody.msgTimestamp as string) || (record.eventTime as string) || '',
        isNewUser: serverExtension.newUser === true,
      });
    } catch {
      // 跳过解析失败的记录
    }
  }

  return comments;
}

function normalizeTimeLabel(baseTime: Date, label: string): Date {
  const match = label.match(/(\d{1,2}):(\d{2})/);
  if (!match) return new Date(baseTime);
  const normalized = new Date(baseTime);
  normalized.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return normalized;
}

async function upsertMinuteMetrics(
  sessionId: number,
  snapshotTime: Date,
  chartData: Record<string, unknown>
): Promise<void> {
  const client = getSupabaseClient();
  const xis = Array.isArray(chartData.xis) ? chartData.xis as string[] : [];
  const onlineList = Array.isArray(chartData.onlineUserCntList) ? chartData.onlineUserCntList as number[] : [];
  const commenterList = Array.isArray(chartData.commenterCntList) ? chartData.commenterCntList as number[] : [];
  const clickList = Array.isArray(chartData.productClickCntList) ? chartData.productClickCntList as number[] : [];
  const orderList = Array.isArray(chartData.transactionCntList) ? chartData.transactionCntList as number[] : [];
  const payUserList = Array.isArray(chartData.payUserCntList) ? chartData.payUserCntList as number[] : [];
  const amountList = Array.isArray(chartData.transactionAmountList) ? chartData.transactionAmountList as number[] : [];
  const viewerList = Array.isArray(chartData.watcherCntList) ? chartData.watcherCntList as number[] : [];

  for (let i = 0; i < xis.length; i++) {
    const existing = await client
      .from('live_metrics_minute')
      .select('id')
      .eq('session_id', sessionId)
      .eq('minute_index', i)
      .maybeSingle();

    const payload = {
      session_id: sessionId,
      minute_index: i,
      online_count: Number(onlineList[i] || 0),
      comment_count: Number(commenterList[i] || 0),
      click_count: Number(clickList[i] || 0),
      order_count: Number(orderList[i] || 0),
      paid_count: Number(payUserList[i] || 0),
      paid_amount: Number(amountList[i] || 0),
      viewer_count: Number(viewerList[i] || 0),
      created_at: normalizeTimeLabel(snapshotTime, xis[i]).toISOString(),
    };

    if (existing.data?.id) {
      await client
        .from('live_metrics_minute')
        .update(payload)
        .eq('id', existing.data.id);
    } else {
      await client.from('live_metrics_minute').insert(payload);
    }
  }
}

// 时间轴事件功能已移除（live_timeline_events 表已删除）
async function upsertTimelineEvent(
  _sessionId: number,
  _event: {
    timestamp: string;
    offset_seconds: number;
    event_type: string;
    content: string;
    metrics?: Record<string, unknown>;
    source: string;
    importance: 'low' | 'medium' | 'high';
  }
): Promise<void> {
  // live_timeline_events 表已删除
}

async function generateTimelineFromSnapshot(
  sessionId: number,
  snapshotTime: Date,
  analysisData: Record<string, unknown>,
  chartData: Record<string, unknown>,
  comments: Array<{ nickname: string; content: string; timestamp: string; isNewUser: boolean }>,
  orderDetails: Record<string, unknown>[]
): Promise<void> {
  const baseTime = snapshotTime;
  const xis = Array.isArray(chartData.xis) ? chartData.xis as string[] : [];
  const onlineList = Array.isArray(chartData.onlineUserCntList) ? chartData.onlineUserCntList as number[] : [];
  const commentList = Array.isArray(chartData.commenterCntList) ? chartData.commenterCntList as number[] : [];
  const amountList = Array.isArray(chartData.transactionAmountList) ? chartData.transactionAmountList as number[] : [];

  const startTime = xis.length > 0 ? normalizeTimeLabel(baseTime, xis[0]) : baseTime;
  const snapshotOffsetSeconds = Math.max(0, Math.round((snapshotTime.getTime() - startTime.getTime()) / 1000));

  await upsertTimelineEvent(sessionId, {
    timestamp: snapshotTime.toISOString(),
    offset_seconds: snapshotOffsetSeconds,
    event_type: 'snapshot_captured',
    content: `完成第 ${Number(analysisData.snapshotSeq || 0) || 0} 次数据快照抓取`,
    metrics: {
      watchers: Number(analysisData.watcherCnt || 0),
      online: Number(analysisData.peakConcurrentViewers || 0),
      comments: Number(analysisData.commentCnt || 0),
      amount: Number(analysisData.transactionAmount || 0),
    },
    source: 'system',
    importance: 'medium',
  });

  if (onlineList.length > 0 && xis.length > 0) {
    const maxOnline = Math.max(...onlineList);
    const maxIdx = onlineList.indexOf(maxOnline);
    await upsertTimelineEvent(sessionId, {
      timestamp: normalizeTimeLabel(baseTime, xis[maxIdx]).toISOString(),
      offset_seconds: maxIdx * 60,
      event_type: 'online_peak',
      content: `在线人数达到峰值 ${maxOnline}`,
      metrics: { online: maxOnline },
      source: 'chart',
      importance: 'high',
    });
  }

  if (commentList.length > 0 && xis.length > 0) {
    const maxComments = Math.max(...commentList);
    const maxIdx = commentList.indexOf(maxComments);
    if (maxComments > 0) {
      await upsertTimelineEvent(sessionId, {
        timestamp: normalizeTimeLabel(baseTime, xis[maxIdx]).toISOString(),
        offset_seconds: maxIdx * 60,
        event_type: 'comment_burst',
        content: `评论互动达到高峰，评论人数 ${maxComments}`,
        metrics: { commenters: maxComments },
        source: 'comment',
        importance: 'medium',
      });
    }
  }

  if (amountList.length > 0 && xis.length > 0) {
    const maxAmount = Math.max(...amountList);
    const maxIdx = amountList.indexOf(maxAmount);
    if (maxAmount > 0) {
      await upsertTimelineEvent(sessionId, {
        timestamp: normalizeTimeLabel(baseTime, xis[maxIdx]).toISOString(),
        offset_seconds: maxIdx * 60,
        event_type: 'payment_peak',
        content: `成交金额达到峰值 ¥${maxAmount}`,
        metrics: { paid_amount: maxAmount },
        source: 'order',
        importance: 'high',
      });
    }
  }

  const questionComment = comments.find((comment) => /[?？]|怎么|多少钱|可以|适合|有没有|效果|物流|发货/.test(comment.content));
  if (questionComment) {
    const commentTime = questionComment.timestamp ? new Date(Number(questionComment.timestamp) || questionComment.timestamp) : snapshotTime;
    await upsertTimelineEvent(sessionId, {
      timestamp: commentTime.toISOString(),
      offset_seconds: Math.max(0, Math.round((commentTime.getTime() - startTime.getTime()) / 1000)),
      event_type: 'high_value_question',
      content: `高价值评论问题：${questionComment.content.slice(0, 80)}`,
      metrics: { nickname: questionComment.nickname },
      source: 'comment',
      importance: 'medium',
    });
  }

  const topOrder = [...orderDetails]
    .map((item) => ({
      goodsName: String(item.goodsName || item.productName || ''),
      paidCount: Number(item.paidCount || item.paid_count || 0),
      payAmount: Number(item.payAmount || item.pay_amount || 0),
    }))
    .filter((item) => item.goodsName)
    .sort((a, b) => (b.payAmount || b.paidCount) - (a.payAmount || a.paidCount))[0];

  if (topOrder && (topOrder.payAmount > 0 || topOrder.paidCount > 0)) {
    await upsertTimelineEvent(sessionId, {
      timestamp: snapshotTime.toISOString(),
      offset_seconds: snapshotOffsetSeconds,
      event_type: 'product_hotspot',
      content: `当前高表现商品：${topOrder.goodsName}`,
      metrics: { paid_count: topOrder.paidCount, pay_amount: topOrder.payAmount },
      source: 'order',
      importance: 'medium',
    });
  }
}

// ==================== 综合抓取入口 ====================

/**
 * 一次性抓取所有数据并存入数据库
 * 全部使用管理页API，无需 LiveToken
 */
export async function fetchAllSnapshotData(
  sessionId: number,
  roomId: string,
  seq: number
): Promise<void> {
  const client = getSupabaseClient();
  const snapshotTime = new Date();

  // 获取 liveSpaceId（管理页API，无需 LiveToken）
  const liveSpaceId = await getLiveSpaceId(roomId);

  // 并行抓取所有管理页数据
  const fetchPromises = {
    newoldData: liveSpaceId
      ? fetchNewoldData(roomId, liveSpaceId).catch(err => {
          console.error('fetchNewoldData失败:', err instanceof Error ? err.message : err);
          return {} as Record<string, string>;
        })
      : Promise.resolve({} as Record<string, string>),

    analysisData: liveSpaceId
      ? fetchAnalysis(roomId, liveSpaceId).catch(err => {
          console.error('fetchAnalysis失败:', err instanceof Error ? err.message : err);
          return {} as Record<string, unknown>;
        })
      : Promise.resolve({} as Record<string, unknown>),

    chartData: liveSpaceId
      ? fetchChartData(roomId, liveSpaceId).catch(err => {
          console.error('fetchChartData失败:', err instanceof Error ? err.message : err);
          return {} as Record<string, unknown>;
        })
      : Promise.resolve({} as Record<string, unknown>),

    comments: liveSpaceId
      ? fetchAllComments(roomId, liveSpaceId).catch(err => {
          console.error('fetchAllComments失败:', err instanceof Error ? err.message : err);
          return { records: [], total: 0 } as { records: Record<string, unknown>[]; total: number };
        })
      : Promise.resolve({ records: [], total: 0 } as { records: Record<string, unknown>[]; total: number }),

    orderSummary: liveSpaceId
      ? fetchOrderAnalysis(roomId, liveSpaceId).catch(err => {
          console.error('fetchOrderAnalysis失败:', err instanceof Error ? err.message : err);
          return {} as Record<string, unknown>;
        })
      : Promise.resolve({} as Record<string, unknown>),

    orderDetails: liveSpaceId
      ? fetchAllOrderAnalysisPage(roomId, liveSpaceId).catch(err => {
          console.error('fetchAllOrderAnalysisPage失败:', err instanceof Error ? err.message : err);
          return { records: [], total: 0 } as { records: Record<string, unknown>[]; total: number };
        })
      : Promise.resolve({ records: [], total: 0 } as { records: Record<string, unknown>[]; total: number }),

    memberData: liveSpaceId
      ? fetchAllMemberData(roomId, liveSpaceId).catch(err => {
          console.error('fetchAllMemberData失败:', err instanceof Error ? err.message : err);
          return { records: [], total: 0 } as { records: Record<string, unknown>[]; total: number };
        })
      : Promise.resolve({ records: [], total: 0 } as { records: Record<string, unknown>[]; total: number }),
  };

  const [newoldData, analysisData, chartData, comments, orderSummary, orderDetails, memberData] = await Promise.all([
    fetchPromises.newoldData,
    fetchPromises.analysisData,
    fetchPromises.chartData,
    fetchPromises.comments,
    fetchPromises.orderSummary,
    fetchPromises.orderDetails,
    fetchPromises.memberData,
  ]);

  // 提取核心指标
  const analysisResult = analysisData as Record<string, unknown>;
  const orderSummaryData = orderSummary as Record<string, unknown>;
  const newoldResult = newoldData as Record<string, string>;

  // 从 getAnalysis 提取统计概览字段
  const watcherCnt = analysisResult.watcherCnt ? parseInt(String(analysisResult.watcherCnt), 10) : null;
  const commentCnt = analysisResult.commentCnt ? parseInt(String(analysisResult.commentCnt), 10) : null;
  const viewCnt = analysisResult.viewCnt ? Number(analysisResult.viewCnt) : null;
  const peakConcurrent = analysisResult.peakConcurrentViewers ? Number(analysisResult.peakConcurrentViewers) : null;
  const transactionAmount = analysisResult.transactionAmount ? String(analysisResult.transactionAmount) : null;
  const transactionCnt = analysisResult.transactionCnt ? Number(analysisResult.transactionCnt) : null;
  const payUserCnt = analysisResult.payUserCnt ? Number(analysisResult.payUserCnt) : null;

  // 提取真实观众评论
  const audienceComments = extractAudienceComments(comments.records);

  // 写入快照表
  const { error } = await client.from('snapshot_data').insert({
    session_id: sessionId,
    snapshot_seq: seq,
    snapshot_time: snapshotTime.toISOString(),
    watcher_cnt: watcherCnt,
    comment_cnt: commentCnt,
    online_user_cnt: peakConcurrent,
    order_total: transactionAmount || (orderSummaryData.totalAmount?.toString() ?? null),
    order_count: transactionCnt || (orderSummaryData.totalCount ? Number(orderSummaryData.totalCount) : null),
    new_fan_conversion_rate: newoldResult.nconversionRate || null,
    old_fan_conversion_rate: newoldResult.oconversionRate || null,
    new_fan_pay_count: newoldResult.ntransactionUserCnt ? parseInt(newoldResult.ntransactionUserCnt, 10) : null,
    old_fan_pay_count: newoldResult.otransactionUserCnt ? parseInt(newoldResult.otransactionUserCnt, 10) : null,
    raw_json: {
      analysis: analysisResult,
      newoldData: newoldResult,
      chartData,
      comments: audienceComments,
      commentsRaw: comments.records,
      orderSummary: orderSummaryData,
      orderDetails: orderDetails.records,
      memberData: memberData.records,
    },
  });

  if (error) throw new Error(`写入快照数据失败: ${error.message}`);

  analysisResult.snapshotSeq = seq;

  await upsertMinuteMetrics(sessionId, snapshotTime, chartData as Record<string, unknown>);
  await generateTimelineFromSnapshot(
    sessionId,
    snapshotTime,
    analysisResult,
    chartData as Record<string, unknown>,
    audienceComments,
    orderDetails.records
  );

  console.info(`[Fetcher] 快照 #${seq} 写入成功: ${audienceComments.length}条评论, ${orderDetails.records.length}条订单`);
}

/**
 * 获取会话的所有快照数据（用于分析）
 */
export async function getSessionSnapshots(sessionId: number): Promise<Record<string, unknown>[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('snapshot_data')
    .select('*')
    .eq('session_id', sessionId)
    .order('snapshot_seq', { ascending: true });

  if (error) throw new Error(`查询快照数据失败: ${error.message}`);
  return (data || []) as unknown as Record<string, unknown>[];
}

/**
 * 获取直播实时统计（用于监控面板实时展示）
 * 使用管理页统计概览API，无需 LiveToken
 */
export async function fetchLiveOverview(roomId: string, liveSpaceId: string): Promise<{
  watcherCnt: number;
  viewCnt: number;
  peakConcurrentViewers: number;
  commentCnt: number;
  transactionAmount: number;
  transactionCnt: number;
  payUserCnt: number;
  newFanConversionRate: number;
  oldFanConversionRate: number;
}> {
  const [analysisResult, newoldResult] = await Promise.allSettled([
    fetchAnalysis(roomId, liveSpaceId),
    fetchNewoldData(roomId, liveSpaceId),
  ]);

  const analysis = analysisResult.status === 'fulfilled' ? analysisResult.value : {};
  const newold = newoldResult.status === 'fulfilled' ? newoldResult.value : {};

  return {
    watcherCnt: Number((analysis as Record<string, unknown>).watcherCnt || 0),
    viewCnt: Number((analysis as Record<string, unknown>).viewCnt || 0),
    peakConcurrentViewers: Number((analysis as Record<string, unknown>).peakConcurrentViewers || 0),
    commentCnt: Number((analysis as Record<string, unknown>).commentCnt || 0),
    transactionAmount: Number((analysis as Record<string, unknown>).transactionAmount || 0),
    transactionCnt: Number((analysis as Record<string, unknown>).transactionCnt || 0),
    payUserCnt: Number((analysis as Record<string, unknown>).payUserCnt || 0),
    newFanConversionRate: Number(newold.nconversionRate || 0),
    oldFanConversionRate: Number(newold.oconversionRate || 0),
  };
}

// ==================== 录播/回放统计API（智能直播）====================

/**
 * 获取录播统计概览（智能直播）
 * 端点: POST /api/livemanage/statRoomLiveSpace/anyTenant/getAnalysis
 * Header path: /livemanage/intelligenceRoom/analysis/{roomId}
 */
export async function fetchReplayAnalysis(roomId: string, liveSpaceId: string): Promise<Record<string, unknown>> {
  const result = await adminApiRequest<{
    code: number;
    data: Record<string, unknown>;
  }>('/api/livemanage/statRoomLiveSpace/anyTenant/getAnalysis', {
    body: { roomId, liveSpaceId },
    pathOverride: `/livemanage/intelligenceRoom/analysis/${roomId}`,
  });
  return result.data || {};
}

/**
 * 获取录播图表趋势数据（智能直播）
 * 端点: POST /api/livemanage/statRoomLiveSpace/anyTenant/getChartData
 * Header path: /livemanage/intelligenceRoom/analysis/{roomId}
 */
export async function fetchReplayChartData(roomId: string, liveSpaceId: string): Promise<Record<string, unknown>> {
  const result = await adminApiRequest<{
    code: number;
    data: Record<string, unknown>;
  }>('/api/livemanage/statRoomLiveSpace/anyTenant/getChartData', {
    body: { roomId, liveSpaceId },
    pathOverride: `/livemanage/intelligenceRoom/analysis/${roomId}`,
  });
  return result.data || {};
}

/**
 * 获取录播新老用户数据（智能直播）
 * 端点: POST /api/livemanage/statRoomLiveSpace/anyTenant/getNewoldData
 * Header path: /livemanage/intelligenceRoom/analysis/${roomId}
 */
export async function fetchReplayNewoldData(roomId: string, liveSpaceId: string): Promise<Record<string, string>> {
  const result = await adminApiRequest<{
    code: number;
    data: { statMemberNewoldDailyVo: Record<string, string> };
    isSuccess: boolean;
  }>('/api/livemanage/statRoomLiveSpace/anyTenant/getNewoldData', {
    body: { roomId, liveSpaceId, channelIds: [], channelGroupId: '' },
    pathOverride: `/livemanage/intelligenceRoom/analysis/${roomId}`,
  });
  return result.data?.statMemberNewoldDailyVo || {};
}

/**
 * 获取录播学员数据（智能直播）
 * 端点: POST /api/livemanage/statRoomLiveSpace/anyTenant/getMemberData
 * Header path: /livemanage/intelligenceRoom/analysis/${roomId}
 */
export async function fetchReplayMemberData(roomId: string, liveSpaceId: string, page = 1, size = 200): Promise<{
  records: Record<string, unknown>[];
  total: number;
}> {
  const result = await adminApiRequest<{
    code: number;
    data: { records: Record<string, unknown>[]; total: number };
  }>('/api/livemanage/statRoomLiveSpace/anyTenant/getMemberData', {
    body: { model: { roomId, liveSpaceId }, extra: {}, current: page, size },
    pathOverride: `/livemanage/intelligenceRoom/analysis/${roomId}`,
  });
  return result.data || { records: [], total: 0 };
}

/**
 * 获取录播订单分析（智能直播）
 * 端点: POST /api/livemanage/order/getOrderAnalysis
 * Header path: /livemanage/intelligenceRoom/analysis/${roomId}
 */
export async function fetchReplayOrderAnalysis(roomId: string, liveSpaceId: string): Promise<Record<string, unknown>> {
  const result = await adminApiRequest<{
    code: number;
    data: Record<string, unknown>;
  }>('/api/livemanage/order/getOrderAnalysis', {
    body: { roomId, liveSpaceId },
    pathOverride: `/livemanage/intelligenceRoom/analysis/${roomId}`,
  });
  return result.data || {};
}

/**
 * 获取录播订单分页（智能直播）
 * 端点: POST /api/livemanage/order/getOrderAnalysisPage
 * Header path: /livemanage/intelligenceRoom/analysis/${roomId}
 */
export async function fetchReplayOrderAnalysisPage(
  roomId: string, liveSpaceId: string, page = 1, size = 200): Promise<{
  records: Record<string, unknown>[];
  total: number;
}> {
  const result = await adminApiRequest<{
    code: number;
    data: { records: Record<string, unknown>[]; total: number };
  }>('/api/livemanage/order/getOrderAnalysisPage', {
    body: { model: { roomId, liveSpaceId }, extra: {}, current: page, size },
    pathOverride: `/livemanage/intelligenceRoom/analysis/${roomId}`,
  });
  return result.data || { records: [], total: 0 };
}

// ==================== 辅助API（房间、场次、渠道等）====================

/**
 * 获取房间详情
 * 端点: GET /api/livemanage/openClassesRoom/detail?id={roomId}
 */
export async function fetchRoomDetail(roomId: string): Promise<Record<string, unknown>> {
  const result = await adminApiRequest<{
    code: number;
    data: Record<string, unknown>;
  }>(`/api/livemanage/openClassesRoom/detail?id=${roomId}`, {
    method: 'GET',
  });
  return result.data || {};
}

/**
 * 获取直播场次选择列表
 * 端点: GET /api/livemanage/roomLiveSpace/selectOptions?roomId={roomId}
 */
export async function fetchLiveSpaceOptions(roomId: string): Promise<Array<{ id: string; name: string; startTime: string; endTime: string }>> {
  const result = await adminApiRequest<{
    code: number;
    data: Array<{ id: string; name: string; startTime: string; endTime: string }>;
  }>(`/api/livemanage/roomLiveSpace/selectOptions?roomId=${roomId}`, {
    method: 'GET',
  });
  return result.data || [];
}

/**
 * 获取渠道选择列表
 * 端点: GET /api/livemanage/channel/selectOptions?groupId=&roomId={roomId}
 */
export async function fetchChannelOptions(roomId: string): Promise<Array<{ label: string; value: string }>> {
  const result = await adminApiRequest<{
    code: number;
    data: Array<{ label: string; value: string }>;
  }>(`/api/livemanage/channel/selectOptions?groupId=&roomId=${roomId}`, {
    method: 'GET',
  });
  return result.data || [];
}
