// 直播监控模块 - 状态轮询 + 任务编排 + 自动片段分析

import { adminApiRequest, getLiveSpaceId } from './auth';
import { ensureKnowledgeSeeded } from './knowledge-seed';
import { CONFIG, LIVE_STATUS, SESSION_STATUS } from './config';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { fetchAllSnapshotData, getSessionSnapshots } from './fetcher';
import { runAnalysis, extractAnchorName, analyzeProduct } from './analyzer';
import { autoStartRecording, stopAudioRecording, isRecording, canAutoRestart, isStreamDead, resetRetryCount } from './recorder';
import { globalQueue } from '@/worker/queue';

// ==================== 类型定义 ====================

export interface LiveRoom {
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
  // 新增：从直播列表API获取的流地址
  mainUrl?: string;
  rawData?: Record<string, unknown>;
}

interface FindPageResult {
  code: number;
  data: {
    records: Array<Record<string, unknown>>;
    total: number;
    pageNo: number;
  };
}

/** 正在运行的分析任务（防止重复触发） */
const runningAnalyses = new Set<number>();

// 缓存智能模板名称，避免重复请求
const templateNameCache = new Map<string, string>();

/**
 * 获取智能模板名称
 */
async function getIntelligenceTemplateName(templateId: string): Promise<string> {
  if (templateNameCache.has(templateId)) {
    return templateNameCache.get(templateId)!;
  }
  
  try {
    const result = await adminApiRequest<{
      code: number;
      data: {
        id: string;
        name: string;
        [key: string]: unknown;
      };
    }>(`/api/livemanage/intelligenceTemplate/detail?id=${templateId}`, {
      method: 'GET',
    });
    
    const templateName = result.data?.name || '智能模板';
    templateNameCache.set(templateId, templateName);
    return templateName;
  } catch (err) {
    console.error('[Monitor] 获取智能模板名称失败:', templateId, err);
    return '智能模板';
  }
}

// ==================== 直播列表查询 ====================

/**
 * 将平台API原始字段映射为标准 LiveRoom 结构
 * 平台API返回: id=房间ID, name=直播间名称, liveStatus=状态
 */
async function mapIntelligenceRoomFromApi(raw: Record<string, unknown>): Promise<LiveRoom> {
  const roomId = String(raw.roomId || raw.id || '');
  
  // 获取模板名称
  let templateName: string | undefined;
  const templateId = raw.intelligenceTemplateId ? String(raw.intelligenceTemplateId) : undefined;
  if (templateId) {
    templateName = await getIntelligenceTemplateName(templateId);
  }
  
  // 尝试从原始数据中提取流地址
  const mainUrl = raw.mainUrl || raw.streamUrl || raw.playUrl || raw.liveUrl || 
                 raw.flvUrl || raw.webrtcUrl || null;
  
  return {
    id: roomId,
    roomId: roomId,
    roomName: String(raw.name || ''),
    liveStatus: String(raw.liveStatus || ''),
    startTime: raw.startTime || raw.start_time ? String(raw.startTime || raw.start_time) : null,
    coverUrl: raw.liveCover || raw.live_cover ? String(raw.liveCover || raw.live_cover) : undefined,
    description: raw.description ? String(raw.description) : undefined,
    online: raw.online ? String(raw.online) : undefined,
    anchorId: raw.anchorId || raw.anchor_id ? String(raw.anchorId || raw.anchor_id) : undefined,
    roomType: 'intelligence',
    templateName,
    // 存储原始数据中可能包含的流地址
    rawData: raw,
    mainUrl: mainUrl ? String(mainUrl) : undefined,
  };
}

/**
 * 将平台API原始字段映射为标准 LiveRoom 结构（普通直播）
 */
