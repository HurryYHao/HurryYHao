// 直播监控模块 - 状态轮询 + 任务编排 + 自动片段分析

import { adminApiRequest, getLiveSpaceId } from './auth';
import { ensureKnowledgeSeeded } from './knowledge-seed';
import { CONFIG, LIVE_STATUS, SESSION_STATUS } from './config';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { fetchAllSnapshotData, getSessionSnapshots, fetchAnalysis, fetchChartData, fetchNewoldData } from './fetcher';
import { runAnalysis, extractAnchorName, upsertAnchorProfile } from './analyzer';
import { autoStartRecording, stopAudioRecording, isRecording, canAutoRestart, isStreamDead, resetRetryCount } from './recorder';
import { transcribeAudio } from './transcribe-worker';
import { globalQueue } from '@/worker/queue';
import { sendWeComAlertsBatch } from './wecom-notify';

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

/** 正在运行的分析任务（防止重复触发）+ 超时自动清理 */
const runningAnalyses = new Set<number>();
const runningAnalysisStart = new Map<number, number>(); // sessionId -> startTime
const ANALYSIS_TIMEOUT_MS = 30 * 60 * 1000; // 30分钟超时

// 定期清理超时的分析任务（防止内存泄漏）
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, startTime] of runningAnalysisStart) {
    if (now - startTime > ANALYSIS_TIMEOUT_MS) {
      console.warn(`[Monitor] 分析任务超时自动清理: session=${sessionId}, 耗时=${Math.round((now - startTime) / 60000)}分钟`);
      runningAnalyses.delete(sessionId);
      runningAnalysisStart.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // 每5分钟检查一次

// 内存锁：防止并发请求为同一房间重复创建会话
const sessionCreationLocks = new Set<string>();

/** 清理已结束会话的内存缓存（防止内存泄漏） */
function cleanupMemoryForSession(sessionId: number, roomId: string) {
  runningAnalyses.delete(sessionId);
  runningAnalysisStart.delete(sessionId);
  sessionCreationLocks.delete(roomId);
  lastRealtimeCheck.delete(sessionId);
}
// 防抖：避免频繁调用 pollLiveStatus

/**
 * 从 DbQueryBuilder 返回的对象中安全读取字段（兼容 camelCase 和 snake_case）
 * DbQueryBuilder 自动将 snake_case 转为 camelCase，但旧代码可能使用 snake_case
 */
function getField<T = unknown>(obj: Record<string, unknown>, camelKey: string, snakeKey?: string): T {
  return (obj[camelKey] ?? (snakeKey ? obj[snakeKey] : undefined)) as T;
}
let lastPollTime = 0;
const MIN_POLL_INTERVAL = 10_000; // 10秒内不重复调用

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
  rooms: LiveRoom[];
}> {
  // 防抖：10秒内不重复调用
  const now = Date.now();
  if (now - lastPollTime < MIN_POLL_INTERVAL) {
    console.log('[Monitor] pollLiveStatus 防抖跳过，距上次调用不足10秒');
    const { rooms: currentRooms } = await getLiveList(1, 100);
    return { newLiveRooms: [], endedRooms: [], rooms: currentRooms };
  }
  lastPollTime = now;

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
    (activeSessions || []).map((s: any) => [s.roomId ?? s.room_id, s])
  );

  // 检测开播
  for (const room of rooms) {
    if (room.liveStatus === LIVE_STATUS.STARTING) {
      if (!activeSessionMap.has(room.roomId) && !sessionCreationLocks.has(room.roomId)) {
        // 加锁防止并发创建
        sessionCreationLocks.add(room.roomId);
        try {
          await startSession(room);
          newLiveRooms.push(room.roomId);
        } finally {
          sessionCreationLocks.delete(room.roomId);
        }
      }
    }
  }

  // 检测下播
  for (const [roomId, session] of activeSessionMap) {
    const roomStillLive = rooms.some(
      (r) => r.roomId === roomId && r.liveStatus === LIVE_STATUS.STARTING
    );

    if (!roomStillLive && session.status !== SESSION_STATUS.ENDED) {
      await endSession(Number(getField(session, 'id')), roomId);
      endedRooms.push(roomId);
    }
  }

  return { newLiveRooms, endedRooms, rooms };
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

  // 企业微信通知：开播提醒
  sendWeComAlertsBatch([{
    title: `[${room.roomName || room.roomId}] 直播已开播`,
    description: `系统已自动开始录制和数据监控，将在30分钟后进行首次分析。`,
    severity: 'low',
  }]).catch(err => {
    console.error('[startSession] 企微通知失败:', err instanceof Error ? err.message : err);
  });

  return sessionId;
}