function mapNormalRoomFromApi(raw: Record<string, unknown>): LiveRoom {
  const roomId = String(raw.roomId || raw.id || '');
  
  // 尝试从原始数据中提取流地址
  const mainUrl = raw.mainUrl || raw.streamUrl || raw.playUrl || raw.liveUrl || 
                 raw.flvUrl || raw.webrtcUrl || null;
  
  return {
    id: roomId,
    roomId: roomId,
    roomName: String(raw.name || ''),
    liveStatus: String(raw.liveStatus || ''),
    startTime: raw.startTime || raw.start_time ? String(raw.startTime || raw.start_time) : null,
    coverUrl: raw.liveCover || raw.live_cover ? String(raw.liveCover || raw.live_cover) : undefined,
    description: raw.description ? String(raw.description) : undefined,
    online: raw.online ? String(raw.online) : undefined,
    anchorId: raw.anchorId || raw.anchor_id ? String(raw.anchorId || raw.anchor_id) : undefined,
    roomType: 'normal',
    // 存储原始数据中可能包含的流地址
    rawData: raw,
    mainUrl: mainUrl ? String(mainUrl) : undefined,
  };
}

/**
 * 获取智能直播房间列表
 */
export async function getIntelligenceLiveList(page = 1, size = 100): Promise<{ rooms: LiveRoom[]; total: number }> {
  const result = await adminApiRequest<FindPageResult>('/api/livemanage/intelligenceRoom/page', {
    body: { model: {}, extra: {}, current: page, size },
    pathOverride: '/livemanage/intelligenceRoom',
  });

  const rawRecords = result.data?.records || [];
  // 并行获取所有智能直播房间的模板名称
  const rooms = await Promise.all(rawRecords.map(raw => mapIntelligenceRoomFromApi(raw)));
  
  return {
    rooms,
    total: result.data?.total || 0,
  };
}

/**
 * 获取直播列表（包括普通直播和智能直播）
 */
export async function getLiveList(page = 1, size = 20): Promise<{ rooms: LiveRoom[]; total: number }> {
  const [normalResult, intelligenceResult] = await Promise.all([
    adminApiRequest<FindPageResult>('/api/livemanage/openClassesRoom/findPage', {
      body: { model: {}, extra: {}, current: page, size },
    }),
    getIntelligenceLiveList(page, size),
  ]);

  const normalRooms = (normalResult.data?.records || []).map(raw => mapNormalRoomFromApi(raw));
  const allRooms = [...normalRooms, ...intelligenceResult.rooms];
  
  // 去重
  const seen = new Set();
  const uniqueRooms = allRooms.filter(room => {
    if (seen.has(room.roomId)) {
      return false;
    }
    seen.add(room.roomId);
    return true;
  });

  return {
    rooms: uniqueRooms,
    total: normalResult.data?.total || 0 + intelligenceResult.total,
  };
}

/**
 * 获取各状态统计（包括智能直播）
 */
export async function getNumberAnalysis(): Promise<{
  total: number;
  inStart: number;
  notStart: number;
  playback: number;
}> {
  const [normalResult, intelligenceResult] = await Promise.all([
    adminApiRequest<{
      code: number;
      data: { total: number; inStart: number; notStart: number };
    }>('/api/livemanage/openClassesRoom/findNumberAnalysis', {
      body: { intelligence: false, page: 1, pageSize: 20 },
    }),
    adminApiRequest<{
      code: number;
      data: { total: number; inStart: number; notStart: number; playback: number };
    }>('/api/livemanage/intelligenceRoom/findNumberAnalysis', {
      body: { intelligence: false },
      pathOverride: '/livemanage/intelligenceRoom',
    }),
  ]);

  const normalData = normalResult.data || { total: 0, inStart: 0, notStart: 0 };
  const intelData = intelligenceResult.data || { total: 0, inStart: 0, notStart: 0, playback: 0 };

  return {
    total: normalData.total + intelData.total,
    inStart: normalData.inStart + intelData.inStart,
    notStart: normalData.notStart + intelData.notStart,
    playback: intelData.playback || 0,
  };
}

// ==================== 状态机管理 ====================

/**
 * 检测开播状态并更新数据库
 */
export async function pollLiveStatus(): Promise<{
  newLiveRooms: string[];
  endedRooms: string[];
}> {
  const client = getSupabaseClient();
  const newLiveRooms: string[] = [];
  const endedRooms: string[] = [];

  // 获取当前直播列表
  const { rooms } = await getLiveList(1, 100);

  // 获取数据库中所有活跃会话
  const { data: activeSessions, error } = await client
    .from('live_sessions')
    .select('id, room_id, status')
    .in('status', [SESSION_STATUS.IDLE, SESSION_STATUS.RECORDING, SESSION_STATUS.ANALYZING]);

  if (error) throw new Error(`查询活跃会话失败: ${error.message}`);

  const activeSessionMap = new Map<string, { id: number; room_id: string; status: string }>(
    (activeSessions || []).map((s: any) => [s.room_id, s])
  );

  // 检测开播
  for (const room of rooms) {
    if (room.liveStatus === LIVE_STATUS.STARTING) {
      if (!activeSessionMap.has(room.roomId)) {
        // 新开播 - 创建会话
        await startSession(room);
        newLiveRooms.push(room.roomId);
      }
    }
  }

  // 检测下播
  for (const [roomId, session] of activeSessionMap) {
    const roomStillLive = rooms.some(
      (r) => r.roomId === roomId && r.liveStatus === LIVE_STATUS.STARTING
    );

    if (!roomStillLive && session.status !== SESSION_STATUS.ENDED) {
      await endSession(session.id, roomId);
      endedRooms.push(roomId);
    }
  }

  return { newLiveRooms, endedRooms };
}

/**
 * 启动一场直播的监控会话
 */
async function startSession(room: LiveRoom): Promise<number> {
  const client = getSupabaseClient();

  // 打印直播列表返回的原始数据，查看有哪些可用字段
  if (room.rawData) {
    console.log(`[Monitor] 直播列表原始数据(${room.roomId}):`, JSON.stringify(room.rawData, null, 2));
  }

  // 获取 liveSpaceId（优先管理页API，无需LiveToken）
  let liveSpaceId: string | null = null;
  try {
    liveSpaceId = await getLiveSpaceId(room.roomId);
  } catch (err) {
    console.warn(`获取liveSpaceId失败(${room.roomId}):`, err instanceof Error ? err.message : err);
  }

  // 优先使用从直播列表获取的流地址
  let trtcInfo: Record<string, unknown> = {};
  if (room.mainUrl) {
    console.log(`[Monitor] 使用直播列表中的流地址: ${room.mainUrl}`);
    trtcInfo = { mainUrl: room.mainUrl };
  }

  // 创建数据库记录 - 状态直接设为 recording（表示正在录制数据）
  const now = new Date().toISOString();
  const anchorName = extractAnchorName(room.roomName || '');
  const { data, error } = await client
    .from('live_sessions')
    .insert({
      room_id: room.roomId,
      room_name: room.roomName,
      anchor_name: anchorName,
      live_space_id: liveSpaceId,
      start_time: room.startTime || now,
      status: SESSION_STATUS.RECORDING,
      last_snapshot_seq: 0,
      last_analysis_time: now, // 初始化为开播时间，30分钟后触发首次分析
      room_type: room.roomType,
      template_name: room.templateName,
      trtc_info: trtcInfo, // 保存从直播列表获取的流地址
    })
    .select('id')
    .single();

  if (error) throw new Error(`创建会话失败: ${error.message}`);

  const sessionId = data.id;

  // 立即执行第一次数据抓取（不执行分析，只采集初始数据）
  try {
    await fetchAllSnapshotData(sessionId, room.roomId, 1);
    // 更新 snapshot_seq
    await client
      .from('live_sessions')
      .update({ last_snapshot_seq: 1 })
      .eq('id', sessionId);
  } catch (err) {
    console.error(`首次数据抓取失败(${room.roomId}):`, err instanceof Error ? err.message : err);
  }

  // 自动启动音频录制 - 传递可能从直播列表获取的流地址
  autoStartRecording(room.roomId, sessionId, room.roomName, room.mainUrl).then(result => {
    if (result.success) {
      console.log(`[Monitor] 自动录制已启动: room=${room.roomId}, name=${room.roomName}`);
    } else {
      console.error(`[Monitor] 自动录制启动失败: room=${room.roomId}, error=${result.error}`);
    }
  }).catch(err => {
    console.error(`[Monitor] 自动录制异常:`, err instanceof Error ? err.message : err);
  });

  return sessionId;
}

/**
 * 结束一场直播会话
 */