/**
 * 结束一场直播会话
 */
async function endSession(sessionId: number, roomId: string): Promise<void> {
  const client = getSupabaseClient();

  // 获取会话信息
  const { data: session } = await client
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  // 先停止音频录制
  if (isRecording(roomId)) {
    console.log(`[Monitor] 直播结束，停止录制: room=${roomId}`);
    stopAudioRecording(roomId);
  }
  // 重置重试计数，防止后续误判
  resetRetryCount(roomId);
  // 清理该会话的内存缓存（防止内存泄漏）
  cleanupMemoryForSession(sessionId, roomId);

  // 转写最后一段录制的音频（等待完成后再分析）
  const lastSegmentSeq = Number(getField(session, 'lastSnapshotSeq', 'last_snapshot_seq')) || 0;
  if (lastSegmentSeq > 0) {
    try {
      console.log(`[Monitor] 终场前转写最后一段音频: session=${sessionId}, seq=${lastSegmentSeq}`);
      const recordingSegments = await client
        .from('recording_segments')
        .select('*')
        .eq('session_id', sessionId)
        .order('segment_seq', { ascending: false })
        .limit(1);
      const segment = recordingSegments.data?.[0];
      if (segment) {
        const audioUrl = String(getField(segment, 'audioUrl', 'audio_url') || '');
        const segmentSeq = Number(getField(segment, 'segmentSeq', 'segment_seq')) || 0;
        if (audioUrl && segmentSeq) {
          await transcribeAudio(audioUrl, sessionId, segmentSeq);
        }
      }
    } catch (err) {
      console.error(`[Monitor] 终场前转写最后一段音频失败:`, err instanceof Error ? err.message : err);
    }
  }

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

  // 生成/更新主播画像
  try {
    const anchorName = String(getField(session, 'anchorName', 'anchor_name') || '');
    if (anchorName && anchorName !== '未知主播') {
      console.log(`[Monitor] 终场后生成主播画像: ${anchorName}`);
      await upsertAnchorProfile(anchorName);
    }
  } catch (err) {
    console.error(`主播画像生成失败:`, err instanceof Error ? err.message : err);
  }

  // 更新状态为已结束
  const { error: endError } = await client
    .from('live_sessions')
    .update({ status: SESSION_STATUS.ENDED })
    .eq('id', sessionId);

  if (endError) throw new Error(`结束会话失败: ${endError.message}`);

  // 企业微信通知：直播结束
  const sRoomName = String(getField(session, 'roomName', 'room_name') ?? '未知直播间');
  const sStartTime = getField(session, 'startTime', 'start_time') as string | null;
  const durationMin = sStartTime ? Math.round((Date.now() - new Date(sStartTime).getTime()) / 60000) : 0;
  sendWeComAlertsBatch([{
    title: `[${sRoomName}] 直播已结束`,
    description: `直播时长${durationMin}分钟，终场分析已完成。`,
    severity: 'low',
  }]).catch(err => {
    console.error('[endSession] 企微通知失败:', err instanceof Error ? err.message : err);
  });
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

  const nextSeq = (Number(getField(session, 'lastSnapshotSeq', 'last_snapshot_seq')) || 0) + 1;

  // 检查是否已有对应 seq 的有效快照数据（watcher_cnt 非空表示有实际数据）
  const { data: existingSnapshot } = await client
    .from('snapshot_data')
    .select('id, watcher_cnt')
    .eq('session_id', sessionId)
    .eq('snapshot_seq', nextSeq)
    .not('watcher_cnt', 'is', null)
    .limit(1);

  if (existingSnapshot && existingSnapshot.length > 0) {
    console.log(`[SegmentAnalysis] 片段${nextSeq}已有有效快照数据，跳过抓取`);
  } else {
    // 先抓取数据
    await fetchAllSnapshotData(sessionId, roomId, nextSeq);
  }

  // 触发并等待音频转写（录制片段完成后转写任务已入队，
  // 这里直接调用 transcribeAudio 确保转写在分析前完成）
  try {
    const { data: segments } = await client
      .from('recording_segments')
      .select('local_path, transcribe_status, segment_seq')
      .eq('session_id', sessionId)
      .eq('segment_seq', nextSeq)
      .limit(1);

    const seg = segments?.[0];
    const segLocalPath = seg ? String(getField(seg, 'localPath', 'local_path') ?? '') : '';
    const segTranscribeStatus = String(getField(seg, 'transcribeStatus', 'transcribe_status') ?? '');
    
    if (seg && segLocalPath && segTranscribeStatus !== 'success') {
      console.log(`[SegmentAnalysis] 等待音频转写: session=${sessionId}, seg=${nextSeq}, path=${segLocalPath}`);
      const { transcribeAudio } = await import('@/lib/server/transcribe-worker');
      await transcribeAudio(segLocalPath, sessionId, nextSeq);
      console.log(`[SegmentAnalysis] 转写完成，开始AI分析`);
    } else if (segTranscribeStatus === 'success') {
      console.log(`[SegmentAnalysis] 转写已完成，直接开始AI分析`);
    } else {
      console.log(`[SegmentAnalysis] 无录制片段数据，仅基于直播间数据分析`);
    }
  } catch (transcribeErr) {
    console.error(`[SegmentAnalysis] 转写失败，将仅基于直播间数据分析:`, transcribeErr instanceof Error ? transcribeErr.message : transcribeErr);
  }

  // 执行分析（含转写文字+直播数据）
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
    const sessionId = Number(getField(session, 'id'));
    const sRoomId = String(getField(session, 'roomId', 'room_id'));
    const sRoomName = String(getField(session, 'roomName', 'room_name') ?? '');
    const sLastAnalysisTime = getField<string | null>(session, 'lastAnalysisTime', 'last_analysis_time');
    const sLastSnapshotSeq = Number(getField(session, 'lastSnapshotSeq', 'last_snapshot_seq') ?? 0);

    // 验证直播间是否还在开播状态（如果成功获取到了直播列表）
    if (liveRoomIds.size > 0 && !liveRoomIds.has(sRoomId)) {
      console.log(`[AutoRecording] 检测到直播间 ${sRoomId} 已不再开播状态，自动结束会话`);
      resetRetryCount(sRoomId);
      await endSession(sessionId, sRoomId).catch(err => {
        console.error(`[AutoRecording] 自动结束会话失败:`, err instanceof Error ? err.message : err);
      });
      continue;
    }

    // 检查流是否已失效（连续多次录制失败→直播实际已结束但API延迟更新）
    if (isStreamDead(sRoomId)) {
      console.warn(`[AutoRecording] 流已失效(连续${3}次录制失败)，自动结束会话: room=${sRoomId}, sessionId=${sessionId}`);
      resetRetryCount(sRoomId);
      await endSession(sessionId, sRoomId).catch(err => {
        console.error(`[AutoRecording] 自动结束会话失败:`, err instanceof Error ? err.message : err);
      });
      continue; // 跳过后续处理
    }

    // 确保录制正在进行（防止录制进程意外中断）
    // 但如果重试次数已耗尽（直播已结束/流不可用），则不再重启
    if (!isRecording(sRoomId) && canAutoRestart(sRoomId)) {
      console.log(`[AutoRecording] 检测到录制中断，重新启动: room=${sRoomId}`);
      autoStartRecording(sRoomId, sessionId, sRoomName).catch(err => {
        console.error(`[AutoRecording] 重新启动失败:`, err instanceof Error ? err.message : err);
      });
    }

    // 跳过正在运行的分析
    if (runningAnalyses.has(sessionId)) continue;

    const lastAnalysis = sLastAnalysisTime
      ? new Date(sLastAnalysisTime).getTime()
      : 0;

    // 如果从未分析过，用 start_time 计算
    let referenceTime = lastAnalysis;
    if (!referenceTime) {
      const { data: s } = await client
        .from('live_sessions')
        .select('start_time')
        .eq('id', sessionId)
        .maybeSingle();
      referenceTime = s ? new Date(String(getField(s, 'startTime', 'start_time'))).getTime() : 0;
    }

    const elapsed = now - referenceTime;

    if (elapsed >= intervalMs) {
      // 标记为正在运行，防止重复触发
      runningAnalyses.add(sessionId);
      runningAnalysisStart.set(sessionId, Date.now());

      const nextSeq = sLastSnapshotSeq + 1;

      console.log(`[AutoAnalysis] 触发片段分析: session=${sessionId}, room=${sRoomId}, seq=${nextSeq}, 距上次分析=${Math.round(elapsed / 60000)}分钟`);

      // 后台执行，不 await
      runSegmentAnalysis(sessionId, sRoomId)
        .then(() => {
          console.log(`[AutoAnalysis] 片段分析完成: session=${sessionId}, seq=${nextSeq}`);
        })
        .catch((err) => {
          console.error(`[AutoAnalysis] 片段分析失败: session=${sessionId}`, err instanceof Error ? err.message : err);
        })
        .finally(() => {
          runningAnalyses.delete(sessionId);
          runningAnalysisStart.delete(sessionId);
        });

      triggered.push({ sessionId, roomId: sRoomId, segmentSeq: nextSeq });
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

  return sessions.map((s: Record<string, unknown>) => {
    // DbQueryBuilder 返回 camelCase 字段
    const id = Number(s.id);
    const roomId = String(s.roomId ?? s.room_id ?? '');
    const roomName = s.roomName ?? s.room_name ?? null;
    const status = String(s.status ?? '');
    const startTimeStr = s.startTime ?? s.start_time ?? null;
    const lastAnalysisTimeStr = s.lastAnalysisTime ?? s.last_analysis_time ?? null;
    const lastSnapshotSeq = Number(s.lastSnapshotSeq ?? s.last_snapshot_seq ?? 0);

    const lastAnalysis = lastAnalysisTimeStr ? new Date(String(lastAnalysisTimeStr)).getTime() : 0;
    const startTime = startTimeStr ? new Date(String(startTimeStr)).getTime() : 0;
    const elapsed = lastAnalysis ? (now - lastAnalysis) : (now - startTime);
    const nextIn = status === SESSION_STATUS.RECORDING
      ? Math.max(0, Math.round((intervalMs - elapsed) / 60000))
      : null;

    const recordingDuration = startTime ? Math.round((now - startTime) / 60000) : null;

    return {
      sessionId: id,
      roomId,
      roomName,
      status,
      startTime: startTimeStr ? String(startTimeStr) : null,
      lastAnalysisTime: lastAnalysisTimeStr ? String(lastAnalysisTimeStr) : null,
      lastSnapshotSeq,
      nextAnalysisIn: nextIn,
      isAnalyzing: runningAnalyses.has(id),
      recordingDuration,
    };
  });
}

// ==================== 1分钟实时预警检查 ====================

/** 上次实时预警检查时间（per session） */
const lastRealtimeCheck: Map<number, number> = new Map();
/** 实时预警检查间隔（毫秒），默认1分钟 */
const REALTIME_CHECK_INTERVAL_MS = 60 * 1000;

/**
 * 1分钟实时预警检查
 * 挂载在 GET /api/monitor/status 上，每次前端30秒轮询时调用
 * 
 * 逻辑：遍历所有 RECORDING 状态的会话，
 * 如果距离上次检查超过1分钟，则抓取最新实时数据，
 * 使用轻量级AI模型分析异常，生成预警
 */
export async function checkAndRunRealtimeAlerts(): Promise<Array<{
  sessionId: number;
  alertCount: number;
}>> {
  const client = getSupabaseClient();
  const triggered: Array<{ sessionId: number; alertCount: number }> = [];
  const now = Date.now();

  // 查询所有 RECORDING 状态的会话
  const { data: recordingSessions, error } = await client
    .from('live_sessions')
    .select('id, room_id, room_name, start_time, live_space_id')
    .eq('status', SESSION_STATUS.RECORDING);

  if (error || !recordingSessions || recordingSessions.length === 0) {
    return triggered;
  }

  for (const session of recordingSessions) {
    const sessionId = Number(getField(session, 'id'));
    const sRoomId = String(getField(session, 'roomId', 'room_id'));
    const sStartTime = getField<string | null>(session, 'startTime', 'start_time');
    const sLiveSpaceId = String(getField(session, 'liveSpaceId', 'live_space_id') ?? '');

    const lastCheck = lastRealtimeCheck.get(sessionId) || 0;
    const elapsed = now - lastCheck;

    if (elapsed < REALTIME_CHECK_INTERVAL_MS) continue;

    // 更新检查时间
    lastRealtimeCheck.set(sessionId, now);

    try {
      console.log(`[RealtimeAlert] 检查session=${sessionId}, room=${sRoomId}, 距上次检查=${Math.round(elapsed / 60000)}分钟`);

      // 抓取最新实时数据
      const roomId = sRoomId;
      const liveSpaceId = sLiveSpaceId;

      // 并行获取多个数据源
      const [analysisData, chartData, newoldData] = await Promise.allSettled([
        fetchAnalysis(roomId, liveSpaceId),
        fetchChartData(roomId, liveSpaceId),
        fetchNewoldData(roomId, liveSpaceId),
      ]);

      // 构建当前实时数据摘要
      // fetchAnalysis 返回字段: watcherCnt, peakConcurrentViewers, commentCnt, transactionAmount 等
      // fetchNewoldData 返回字段: nconversionRate, oconversionRate, ntransactionUserCnt, otransactionUserCnt 等
      // fetchChartData 返回字段: onlineUserCntList, watcherCntList 等
      const analysis = analysisData.status === 'fulfilled' ? analysisData.value : {};
      const chart = chartData.status === 'fulfilled' ? chartData.value : {};
      const newold = newoldData.status === 'fulfilled' ? newoldData.value : {};

      // 从 analysis 提取统计字段（与 fetchLiveOverview 保持一致）
      const currentOnline = Number((analysis as Record<string, unknown>).peakConcurrentViewers || 0);
      const currentViewers = Number((analysis as Record<string, unknown>).watcherCnt || 0);
      const currentComments = Number((analysis as Record<string, unknown>).commentCnt || 0);
      const currentAmount = Number((analysis as Record<string, unknown>).transactionAmount || 0);

      // 从 chartData 提取最新在线人数（如果有的话，取列表最后一个值更实时）
      const onlineList = Array.isArray((chart as Record<string, unknown>).onlineUserCntList)
        ? (chart as Record<string, unknown>).onlineUserCntList as number[] : [];
      const latestOnline = onlineList.length > 0 ? Number(onlineList[onlineList.length - 1]) : currentOnline;

      // 从 newold 提取新老粉转化数据
      const newFanConversionRate = Number((newold as Record<string, string>).nconversionRate || 0);
      const oldFanConversionRate = Number((newold as Record<string, string>).oconversionRate || 0);
      const newFanPayCount = Number((newold as Record<string, string>).ntransactionUserCnt || 0);
      const oldFanPayCount = Number((newold as Record<string, string>).otransactionUserCnt || 0);

      const currentData = {
        viewers: currentViewers,
        online: latestOnline || currentOnline,
        comments: currentComments,
        amount: currentAmount,
        newFans: newFanPayCount,
        oldFans: oldFanPayCount,
        newFanConversionRate,
        oldFanConversionRate,
      };

      // 获取最近的alerts，用于判断是否重复
      const { data: recentAlerts } = await client
        .from('live_alerts')
        .select('alert_type, title')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(10);

      const recentAlertTypes = new Set((recentAlerts || []).map((a: Record<string, unknown>) => `${getField(a, 'alertType', 'alert_type')}:${getField(a, 'title')}`));

      // 基于规则的实时预警检测
      const newAlerts: Array<{
        alertType: string;
        severity: 'high' | 'medium' | 'low';
        title: string;
        description: string;
      }> = [];

      // 规则1: 在线人数骤降（超过30%）——私域场景：可能是社群活跃度下降或直播内容失去吸引力
      const prevMetrics = await client
        .from('live_metrics_minute')
        .select('online_count')
        .eq('session_id', sessionId)
        .order('minute_index', { ascending: false })
        .limit(5);

      if (prevMetrics.data && prevMetrics.data.length >= 3) {
        const recentOnline = prevMetrics.data.map((m: Record<string, unknown>) => Number(getField(m, 'onlineCount', 'online_count') || 0));
        const avgOnline = recentOnline.reduce((a: number, b: number) => a + b, 0) / recentOnline.length;
        if (avgOnline > 0 && currentData.online < avgOnline * 0.7 && currentData.online > 0) {
          const alertKey = `online_drop:在线人数骤降`;
          if (!recentAlertTypes.has(alertKey)) {
            newAlerts.push({
              alertType: 'online_drop',
              severity: 'high',
              title: '在线人数骤降',
              description: `在线人数从平均${Math.round(avgOnline)}人降至${currentData.online}人，降幅${Math.round((1 - currentData.online / avgOnline) * 100)}%，私域场景下可能是社群活跃度下降或当前内容失去吸引力，建议调整话术节奏或发起互动话题`,
            });
          }
        }
      }

      // 规则2: 互动率低（评论数相对在线人数过低）——私域直播互动率通常10%-30%，低于5%需关注
      if (currentData.online > 20 && currentData.comments < currentData.online * 0.05) {
        const alertKey = `low_interaction:互动率偏低`;
        if (!recentAlertTypes.has(alertKey)) {
          newAlerts.push({
            alertType: 'low_interaction',
            severity: 'medium',
            title: '互动率偏低',
            description: `当前在线${currentData.online}人但评论互动仅${currentData.comments}条，互动率${(currentData.comments / currentData.online * 100).toFixed(1)}%，低于私域正常水平(10%+)，建议主播增加互动引导话术`,
          });
        }
      }

      // 规则3: 成交额停滞（长时间无新增成交）
      const prevAmount = await client
        .from('live_metrics_minute')
        .select('paid_amount')
        .eq('session_id', sessionId)
        .order('minute_index', { ascending: false })
        .limit(10);

      if (prevAmount.data && prevAmount.data.length >= 5) {
        const amounts = prevAmount.data.map((m: Record<string, unknown>) => Number(getField(m, 'paidAmount', 'paid_amount') || 0));
        const recentSum = amounts.slice(0, 3).reduce((a: number, b: number) => a + b, 0);
        const olderSum = amounts.slice(3).reduce((a: number, b: number) => a + b, 0);
        if (olderSum > 0 && recentSum < olderSum * 0.2) {
          const alertKey = `sales_stagnation:成交额停滞`;
          if (!recentAlertTypes.has(alertKey)) {
            newAlerts.push({
              alertType: 'sales_stagnation',
              severity: 'high',
              title: '成交额停滞',
              description: `近3分钟成交额较前期下降${Math.round((1 - recentSum / olderSum) * 100)}%，私密产品决策链长，建议主播加强信任背书和紧迫感话术促单`,
            });
          }
        }
      }

      // 规则4: 新粉成交占比分析——私域中新粉占比高是社群裂变效果好的正向信号
      const totalFanPay = currentData.newFans + currentData.oldFans;
      if (totalFanPay >= 5) {
        const newFanRatio = currentData.newFans / totalFanPay;
        // 私域场景：新粉占比高是好事（社群裂变好），只在老粉完全不成交时预警
        if (currentData.oldFans === 0 && currentData.newFans >= 5) {
          const alertKey = `old_fan_inactive:老粉零成交`;
          if (!recentAlertTypes.has(alertKey)) {
            newAlerts.push({
              alertType: 'old_fan_inactive',
              severity: 'medium',
              title: '老粉零成交',
              description: `成交全部来自新粉(${currentData.newFans}人)，老粉无一人成交，可能需要加强老粉专属福利或复购话术`,
            });
          }
        }
      }

      // 规则5: 在线人数显著增长——私域场景：来自社群新邀请/群预告生效，是正向信号
      if (prevMetrics.data && prevMetrics.data.length >= 3) {
        const recentOnline2 = prevMetrics.data.map((m: Record<string, unknown>) => Number(getField(m, 'onlineCount', 'online_count') || 0));
        const avgOnline2 = recentOnline2.reduce((a: number, b: number) => a + b, 0) / recentOnline2.length;
        if (avgOnline2 > 0 && currentData.online > avgOnline2 * 1.5) {
          const alertKey = `online_surge:在线人数增长`;
          if (!recentAlertTypes.has(alertKey)) {
            newAlerts.push({
              alertType: 'online_surge',
              severity: 'low',
              title: '在线人数增长',
              description: `在线人数从平均${Math.round(avgOnline2)}人增至${currentData.online}人，增幅${Math.round((currentData.online / avgOnline2 - 1) * 100)}%，可能是社群引流或群预告生效，建议趁流量高峰推进产品讲解`,
            });
          }
        }
      }

      // ---- AI 实时分析预警 ----
      // 每分钟将实时数据发给AI分析，检测规则引擎无法发现的异常
      try {
        const sRoomName = String(getField(session, 'roomName', 'room_name') ?? '未知直播间');
        const aiPrompt = `你是一个私域直播数据实时监控AI。请分析以下直播间的1分钟实时数据，判断是否存在异常或需要预警的问题。

重要背景：
- 这是私域直播，没有算法推流，观众来自私域社群（微信群/朋友圈/粉丝群），在线人数不会有公域那种爆发式增长
- 这是私密产品直播（两性健康/私护品类），决策链长、隐私性高，转化率天然低于快消品
- 私域在线人数波动属正常（社群成员陆续进入），不要把小幅波动当成异常
- 新粉占比高是社群裂变效果好的正向信号，不是问题

直播间：${sRoomName}
当前在线：${currentData.online}人，累计观看人数：${currentData.viewers}人
评论数：${currentData.comments}条（注意：评论数≠评论人数，评论数是总条数）
成交金额：¥${currentData.amount.toFixed(2)}
新粉转化率：${currentData.newFanConversionRate.toFixed(1)}%，老粉转化率：${currentData.oldFanConversionRate.toFixed(1)}%
新粉成交：${currentData.newFans}人，老粉成交：${currentData.oldFans}人

请严格按JSON格式返回分析结果：
{"hasAlert":false,"alerts":[]}
或
{"hasAlert":true,"alerts":[{"type":"ai_detected","severity":"high/medium/low","title":"预警标题","description":"详细描述"}]}

注意：
- 只在确实存在严重异常时才发出预警，私域数据波动正常，不要过度预警
- severity: high=严重(需立即处理), medium=中等(需关注), low=轻微(参考)
- 真正需要关注的异常：在线骤降超50%且持续、互动率极低(<3%)、成交长时间完全停滞、老粉完全不成交
- 不需要预警的情况：在线小幅波动、新粉占比高、在线人数缓慢增长`

        const { UniversalLLMClient } = await import('./llm-client');
        const llm = new UniversalLLMClient();
        // 实时预警AI调用添加30秒超时，防止卡住
        const aiResult = await Promise.race([
          llm.invoke(
            [{ role: 'user', content: aiPrompt }],
            { model: 'doubao-seed-2-0-lite-260215', temperature: 0.3 }
          ),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000)),
        ]);

        if (aiResult) {
          const jsonMatch = aiResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as {
              hasAlert: boolean;
              alerts: Array<{ type: string; severity: string; title: string; description: string }>;
            };
            if (parsed.hasAlert && parsed.alerts) {
              for (const alert of parsed.alerts) {
                const alertKey = `ai_${alert.type}:${alert.title}`;
                if (!recentAlertTypes.has(alertKey)) {
                  newAlerts.push({
                    alertType: `ai_${alert.type}`,
                    severity: (['high', 'medium', 'low'].includes(alert.severity) ? alert.severity : 'medium') as 'high' | 'medium' | 'low',
                    title: alert.title,
                    description: alert.description,
                  });
                }
              }
            }
          }
        }
      } catch (aiErr) {
        // AI分析失败不影响规则引擎预警
        console.error(`[RealtimeAlert] AI分析失败(session=${sessionId}):`, aiErr instanceof Error ? aiErr.message : aiErr);
      }

      // 保存新预警到数据库
      const startTime = sStartTime ? new Date(sStartTime).getTime() : now;
      const offsetMinutes = Math.round((now - startTime) / 60000);

      if (newAlerts.length > 0) {

        for (const alert of newAlerts) {
          const alertRecord = {
            session_id: sessionId,
            alert_type: alert.alertType,
            severity: alert.severity,
            title: alert.title,
            description: alert.description,
            triggered_at: new Date(now).toISOString(),
            offset_minutes: offsetMinutes,
            is_read: false,
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          };

          const { error: insertError } = await client
            .from('live_alerts')
            .insert(alertRecord);

          if (insertError) {
            console.error(`[RealtimeAlert] 保存预警失败:`, insertError);
          } else {
            console.log(`[RealtimeAlert] 新预警: session=${sessionId}, type=${alert.alertType}, severity=${alert.severity}`);
          }
        }

        triggered.push({ sessionId, alertCount: newAlerts.length });

        // 企业微信通知
        if (newAlerts.length > 0) {
          const sRoomName = String(getField(session, 'roomName', 'room_name') ?? '未知直播间');
          const wecomAlerts = newAlerts.map(a => ({
            title: `[${sRoomName}] ${a.title}`,
            description: a.description,
            severity: a.severity,
          }));
          sendWeComAlertsBatch(wecomAlerts).catch(err => {
            console.error('[RealtimeAlert] 企微通知发送失败:', err instanceof Error ? err.message : err);
          });
        }
      }

      // 同时记录分钟级metrics
      const minuteIndex = offsetMinutes;
      await client
        .from('live_metrics_minute')
        .upsert({
          session_id: sessionId,
          minute_index: minuteIndex,
          online_count: currentData.online,
          comment_count: currentData.comments,
          order_count: 0,
          paid_count: 0,
          paid_amount: currentData.amount,
          viewer_count: currentData.viewers,
          created_at: new Date(now).toISOString(),
        }, { onConflict: 'session_id,minute_index' });

    } catch (err) {
      console.error(`[RealtimeAlert] 检查session=${sessionId}失败:`, err instanceof Error ? err.message : err);
    }
  }

  return triggered;
}

// ==================== Worker 任务注册 ====================

/** 注册所有任务处理器并启动 Worker */
export async function initializeWorker() {
  // 启动队列的 worker
  await globalQueue.start();
  console.log('[Monitor] Worker 已初始化并启动');
}