async function endSession(sessionId: number, roomId: string): Promise<void> {
  const client = getSupabaseClient();

  // 先停止音频录制
  if (isRecording(roomId)) {
    console.log(`[Monitor] 直播结束，停止录制: room=${roomId}`);
    stopAudioRecording(roomId);
  }
  // 重置重试计数，防止后续误判
  resetRetryCount(roomId);

  // 更新状态为分析中
  const { error: updateError } = await client
    .from('live_sessions')
    .update({
      status: SESSION_STATUS.ANALYZING,
      end_time: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (updateError) throw new Error(`更新会话状态失败: ${updateError.message}`);

  // 执行终场分析
  try {
    await runAnalysis(sessionId, roomId, 0, 'final');
  } catch (err) {
    console.error(`终场分析失败:`, err instanceof Error ? err.message : err);
  }

  // 自动分析该场直播中的所有商品并生成作战卡
  try {
    await autoAnalyzeProductsForSession(sessionId);
  } catch (err) {
    console.error(`商品作战卡生成失败:`, err instanceof Error ? err.message : err);
  }

  // 更新状态为已结束
  const { error: endError } = await client
    .from('live_sessions')
    .update({ status: SESSION_STATUS.ENDED })
    .eq('id', sessionId);

  if (endError) throw new Error(`结束会话失败: ${endError.message}`);
}

/**
 * 自动分析该场直播中的所有商品并生成作战卡
 */
async function autoAnalyzeProductsForSession(sessionId: number): Promise<void> {
  console.log(`[ProductAnalysis] 开始为会话 #${sessionId} 生成商品作战卡`);
  
  // 获取该会话的所有快照数据
  const snapshots = await getSessionSnapshots(sessionId);
  if (snapshots.length === 0) {
    console.log(`[ProductAnalysis] 会话 #${sessionId} 没有快照数据，跳过`);
    return;
  }

  // 从快照数据中提取所有商品
  const goodsSet = new Set<string>();
  
  for (const snapshot of snapshots) {
    const rawJson = (snapshot as any).raw_json;
    if (!rawJson?.orderDetails) continue;
    
    const orderDetails = rawJson.orderDetails as any[];
    for (const orderItem of orderDetails) {
      const goodsName = orderItem.goodsName || orderItem.goods_name;
      if (goodsName && typeof goodsName === 'string') {
        goodsSet.add(goodsName.trim());
      }
    }
  }

  const goodsList = Array.from(goodsSet);
  if (goodsList.length === 0) {
    console.log(`[ProductAnalysis] 会话 #${sessionId} 没有找到商品数据`);
    return;
  }

  console.log(`[ProductAnalysis] 会话 #${sessionId} 找到 ${goodsList.length} 个商品，开始分析...`);

  // 为每个商品生成作战卡
  for (const goodsName of goodsList) {
    try {
      await generateProductBattleCard(goodsName);
      console.log(`[ProductAnalysis] 商品作战卡生成成功: ${goodsName}`);
    } catch (err) {
      console.error(`[ProductAnalysis] 商品作战卡生成失败 ${goodsName}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[ProductAnalysis] 会话 #${sessionId} 商品作战卡全部完成`);
}

/**
 * 生成单个商品的作战卡并保存到数据库
 */
async function generateProductBattleCard(goodsName: string): Promise<void> {
  const client = getSupabaseClient();
  
  // 获取商品的历史数据
  const { data: snapshotData, error: snapshotError } = await client
    .from('snapshot_data')
    .select(`
      id,
      session_id,
      snapshot_seq,
      snapshot_time,
      raw_json,
      live_sessions (
        id,
        room_id,
        room_name,
        anchor_name,
        start_time,
        room_type,
        template_name
      )
    `)
    .not('raw_json', 'is', null)
    .order('snapshot_time', { ascending: false });

  if (snapshotError) throw new Error(`查询商品历史数据失败: ${snapshotError.message}`);

  // 解析和筛选包含该商品的快照
  const productHistory = [];
  const productStats = {
    totalSessions: new Set(),
    totalClicks: 0,
    totalOrders: 0,
    totalPaid: 0,
    totalAmount: 0
  };

  for (const snapshot of (snapshotData || [])) {
    try {
      const rawJson = (snapshot as any).raw_json;
      const orderDetails = rawJson?.orderDetails || [];
      
      for (const orderItem of (orderDetails as any[])) {
        // 检查是否包含该商品
        const itemName = (orderItem.goodsName || orderItem.goods_name || '').trim();
        if (itemName === goodsName || goodsName.includes(itemName) || itemName.includes(goodsName)) {
          productStats.totalSessions.add((snapshot as any).session_id);
          
          const clickCount = Number(orderItem.clickCount || orderItem.click_count || 0);
          const orderCount = Number(orderItem.orderCount || orderItem.order_count || 0);
          const paidCount = Number(orderItem.paidCount || orderItem.paid_count || 0);
          const payAmount = Number(orderItem.payAmount || orderItem.pay_amount || 0);
          
          productStats.totalClicks += clickCount;
          productStats.totalOrders += orderCount;
          productStats.totalPaid += paidCount;
          productStats.totalAmount += payAmount;
          
          productHistory.push({
            id: (snapshot as any).id,
            session_id: (snapshot as any).session_id,
            snapshot_seq: (snapshot as any).snapshot_seq,
            snapshot_time: (snapshot as any).snapshot_time,
            goods_name: itemName,
            click_count: clickCount,
            order_count: orderCount,
            paid_count: paidCount,
            pay_amount: payAmount,
            live_sessions: (snapshot as any).live_sessions
          });
        }
      }
    } catch (parseError) {
      continue;
    }
  }

  if (productHistory.length === 0) {
    console.log(`[ProductAnalysis] 商品 ${goodsName} 没有找到历史数据，跳过`);
    return;
  }

  // 计算统计数据
  const totalClicks = productStats.totalClicks;
  const totalOrders = productStats.totalOrders;
  const totalPaid = productStats.totalPaid;
  const totalAmount = productStats.totalAmount;
  const totalSessions = productStats.totalSessions.size;
  
  const avgClickToOrder = totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0;
  const avgOrderToPay = totalOrders > 0 ? (totalPaid / totalOrders) * 100 : 0;
  const avgClickToPay = totalClicks > 0 ? (totalPaid / totalClicks) * 100 : 0;

  // 找出最佳和最差场次
  const bestSession = [...productHistory].sort((a, b) => Number(b.pay_amount) - Number(a.pay_amount))[0];
  const worstSession = [...productHistory].sort((a, b) => Number(a.pay_amount) - Number(b.pay_amount))[0];

  // 获取所有唯一的场次
  const sessionsBySessionId = new Map();
  for (const item of productHistory) {
    if (!sessionsBySessionId.has(item.session_id)) {
      sessionsBySessionId.set(item.session_id, {
        session_id: item.session_id,
        room_name: item.live_sessions?.room_name,
        anchor_name: item.live_sessions?.anchor_name,
        start_time: item.live_sessions?.start_time,
        items: []
      });
    }
    sessionsBySessionId.get(item.session_id).items.push(item);
  }

  const uniqueSessions = Array.from(sessionsBySessionId.values()).sort((a, b) => 
    new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
  );

  // 构建商品数据
  const productData = {
    goods_name: goodsName,
    summary: {
      total_sessions: totalSessions,
      total_clicks: totalClicks,
      total_orders: totalOrders,
      total_paid: totalPaid,
      total_amount: totalAmount,
      avg_click_to_order_rate: avgClickToOrder.toFixed(2),
      avg_order_to_pay_rate: avgOrderToPay.toFixed(2),
      avg_click_to_pay_rate: avgClickToPay.toFixed(2),
      avg_amount_per_session: (totalAmount / totalSessions).toFixed(2)
    },
    best_session: bestSession,
    worst_session: worstSession,
    recent_sessions: uniqueSessions.slice(0, 5)
  };

  // 调用 AI 分析
  const aiAnalysisText = await analyzeProduct(productData);

  // 检查是否已存在该商品的作战卡
  const { data: existingCards } = await client
    .from('product_battle_cards')
    .select('id')
    .eq('goods_name', goodsName)
    .limit(1);

  if (existingCards && existingCards.length > 0) {
    // 更新现有作战卡
    const { error } = await client
      .from('product_battle_cards')
      .update({
        summary_stats: productData.summary,
        best_session: bestSession,
        worst_session: worstSession,
        ai_analysis: aiAnalysisText,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingCards[0].id);
      
    if (error) throw new Error(`更新商品作战卡失败: ${error.message}`);
  } else {
    // 创建新的作战卡
    const { error } = await client
      .from('product_battle_cards')
      .insert({
        goods_name: goodsName,
        summary_stats: productData.summary,
        best_session: bestSession,
        worst_session: worstSession,
        ai_analysis: aiAnalysisText,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
    if (error) throw new Error(`创建商品作战卡失败: ${error.message}`);
  }
}

/**
 * 执行片段分析（每30分钟触发）
 */
export async function runSegmentAnalysis(sessionId: number, roomId: string): Promise<void> {
  const client = getSupabaseClient();

  // 获取当前片段序号
  const { data: session, error } = await client
    .from('live_sessions')
    .select('last_snapshot_seq')
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !session) throw new Error('会话不存在');

  const nextSeq = (session.last_snapshot_seq || 0) + 1;

  // 先抓取数据
  await fetchAllSnapshotData(sessionId, roomId, nextSeq);

  // 执行分析
  await runAnalysis(sessionId, roomId, nextSeq, 'segment');

  // 更新片段序号和最后分析时间
  await client
    .from('live_sessions')
    .update({
      last_snapshot_seq: nextSeq,
      last_analysis_time: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

// ==================== 自动片段分析调度 ====================

/**
 * 检查并执行到期的片段分析
 * 挂载在 GET /api/monitor/status 上，每次前端30秒轮询时调用
 * 
 * 逻辑：遍历所有 RECORDING 状态的会话，
 * 如果距离 last_analysis_time 超过 snapshotIntervalMinutes(默认30分钟)，
 * 则自动触发片段分析
 */
export async function checkAndRunScheduledAnalysis(): Promise<Array<{
  sessionId: number;
  roomId: string;
  segmentSeq: number;
}>> {
  // 确保知识库已初始化(生产环境首次启动时自动seed)
  await ensureKnowledgeSeeded();

  const client = getSupabaseClient();
  const intervalMs = CONFIG.snapshotIntervalMinutes * 60 * 1000;
  const triggered: Array<{ sessionId: number; roomId: string; segmentSeq: number }> = [];

  // 查询所有 RECORDING 状态的会话
  const { data: recordingSessions, error } = await client
    .from('live_sessions')
    .select('id, room_id, room_name, last_analysis_time, last_snapshot_seq')
    .eq('status', SESSION_STATUS.RECORDING);

  if (error || !recordingSessions || recordingSessions.length === 0) {
    return triggered;
  }

  const now = Date.now();

  // 获取当前所有在直播的房间列表
  let liveRooms: LiveRoom[] = [];
  try {
    const { rooms } = await getLiveList(1, 100);
    liveRooms = rooms.filter(r => r.liveStatus === LIVE_STATUS.STARTING);
  } catch (err) {
    console.error(`[AutoRecording] 获取直播列表失败，将跳过状态验证:`, err);
  }
  const liveRoomIds = new Set(liveRooms.map(r => r.roomId));

  for (const session of recordingSessions) {
    // 验证直播间是否还在开播状态（如果成功获取到了直播列表）
    if (liveRoomIds.size > 0 && !liveRoomIds.has(session.room_id)) {
      console.log(`[AutoRecording] 检测到直播间 ${session.room_id} 已不再开播状态，自动结束会话`);
      resetRetryCount(session.room_id);
      await endSession(session.id, session.room_id).catch(err => {
        console.error(`[AutoRecording] 自动结束会话失败:`, err instanceof Error ? err.message : err);
      });
      continue;
    }

    // 检查流是否已失效（连续多次录制失败→直播实际已结束但API延迟更新）
    if (isStreamDead(session.room_id)) {
      console.warn(`[AutoRecording] 流已失效(连续${3}次录制失败)，自动结束会话: room=${session.room_id}, sessionId=${session.id}`);
      resetRetryCount(session.room_id);
      await endSession(session.id, session.room_id).catch(err => {
        console.error(`[AutoRecording] 自动结束会话失败:`, err instanceof Error ? err.message : err);
      });
      continue; // 跳过后续处理
    }

    // 确保录制正在进行（防止录制进程意外中断）
    // 但如果重试次数已耗尽（直播已结束/流不可用），则不再重启
    if (!isRecording(session.room_id) && canAutoRestart(session.room_id)) {
      console.log(`[AutoRecording] 检测到录制中断，重新启动: room=${session.room_id}`);
      autoStartRecording(session.room_id, session.id, session.room_name || '').catch(err => {
        console.error(`[AutoRecording] 重新启动失败:`, err instanceof Error ? err.message : err);
      });
    }

    // 跳过正在运行的分析
    if (runningAnalyses.has(session.id)) continue;

    const lastAnalysis = session.last_analysis_time
      ? new Date(session.last_analysis_time).getTime()
      : 0;

    // 如果从未分析过，用 start_time 计算
    let referenceTime = lastAnalysis;
    if (!referenceTime) {
      const { data: s } = await client
        .from('live_sessions')
        .select('start_time')
        .eq('id', session.id)
        .maybeSingle();
      referenceTime = s?.start_time ? new Date(s.start_time).getTime() : 0;
    }

    const elapsed = now - referenceTime;

    if (elapsed >= intervalMs) {
      // 标记为正在运行，防止重复触发
      runningAnalyses.add(session.id);

      // 异步执行，不阻塞当前请求
      const sessionId = session.id;
      const roomId = session.room_id;
      const nextSeq = (session.last_snapshot_seq || 0) + 1;

      console.log(`[AutoAnalysis] 触发片段分析: session=${sessionId}, room=${roomId}, seq=${nextSeq}, 距上次分析=${Math.round(elapsed / 60000)}分钟`);

      // 后台执行，不 await
      runSegmentAnalysis(sessionId, roomId)
        .then(() => {
          console.log(`[AutoAnalysis] 片段分析完成: session=${sessionId}, seq=${nextSeq}`);
        })
        .catch((err) => {
          console.error(`[AutoAnalysis] 片段分析失败: session=${sessionId}`, err instanceof Error ? err.message : err);
        })
        .finally(() => {
          runningAnalyses.delete(sessionId);
        });

      triggered.push({ sessionId, roomId, segmentSeq: nextSeq });
    }
  }

  return triggered;
}

/**
 * 获取所有活跃会话的录制/分析状态信息
 */
export async function getRecordingStatus(): Promise<Array<{
  sessionId: number;
  roomId: string;
  roomName: string | null;
  status: string;
  startTime: string | null;
  lastAnalysisTime: string | null;
  lastSnapshotSeq: number;
  nextAnalysisIn: number | null; // 距下次分析的分钟数，null=不适用
  isAnalyzing: boolean; // 是否正在执行分析
  recordingDuration: number | null; // 录制时长（分钟）
}>> {
  const client = getSupabaseClient();
  const intervalMs = CONFIG.snapshotIntervalMinutes * 60 * 1000;

  const { data: sessions, error } = await client
    .from('live_sessions')
    .select('id, room_id, room_name, status, start_time, last_analysis_time, last_snapshot_seq')
    .in('status', [SESSION_STATUS.RECORDING, SESSION_STATUS.ANALYZING]);

  if (error || !sessions) return [];

  const now = Date.now();

  return sessions.map((s: {
    id: number;
    room_id: string;
    room_name: string | null;
    status: string;
    start_time: string | null;
    last_analysis_time: string | null;
    last_snapshot_seq: number;
  }) => {
    const lastAnalysis = s.last_analysis_time ? new Date(s.last_analysis_time).getTime() : 0;
    const startTime = s.start_time ? new Date(s.start_time).getTime() : 0;
    const elapsed = lastAnalysis ? (now - lastAnalysis) : (now - startTime);
    const nextIn = s.status === SESSION_STATUS.RECORDING
      ? Math.max(0, Math.round((intervalMs - elapsed) / 60000))
      : null;

    const recordingDuration = startTime ? Math.round((now - startTime) / 60000) : null;

    return {
      sessionId: s.id,
      roomId: s.room_id,
      roomName: s.room_name,
      status: s.status,
      startTime: s.start_time,
      lastAnalysisTime: s.last_analysis_time,
      lastSnapshotSeq: s.last_snapshot_seq || 0,
      nextAnalysisIn: nextIn,
      isAnalyzing: runningAnalyses.has(s.id),
      recordingDuration,
    };
  });
}

// ==================== Worker 任务注册 ====================

/** 注册所有任务处理器并启动 Worker */
export async function initializeWorker() {
  // 启动队列的 worker
  await globalQueue.start();
  console.log('[Monitor] Worker 已初始化并启动');
}
